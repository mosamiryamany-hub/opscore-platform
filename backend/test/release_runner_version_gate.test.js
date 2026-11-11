'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {satisfiesNodeEngine}=require('../scripts/node-engine');
test('release runner requires the complete declared Node.js engine range',()=>{
 const range='>=22.23.4 <23';
 for(const v of ['22.23.4','22.24.0','22.30.0','v22.23.4'])assert.equal(satisfiesNodeEngine(v,range),true,v);
 for(const v of ['22.16.0','22.22.99','22.23.0','22.23.1','22.23.3','23.0.0','24.1.0','21.99.99','22.23.4-nightly'])assert.equal(satisfiesNodeEngine(v,range),false,v);
 assert.equal(satisfiesNodeEngine('22.23.4','>=22'),false,'unknown range syntax must fail closed');
});
