'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createPostgresPool}=require('../src/adapters/postgres');
const {parseMigrationFilename,compareMigrationFilenames,LEGACY_CHECKSUM_RECONCILIATIONS,buildMigrationPlan}=require('../src/postgres-migration-plan');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'sql','postgres');
const EXPECTED_042_COLUMNS=[
['feature_flags','id','text','NO'],['feature_flags','organization_id','text','NO'],['feature_flags','flag_key','text','NO'],['feature_flags','enabled','integer','NO'],['feature_flags','reason','text','NO'],['feature_flags','updated_by','text','NO'],['feature_flags','created_at','text','NO'],['feature_flags','updated_at','text','NO'],
['safe_mode_states','organization_id','text','NO'],['safe_mode_states','enabled','integer','NO'],['safe_mode_states','reason','text','NO'],['safe_mode_states','updated_by','text','NO'],['safe_mode_states','updated_at','text','NO'],
['control_plane_runs','id','text','NO'],['control_plane_runs','organization_id','text','NO'],['control_plane_runs','run_type','text','NO'],['control_plane_runs','result_json','text','NO'],['control_plane_runs','result_sha256','text','NO'],['control_plane_runs','created_by','text','NO'],['control_plane_runs','created_at','text','NO']];
function emit(payload,code=0){process.stdout.write(JSON.stringify({schemaVersion:'opscore.postgres-migration-runner.v1',generatedAt:new Date().toISOString(),...payload},null,2)+'\n');process.exitCode=code;}
function hash(s){return crypto.createHash('sha256').update(s,'utf8').digest('hex');}
function readMigrations(){return fs.readdirSync(DIR).filter(parseMigrationFilename).sort(compareMigrationFilenames).map(filename=>{const content=fs.readFileSync(path.join(DIR,filename),'utf8');return{filename,content,sha256:hash(content)};});}
function assertTarget(url,database,apply){
 if(String(url.hostname||'').toLowerCase().includes('-pooler'))throw new Error('MIGRATION_DIRECT_CONNECTION_REQUIRED');
 const preview=/preview|test|testing|ci|acceptance|scratch|disposable/i.test(database);
 if(!preview&&process.env.OPSC_MIGRATION_ALLOW_PRODUCTION!=='1')throw new Error('MIGRATION_TARGET_NOT_PREVIEW_OR_TEST');
 if(apply&&process.env.OPSC_MIGRATION_CONFIRM_DATABASE!==database)throw new Error('MIGRATION_DATABASE_CONFIRMATION_REQUIRED');
 return preview?'preview-or-test':'production-explicit-opt-in';
}
async function verifyLegacy042Catalog(client){
 const columns=(await client.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('feature_flags','safe_mode_states','control_plane_runs')")).rows;
 const actual=new Set(columns.map(x=>[x.table_name,x.column_name,x.data_type,x.is_nullable].join('|')));
 const missingColumns=EXPECTED_042_COLUMNS.map(x=>x.join('|')).filter(x=>!actual.has(x));
 const names=['feature_flags','safe_mode_states','control_plane_runs'];
 const tables=(await client.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[names])).rows;
 const secure=new Set(tables.filter(x=>x.relrowsecurity&&x.relforcerowsecurity).map(x=>x.relname));
 const missingRlsTables=names.filter(x=>!secure.has(x));
 const policies=(await client.query("SELECT c.relname,p.polpermissive AS permissive,pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND p.polname='opscore_tenant_boundary_guard'",[names])).rows;
 const tenantBound=x=>{const s=String(x||'').toLowerCase();return s.includes('opscore_current_tenant()')||(s.includes('current_setting')&&s.includes('app.tenant_id'));};
 const valid=new Set(policies.filter(x=>x.permissive===true&&tenantBound(x.using_expr)&&tenantBound(x.check_expr)).map(x=>x.relname));
 const missingPolicies=names.filter(x=>!valid.has(x));
 const constraints=(await client.query("SELECT conname FROM pg_constraint WHERE conrelid=ANY(ARRAY['public.feature_flags'::regclass,'public.safe_mode_states'::regclass,'public.control_plane_runs'::regclass])")).rows;
 const constraintNames=new Set(constraints.map(x=>x.conname));
 const required=['feature_flags_pkey','feature_flags_organization_id_flag_key_key','feature_flags_enabled_check','feature_flags_organization_id_fkey','feature_flags_updated_by_fkey','safe_mode_states_pkey','safe_mode_states_enabled_check','safe_mode_states_organization_id_fkey','safe_mode_states_updated_by_fkey','control_plane_runs_pkey','control_plane_runs_organization_id_fkey','control_plane_runs_created_by_fkey'];
 const missingConstraints=required.filter(x=>!constraintNames.has(x));
 const hasUniqueIndex=(await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='feature_flags_organization_id_flag_key_key'")).rowCount===1;
 const legacy042PolicyWasPermissive=policies.length===3&&policies.every(x=>x.permissive===true);
 const verified=actual.size===EXPECTED_042_COLUMNS.length&&!missingColumns.length&&!missingRlsTables.length&&!missingPolicies.length&&!missingConstraints.length&&hasUniqueIndex&&legacy042PolicyWasPermissive;
 return {verified,verifier:'control_plane_catalog_equivalence_v1',expectedColumns:EXPECTED_042_COLUMNS.length,actualColumns:actual.size,missingColumns,missingRlsTables,missingPolicies,missingConstraints,uniqueIndexPresent:hasUniqueIndex,legacy042PolicyWasPermissive,note:'This validates the historical 042 catalog before migration 053 normalizes its default-PERMISSIVE tenant policy into a separate PERMISSIVE access policy and RESTRICTIVE boundary guard.'};
}
async function verifyControlPlane053Catalog(client){
 const names=['feature_flags','safe_mode_states','control_plane_runs'];
 const tables=(await client.query(
  "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",
  [names]
 )).rows;
 const policies=(await client.query(
  "SELECT c.relname AS table_name,p.polname AS policy_name,p.polpermissive AS permissive,p.polcmd AS command,p.polroles::text AS policy_roles,pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
  [names]
 )).rows;
 // Compare pg_get_expr's canonical representation verbatim; quoted literal whitespace is significant.
 const expectedExpr="(organization_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))";
 const results=names.map(tableName=>{
  const tableRows=tables.filter(x=>x.relname===tableName);
  const rows=policies.filter(x=>x.table_name===tableName);
  const permissive=rows.filter(x=>x.policy_name==='opscore_tenant_permissive'&&x.permissive===true);
  const restrictive=rows.filter(x=>x.policy_name==='opscore_tenant_boundary_guard'&&x.permissive===false);
   const expressionExact=row=>row.using_expr===expectedExpr&&row.check_expr===expectedExpr;
  const valid=tableRows.length===1&&tableRows[0].relrowsecurity===true&&tableRows[0].relforcerowsecurity===true&&
   rows.length===2&&permissive.length===1&&restrictive.length===1&&
   [permissive[0],restrictive[0]].every(row=>row.command==='*'&&row.policy_roles==='{0}'&&expressionExact(row));
  return {
   table:tableName,
   status:valid?'PASS':'FAIL',
   rlsEnabled:tableRows[0]?.relrowsecurity===true,
   forceRls:tableRows[0]?.relforcerowsecurity===true,
   policyCount:rows.length,
   permissivePolicies:permissive.length,
   restrictivePolicies:restrictive.length,
   unexpectedPolicies:rows.filter(x=>!['opscore_tenant_permissive','opscore_tenant_boundary_guard'].includes(x.policy_name)).map(x=>x.policy_name),
   exactTenantPredicates:[...permissive,...restrictive].filter(expressionExact).length
  };
 });
 return {
  verified:results.every(x=>x.status==='PASS'),
  verifier:'control_plane_053_catalog_equivalence_v1',
  tables:results,
  note:'Catalog-equivalence proof only; it does not establish byte-for-byte identity of the historical migration payload or behavioral Tenant A/B acceptance.'
 };
}
async function main(){
 const raw=String(process.env.OPSC_MIGRATION_DATABASE_URL||'').trim();if(!raw)throw new Error('OPSC_MIGRATION_DATABASE_URL_REQUIRED');
 let url;try{url=new URL(raw);}catch{throw new Error('OPSC_MIGRATION_DATABASE_URL_INVALID');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('MIGRATION_DATABASE_URL_PROTOCOL_INVALID');
 const apply=process.argv.includes('--apply');
 const pool=createPostgresPool({connectionString:raw,max:1,statementTimeoutMs:30000,idleInTransactionSessionTimeoutMs:30000});
 let client,locked=false;
 try{
  client=await pool.connect();
  const info=(await client.query("SELECT current_database() AS database,current_user AS role,current_setting('server_version') AS server_version,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname=current_user")).rows[0];
  if(!info||info.role!=='neondb_owner'||info.superuser||!info.bypass_rls)throw new Error('MIGRATION_ROLE_NOT_ALLOWED');
  const targetClass=assertTarget(url,info.database,apply);
  await client.query("SELECT pg_advisory_lock(hashtext(current_database()),hashtext('opscore-schema-migrations'))");locked=true;
  const ledgerExists=(await client.query("SELECT to_regclass('public.schema_migrations') AS ledger")).rows[0]?.ledger;
  let ledger;
  if(!ledgerExists){
   // Virgin preview/test DBs: bootstrap ledger only under --apply. Never invent history on production.
   if(!apply){ledger=[];}
   else if(targetClass!=='preview-or-test'){throw new Error('MIGRATION_LEDGER_MISSING');}
   else{
    await client.query("CREATE TABLE public.schema_migrations (filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    ledger=[];
   }
  }else{
   ledger=(await client.query('SELECT filename,sha256 FROM public.schema_migrations ORDER BY filename')).rows;
  }
  const migrations=readMigrations();
  const legacy=LEGACY_CHECKSUM_RECONCILIATIONS['042_control_plane_tables.sql'];
  const row42=ledger.find(x=>x.filename===legacy.ledgerFilename),file42=migrations.find(x=>x.filename==='042_control_plane_tables.sql');
  const reconciliation053=LEGACY_CHECKSUM_RECONCILIATIONS['053_control_plane_restrictive_tenant_guards.sql'];
  const row53=ledger.find(x=>x.filename===reconciliation053.ledgerFilename),file53=migrations.find(x=>x.filename==='053_control_plane_restrictive_tenant_guards.sql');
  let legacy042Evidence=null,controlPlane053Evidence=null,verifiedLegacy=[];
  if(row42&&file42&&String(row42.sha256).toLowerCase()===legacy.ledgerSha256&&file42.sha256===legacy.sourceSha256){legacy042Evidence=await verifyLegacy042Catalog(client);if(legacy042Evidence.verified)verifiedLegacy.push('042_control_plane_tables.sql');}
  if(row53&&file53&&String(row53.sha256).toLowerCase()===reconciliation053.ledgerSha256&&file53.sha256===reconciliation053.sourceSha256){controlPlane053Evidence=await verifyControlPlane053Catalog(client);if(controlPlane053Evidence.verified)verifiedLegacy.push('053_control_plane_restrictive_tenant_guards.sql');}
  const plan=buildMigrationPlan(migrations,ledger,verifiedLegacy);
  if(plan.blockers.length){emit({status:'BLOCKED',target:{database:info.database,role:info.role,targetClass},serverVersion:info.server_version,legacy042Evidence,controlPlane053Evidence,pending:plan.pending.map(x=>x.filename),skipped:plan.skipped,blockers:plan.blockers,note:'No SQL changes were made because migration history or catalog reconciliation was not fully verified.'},2);return;}
  if(!apply){emit({status:'DRY_RUN_PASS',target:{database:info.database,role:info.role,targetClass},serverVersion:info.server_version,legacy042Evidence,controlPlane053Evidence,pending:plan.pending.map(x=>({filename:x.filename,sha256:x.sha256})),skipped:plan.skipped,note:'No database changes were made. Apply requires --apply and exact OPSC_MIGRATION_CONFIRM_DATABASE.'});return;}
  const applied=[];
  for(const migration of plan.pending){
   await client.query('BEGIN');
   try{
    await client.query("SELECT set_config('opscore.app_role','opscore_app',true),set_config('opscore.fn_owner','neondb_owner',true)");
    await client.query(migration.content);
    await client.query('INSERT INTO public.schema_migrations(filename,sha256,applied_at) VALUES ($1,$2,clock_timestamp())',[migration.filename,migration.sha256]);
    await client.query('COMMIT');applied.push({filename:migration.filename,sha256:migration.sha256});
   }catch(error){try{await client.query('ROLLBACK');}catch(_){}throw new Error('MIGRATION_APPLY_FAILED:'+migration.filename+':'+(error.code||error.message));}
  }
  const post=(await client.query(String.raw`
WITH runtime_role AS (
  SELECT * FROM pg_roles WHERE rolname='opscore_runtime'
),
runtime_policy_function_gaps AS (
  SELECT count(*) AS gap_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN runtime_role rr
  WHERE n.nspname='public'
    AND p.proname LIKE 'opscore_%'
    AND EXISTS (
      SELECT 1
      FROM pg_policies pol
      WHERE pol.schemaname='public'
        AND (
          COALESCE(pol.qual,'') LIKE '%'||p.proname||'(%'
          OR COALESCE(pol.with_check,'') LIKE '%'||p.proname||'(%'
        )
    )
    AND NOT has_function_privilege(rr.rolname,p.oid,'EXECUTE')
),
runtime_control_plane_gaps AS (
  SELECT count(*) AS gap_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN runtime_role rr
  WHERE n.nspname='public'
    AND c.relkind='r'
    AND (
      (c.relname='feature_flags' AND (
        NOT has_table_privilege(rr.rolname,c.oid,'SELECT')
        OR NOT has_table_privilege(rr.rolname,c.oid,'INSERT')
        OR NOT has_table_privilege(rr.rolname,c.oid,'UPDATE')
        OR has_table_privilege(rr.rolname,c.oid,'DELETE')
        OR has_table_privilege(rr.rolname,c.oid,'TRUNCATE')
      ))
      OR
      (c.relname='safe_mode_states' AND (
        NOT has_table_privilege(rr.rolname,c.oid,'SELECT')
        OR NOT has_table_privilege(rr.rolname,c.oid,'INSERT')
        OR NOT has_table_privilege(rr.rolname,c.oid,'UPDATE')
        OR has_table_privilege(rr.rolname,c.oid,'DELETE')
        OR has_table_privilege(rr.rolname,c.oid,'TRUNCATE')
      ))
      OR
      (c.relname='control_plane_runs' AND (
        NOT has_table_privilege(rr.rolname,c.oid,'INSERT')
        OR has_table_privilege(rr.rolname,c.oid,'SELECT')
        OR has_table_privilege(rr.rolname,c.oid,'UPDATE')
        OR has_table_privilege(rr.rolname,c.oid,'DELETE')
        OR has_table_privilege(rr.rolname,c.oid,'TRUNCATE')
      ))
    )
)
SELECT
  has_database_privilege('opscore_app',current_database(),'CREATE') AS app_can_create_database_schema,
  has_schema_privilege('opscore_app','public','CREATE') AS app_can_create_public_objects,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.schema_migrations'::regclass) AS ledger_forced_rls,
  has_table_privilege('opscore_app','public.schema_migrations','SELECT') AS app_can_select,
  has_table_privilege('opscore_app','public.schema_migrations','INSERT') AS app_can_insert,
  has_table_privilege('opscore_app','public.schema_migrations','UPDATE') AS app_can_update,
  has_table_privilege('opscore_app','public.schema_migrations','DELETE') AS app_can_delete,
  (SELECT prosecdef FROM pg_proc WHERE oid='public.opscore_is_privileged()'::regprocedure) AS privileged_is_definer,
  (SELECT proconfig @> ARRAY['row_security=off'] FROM pg_proc WHERE oid='public.opscore_create_password_reset_token(text,text,text,timestamptz)'::regprocedure) AS reset_token_row_security_off,
  EXISTS(SELECT 1 FROM runtime_role) AS runtime_role_exists,
  COALESCE((SELECT rolcanlogin FROM runtime_role),false) AS runtime_login,
  COALESCE((SELECT rolsuper FROM runtime_role),false) AS runtime_superuser,
  COALESCE((SELECT rolbypassrls FROM runtime_role),false) AS runtime_bypassrls,
  COALESCE((SELECT rolcreaterole FROM runtime_role),false) AS runtime_create_role,
  COALESCE((SELECT rolcreatedb FROM runtime_role),false) AS runtime_create_db,
  CASE WHEN EXISTS(SELECT 1 FROM runtime_role) THEN has_database_privilege('opscore_runtime',current_database(),'CREATE') ELSE false END AS runtime_database_create,
  CASE WHEN EXISTS(SELECT 1 FROM runtime_role) THEN has_schema_privilege('opscore_runtime','public','CREATE') ELSE false END AS runtime_schema_create,
  CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neon_superuser') AND EXISTS(SELECT 1 FROM runtime_role) THEN pg_has_role('opscore_runtime','neon_superuser','MEMBER') ELSE false END AS runtime_neon_superuser_member,
  CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neon_superuser') AND EXISTS(SELECT 1 FROM runtime_role) THEN pg_has_role('opscore_runtime','neon_superuser','SET') ELSE false END AS runtime_neon_superuser_set,
  CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='opscore_app') AND EXISTS(SELECT 1 FROM runtime_role) THEN pg_has_role('opscore_runtime','opscore_app','MEMBER') ELSE false END AS runtime_app_role_member,
  CASE WHEN EXISTS(SELECT 1 FROM runtime_role) AND to_regclass('public.schema_migrations') IS NOT NULL THEN (
    has_table_privilege('opscore_runtime','public.schema_migrations','SELECT')
    OR has_table_privilege('opscore_runtime','public.schema_migrations','INSERT')
    OR has_table_privilege('opscore_runtime','public.schema_migrations','UPDATE')
    OR has_table_privilege('opscore_runtime','public.schema_migrations','DELETE')
  ) ELSE false END AS runtime_schema_migrations_access,
  CASE WHEN EXISTS(SELECT 1 FROM runtime_role) AND to_regprocedure('public.opscore_is_privileged()') IS NOT NULL THEN has_function_privilege('opscore_runtime','public.opscore_is_privileged()','EXECUTE') ELSE false END AS runtime_privileged_execute,
  COALESCE((SELECT gap_count FROM runtime_policy_function_gaps),0) AS runtime_policy_function_gap_count,
  COALESCE((SELECT gap_count FROM runtime_control_plane_gaps),0) AS runtime_control_plane_privilege_gap_count,
  CASE WHEN EXISTS(SELECT 1 FROM runtime_role) THEN (
    SELECT count(*)
    FROM pg_auth_members am
    JOIN pg_roles r ON r.oid=am.roleid
    JOIN runtime_role rr ON am.member=rr.oid
    WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
  ) ELSE 0 END AS runtime_privileged_membership_count,
  (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('control_plane_runs','feature_flags','safe_mode_states')) AS control_plane_table_count,
  (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('control_plane_runs','feature_flags','safe_mode_states') AND (
    (c.relname='feature_flags' AND (NOT has_table_privilege('opscore_app',c.oid,'SELECT') OR NOT has_table_privilege('opscore_app',c.oid,'INSERT') OR NOT has_table_privilege('opscore_app',c.oid,'UPDATE') OR has_table_privilege('opscore_app',c.oid,'DELETE') OR has_table_privilege('opscore_app',c.oid,'TRUNCATE')))
    OR (c.relname='safe_mode_states' AND (NOT has_table_privilege('opscore_app',c.oid,'SELECT') OR NOT has_table_privilege('opscore_app',c.oid,'INSERT') OR NOT has_table_privilege('opscore_app',c.oid,'UPDATE') OR has_table_privilege('opscore_app',c.oid,'DELETE') OR has_table_privilege('opscore_app',c.oid,'TRUNCATE')))
    OR (c.relname='control_plane_runs' AND (NOT has_table_privilege('opscore_app',c.oid,'INSERT') OR has_table_privilege('opscore_app',c.oid,'SELECT') OR has_table_privilege('opscore_app',c.oid,'UPDATE') OR has_table_privilege('opscore_app',c.oid,'DELETE') OR has_table_privilege('opscore_app',c.oid,'TRUNCATE')))
  )) AS control_plane_privilege_gap_count
`)).rows[0];
  const controlPlaneTables=['feature_flags','safe_mode_states','control_plane_runs'];
  const controlPlanePolicyRows=(await client.query(`SELECT c.relname AS table_name,p.polname AS policy_name,p.polpermissive AS permissive,pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[controlPlaneTables])).rows;
  const controlPlaneRlsRows=(await client.query(`SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[controlPlaneTables])).rows;
  const tenantPolicyExprValid=x=>{const value=String(x||'').toLowerCase();return value.includes("current_setting('app.tenant_id'")&&value.includes('organization_id')&&value.includes('nullif(');};
  const controlPlanePolicyResults=controlPlaneTables.map(tableName=>{
    const rows=controlPlanePolicyRows.filter(x=>x.table_name===tableName);
    const rls=controlPlaneRlsRows.find(x=>x.table_name===tableName);
    const permissive=rows.filter(x=>x.policy_name==='opscore_tenant_permissive'&&x.permissive===true&&tenantPolicyExprValid(x.using_expr)&&tenantPolicyExprValid(x.check_expr));
    const restrictive=rows.filter(x=>x.policy_name==='opscore_tenant_boundary_guard'&&x.permissive===false&&tenantPolicyExprValid(x.using_expr)&&tenantPolicyExprValid(x.check_expr));
    const valid=Boolean(rls&&rls.rls_enabled&&rls.force_rls&&permissive.length===1&&restrictive.length===1);
    return {table:tableName,status:valid?'PASS':'FAIL',rlsEnabled:Boolean(rls&&rls.rls_enabled),forceRls:Boolean(rls&&rls.force_rls),permissiveTenantPolicies:permissive.length,restrictiveBoundaryGuards:restrictive.length};
  });
  post.control_plane_policy_results=controlPlanePolicyResults;
  post.control_plane_restrictive_policy_gap_count=controlPlanePolicyResults.filter(x=>x.status!=='PASS').length;
  if((!post.runtime_role_exists&&(post.app_can_create_database_schema||post.app_can_create_public_objects||post.app_can_select||post.app_can_insert||post.app_can_update||post.app_can_delete||Number(post.control_plane_privilege_gap_count)!==0))||!post.ledger_forced_rls||!post.privileged_is_definer||!post.reset_token_row_security_off||Number(post.control_plane_table_count)!==3||Number(post.control_plane_restrictive_policy_gap_count)!==0||(post.runtime_role_exists&&(!post.runtime_login||post.runtime_superuser||post.runtime_bypassrls||post.runtime_create_role||post.runtime_create_db||Number(post.runtime_privileged_membership_count)!==0||post.runtime_database_create||post.runtime_schema_create||post.runtime_neon_superuser_member||post.runtime_neon_superuser_set||post.runtime_app_role_member||post.runtime_schema_migrations_access||!post.runtime_privileged_execute||Number(post.runtime_policy_function_gap_count)!==0||Number(post.runtime_control_plane_privilege_gap_count)!==0)))throw new Error('MIGRATION_POSTCONDITION_FAILED');
  emit({status:'APPLIED_AND_VERIFIED',target:{database:info.database,role:info.role,targetClass},serverVersion:info.server_version,legacy042Evidence,controlPlane053Evidence,applied,skipped:plan.skipped,postconditions:post,note:'Only the explicitly confirmed target database was changed. Production certification remains separate.'});
 }finally{
  if(locked&&client)try{await client.query("SELECT pg_advisory_unlock(hashtext(current_database()),hashtext('opscore-schema-migrations'))");}catch(_){}
  if(client)client.release();await pool.end();
 }
}
main().catch(error=>emit({status:'FAIL',reason:error.message||String(error),note:'Connection values are never emitted; no production fallback is used.'},1));
