#!/usr/bin/env python3
"""Create and verify a non-finalizing Neon restore from the exact Production Primary snapshot."""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ID = "summer-leaf-18448271"
PRIMARY_BRANCH_ID = "br-proud-salad-bcshhdap"
SNAPSHOT_ID = os.environ.get("OPSC_PRIMARY_SNAPSHOT_ID", "snap-floral-sea-bcug7fd3").strip()
DATABASE_NAME = "opscore_acceptance"
ROLE_NAME = "neondb_owner"
RESTORE_NAME = "opscore-primary-snapshot-restore-proof"
PROOF_PATH = Path("docs/ops/evidence/PRODUCTION_PRIMARY_RESTORE_PROOF.json")
SHA_RE = re.compile(r"^[a-f0-9]{64}$")
BRANCH_RE = re.compile(r"^br-[a-z0-9-]{8,80}$")
SNAPSHOT_RE = re.compile(r"^snap-[a-z0-9-]{8,80}$")
REQUIRED_PENDING = {
    "063_signed_tenant_context_verifier.sql",
    "064_signed_tenant_context_work_orders_routing.sql",
    "065_signed_tenant_context_evidence_upload_chunks.sql",
    "066_signed_tenant_context_verifier_search_path_hardening.sql",
    "067_signed_tenant_context_rls_policy_accessor_alignment.sql",
    "069_technician_location_trail_tenant_persistence.sql",
}

SCHEMA_INVENTORY_SQL = r"""
WITH schema_items AS (
 SELECT 'schema|'||n.nspname||'|'||pg_catalog.pg_get_userbyid(n.nspowner)||'|'||coalesce(n.nspacl::text,'') AS item
 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT 'extension|'||e.extname||'|'||e.extversion||'|'||n.nspname
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 UNION ALL
 SELECT 'relation|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||c.relpersistence::text||'|'||
        c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||
        pg_catalog.pg_get_userbyid(c.relowner)||'|'||coalesce(c.reloptions::text,'')||'|'||
        coalesce(c.relacl::text,'')||'|'||c.relispartition::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
   AND c.relkind IN ('r','p','v','m','S','f','i','I')
 UNION ALL
 SELECT 'column|'||n.nspname||'.'||c.relname||'.'||a.attname||'|'||
        pg_catalog.format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||
        a.attidentity::text||'|'||a.attgenerated::text||'|'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')||'|'||
        coalesce(a.attcollation::regcollation::text,'')||'|'||coalesce(a.attacl::text,'')
 FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
   AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'constraint|'||coalesce(n.nspname,'')||'.'||coalesce(c.relname,t.typname,'')||'|'||
        con.conname||'|'||pg_catalog.pg_get_constraintdef(con.oid,true)||'|'||
        con.convalidated::text||'|'||con.condeferrable::text||'|'||con.condeferred::text
 FROM pg_constraint con
 LEFT JOIN pg_class c ON c.oid=con.conrelid
 LEFT JOIN pg_namespace n ON n.oid=coalesce(c.relnamespace, (SELECT typnamespace FROM pg_type WHERE oid=con.contypid))
 LEFT JOIN pg_type t ON t.oid=con.contypid
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT 'index|'||schemaname||'.'||tablename||'.'||indexname||'|'||indexdef
 FROM pg_indexes
 WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'
 UNION ALL
 SELECT 'policy|'||schemaname||'.'||tablename||'.'||policyname||'|'||
        permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
 FROM pg_policies
 WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'
 UNION ALL
 SELECT 'function|'||n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')|'||
        pg_catalog.pg_get_userbyid(p.proowner)||'|'||p.prosecdef::text||'|'||coalesce(p.proconfig::text,'')||'|'||
        coalesce(p.proacl::text,'')||'|'||pg_catalog.pg_get_functiondef(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p','w')
 UNION ALL
 SELECT 'trigger|'||n.nspname||'.'||c.relname||'.'||t.tgname||'|'||pg_catalog.pg_get_triggerdef(t.oid,true)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT 'view|'||schemaname||'.'||viewname||'|'||definition
 FROM pg_views WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'
 UNION ALL
 SELECT 'type|'||n.nspname||'.'||t.typname||'|'||t.typtype::text||'|'||coalesce(t.typbasetype::regtype::text,'')||'|'||t.typnotnull::text||'|'||coalesce(t.typacl::text,'')
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT 'enum|'||n.nspname||'.'||t.typname||'|'||e.enumlabel
 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT 'sequence|'||schemaname||'.'||sequencename||'|'||start_value::text||'|'||min_value::text||'|'||max_value::text||'|'||increment_by::text||'|'||cycle::text||'|'||cache_size::text
 FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'
)
SELECT count(*)::int || '|' ||
       encode(digest(coalesce(string_agg(item,E'\n' ORDER BY item),''),'sha256'),'hex')
FROM schema_items
"""


