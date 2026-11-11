'use strict';

const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {satisfiesNodeEngine,satisfiesNodeMinimum}=require('./node-engine');

const root = path.resolve(__dirname, '..');
const testDir = path.join(root, 'test');
const perFileTimeoutMs = Number(process.env.OPSC_RELEASE_TEST_TIMEOUT_MS || 60000);
const concurrency = Math.max(1, Math.min(16, Number(process.env.OPSC_RELEASE_TEST_CONCURRENCY || 4)));
const files = fs.readdirSync(testDir).filter(name => name.endsWith('.test.js')).sort((a, b) => a.localeCompare(b));
// These tests intentionally touch tracked source artifacts. Run them after the isolated pool
// so provenance observes a stable API inventory instead of racing another writer.
const serialFiles = new Set(['resource_limits.test.js', 'provenance_generation.test.js']);

function parseSummary(output) {
  const m = (label) => output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1];
  return {
    tests: Number(m('tests') || 0),
    pass: Number(m('pass') || 0),
    fail: Number(m('fail') || 0),
    cancelled: Number(m('cancelled') || 0),
    skipped: Number(m('skipped') || 0),
    todo: Number(m('todo') || 0)
  };
}

function parseTapCases(output, file) {
  const cases = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(not )?ok\s+\d+\s+-\s+(.+?)(?:\s+#\s+(SKIP|TODO)(?:\s+(.*))?)?$/);
    if (!match) continue;
    cases.push({ name: match[2].trim() || file, failed: Boolean(match[1]) && match[3] !== 'TODO',
      skipped: match[3] === 'SKIP', todo: match[3] === 'TODO', detail: match[4] || '' });
  }
  return cases;
}
function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function normalizeTestcaseIdentity(testcaseXml,file,ordinal){
 const normalizedClass=xmlEscape(file),prefix=String(ordinal).padStart(4,'0')+' - ';
 let normalized=testcaseXml;
 if(/\bclassname="[^"]*"/.test(normalized))normalized=normalized.replace(/\bclassname="[^"]*"/,'classname="'+normalizedClass+'"');
 else normalized=normalized.replace(/<testcase\b/,'<testcase classname="'+normalizedClass+'"');
 normalized=normalized.replace(/\bname="([^"]*)"/,(_m,name)=>'name="'+prefix+name+'"');
 // Node JUnit emits both skipped and failure markers for TODO. TODO is not a failure.
 if(/<skipped\b[^>]*\btype="todo"/i.test(normalized)){
  normalized=normalized.replace(/\s+failure="[^"]*"/i,'');
  normalized=normalized.replace(/\s*<failure\b[^>]*>[\s\S]*?<\/failure>/i,'');
 }
 return normalized;
}

function junitXml(results) {
  const caseXml = [];
  const expectedTests = results.reduce((total, result) => total + (result.tests || 0), 0);
  const perFileCounts = [];
  for (const result of results) {
    const xml = result.junitContent || '';
    const matches = xml.match(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g) || [];
    const tapCases = result.cases || [];
    if (result.tests > 0 && matches.length === result.tests) {
      matches.forEach((item, index) => caseXml.push(normalizeTestcaseIdentity(item, result.file, index + 1)));
      continue;
    }
    // Some node:test cases are summarized correctly in TAP but omitted by the built-in JUnit
    // reporter (observed in platform_intelligence_layer.test.js). Use TAP only when its exact
    // case count matches the per-file test summary; otherwise fail closed with diagnostics.
    if (result.tests > 0 && tapCases.length === result.tests) {
      for (const [index, item] of tapCases.entries()) {
        const attrs = 'classname="' + xmlEscape(result.file) + '" name="' + String(index + 1).padStart(4, '0') + ' - ' + xmlEscape(item.name) + '"';
        if (item.skipped || item.todo) caseXml.push('<testcase ' + attrs + '><skipped message="' + xmlEscape(item.detail || (item.todo ? 'TODO' : 'SKIP')) + '"/></testcase>');
        else if (item.failed) caseXml.push('<testcase ' + attrs + '><failure message="' + xmlEscape(item.detail || 'Test failed') + '">' + xmlEscape(item.detail || 'Test failed') + '</failure></testcase>');
        else caseXml.push('<testcase ' + attrs + '/>');
      }
      continue;
    }
    if (result.tests > 0 || matches.length || tapCases.length) {
      perFileCounts.push({ file: result.file, expected: result.tests, junit: matches.length, tap: tapCases.length });
      if (matches.length) caseXml.push(...matches);
      else if (tapCases.length) {
        for (const [index, item] of tapCases.entries()) {
          const attrs = 'classname="' + xmlEscape(result.file) + '" name="' + String(index + 1).padStart(4, '0') + ' - ' + xmlEscape(item.name) + '"';
          if (item.skipped || item.todo) caseXml.push('<testcase ' + attrs + '><skipped message="' + xmlEscape(item.detail || (item.todo ? 'TODO' : 'SKIP')) + '"/></testcase>');
          else if (item.failed) caseXml.push('<testcase ' + attrs + '><failure message="' + xmlEscape(item.detail || 'Test failed') + '">' + xmlEscape(item.detail || 'Test failed') + '</failure></testcase>');
          else caseXml.push('<testcase ' + attrs + '/>');
        }
      }
    }
  }
  const failures = caseXml.filter(item => /<failure\b/.test(item)).length;
  const errors = caseXml.filter(item => /<error\b/.test(item)).length;
  const skipped = caseXml.filter(item => /<skipped\b/.test(item)).length;
  const expectedSkipped = results.reduce((n,r)=>n+(r.skipped||0)+(r.todo||0),0);
  if(skipped!==expectedSkipped)throw new Error('JUNIT_SKIPPED_COUNT_MISMATCH: expected '+expectedSkipped+', found '+skipped);
  if (caseXml.length !== expectedTests) {
    throw new Error('JUNIT_TEST_COUNT_MISMATCH: expected ' + expectedTests + ' test cases from Node summaries, found ' + caseXml.length + '; per-file=' + JSON.stringify(perFileCounts));
  }
  const body = caseXml.map(item => '  ' + item).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<testsuites tests="' + caseXml.length + '" failures="' + failures + '" errors="' + errors + '" skipped="' + skipped + '">' +
    '<testsuite name="OpsCore release tests" tests="' + caseXml.length + '" failures="' + failures + '" errors="' + errors + '" skipped="' + skipped + '">\n' +
    body + '\n</testsuite></testsuites>\n';
}

