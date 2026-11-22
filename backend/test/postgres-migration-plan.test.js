'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {parseMigrationFilename,compareMigrationFilenames,buildMigrationPlan,LEGACY_CHECKSUM_RECONCILIATIONS}=require('../src/postgres-migration-plan');
const H42='8b1dd407326d51aa1a01c9ebe09bd083b31e324203a7a48b00b141115c0f62d9',OLD42='cb62032f4764956822ea25cd412c29f8b9528a15f92ea03fa1b5e97417508d84',H44='01e18ca761e6ca97c3ac259f1a67df95a7523ba5ca57b090d0d25ffa836ef338';
const H53='238863ead435124fc0975a353aeb2c135382f8e5bfc464e14dd7e22f427041ed',OLD53='238863ebd435124fc0975a353aeb2c135382f8e5bfc464e14dd7e22f427041ed';
test('031b migration suffix is parsed and ordered correctly',()=>{assert.deepEqual(parseMigrationFilename('031b_sessions_organization_id.sql'),{filename:'031b_sessions_organization_id.sql',number:31,suffix:'b'});assert.deepEqual(['032_identity_plane_rls.sql','031b_sessions_organization_id.sql','031_digital_twin_chain_hardening.sql'].sort(compareMigrationFilenames),['031_digital_twin_chain_hardening.sql','031b_sessions_organization_id.sql','032_identity_plane_rls.sql']);});
test('044 rename is skipped only when 040 ledger checksum matches',()=>{const p=buildMigrationPlan([{filename:'044_system_tables_rls.sql',sha256:H44}],[{filename:'040_system_tables_rls.sql',sha256:H44}]);assert.equal(p.blockers.length,0);assert.equal(p.pending.length,0);assert.equal(p.skipped[0].reason,'legacy-rename-same-checksum');});
test('042 checksum drift remains blocked until catalog-equivalence verification',()=>{const m={filename:'042_control_plane_tables.sql',sha256:H42},l=[{filename:'042_control_plane_tables.sql',sha256:OLD42}];assert.equal(buildMigrationPlan([m],l).blockers[0].code,'MIGRATION_CHECKSUM_MISMATCH');const p=buildMigrationPlan([m],l,['042_control_plane_tables.sql']);assert.equal(p.blockers.length,0);assert.equal(p.pending.length,0);assert.equal(p.skipped[0].reason,'legacy-checksum-drift-catalog-equivalence-verified');});
test('053 Preview checksum drift is skipped only after exact catalog-equivalence verification',()=>{const m={filename:'053_control_plane_restrictive_tenant_guards.sql',sha256:H53},l=[{filename:'053_control_plane_restrictive_tenant_guards.sql',sha256:OLD53}];assert.equal(buildMigrationPlan([m],l).blockers[0].code,'MIGRATION_CHECKSUM_MISMATCH');const p=buildMigrationPlan([m],l,['053_control_plane_restrictive_tenant_guards.sql']);assert.equal(p.blockers.length,0);assert.equal(p.pending.length,0);assert.equal(p.skipped[0].reason,'legacy-checksum-drift-catalog-equivalence-verified');assert.equal(p.skipped[0].verifier,'control_plane_053_catalog_equivalence_v1');});
test('053 reconciliation rejects any unrecognized ledger checksum',()=>{const m={filename:'053_control_plane_restrictive_tenant_guards.sql',sha256:H53},l=[{filename:'053_control_plane_restrictive_tenant_guards.sql',sha256:'f'.repeat(64)}];const p=buildMigrationPlan([m],l,['053_control_plane_restrictive_tenant_guards.sql']);assert.equal(p.blockers[0].code,'MIGRATION_CHECKSUM_MISMATCH');});
test('unrecognized checksum mismatch is never waived',()=>{const p=buildMigrationPlan([{filename:'042_control_plane_tables.sql',sha256:'a'.repeat(64)}],[{filename:'042_control_plane_tables.sql',sha256:OLD42}],['042_control_plane_tables.sql']);assert.equal(p.blockers[0].code,'MIGRATION_CHECKSUM_MISMATCH');});
test('verified baseline leaves only migrations 043,045,046 pending',()=>{const files=[{filename:'046_migration_ledger_access_lockdown.sql',sha256:'6'.repeat(64)},{filename:'045_password_reset_token_definer_hardening.sql',sha256:'5'.repeat(64)},{filename:'043_work_order_context_privileged_definer.sql',sha256:'3'.repeat(64)},{filename:'044_system_tables_rls.sql',sha256:H44},{filename:'042_control_plane_tables.sql',sha256:H42}],ledger=[{filename:'042_control_plane_tables.sql',sha256:OLD42},{filename:'040_system_tables_rls.sql',sha256:H44}],p=buildMigrationPlan(files,ledger,['042_control_plane_tables.sql']);assert.equal(p.blockers.length,0);assert.deepEqual(p.pending.map(x=>x.filename),['043_work_order_context_privileged_definer.sql','045_password_reset_token_definer_hardening.sql','046_migration_ledger_access_lockdown.sql']);});
test('unknown ledger records block the plan',()=>{const p=buildMigrationPlan([{filename:'046_migration_ledger_access_lockdown.sql',sha256:'6'.repeat(64)}],[{filename:'099_unknown_old.sql',sha256:'9'.repeat(64)}]);assert.equal(p.blockers[0].code,'MIGRATION_LEDGER_ORPHANED_ROW');});

