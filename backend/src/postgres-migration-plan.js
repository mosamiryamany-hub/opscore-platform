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
  }),
  // Preview 2026-11-11 records this historical 053 digest. The committed source
  // digest differs, so skip is permitted only after the runner proves exact
  // control-plane policy/RLS catalog equivalence on the target database.
  '053_control_plane_restrictive_tenant_guards.sql': Object.freeze({
    ledgerFilename: '053_control_plane_restrictive_tenant_guards.sql',
    ledgerSha256: '238863ebd435124fc0975a353aeb2c135382f8e5bfc464e14dd7e22f427041ed',
    sourceSha256: '238863ead435124fc0975a353aeb2c135382f8e5bfc464e14dd7e22f427041ed',
    verifier: 'control_plane_053_catalog_equivalence_v1'
  }),
  '023_contextual_sync_and_rls.sql': Object.freeze({
    ledgerFilename: '023_contextual_sync_and_rls.sql',
    ledgerSha256: '56377ea333a5b85035385b4bcd85a12a01657cde28e50004f236f46151f3f113',
    sourceSha256: '7b636eb995e1f534879da381fc2f987516572a511c01e4919ca73b27320ebced',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '043_work_order_context_privileged_definer.sql': Object.freeze({
    ledgerFilename: '043_work_order_context_privileged_definer.sql',
    ledgerSha256: '89aaccd220355d8af6e8693aac13edcfd1a8ca3f61236af1c0ee6e6554c94dc5',
    sourceSha256: '9440ea5fa2ec14e79ab7ec6bc6d3376325e7c3b3ccd0374aeb51067e181352b6',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '044_system_tables_rls.sql': Object.freeze({
    ledgerFilename: '044_system_tables_rls.sql',
    ledgerSha256: '01e18ca761e6ca97c3ac259f1a67df95a7523ba5ca57b090d0d25ffa836ef338',
    sourceSha256: '8d9588b6bdef8d6a6c421d47191654ba1d688faaad42bda4f42532fd2ee218d1',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '046_migration_ledger_access_lockdown.sql': Object.freeze({
    ledgerFilename: '046_migration_ledger_access_lockdown.sql',
    ledgerSha256: 'e33072aafa38af8fabbc2ed98a8de6caf8aa5e35c2b0eb58aa4e7376f3311487',
    sourceSha256: 'd512d1ec62d23bc5e5c4b67a3e08087cecbfc38dca940b1bb21cdd742f65d9de',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '047_control_plane_runtime_privileges.sql': Object.freeze({
    ledgerFilename: '047_control_plane_runtime_privileges.sql',
    ledgerSha256: 'd86b5290d243aae02163e49ccb9cc8a3da0e4adc5d416ea80e18dc6ffd22ec37',
    sourceSha256: '6e2caa4f19b94e5a1e38b75a50d02facc3fd1d953f5cc73954dc18435d931444',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '048_system_table_app_grants.sql': Object.freeze({
    ledgerFilename: '048_system_table_app_grants.sql',
    ledgerSha256: '093534137ed72ef5972f2fd203abc369aa89933c48bdc373620c25c23f6baea1',
    sourceSha256: '49aeb2a22fa5ac7eae8186c7110bb0de1bd2ec854a2332c5fa85e7eebb0c459a',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '049_app_role_table_privileges.sql': Object.freeze({
    ledgerFilename: '049_app_role_table_privileges.sql',
    ledgerSha256: 'd2225d45849b029cb611d918fbf09eacd88c7df29b17f1f14029c0cb95ed8e7b',
    sourceSha256: '511b53d261b9a2f3d7785d9ebea07fd771fd5506dce229cd99c0842b67e04b4d',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '050_app_role_schema_create.sql': Object.freeze({
    ledgerFilename: '050_app_role_schema_create.sql',
    ledgerSha256: '417e6ac6d00e8b393d71f2ba833df15fce91947633a6bb3043991ca7b939a900',
    sourceSha256: 'be7a587ecf40df716c57527435f387d229eaa7458a2df3db17bae076a497485c',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '051_revoke_runtime_role_ddl_privileges.sql': Object.freeze({
    ledgerFilename: '051_revoke_runtime_role_ddl_privileges.sql',
    ledgerSha256: 'b1057ee7c46e81322cf9e3e5a4feae72322bed5f56f9501d08d164b134ddc2b5',
    sourceSha256: '60e11b22751bdebea824459cb1c434521ad14a30f6c0bd87253c84e8220103f2',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
  }),
  '061_operational_autopilot_tenant_persistence.sql': Object.freeze({
    ledgerFilename: '061_operational_autopilot_tenant_persistence.sql',
    ledgerSha256: 'c44f383e0095ac3815743b754876f7403cc8eb69e33b3faddbf1bbef5bd286dd',
    sourceSha256: '62e3df7a93535e8e38f910e8c2804765352e687c76f3d22f51c4ce2d9aa4a545',
    verifier: 'legacy_app_role_optional_catalog_equivalence_v1'
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
