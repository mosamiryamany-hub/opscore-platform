#!/usr/bin/env node
'use strict';
const [major,minor,patch]=process.versions.node.split('.').map(Number);
const min=[22,23,4];
const lowerOk=major>min[0] || (major===min[0] && (minor>min[1] || (minor===min[1] && patch>=min[2])));
const upperOk=major<23; const ok=lowerOk && upperOk;
const out={schemaVersion:'opscore.runtime-version-gate.v1',node:process.versions.node,required: '>=22.23.4 <23',pass:ok};
process.stdout.write(JSON.stringify(out,null,2)+'\n');
process.exitCode=ok?0:1;
