#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API = 'https://api.github.com';
const TAG = 'v0.11.62.18-commercial-source-package';
const RELEASE_ID = 450480423;
const EXPECTED_OLD_TAG_SHA = '63da7abe69c00d2311af02c5955ff77d5fffb0b5';
const SECTION_START = '<!-- OPSCORE .18 CURRENT BUILD START -->';
const SECTION_END = '<!-- OPSCORE .18 CURRENT BUILD END -->';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function assert(value, code) {
  if (!value) throw new Error(code);
}
function authHeaders(extra = {}) {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  assert(token.length > 0, 'GITHUB_TOKEN_MISSING');
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra
  };
}
function repositoryName() {
  const value = String(process.env.GITHUB_REPOSITORY || '');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value), 'GITHUB_REPOSITORY_INVALID');
  return value;
}
async function apiJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders(init.headers || {})
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text.slice(0, 1600) }; }
  }
  if (!response.ok) {
    throw new Error('GITHUB_API_' + response.status + ': ' + JSON.stringify(data).slice(0, 1800));
  }
  return data;
}
async function uploadAsset(uploadBase, name, bytes, contentType, digest, existing) {
  const old = existing.find(asset => asset.name === name);
  if (old) {
    assert(old.digest === 'sha256:' + digest, 'EXISTING_ASSET_DIGEST_MISMATCH:' + name);
    return old;
  }

  const response = await fetch(uploadBase + '?name=' + encodeURIComponent(name), {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': contentType,
      'Content-Length': String(bytes.length)
    }),
    body: bytes
  });
  const text = await response.text();
  let asset = null;
  try { asset = JSON.parse(text); }
  catch { asset = { raw: text.slice(0, 1600) }; }
  assert(response.ok, 'RELEASE_ASSET_UPLOAD_' + response.status + ':' + JSON.stringify(asset).slice(0, 1600));
  assert(asset && asset.id && asset.name === name && asset.browser_download_url, 'RELEASE_ASSET_RESPONSE_INVALID:' + name);
  if (asset.digest) {
    assert(asset.digest === 'sha256:' + digest, 'GITHUB_ASSET_DIGEST_MISMATCH:' + name);
  } else {
    const download = await fetch(asset.browser_download_url, { headers: authHeaders() });
    assert(download.ok, 'UPLOADED_ASSET_REDOWNLOAD_FAILED:' + name);
    const downloadedDigest = sha256(Buffer.from(await download.arrayBuffer()));
    assert(downloadedDigest === digest, 'UPLOADED_ASSET_REDOWNLOAD_DIGEST_MISMATCH:' + name);
  }
  return asset;
}
function replaceSection(_body, section) {
  // Keep the release description single-source-of-truth: no stale commit,
  // archive filename, digest, or old run remains above the current build.
  return [
    '## OpsCore v0.11.62 — isolated commercial source package (.18)',
    '',
    'This release is a draft/pre-release source-package candidate. The exact versioned archive, source commit, SHA-256 and Secure Release run below are authoritative.',
    '',
    'All older assets retained in the release history are historical and superseded. Do not use them for verification or handoff.',
    '',
    'The release grants no license, authorizes no distribution, and does not certify Production. See the buyer trust pack inside the exact archive for security and environment residuals.',
    '',
    section
  ].join('\\n') + '\\n';
}

