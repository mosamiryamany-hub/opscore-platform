'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..','src');
const REPO=path.resolve(__dirname,'../..');
const reviewPath=path.join(__dirname,'../docs/TRANSACTION_SCOPE_REVIEW.json');
const semanticReview=fs.existsSync(reviewPath)?JSON.parse(fs.readFileSync(reviewPath,'utf8')):{entries:[]};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const findings=[], reviewedFindings=[], staleReviewEntries=[];
const files=fs.readdirSync(ROOT,{withFileTypes:true}).flatMap(e=>e.isDirectory()
  ?fs.readdirSync(path.join(ROOT,e.name)).filter(x=>x.endsWith('.js')).map(x=>path.join(ROOT,e.name,x))
  :e.name.endsWith('.js')?[path.join(ROOT,e.name)]:[]);
const sourceLineIndex=new Map();
for(const file of files){
  const lines=fs.readFileSync(file,'utf8').split(/\n/);
  lines.forEach((line,i)=>{
    const rel=path.relative(REPO,file);
    const key=`${rel}:${sha256(line)}`;
    const arr=sourceLineIndex.get(key)||[];
    arr.push(i+1);
    sourceLineIndex.set(key,arr);
  });
}

const reviewedSha=new Map();
for(const entry of semanticReview.entries||[]){
  const rel=entry.file;
  const matches=sourceLineIndex.get(`${rel}:${entry.sha256}`)||[];
  if(matches.length===1){
    reviewedSha.set(`${rel}:${entry.sha256}`,{...entry,currentLine:matches[0]});
  } else {
    staleReviewEntries.push({
      ...entry,
      currentMatches:matches,
      classification:matches.length===0?'SOURCE_LINE_NOT_FOUND':'AMBIGUOUS_SOURCE_LINE'
    });
  }
}

const push=(severity,code,file,line,detail)=>findings.push({severity,code,file:path.relative(REPO,file),line,detail});
for(const file of files){
  const lines=fs.readFileSync(file,'utf8').split(/\n/);
  lines.forEach((line,i)=>{
    if(/\bSELECT\s+\*?\s*FROM\s+users\s+WHERE\s+id=\?/.test(line)&&!/memberships/.test(line))
      push('HIGH','TENANT_USER_LOOKUP',file,i+1,'User lookup by id lacks an organization membership predicate; verify every caller is system-scoped.');

    const check=(code,re)=>{
      if(!re.test(line)||(/organization_id=\?/.test(line)||/user_id=\?/.test(line)))return;
      const rel=path.relative(REPO,file);
      const statementSha=sha256(line);
      const review=reviewedSha.get(`${rel}:${statementSha}`);
      if(review){
        reviewedFindings.push({
          code,
          file:rel,
          originalLine:review.line,
          currentLine:i+1,
          sha256:statementSha,
          classification:'ACCEPTED_SEMANTIC_SCOPE',
          reason:review.reason
        });
        return;
      }
      push('REVIEW',code,file,i+1,code==='UNSCOPED_UPDATE'
        ?'UPDATE by id without an obvious tenant/user predicate; requires explicit semantic scope review.'
        :'DELETE by id without an obvious tenant/user predicate; requires explicit semantic scope review.');
    };
    check('UNSCOPED_UPDATE',/\bUPDATE\s+\w+\s+SET[\s\S]*WHERE\s+id=\?/);
    check('UNSCOPED_DELETE',/\bDELETE\s+FROM\s+\w+\s+WHERE\s+id=\?/);
  });
}

const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8'),sl=server.split(/\n/);
const mutationLines=sl.map((line,i)=>({line,i:i+1})).filter(x=>/req\.method===['"](?:POST|PUT|PATCH|DELETE)['"]/.test(x.line));
const idemBlocks=[];
for(const m of mutationLines){
  const block=sl.slice(Math.max(0,m.i-3),Math.min(sl.length,m.i+3)).join('\n');
  idemBlocks.push({line:m.i,wrapped:/idempotentWrite\(|idempotentAsyncWrite\(/.test(block)||(/idempotencyKey\(req\)/.test(block)&&/IDEMPOTENCY_KEY_REQUIRED/.test(block)),route:m.line.trim().slice(0,220)});
}
const explicitNonMutating=[
  /custom-domains\/[^ ]*\/verify/, // retained here as a backwards-compatible exclusion; route is actually wrapped and checked by route inventory.
  /tenant-field\/reveal/,
  /geofences\/(dynamic-evaluate|evaluate)/,
  /security\/signature-chain\/verify/
];
const routeIsExplicitNonMutating=(route)=>explicitNonMutating.some(re=>re.test(route)&&!route.includes("store.idempotentWrite"));
const unwrapped=idemBlocks.filter(x=>!x.wrapped&&!routeIsExplicitNonMutating(x.route)&&!/login|logout|refresh|webhook|callback|health/.test(x.route));
for(const x of unwrapped)push('REVIEW','MUTATION_NOT_IDEMPOTENT_WRAPPED',path.join(ROOT,'server.js'),x.line,x.route);

const report={
  schemaVersion:'opscore.red-team-transaction-audit.v2',
  scope:'pre-infrastructure-static-independent',
  generatedAt:new Date().toISOString(),
  checks:{
    sourceFiles:files.length,
    mutationRoutes:mutationLines.length,
    unwrappedMutationRoutes:unwrapped.length,
    semanticallyReviewedScopeFindings:reviewedFindings.length,
    staleSemanticReviewEntries:staleReviewEntries.length
  },
  findings,
  semanticallyReviewed:reviewedFindings,
  staleSemanticReviewEntries:staleReviewEntries,
  decision:findings.some(f=>f.severity==='HIGH')?'FAIL':findings.length?'REVIEW':staleReviewEntries.length?'REVIEW':'PASS',
  notes:[
    'Semantic scope acceptance is bound to the exact current source-line SHA-256, independent of line-number drift.',
    'Accepted semantic entries are classified explicitly and removed from unresolved findings; source changes reopen review.',
    'Static analysis does not certify runtime tenant isolation or concurrency safety.',
    'Infrastructure-required controls remain UNVERIFIED.'
  ]
};
fs.writeFileSync(path.join(__dirname,'../docs/RED_TEAM_TRANSACTION_AUDIT_RESULT.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
