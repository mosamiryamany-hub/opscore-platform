'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeTestcaseIdentity,parseSummary,parseTapCases,summarizeResults}=require('../scripts/release-test-runner');
const TAP=`TAP version 13
ok 1 - completed
ok 2 - optional external gate # SKIP database URL not configured
not ok 3 - expected future implementation # TODO tracked separately
1..3
# tests 3
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 1
# todo 1
# duration_ms 10.0
`;
test('Node TAP summary parses pass, fail, skip and TODO independently',()=>{
 assert.deepEqual(parseSummary(TAP),{tests:3,pass:1,fail:0,cancelled:0,skipped:1,todo:1});
 const c=parseTapCases(TAP,'sample.test.js');assert.equal(c.length,3);
 assert.equal(c[0].failed,false);assert.equal(c[1].skipped,true);
 assert.equal(c[2].todo,true);assert.equal(c[2].failed,false);
});
test('release result does not count skipped or TODO cases as passed',()=>{
 const s=parseSummary(TAP),r=summarizeResults([{ok:true,tests:s.tests,pass:s.pass,fail:s.fail,cancelled:s.cancelled,skipped:s.skipped,todo:s.todo}],'22.23.4','>=22.23.4 <23');
 assert.equal(r.totalTests,3);assert.equal(r.passedTests,1);assert.equal(r.failedTests,0);
 assert.equal(r.skippedTests,1);assert.equal(r.todoTests,1);assert.equal(r.unaccountedTests,0);
 assert.equal(r.testAccountingValid,true);assert.equal(r.status,'PASS_WITH_SKIPS');
});
test('release result fails when TAP omits test cases from all status counters',()=>{
 const r=summarizeResults([{ok:true,tests:2,pass:1,fail:0,cancelled:0,skipped:0,todo:0}],'22.23.4','>=22.23.4 <23');
 assert.equal(r.unaccountedTests,1);assert.equal(r.testAccountingValid,false);assert.equal(r.status,'FAIL');
});
test('release result fails on failed files or unsupported Node ranges',()=>{
 const f=summarizeResults([{ok:false,tests:1,pass:0,fail:1,cancelled:0,skipped:0,todo:0}],'22.23.4','>=22.23.4 <23');
 assert.equal(f.status,'FAIL');
 const r=summarizeResults([{ok:true,tests:1,pass:1,fail:0,cancelled:0,skipped:0,todo:0}],'24.0.0','>=22.23.4 <23');
 assert.equal(r.status,'FAIL');
});
test('JUnit TODO testcases normalize to skipped rather than failed',()=>{
 const raw='<testcase name="todo" classname="sample" failure="expected"><skipped type="todo"/><failure message="expected">expected</failure></testcase>';
 const n=normalizeTestcaseIdentity(raw,'sample.test.js',1);
 assert.match(n,/<skipped type="todo"\/>/);assert.doesNotMatch(n,/\bfailure=/);assert.doesNotMatch(n,/<failure\b/);
});
