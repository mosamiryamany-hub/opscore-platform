#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const installed = name => lock.packages?.[`node_modules/${name}`]?.version || null;
const major = value => Number(String(value || '').split('.')[0]);
const minor = value => Number(String(value || '').split('.')[1]);
const checks = [
  ['Expo SDK 58 requested', /^\^?~?58\.0\.0$/.test(pkg.dependencies.expo) || /^\^?~?58\./.test(pkg.dependencies.expo)],
  ['lockfile resolves Expo SDK 58', major(installed('expo')) === 58],
  ['React Native 0.88 line', major(installed('react-native')) === 0 && minor(installed('react-native')) === 88],
  ['React 19.3 line', major(installed('react')) === 19 && minor(installed('react')) === 3],
  ['React DOM 19.3 line', major(installed('react-dom')) === 19 && minor(installed('react-dom')) === 3],
  ['Expo ImagePicker SDK 58 line', major(installed('expo-image-picker')) === 58],
  ['Expo Location SDK 58 line', major(installed('expo-location')) === 58],
  ['Expo Network SDK 58 line', major(installed('expo-network')) === 58],
  ['Expo SecureStore SDK 58 line', major(installed('expo-secure-store')) === 58],
  ['Expo SQLite SDK 58 line', major(installed('expo-sqlite')) === 58],
  ['node-forge patched version pinned', pkg.overrides?.['node-forge'] === '1.4.3' && installed('node-forge') === '1.4.3']
];
const result = {
  schemaVersion: 'opscore.mobile-dependency-gate.v2',
  status: checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL',
  releaseVersion: pkg.version,
  current: {
    expo: installed('expo'),
    reactNative: installed('react-native'),
    react: installed('react'),
    reactDom: installed('react-dom'),
    expoImagePicker: installed('expo-image-picker'),
    expoLocation: installed('expo-location'),
    expoNetwork: installed('expo-network'),
    expoSecureStore: installed('expo-secure-store'),
    expoSqlite: installed('expo-sqlite'),
    nodeForge: installed('node-forge')
  },
  checks: checks.map(([name, ok]) => ({ name, status: ok ? 'PASS' : 'FAIL' })),
  truthBoundary: 'Dependency alignment only; signed native binaries and physical-device validation are separate acceptance gates.'
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