function runFile(file) {
  return new Promise((resolve) => {
    const releaseRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-files-'));
    const junitPath = path.join(releaseRepo, 'node-test-results.xml');
    const child = cp.spawn(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', '--test-reporter=junit', '--test-reporter-destination=stdout', `--test-reporter-destination=${junitPath}`, path.join('test', file)], {
      cwd: root,
      env: {
        ...process.env,
        OPSC_REPOSITORY_PATH: releaseRepo,
        OPSC_RELEASE_VERIFICATION_ROOT: releaseRepo,
        OPSC_TEST_SCRYPT_N: '32768',
        NODE_ENV: 'test'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const finalize = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`;
      const summary = parseSummary(output);
      const cases = parseTapCases(output, file);
      let junitContent = '';
      try { junitContent = fs.readFileSync(junitPath, 'utf8'); } catch {}
      const summaryComplete = summary.tests > 0 && summary.pass + summary.skipped + summary.todo === summary.tests && !summary.fail && !summary.cancelled;
      const completedWithOpenHandles = timedOut && summaryComplete;
      const ok = !summary.fail && !summary.cancelled && (
        (!timedOut && code === 0) || completedWithOpenHandles
      );
      const tail = output.split(/\r?\n/).filter(Boolean).slice(-30).join('\n');
      try { fs.rmSync(releaseRepo, { recursive: true, force: true }); } catch {}
      resolve({ file, ok, timedOut, completedWithOpenHandles, code, signal, ...summary, cases, junitContent, tail });
    };
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
      // A descendant can retain the pipe even after the direct child exits. Destroying
      // both streams makes timeout handling deterministic instead of waiting forever.
      try { child.stdout.destroy(); } catch {}
      try { child.stderr.destroy(); } catch {}
      setTimeout(() => {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {}
        finalize(null, 'SIGTERM_TIMEOUT');
      }, 1500).unref();
    }, perFileTimeoutMs);
    child.on('error', (error) => {
      stderr += `\n${error.stack || error.message || error}`;
      finalize(1, null);
    });
    child.on('close', (code, signal) => finalize(code, signal));
  });
}

async function main() {
  const parallelFiles = files.filter(file => !serialFiles.has(file));
  const queue = parallelFiles.slice();
  const results = [];
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      if (!file) return;
      const result = await runFile(file);
      results.push(result);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.file} tests=${result.tests} pass=${result.pass} fail=${result.fail} skipped=${result.skipped} todo=${result.todo} cancelled=${result.cancelled}${result.completedWithOpenHandles ? ' open-handles' : (result.timedOut ? ' timeout' : '')}`);
      if (!result.ok) console.log(result.tail);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, parallelFiles.length) }, worker));

  // Deterministic source writers/readers: resource inventory generation must settle before
  // provenance hashes are calculated. Regenerate the provenance manifest immediately before
  // its verification test so buyer-facing docs/source edits cannot leave a stale manifest.
  for (const file of ['resource_limits.test.js']) {
    if (!serialFiles.has(file) || !files.includes(file)) continue;
    const result = await runFile(file);
    results.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.file} tests=${result.tests} pass=${result.pass} fail=${result.fail} skipped=${result.skipped} todo=${result.todo} cancelled=${result.cancelled}${result.completedWithOpenHandles ? ' open-handles' : (result.timedOut ? ' timeout' : '')}`);
    if (!result.ok) console.log(result.tail);
  }
  if (files.includes('provenance_generation.test.js')) {
    try {
      cp.execFileSync(process.execPath, ['scripts/generate-provenance.js'], { cwd: root, stdio: 'pipe', env: { ...process.env } });
    } catch (e) {
      results.push({ file: 'pretest:generate-provenance.js', ok: false, tests: 0, pass: 0, fail: 1, cancelled: 0, timedOut: false, code: e.status ?? null, signal: null, tail: `${e.stdout?.toString?.() || ''}
