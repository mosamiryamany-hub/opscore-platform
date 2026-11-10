'use strict';
const MIGRATION_FILE_PATTERN = /^(\d{3})([a-z]?)_(.+)\.sql$/i;
const LEGACY_MIGRATION_RENAMES = Object.freeze({
  '044_system_tables_rls.sql': '040_system_tables_rls.sql'
});
const LEGACY_CHECKSUM_RECONCILIATIONS = Object.freeze({
  '042_control_plane_tables.sql': Object.freeze({
    ledgerFilename: '042_control_plane_tables.sql',
    ledgerSha256: 'cb62032f4764956822ea25cd412c29f8b9528a15f92ea03fa1b5e97417508d84',
    sourceSha256: '8b1dd407326d51aa1a01c9ebe09bd083b31e324203a7a48b00b141115c0f62d9',
    verifier: 'control_plane_catalog_equivalence_v1'
  })
});
function parseMigrationFilename(filename) {
  const match=MIGRATION_FILE_PATTERN.exec(String(filename||''));
  return match?{filename,number:Number(match[1]),suffix:String(match[2]||'').toLowerCase()}:null;
}
function compareMigrationFilenames(a,b) {
  const l=parseMigrationFilename(a),r=parseMigrationFilename(b);
  if(!l||!r)return String(a).localeCompare(String(b));
  return l.number-r.number||l.suffix.localeCompare(r.suffix)||String(a).localeCompare(String(b));
}
function buildMigrationPlan(migrations,ledgerRows,verifiedLegacyMigrations=[]) {
  const files=[...migrations].sort((a,b)=>compareMigrationFilenames(a.filename,b.filename));
  const ledger=new Map(),blockers=[],skipped=[],pending=[],verified=new Set(verifiedLegacyMigrations);
  for(const row of ledgerRows) {
    if(!row||!row.filename||!/^[a-f0-9]{64}$/i.test(String(row.sha256||''))) {
      blockers.push({code:'MIGRATION_LEDGER_ROW_INVALID',filename:row?.filename||null}); continue;
    }
    if(ledger.has(row.filename)) { blockers.push({code:'MIGRATION_LEDGER_DUPLICATE_FILENAME',filename:row.filename}); continue; }
    ledger.set(row.filename,String(row.sha256).toLowerCase());
  }
  const currentNames=new Set(files.map(x=>x.filename));
  const historicNames=new Set(Object.values(LEGACY_MIGRATION_RENAMES));
  for(const name of ledger.keys()) if(!currentNames.has(name)&&!historicNames.has(name)) blockers.push({code:'MIGRATION_LEDGER_ORPHANED_ROW',filename:name});
  for(const file of files) {
    const filename=file.filename,sourceSha=String(file.sha256||'').toLowerCase();
    if(!parseMigrationFilename(filename)||!/^[a-f0-9]{64}$/.test(sourceSha)) {blockers.push({code:'MIGRATION_SOURCE_FILE_INVALID',filename});continue;}
    const exact=ledger.get(filename);
    if(exact) {
      if(exact===sourceSha) {skipped.push({filename,reason:'exact-ledger-checksum-match'});continue;}
      const reconciliation=LEGACY_CHECKSUM_RECONCILIATIONS[filename];
      if(reconciliation&&reconciliation.ledgerSha256===exact&&reconciliation.sourceSha256===sourceSha&&verified.has(filename)) {
        skipped.push({filename,reason:'legacy-checksum-drift-catalog-equivalence-verified',verifier:reconciliation.verifier,ledgerSha256:exact,sourceSha256:sourceSha});continue;
      }
      blockers.push({code:'MIGRATION_CHECKSUM_MISMATCH',filename,ledgerSha256:exact,sourceSha256:sourceSha});continue;
    }
    const alias=LEGACY_MIGRATION_RENAMES[filename];
    if(alias&&ledger.has(alias)) {
      const old=ledger.get(alias);
      if(old===sourceSha) skipped.push({filename,reason:'legacy-rename-same-checksum',ledgerFilename:alias});
      else blockers.push({code:'MIGRATION_RENAME_CHECKSUM_MISMATCH',filename,ledgerFilename:alias,ledgerSha256:old,sourceSha256:sourceSha});
      continue;
    }
    pending.push(file);
  }
  return {pending,skipped,blockers};
}
module.exports={MIGRATION_FILE_PATTERN,LEGACY_MIGRATION_RENAMES,LEGACY_CHECKSUM_RECONCILIATIONS,parseMigrationFilename,compareMigrationFilenames,buildMigrationPlan};
