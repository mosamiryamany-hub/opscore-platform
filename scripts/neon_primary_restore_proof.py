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


def psql(uri, sql):
    result = subprocess.run(
        ["psql", uri, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
        text=True,
        capture_output=True,
        timeout=60,
        env={**os.environ, "PGCONNECT_TIMEOUT": "10"},
    )
    if result.returncode != 0:
        stderr = re.sub(r"postgres(?:ql)?://[^\s@]+@", "postgresql://[redacted]@", result.stderr)
        fail("RESTORE_PROOF_PSQL_FAILED", {"stderr": stderr[-900:], "sql": sql[:200]})
    return result.stdout.strip()


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
    uri = direct_connection_uri(branch_id)

    identity = psql(uri, "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version')")
    identity_parts = identity.split("|")
    if len(identity_parts) != 3 or identity_parts[0] != DATABASE_NAME or identity_parts[1] != ROLE_NAME:
        fail("RESTORE_PROOF_DATABASE_IDENTITY_MISMATCH", {"identity": identity})
    database_version = identity_parts[2]

    schema_output = psql(uri, "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1")
    table_output = psql(uri, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
    schema_sha = hashlib.sha256(schema_output.encode("utf-8")).hexdigest()
    table_sha = hashlib.sha256(table_output.encode("utf-8")).hexdigest()
    table_names = [line for line in table_output.splitlines() if line]
    public_table_count = len(table_names)
    if public_table_count != 135:
        fail("RESTORE_PROOF_PUBLIC_TABLE_COUNT_MISMATCH", {"count": public_table_count})

    ledger_count = int(psql(uri, "SELECT COUNT(*) FROM public.schema_migrations"))
    migration_rows = psql(
        uri,
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
    if psql(uri, "SELECT to_regclass('public.technician_location_trail') IS NULL") != "t":
        fail("RESTORE_PROOF_TECHNICIAN_TRAIL_BASELINE_MISMATCH")

    organizations_count = int(psql(uri, "SELECT COUNT(*) FROM public.organizations"))
    if organizations_count <= 0:
        fail("RESTORE_PROOF_CORE_TABLE_EMPTY")

    role_rows = psql(
        uri,
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

    rls_counts = psql(
        uri,
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
        "tableInventorySha256": table_sha,
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
            "schema_catalog_read": {"status": "PASS"},
            "public_table_inventory": {
                "status": "PASS",
                "publicTableCount": public_table_count,
                "rlsEnabledTableCount": rls_parts[1],
                "forceRlsEnabledTableCount": rls_parts[2],
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
