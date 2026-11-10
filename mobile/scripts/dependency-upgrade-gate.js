#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const desired={expo:'~57.0.31','react-native':'0.86.3'};
const actual={expo:lock.packages?.['node_modules/expo']?.version,rn:lock.packages?.['node_modules/react-native']?.version};
const checks=[
 ['Expo 57.0.31 target documented', pkg.dependencies.expo === '~57.0.31'],
 ['React Native 0.86.3 target documented', pkg.dependencies['react-native'] === '0.86.3'],
 ['lockfile matches Expo target', actual.expo === '57.0.31'],
 ['lockfile matches React Native target', actual.rn === '0.86.3']
];
console.log(JSON.stringify({schemaVersion:'opscore.mobile-dependency-gate.v1',status:checks.every(([,ok])=>ok)?'PASS':'PENDING_UPGRADE',current:{packageJson:{expo:pkg.dependencies.expo,reactNative:pkg.dependencies['react-native']},lockfile:actual},target:desired,checks:checks.map(([name,ok])=>({name,status:ok?'PASS':'FAIL'})),note:'The target is Expo 57.0.31 / React Native 0.86.3. Do not alter package.json without regenerating package-lock.json from a successful package-manager resolution.'},null,2));
process.exitCode=checks.every(([,ok])=>ok)?0:2;
