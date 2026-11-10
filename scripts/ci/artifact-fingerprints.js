#!/usr/bin/env node
'use strict';
/**
 * Commit-tied SHA-256 manifest. Hashes Git object contents, never the mutable
 * working tree. Historical artifacts remain explicitly superseded.
 */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const outPath = process.argv[2] || 'dist/ARTIFACT_SHA256_MANIFEST.json';
const gitBuffer = (...args) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
const gitText = (...args) => gitBuffer(...args).toString('utf8').trim();
const commit = gitText('rev-parse', 'HEAD');
const tree = gitText('rev-parse', 'HEAD^{tree}');

// NUL-delimited tree records preserve spaces, quotes, and non-ASCII paths.
const rawTree = gitBuffer('ls-tree', '-r', '-z', '--full-tree', 'HEAD');
const records = rawTree.toString('utf8').split('\0').filter(Boolean).map((record) => {
  const tab = record.indexOf('\t');
  if (tab < 0) throw new Error('INVALID_GIT_TREE_RECORD');
  const [mode, type, objectId] = record.slice(0, tab).split(' ');
  return { mode, type, objectId, path: record.slice(tab + 1) };
});

// Fetch all blobs in one Git subprocess. This is both faster and exact: no checkout
// filters, CRLF conversion, symlink dereference, or mutable working-tree bytes.
const blobIds = [...new Set(records.filter(e => e.type === 'blob').map(e => e.objectId))];
const batch = execFileSync('git', ['cat-file', '--batch'], { input: blobIds.map(id => id + '\n').join(''), maxBuffer: 256 * 1024 * 1024 });
const blobs = new Map();
let offset = 0;
for (const requestedId of blobIds) {
  const headerEnd = batch.indexOf(0x0a, offset);
  if (headerEnd < 0) throw new Error('INVALID_GIT_CAT_FILE_HEADER');
  const [objectId, type, sizeText] = batch.subarray(offset, headerEnd).toString('ascii').split(' ');
  const size = Number(sizeText);
  if (objectId !== requestedId || type !== 'blob' || !Number.isSafeInteger(size) || size < 0)
    throw new Error('INVALID_GIT_CAT_FILE_OBJECT');
  const start = headerEnd + 1;
  const end = start + size;
  if (end >= batch.length || batch[end] !== 0x0a) throw new Error('INVALID_GIT_CAT_FILE_CONTENT');
  blobs.set(objectId, batch.subarray(start, end));
  offset = end + 1;
}

const entries = records.map((entry) => {
  let content;
  if (entry.type === 'blob') {
    content = blobs.get(entry.objectId);
    if (!content) throw new Error('MISSING_COMMITTED_BLOB:' + entry.path);
  } else if (entry.mode === '160000' && entry.type === 'commit') {
    content = Buffer.from('gitlink:' + entry.objectId, 'utf8');
  } else {
    throw new Error('UNSUPPORTED_GIT_TREE_ENTRY:' + entry.mode + ':' + entry.type + ':' + entry.path);
  }
  return {
    path: entry.path,
    mode: entry.mode,
    type: entry.type,
    objectId: entry.objectId,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: content.length
  };
}).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

const h = createHash('sha256');
for (const e of entries) h.update(e.path + '\0' + e.mode + '\0' + e.type + '\0' + e.objectId + '\0' + e.sha256 + '\0' + e.bytes + '\n');
const manifest = {
  schemaVersion: 'opscore.artifact-fingerprints.v2',
  commit,
  treeSha256: tree,
  pipelineId: process.env.CI_PIPELINE_ID || null,
  pipelineUrl: process.env.CI_PIPELINE_URL || null,
  ref: process.env.CI_COMMIT_REF_NAME || null,
  generatedAt: new Date().toISOString(),
  algorithm: 'sha256',
  hashSource: 'git-object-database',
  fileCount: entries.length,
  resolvedCount: entries.length,
  missingCount: 0,
  fingerprintSha256: h.digest('hex'),
  priorArtifactsPolicy: 'Artifact hashes produced before this commit are not reproducible from the current tree and are recorded as superseded, not recomputed. Only this manifest is commit-tied evidence.',
  entries
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('artifact-fingerprints: commit=' + commit + ' files=' + entries.length + ' resolved=' + entries.length + ' fingerprint=' + manifest.fingerprintSha256);
