#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { languages } = require('../src/contact-center-languages');
const quote = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
const header = ['source_row','language','code','duplicate_of_row','catalog_status','text_quality_verified','speech_recognition_verified','speech_synthesis_verified','native_speaker_review','test_run_id','reviewer','notes'];
const lines = [header.join(',')];
for (const item of languages) lines.push([
  item.listNumber,item.name,item.code,item.duplicateOf ?? '',item.catalogStatus,'false','false','false','not_run','','',
  'Machine-assisted draft; not tested against a concrete provider/model and native-speaker acceptance suite.'
].map(quote).join(','));
const csv = lines.join('\r\n')+'\r\n';
const outputArg = process.argv.slice(2).find(x => x.startsWith('--output='));
if (outputArg) {
  const dest = path.resolve(outputArg.slice('--output='.length));
  fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest,csv,{encoding:'utf8',mode:0o600});
  process.stdout.write(`${dest}\n`);
} else process.stdout.write(csv);
