#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
const eas=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
const checks=[
 ['package version matches app.json',pkg.version===app.version],
 ['Android package configured',Boolean(app.android?.package)],
 ['iOS bundle identifier configured',Boolean(app.ios?.bundleIdentifier)],
 ['development EAS profile',Boolean(eas.build?.development)],
 ['preview EAS profile',Boolean(eas.build?.preview)],
 ['production EAS profile',Boolean(eas.build?.production)],
 ['submit production profile',Boolean(eas.submit?.production)],
 ['source entry exists',fs.existsSync(path.join(root,'App.js'))],
];
for(const [label,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${label}`);
console.log(JSON.stringify({version:pkg.version,androidPackage:app.android?.package,iosBundleIdentifier:app.ios?.bundleIdentifier,lockfile:fs.existsSync(path.join(root,'package-lock.json'))?'PRESENT':'NOT_INCLUDED',signedAndroid:'UNVERIFIED',signedIOS:'UNVERIFIED',physicalDevice:'UNVERIFIED'},null,2));
process.exitCode=checks.some(([,ok])=>!ok)?1:0;