async function main() {
  const repository = repositoryName();
  const sourceCommit = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  const runId = String(process.env.GITHUB_RUN_ID || '').trim();
  const releaseTag = String(process.env.RELEASE_TAG || '').trim();
  const archivePath = path.resolve(String(process.env.RELEASE_ARCHIVE_PATH || ''));
  const statementPath = path.resolve(String(process.env.RELEASE_STATEMENT_PATH || ''));

  assert(/^[a-f0-9]{40}$/.test(sourceCommit), 'SOURCE_COMMIT_INVALID');
  assert(/^[1-9][0-9]*$/.test(runId), 'RUN_ID_INVALID');
  assert(releaseTag === TAG, 'RELEASE_TAG_NOT_EXACT');
  assert(fs.existsSync(archivePath) && fs.statSync(archivePath).isFile(), 'RELEASE_ARCHIVE_MISSING');
  assert(fs.existsSync(statementPath) && fs.statSync(statementPath).isFile(), 'RELEASE_STATEMENT_MISSING');

  const archiveBytes = fs.readFileSync(archivePath);
  const archiveDigest = sha256(archiveBytes);
  const statement = JSON.parse(fs.readFileSync(statementPath, 'utf8'));
  assert(statement.schemaVersion === 'opscore.commercial-release-statement.v2', 'RELEASE_STATEMENT_SCHEMA_INVALID');
  assert(statement.version === '0.11.62', 'RELEASE_STATEMENT_VERSION_MISMATCH');
  assert(statement.releaseTag === TAG, 'RELEASE_STATEMENT_TAG_MISMATCH');
  assert(statement.sourceCommit === sourceCommit, 'RELEASE_STATEMENT_COMMIT_MISMATCH');
  assert(String(statement.pipelineId) === runId, 'RELEASE_STATEMENT_RUN_ID_MISMATCH');
  assert(statement.artifact && statement.artifact.bytes === archiveBytes.length, 'RELEASE_STATEMENT_BYTES_MISMATCH');
  assert(statement.artifact.sha256 && statement.artifact.sha256.algorithm === 'SHA-256', 'RELEASE_STATEMENT_HASH_ALGORITHM_INVALID');
  assert(statement.artifact.sha256.value === archiveDigest, 'RELEASE_STATEMENT_HASH_MISMATCH');
  assert(statement.commercialClosure === 'PASS_WITH_BUYER_RESIDUALS', 'COMMERCIAL_CLOSURE_STATUS_NOT_ACCEPTABLE');
  assert(statement.licenseGrant === 'NONE_PENDING_RIGHTS_HOLDER_DECISION', 'UNEXPECTED_LICENSE_GRANT_STATE');
  assert(statement.distributionAuthorized === false, 'UNEXPECTED_DISTRIBUTION_AUTHORIZATION');
  assert(statement.productionCertification === false, 'UNEXPECTED_PRODUCTION_CERTIFICATION');
  assert(Array.isArray(statement.residuals), 'RELEASE_STATEMENT_RESIDUALS_MISSING');
  assert(statement.residuals.some(item => String(item).includes('OPSC_APP_SECURITY')), 'OPSC_APP_SECURITY_RESIDUAL_NOT_DISCLOSED');
  assert(statement.residuals.some(item => String(item).includes('GHSA-fc5q-39xc-vjpf')), 'PICOMATCH_ADVISORY_RESIDUAL_NOT_DISCLOSED');

  const suffix = 'v0.11.62.18-' + sourceCommit.slice(0, 12) + '-' + runId;
  const archiveName = 'OpsCore-release-' + suffix + '.zip';
  const statementName = 'COMMERCIAL_RELEASE_STATEMENT-' + suffix + '.json';
  const checksumName = archiveName + '.sha256';

  statement.artifact.filename = archiveName;
  const finalStatementBytes = Buffer.from(JSON.stringify(statement, null, 2) + '\n', 'utf8');
  const statementDigest = sha256(finalStatementBytes);
  const checksumBytes = Buffer.from(archiveDigest + '  ' + archiveName + '\n', 'utf8');
  const checksumDigest = sha256(checksumBytes);
  fs.writeFileSync(statementPath, finalStatementBytes);
  fs.writeFileSync(archivePath + '.sha256', checksumBytes);

  const base = API + '/repos/' + repository;
  const branchRef = await apiJson(base + '/git/ref/heads/' + encodeURIComponent('release/v0.11.62.18-commercial-source-package'));
  assert(branchRef.object && branchRef.object.sha === sourceCommit, 'STALE_RELEASE_RUN_BRANCH_HEAD_MISMATCH');
  const release = await apiJson(base + '/releases/' + RELEASE_ID);
  assert(release.tag_name === TAG, 'DRAFT_RELEASE_TAG_MISMATCH');
  assert(release.draft === true && release.prerelease === true && release.published_at === null,
    'RELEASE_NOT_UNPUBLISHED_DRAFT_PRERELEASE');
  assert(release.upload_url, 'RELEASE_UPLOAD_URL_MISSING');
  const uploadBase = release.upload_url.replace(/\{\?name,label\}$/, '');
  assert(uploadBase.startsWith('https://uploads.github.com/'), 'RELEASE_UPLOAD_HOST_INVALID');
  const existingAssets = Array.isArray(release.assets) ? release.assets : [];

  const assets = [];
  assets.push(await uploadAsset(uploadBase, archiveName, archiveBytes, 'application/zip', archiveDigest, existingAssets));
  assets.push(await uploadAsset(uploadBase, statementName, finalStatementBytes, 'application/json', statementDigest, existingAssets));
  assets.push(await uploadAsset(uploadBase, checksumName, checksumBytes, 'text/plain', checksumDigest, existingAssets));

  // Change only the isolated .18 tag, and only from the known original .18 commit.
  const refGetUrl = base + '/git/ref/tags/' + encodeURIComponent(TAG);
  const refPatchUrl = base + '/git/refs/tags/' + encodeURIComponent(TAG);
  const currentRef = await apiJson(refGetUrl);
  assert(currentRef.object && currentRef.object.type === 'commit', 'RELEASE_TAG_NOT_LIGHTWEIGHT_COMMIT');
  const currentSha = String(currentRef.object.sha || '').toLowerCase();
  if (currentSha !== sourceCommit) {
    let isPriorIsolatedReleaseTag = currentSha === EXPECTED_OLD_TAG_SHA;
    if (!isPriorIsolatedReleaseTag) {
      const comparison = await apiJson(base + '/compare/' + encodeURIComponent(currentSha + '...' + sourceCommit));
      isPriorIsolatedReleaseTag = comparison.status === 'ahead' &&
        Number(comparison.ahead_by) >= 1 &&
        comparison.base_commit && comparison.base_commit.sha === currentSha;
    }
    assert(isPriorIsolatedReleaseTag, 'RELEASE_TAG_NOT_ON_ISOLATED_ANCESTRY:' + currentSha);
    const latestBranchRef = await apiJson(base + '/git/ref/heads/' + encodeURIComponent('release/v0.11.62.18-commercial-source-package'));
    assert(latestBranchRef.object && latestBranchRef.object.sha === sourceCommit, 'STALE_RELEASE_RUN_BEFORE_TAG_ADVANCE');
    await apiJson(refPatchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: sourceCommit, force: true })
    });
  }
  const movedRef = await apiJson(refGetUrl);
  assert(movedRef.object && movedRef.object.sha === sourceCommit, 'RELEASE_TAG_ADVANCE_VERIFICATION_FAILED');

  const runUrl = 'https://github.com/' + repository + '/actions/runs/' + runId;
  const section = [
    SECTION_START,
    '## Authoritative .18 build — supersedes previous assets',
    '',
    '- Source commit: ' + sourceCommit,
    '- Release tag: ' + TAG,
    '- Secure Release run: ' + runUrl,
    '- Archive: ' + archiveName,
    '- Archive size: ' + archiveBytes.length + ' bytes',
    '- Archive SHA-256: ' + archiveDigest,
    '- Statement: ' + statementName,
    '- Statement SHA-256: ' + statementDigest,
    '- Checksum sidecar: ' + checksumName,
    '',
    'Use only this versioned asset set. Earlier unversioned .18 assets are historical and superseded.',
    'The release remains draft and prerelease. No license is granted, distribution is not authorized, and Production certification is not issued.',
    '',
    ...assets.map(asset => '- Current release asset: ' + asset.name),
    'Download the three named files from the Assets section of this draft release page; do not use any historical/superseded asset.',
    SECTION_END
  ].join('\n');

  const body = replaceSection(String(release.body || ''), section);
  const updated = await apiJson(base + '/releases/' + release.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: TAG,
      name: 'OpsCore Platform v0.11.62 — commercial source package (.18)',
      body,
      draft: true,
      prerelease: true
    })
  });
  assert(updated.draft === true && updated.prerelease === true && updated.published_at === null, 'RELEASE_DRAFT_STATE_CHANGED');
  assert(updated.tag_name === TAG, 'RELEASE_TAG_NAME_CHANGED');

  const finalRef = await apiJson(refGetUrl);
  assert(finalRef.object && finalRef.object.sha === sourceCommit, 'FINAL_TAG_PIN_MISMATCH');
  process.stdout.write(JSON.stringify({
    status: 'DRAFT_RELEASE_ASSETS_VERIFIED_AND_TAG_PINNED',
    releaseId: release.id,
    draft: updated.draft,
    prerelease: updated.prerelease,
    publishedAt: updated.published_at,
    tag: TAG,
    sourceCommit,
    runId,
    archive: { name: archiveName, bytes: archiveBytes.length, sha256: archiveDigest, githubDigest: assets[0].digest },
    statement: { name: statementName, sha256: statementDigest, githubDigest: assets[1].digest },
    checksum: { name: checksumName, sha256: checksumDigest, githubDigest: assets[2].digest },
    assets: assets.map(asset => ({ id: asset.id, name: asset.name, digest: asset.digest, url: asset.browser_download_url }))
  }, null, 2) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.message ? error.message : error) + '\n');
  process.exitCode = 1;
});