def fail(code, detail=None):
    print(code)
    if detail is not None:
        print(json.dumps(detail, sort_keys=True)[:1800])
    raise SystemExit(1)


def api(method, path, body=None, query=None):
    suffix = "?" + urllib.parse.urlencode(query or {})
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        "https://console.neon.tech/api/v2/projects/" + PROJECT_ID + path + suffix,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + KEY,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        fail("NEON_API_REQUEST_FAILED", {
            "method": method,
            "path": path,
            "http_status": error.code,
            "detail": detail[:900],
        })


def list_branches():
    items = []
    cursor = None
    seen = set()
    for page in range(100):
        query = {"limit": 100}
        if cursor:
            query["cursor"] = cursor
        response = api("GET", "/branches", query=query)
        rows = response.get("branches") or []
        if not isinstance(rows, list):
            fail("NEON_BRANCH_LIST_INVALID")
        items.extend(rows)
        next_cursor = (response.get("pagination") or {}).get("next")
        if not next_cursor:
            return items
        next_cursor = str(next_cursor)
        if next_cursor in seen:
            fail("NEON_BRANCH_PAGINATION_CURSOR_REPEATED")
        seen.add(next_cursor)
        cursor = next_cursor
    fail("NEON_BRANCH_PAGINATION_PAGE_LIMIT_EXCEEDED")


def verify_snapshot():
    if not SNAPSHOT_RE.fullmatch(SNAPSHOT_ID):
        fail("PRODUCTION_SNAPSHOT_ID_INVALID")
    response = api("GET", "/snapshots")
    snapshots = response.get("snapshots") or []
    matches = [item for item in snapshots if item.get("id") == SNAPSHOT_ID]
    if len(matches) != 1:
        fail("PRODUCTION_SNAPSHOT_NOT_UNIQUE_OR_MISSING", {"matches": len(matches)})
    source = matches[0].get("source_branch_id")
    if source != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_SNAPSHOT_SOURCE_MISMATCH", {"source_branch_id": source})
    return matches[0]