${e.stderr?.toString?.() || ''}`.trim() });
      console.log('FAIL pretest:generate-provenance.js');
    }
    const result = await runFile('provenance_generation.test.js');
    results.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.file} tests=${result.tests} pass=${result.pass} fail=${result.fail} skipped=${result.skipped} todo=${result.todo} cancelled=${result.cancelled}${result.completedWithOpenHandles ? ' open-handles' : (result.timedOut ? ' timeout' : '')}`);
    if (!result.ok) console.log(result.tail);
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const totals=summarizeResults(results,process.versions.node,String(pkg.engines?.node||''));
  const report={
    schemaVersion:'opscore.release-test-runner.v2',release:pkg.version,files:files.length,...totals,
    perFileTimeoutMs,concurrency,nodeVersion:process.versions.node,
    declaredNodeEngine:String(pkg.engines?.node||'UNDECLARED'),
    openHandleFiles:results.filter(x=>x.completedWithOpenHandles).map(x=>({file:x.file,tests:x.tests,pass:x.pass,skipped:x.skipped,todo:x.todo})),
    failedCases:results.filter(x=>!x.ok).map(x=>({file:x.file,tail:x.tail}))
  };
  const verificationDir = path.join(root, 'docs', 'verification');
  fs.mkdirSync(verificationDir, { recursive: true });
  fs.writeFileSync(path.join(verificationDir, 'RELEASE_TEST_RUN_RESULT.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'junit.xml'), junitXml(results));
  fs.writeFileSync(path.join(root, 'docs', 'PRE_INFRA_TEST_EXECUTION_RESULT.json'), JSON.stringify({
    schemaVersion: 'opscore.pre-infra-test-execution.v1',
    release: pkg.version,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    declaredNodeEngine: String(pkg.engines?.node || 'UNDECLARED'),
    tests: report.totalTests,
    passed: report.passedTests,
    failed: report.failedTests,
    skipped: report.skippedTests,
    todo: report.todoTests,
    unaccounted: report.unaccountedTests,
    testAccountingValid: report.testAccountingValid,
    status: report.status,
    runtimeMinimumSatisfied: report.runtimeMinimumSatisfied,
    runtimeEngineRangeSatisfied: report.runtimeEngineRangeSatisfied,
    evidenceSource: 'Node TAP/JUnit summaries reconciled per test case; skipped and TODO cases are reported separately and never counted as passed.',
    productionCertification: false
  }, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'FAIL' ? 1 : 0;
}
function summarizeResults(results,nodeVersion,declaredNodeEngine){
 const passedFiles=results.filter(r=>r.ok).length,failedFiles=results.length-passedFiles;
 const totalTests=results.reduce((n,r)=>n+(r.tests||0),0);
 const passedTests=results.reduce((n,r)=>n+(r.pass||0),0);
 const failedTests=results.reduce((n,r)=>n+(r.fail||0)+(r.cancelled||0),0);
 const skippedTests=results.reduce((n,r)=>n+(r.skipped||0),0);
 const todoTests=results.reduce((n,r)=>n+(r.todo||0),0);
 const accounted=passedTests+failedTests+skippedTests+todoTests;
 const unaccountedTests=totalTests-accounted,testAccountingValid=unaccountedTests===0&&accounted===totalTests;
 const runtimeMinimumSatisfied=satisfiesNodeMinimum(nodeVersion,declaredNodeEngine);
 const runtimeEngineRangeSatisfied=satisfiesNodeEngine(nodeVersion,declaredNodeEngine);
 const status=failedFiles!==0||failedTests!==0||!testAccountingValid||!runtimeEngineRangeSatisfied
  ? 'FAIL' : (skippedTests>0||todoTests>0?'PASS_WITH_SKIPS':'PASS');
 return {passedFiles,failedFiles,totalTests,passedTests,failedTests,skippedTests,todoTests,unaccountedTests,testAccountingValid,
  skippedFiles:results.filter(r=>r.skipped>0).length,todoFiles:results.filter(r=>r.todo>0).length,
  runtimeMinimumSatisfied,runtimeEngineRangeSatisfied,status};
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={junitXml,normalizeTestcaseIdentity,parseSummary,parseTapCases,summarizeResults};
