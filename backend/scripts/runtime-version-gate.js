#!/usr/bin/env node
'use strict';
const pkg=require('../package.json');
const {satisfiesNodeEngine}=require('./node-engine');
const required=String(pkg.engines?.node||'');
const pass=satisfiesNodeEngine(process.versions.node,required);
const result={schemaVersion:'opscore.runtime-version-gate.v1',node:process.versions.node,required,pass};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.exitCode=pass?0:1;