def find_or_create_real_restore(snapshot):
    branches = list_branches()
    primary = [b for b in branches if b.get("id") == PRIMARY_BRANCH_ID]
    if len(primary) != 1 or not primary[0].get("primary") or not primary[0].get("default"):
        fail("PRODUCTION_PRIMARY_IDENTITY_INVALID")

    valid = [
        b for b in branches
        if b.get("restored_from") == SNAPSHOT_ID
        and b.get("restore_status") == "restored"
        and b.get("restored_as") == PRIMARY_BRANCH_ID
        and str(b.get("current_state") or "").lower() == "ready"
        and not b.get("primary")
        and not b.get("default")
    ]
    if len(valid) > 1:
        fail("MULTIPLE_VALID_RESTORE_BRANCHES_REQUIRE_MANUAL_SELECTION", {
            "branch_ids": [b.get("id") for b in valid]
        })
    if valid:
        branch = valid[0]
        print("reuse_verified_snapshot_restore", branch.get("id"))
    else:
        if len(branches) >= 10:
            fail("BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION", {"active_branch_count": len(branches)})
        # Use Neon Restore Snapshot API, not POST /branches. finalize_restore=false is explicit.
        response = api(
            "POST",
            "/snapshots/" + SNAPSHOT_ID + "/restore",
            body={
                "name": RESTORE_NAME + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
                "target_branch_id": PRIMARY_BRANCH_ID,
                "finalize_restore": False,
            },
        )
        branch = response.get("branch") or {}
        branch_id = str(branch.get("id") or "")
        if not BRANCH_RE.fullmatch(branch_id):
            fail("SNAPSHOT_RESTORE_RESPONSE_MISSING_BRANCH_ID")
        print("snapshot_restore_created_branch", branch_id)

    branch_id = str(branch.get("id") or "")
    if not BRANCH_RE.fullmatch(branch_id):
        fail("RESTORE_BRANCH_ID_INVALID")
    for _ in range(60):
        response = api("GET", "/branches/" + branch_id)
        current = response.get("branch") or response
        if str(current.get("current_state") or "").lower() == "ready":
            branch = current
            break
        time.sleep(3)
    else:
        fail("RESTORE_BRANCH_NOT_READY", {"branch_id": branch_id})

    if branch.get("primary") or branch.get("default"):
        fail("RESTORE_BRANCH_MUST_NOT_BE_PRIMARY")
    if branch.get("restored_from") != SNAPSHOT_ID:
        fail("RESTORE_BRANCH_SNAPSHOT_PROVENANCE_MISMATCH")
    if branch.get("restore_status") != "restored":
        fail("RESTORE_BRANCH_STATUS_NOT_RESTORED")
    if branch.get("restored_as") != PRIMARY_BRANCH_ID:
        fail("RESTORE_BRANCH_TARGET_MISMATCH")
    if str(branch.get("current_state") or "").lower() != "ready":
        fail("RESTORE_BRANCH_NOT_READY")
    return branch


def direct_connection_uri(branch_id):
    response = api(
        "GET",
        "/connection_uri",
        query={
            "branch_id": branch_id,
            "database_name": DATABASE_NAME,
            "role_name": ROLE_NAME,
            "pooled": "false",
        },
    )
    uri = str(response.get("uri") or "")
    if not uri.startswith(("postgres://", "postgresql://")) or "-pooler" in uri.split("@")[-1].split("/")[0]:
        fail("RESTORE_PROOF_DIRECT_NEON_URI_REQUIRED")
    return uri


