const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseMigrationFilename,compareMigrationFilenames}=require('../src/postgres-migration-plan');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'sql', 'postgres');
const files=fs.readdirSync(dir).filter(parseMigrationFilename).sort(compareMigrationFilenames),parsed=files.map(parseMigrationFilename);
const ids=parsed.map(x=>String(x.number).padStart(3,'0')+x.suffix),duplicateNumbers=[...new Set(ids.filter((x,i,a)=>a.indexOf(x)!==i))];
const numeric=[...new Set(parsed.map(x=>x.number))].sort((a,b)=>a-b),reserved=new Set([6,7,8]),missing=[];
if(numeric.length)for(let n=numeric[0];n<=numeric[numeric.length-1];n++)if(!numeric.includes(n))missing.push(n);
const gaps=missing.filter(n=>!reserved.has(n)),digest=crypto.createHash('sha256');
for(const f of files){digest.update(f);digest.update('\0');digest.update(fs.readFileSync(path.join(dir,f)));digest.update('\0');}
const result={schemaVersion:'opscore.migration-preflight.v2',migrationCount:files.length,files,contiguous:gaps.length===0&&duplicateNumbers.length===0,gaps,reservedHistoricalGaps:missing.filter(n=>reserved.has(n)),duplicateNumbers,legacyFilenameAliases:{'044_system_tables_rls.sql':'040_system_tables_rls.sql'},sha256:digest.digest('hex')};
console.log(JSON.stringify(result,null,2));process.exitCode=gaps.length||duplicateNumbers.length?1:0;