const OPTIONAL_APP_MIGRATIONS=[
 ['023_contextual_sync_and_rls.sql','56377ea333a5b85035385b4bcd85a12a01657cde28e50004f236f46151f3f113'],
 ['043_work_order_context_privileged_definer.sql','89aaccd220355d8af6e8693aac13edcfd1a8ca3f61236af1c0ee6e6554c94dc5'],
 ['044_system_tables_rls.sql','01e18ca761e6ca97c3ac259f1a67df95a7523ba5ca57b090d0d25ffa836ef338'],
 ['046_migration_ledger_access_lockdown.sql','e33072aafa38af8fabbc2ed98a8de6caf8aa5e35c2b0eb58aa4e7376f3311487'],
 ['047_control_plane_runtime_privileges.sql','d86b5290d243aae02163e49ccb9cc8a3da0e4adc5d416ea80e18dc6ffd22ec37'],
 ['048_system_table_app_grants.sql','093534137ed72ef5972f2fd203abc369aa89933c48bdc373620c25c23f6baea1'],
 ['049_app_role_table_privileges.sql','d2225d45849b029cb611d918fbf09eacd88c7df29b17f1f14029c0cb95ed8e7b'],
 ['050_app_role_schema_create.sql','417e6ac6d00e8b393d71f2ba833df15fce91947633a6bb3043991ca7b939a900'],
 ['051_revoke_runtime_role_ddl_privileges.sql','b1057ee7c46e81322cf9e3e5a4feae72322bed5f56f9501d08d164b134ddc2b5'],
 ['061_operational_autopilot_tenant_persistence.sql','c44f383e0095ac3815743b754876f7403cc8eb69e33b3faddbf1bbef5bd286dd']
];
test('optional legacy app-role migration checksum reconciliations are exact and catalog-gated',()=>{
 const dir=path.join(__dirname,'..','sql','postgres');
 for(const [filename,ledgerSha] of OPTIONAL_APP_MIGRATIONS){
  const record=LEGACY_CHECKSUM_RECONCILIATIONS[filename];
  assert.ok(record,filename+' reconciliation missing');
  assert.equal(record.ledgerFilename,filename);
  assert.equal(record.ledgerSha256,ledgerSha);
  assert.equal(record.verifier,'legacy_app_role_optional_catalog_equivalence_v1');
  const source=fs.readFileSync(path.join(dir,filename));
  const actual=crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(record.sourceSha256,actual,filename+' source digest mismatch');
  const migration={filename,sha256:actual};
  const ledger=[{filename,sha256:ledgerSha}];
  assert.equal(buildMigrationPlan([migration],ledger).blockers[0].code,'MIGRATION_CHECKSUM_MISMATCH');
  const verified=buildMigrationPlan([migration],ledger,[filename]);
  assert.equal(verified.blockers.length,0,filename+' should reconcile only after catalog proof');
  assert.equal(verified.pending.length,0);
  assert.equal(verified.skipped[0].verifier,'legacy_app_role_optional_catalog_equivalence_v1');
 }
});