def psql(restore_uri, sql):
    result = subprocess.run(
        ["psql", restore_uri, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
        text=True,
        capture_output=True,
        timeout=60,
        env={**os.environ, "PGCONNECT_TIMEOUT": "10"},
    )
    if result.returncode != 0:
        stderr = re.sub(r"postgres(?:ql)?://[^\s@]+@", "postgresql://[redacted]@", result.stderr)
        fail("RESTORE_PROOF_PSQL_FAILED", {"stderr": stderr[-900:], "sql": sql[:200]})
    return result.stdout.strip()


def schema_inventory(uri):
    output = psql(uri, SCHEMA_INVENTORY_SQL)
    parts = output.split("|")
    if len(parts) != 2:
        fail("RESTORE_PROOF_SCHEMA_INVENTORY_INVALID", {"output": output[:300]})
    item_count = int(parts[0])
    digest = parts[1].strip()
    if item_count <= 0 or not SHA_RE.fullmatch(digest):
        fail("RESTORE_PROOF_SCHEMA_INVENTORY_INVALID")
    return item_count, digest


def table_data_inventory(uri):
    table_output = psql(uri, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    table_names = [line for line in table_output.splitlines() if line]
    if len(table_names) < 1:
        fail("RESTORE_PROOF_PUBLIC_TABLE_COUNT_MISMATCH", {"count": len(table_names)})

    statements = []
    for name in table_names:
        identifier = '"' + name.replace('"', '""') + '"'
        literal = name.replace("'", "''")
        statements.append(
            "SELECT '" + literal + "'::text AS table_name, "
            "count(*)::bigint AS row_count, "
            "encode(digest(coalesce(string_agg(encode(digest(row_to_json(t)::text,'sha256'),'hex'), '' "
            "ORDER BY row_to_json(t)::text),''),'sha256'),'hex') AS row_content_sha256 "
            "FROM public." + identifier + " AS t"
        )
    query = "SELECT table_name, row_count::text, row_content_sha256 FROM ("
    query += " UNION ALL ".join(statements)
    query += ") AS inventory ORDER BY table_name"
    inventory_output = psql(uri, query)
    inventory_rows = []
    for line in inventory_output.splitlines():
        parts = line.split("|")
        if len(parts) != 3 or not re.fullmatch(r"[a-f0-9]{64}", parts[2]):
            fail("RESTORE_PROOF_TABLE_CONTENT_INVENTORY_INVALID", {"row": line[:300]})
        inventory_rows.append((parts[0], int(parts[1]), parts[2]))
    if len(inventory_rows) != len(table_names):
        fail("RESTORE_PROOF_TABLE_CONTENT_INVENTORY_INCOMPLETE", {
            "expected": len(table_names),
            "actual": len(inventory_rows),
        })
    table_sha = hashlib.sha256("\n".join(table_names).encode("utf-8")).hexdigest()
    canonical_rows = "\n".join(
        name + "\t" + str(count) + "\t" + digest
        for name, count, digest in inventory_rows
    )
    content_sha = hashlib.sha256(canonical_rows.encode("utf-8")).hexdigest()
    return table_names, table_sha, content_sha


def main():
    global KEY
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
        fail("RESTORE_PROOF_MAIN_MANUAL_DISPATCH_REQUIRED")
    if os.environ.get("OPSC_CONFIRM_RESTORE_PROOF") != "CREATE_PRIMARY_RESTORE_PROOF":
        fail("RESTORE_PROOF_TYPED_CONFIRMATION_REQUIRED")
    KEY = str(os.environ.get("NEON_API_KEY") or "").strip()
    if not KEY:
        fail("NEON_API_KEY_MISSING")

    snapshot = verify_snapshot()
    branch = find_or_create_real_restore(snapshot)
    branch_id = str(branch["id"])

    primary_branch = api("GET", "/branches/" + PRIMARY_BRANCH_ID).get("branch") or {}
    if (
        primary_branch.get("id") != PRIMARY_BRANCH_ID
        or not primary_branch.get("primary")
        or not primary_branch.get("default")
        or str(primary_branch.get("current_state") or "").lower() != "ready"
    ):
        fail("RESTORE_PROOF_CURRENT_PRIMARY_IDENTITY_INVALID")

    primary_uri = direct_connection_uri(PRIMARY_BRANCH_ID)
    restore_uri = direct_connection_uri(branch_id)

    primary_identity = psql(primary_uri, "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version')")
    identity = psql(restore_uri, "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version')")
    for label, identity_value in (("primary", primary_identity), ("restore", identity)):
        identity_parts = identity_value.split("|")
        if len(identity_parts) != 3 or identity_parts[0] != DATABASE_NAME or identity_parts[1] != ROLE_NAME:
            fail("RESTORE_PROOF_DATABASE_IDENTITY_MISMATCH", {"target": label, "identity": identity_value})
    primary_version = primary_identity.split("|")[2]
    database_version = identity.split("|")[2]
    if primary_version != database_version:
        fail("RESTORE_PROOF_POSTGRES_VERSION_MISMATCH")

    primary_schema_count, primary_schema_sha = schema_inventory(primary_uri)
    schema_item_count, schema_sha = schema_inventory(restore_uri)
    if primary_schema_count != schema_item_count or primary_schema_sha != schema_sha:
        fail("RESTORE_PROOF_SCHEMA_DIFFERS_FROM_CURRENT_PRIMARY", {
            "primary_item_count": primary_schema_count,
            "restore_item_count": schema_item_count,
            "primary_schema_sha256": primary_schema_sha,
            "restore_schema_sha256": schema_sha,
        })

    primary_tables, primary_table_sha, primary_data_sha = table_data_inventory(primary_uri)
    table_names, table_sha, data_content_sha = table_data_inventory(restore_uri)
    public_table_count = len(table_names)
    if (
        primary_tables != table_names
        or primary_table_sha != table_sha
        or primary_data_sha != data_content_sha
    ):
        fail("RESTORE_PROOF_TABLE_DATA_DIFFERS_FROM_CURRENT_PRIMARY", {
            "primary_table_count": len(primary_tables),
            "restore_table_count": public_table_count,
            "primary_data_sha256": primary_data_sha,
            "restore_data_sha256": data_content_sha,
        })

    ledger_count = int(psql(restore_uri, "SELECT COUNT(*) FROM public.schema_migrations"))
    migration_rows = psql(
        restore_uri,
        "SELECT filename FROM public.schema_migrations WHERE filename IN ("
        "'063_signed_tenant_context_verifier.sql',"
        "'064_signed_tenant_context_work_orders_routing.sql',"
        "'065_signed_tenant_context_evidence_upload_chunks.sql',"
        "'066_signed_tenant_context_verifier_search_path_hardening.sql',"
        "'067_signed_tenant_context_rls_policy_accessor_alignment.sql',"
        "'068_opscore_app_role_privilege_lockdown.sql',"
        "'069_technician_location_trail_tenant_persistence.sql') ORDER BY filename",
    )
    applied = set(migration_rows.splitlines()) if migration_rows else set()
    expected = {"068_opscore_app_role_privilege_lockdown.sql"}
    if applied != expected:
        fail("RESTORE_PROOF_MIGRATION_LEDGER_BASELINE_MISMATCH", {"rows": sorted(applied)})
    if ledger_count != 62:
        fail("RESTORE_PROOF_MIGRATION_LEDGER_COUNT_MISMATCH", {"count": ledger_count})
    if psql(restore_uri, "SELECT to_regclass('public.technician_location_trail') IS NULL") != "t":
        fail("RESTORE_PROOF_TECHNICIAN_TRAIL_BASELINE_MISMATCH")

    organizations_count = int(psql(restore_uri, "SELECT COUNT(*) FROM public.organizations"))
    if organizations_count <= 0:
        fail("RESTORE_PROOF_CORE_TABLE_EMPTY")

    role_rows = psql(
        restore_uri,
        "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles "
        "WHERE rolname IN ('opscore_runtime','neondb_owner') ORDER BY rolname",
    )
    role_map = {}
    for line in role_rows.splitlines():
        fields = line.split("|")
        if len(fields) != 3:
            fail("RESTORE_PROOF_ROLE_QUERY_INVALID")
        role_map[fields[0]] = (fields[1] == "t", fields[2] == "t")
    if "opscore_runtime" not in role_map or "neondb_owner" not in role_map:
        fail("RESTORE_PROOF_REQUIRED_DATABASE_ROLE_MISSING")
    runtime_super, runtime_bypass = role_map["opscore_runtime"]
    owner_super, owner_bypass = role_map["neondb_owner"]
    if runtime_super or runtime_bypass or owner_super:
        fail("RESTORE_PROOF_RUNTIME_ROLE_BOUNDARY_FAILED", {
            "runtime_superuser": runtime_super,
            "runtime_bypass_rls": runtime_bypass,
            "owner_superuser": owner_super,
        })
    runtime_probe = psql(
        restore_uri,
        "BEGIN; SET LOCAL ROLE opscore_runtime; "
        "SELECT current_user || '|' || COUNT(*)::text FROM public.organizations; ROLLBACK",
    )
    runtime_probe_parts = runtime_probe.split("|")
    if runtime_probe_parts != ["opscore_runtime", "0"]:
        fail("RESTORE_PROOF_RUNTIME_RLS_DEFAULT_DENY_FAILED", {"probe": runtime_probe})

    rls_counts = psql(
        restore_uri,
        "SELECT count(*) || '|' || count(*) FILTER (WHERE c.relrowsecurity) || '|' || "
        "count(*) FILTER (WHERE c.relforcerowsecurity) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relkind='r'",
    )
    rls_parts = [int(value) for value in rls_counts.split("|")]
    if rls_parts != [135, 134, 134]:
        fail("RESTORE_PROOF_RLS_INVENTORY_MISMATCH", {"counts": rls_parts})

    proof = {
        "schemaVersion": "opscore.neon-primary-restore-proof.v1",
        "status": "PASS",
        "projectId": PROJECT_ID,
        "primaryBranchId": PRIMARY_BRANCH_ID,
        "snapshotId": SNAPSHOT_ID,
        "snapshotSourceBranchId": snapshot.get("source_branch_id"),
        "restoreSnapshotId": SNAPSHOT_ID,
        "restoreBranchId": branch_id,
        "restoreBranchState": "ready",
        "databaseName": DATABASE_NAME,
        "databaseIdentity": {"databaseName": DATABASE_NAME, "roleName": ROLE_NAME},
        "testedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "schemaSha256": schema_sha,
        "schemaInventoryItemCount": schema_item_count,
        "tableInventorySha256": table_sha,
        "dataContentSha256": data_content_sha,
        "publicTableCount": public_table_count,
        "checks": {
            "snapshot_provenance": {
                "status": "PASS",
                "restoreStatus": branch.get("restore_status"),
                "restoredAs": branch.get("restored_as"),
            },
            "restore_branch_ready": {
                "status": "PASS",
                "currentState": branch.get("current_state"),
                "branchId": branch_id,
            },
            "database_identity": {"status": "PASS", "serverVersion": database_version},
            "schema_catalog_read": {"status": "PASS", "schemaItemCount": schema_item_count, "definitionParityWithPrimary": True},
            "public_table_inventory": {
                "status": "PASS",
                "publicTableCount": public_table_count,
                "rlsEnabledTableCount": rls_parts[1],
                "forceRlsEnabledTableCount": rls_parts[2],
                "rowContentSha256": data_content_sha,
                "rowContentParityWithPrimary": True,
            },
            "migration_ledger_read": {
                "status": "PASS",
                "schemaMigrationsCount": ledger_count,
                "migration068Present": True,
                "migrations063to067And069Absent": True,
            },
            "core_table_read": {"status": "PASS", "organizationsCount": organizations_count},
            "runtime_role_boundary": {
                "status": "PASS",
                "runtimeRoleSuperuser": runtime_super,
                "runtimeRoleBypassRls": runtime_bypass,
                "ownerRoleBypassRls": owner_bypass,
                "organizationsVisibleWithoutTenantContext": 0,
            },
        },
    }
    PROOF_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(proof, indent=2, sort_keys=True) + "\n").encode("utf-8")
    PROOF_PATH.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    if not SHA_RE.fullmatch(digest):
        fail("RESTORE_PROOF_SHA256_INVALID")
    print("RESTORE_PROOF_STATUS=PASS")
    print("RESTORE_PROOF_BRANCH_ID=" + branch_id)
    print("RESTORE_PROOF_SHA256=" + digest)
    print("RESTORE_PROOF_PUBLIC_TABLES=" + str(public_table_count))
    print("RESTORE_PROOF_MIGRATION_LEDGER_ROWS=" + str(ledger_count))


if __name__ == "__main__":
    main()
