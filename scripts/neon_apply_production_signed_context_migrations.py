#!/usr/bin/env python3
"""Apply the exact signed-context migration set to Neon Production.

This is an approval-gated workflow helper, not an autonomous production action.
It requires an owner-created, hash-pinned Neon snapshot restore proof before any
Production SQL write. It uses the repository's guarded Node migration runner.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ID = "summer-leaf-18448271"
PRIMARY_BRANCH_ID = "br-proud-salad-bcshhdap"
DATABASE_NAME = "opscore_acceptance"
ROLE_NAME = "neondb_owner"
REQUIRED_PENDING = {
    "063_signed_tenant_context_verifier.sql",
    "064_signed_tenant_context_work_orders_routing.sql",
    "065_signed_tenant_context_evidence_upload_chunks.sql",
    "066_signed_tenant_context_verifier_search_path_hardening.sql",
    "067_signed_tenant_context_rls_policy_accessor_alignment.sql",
    "069_technician_location_trail_tenant_persistence.sql",
}
PROOF_PATH = Path("docs/ops/evidence/PRODUCTION_PRIMARY_RESTORE_PROOF.json")
SHA_RE = re.compile(r"^[a-f0-9]{64}$")
BRANCH_RE = re.compile(r"^br-[a-z0-9-]{8,80}$")
SNAPSHOT_RE = re.compile(r"^snap-[a-z0-9-]{8,80}$")


def fail(code, detail=None):
    print(code)
    if detail is not None:
        print(json.dumps(detail, sort_keys=True)[:3000])
    raise SystemExit(1)


def neon_request(key, path):
    request = Request(
        "https://console.neon.tech/api/v2/projects/" + PROJECT_ID + path,
        headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        fail("NEON_API_REQUEST_FAILED", {"path": path, "http_status": error.code, "detail": detail[:1200]})


def parse_iso(value, code):
    raw = str(value or "").strip()
    if not raw:
        fail(code)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        fail(code)
    if parsed.tzinfo is None:
        fail(code)
    return parsed.astimezone(timezone.utc)


def load_and_verify_restore_proof(key):
    if not PROOF_PATH.is_file():
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_MISSING", {"expected_path": str(PROOF_PATH)})
    raw = PROOF_PATH.read_bytes()
    expected_digest = str(os.environ.get("OPSC_PRODUCTION_RESTORE_PROOF_SHA256") or "").strip().lower()
    if not SHA_RE.fullmatch(expected_digest):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SHA256_SECRET_MISSING_OR_INVALID")
    actual_digest = hashlib.sha256(raw).hexdigest()
    if actual_digest != expected_digest:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SHA256_MISMATCH", {"actual_sha256": actual_digest})
    try:
        proof = json.loads(raw.decode("utf-8"))
    except Exception:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_JSON_INVALID")

    if proof.get("schemaVersion") != "opscore.neon-primary-restore-proof.v1":
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SCHEMA_INVALID")
    if proof.get("status") != "PASS":
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_NOT_PASS")
    if proof.get("projectId") != PROJECT_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_PROJECT_MISMATCH")
    if proof.get("primaryBranchId") != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_PRIMARY_BRANCH_MISMATCH")
    if proof.get("databaseName") != DATABASE_NAME:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_DATABASE_MISMATCH")

    snapshot_id = str(proof.get("snapshotId") or "")
    restored_branch_id = str(proof.get("restoreBranchId") or "")
    if not SNAPSHOT_RE.fullmatch(snapshot_id):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SNAPSHOT_ID_INVALID")
    if not BRANCH_RE.fullmatch(restored_branch_id) or restored_branch_id == PRIMARY_BRANCH_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RESTORE_BRANCH_INVALID")
    if proof.get("snapshotSourceBranchId") != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SNAPSHOT_SOURCE_MISMATCH")
    if proof.get("restoreSnapshotId") != snapshot_id:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RESTORE_SOURCE_MISMATCH")
    if str(proof.get("restoreBranchState") or "").lower() != "ready":
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_BRANCH_NOT_READY")

    database_identity = proof.get("databaseIdentity") or {}
    if database_identity.get("databaseName") != DATABASE_NAME or database_identity.get("roleName") != ROLE_NAME:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_DATABASE_IDENTITY_INVALID")

    for field in ("schemaSha256", "tableInventorySha256"):
        if not SHA_RE.fullmatch(str(proof.get(field) or "").lower()):
            fail("PRODUCTION_PRIMARY_RESTORE_PROOF_HASH_INVALID", {"field": field})
    if not isinstance(proof.get("publicTableCount"), int) or proof["publicTableCount"] <= 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_TABLE_COUNT_INVALID")

    required_checks = {
        "snapshot_provenance",
        "restore_branch_ready",
        "database_identity",
        "schema_catalog_read",
        "public_table_inventory",
        "migration_ledger_read",
        "core_table_read",
        "runtime_role_boundary",
    }
    checks = proof.get("checks")
    if not isinstance(checks, dict):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_CHECKS_MISSING")
    if set(checks) != required_checks:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_CHECK_SET_MISMATCH", {
            "actual": sorted(str(name) for name in checks),
            "required": sorted(required_checks),
        })
    actual_checks = {
        str(name): str(item.get("status"))
        for name, item in checks.items()
        if isinstance(item, dict)
    }
    if any(actual_checks.get(name) != "PASS" for name in required_checks):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_CHECKS_INCOMPLETE")

    snapshot_check = checks["snapshot_provenance"]
    if snapshot_check.get("restoreStatus") != "restored" or snapshot_check.get("restoredAs") != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SNAPSHOT_CHECK_INVALID")
    restore_check = checks["restore_branch_ready"]
    if str(restore_check.get("currentState") or "").lower() != "ready" or restore_check.get("branchId") != restored_branch_id:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RESTORE_CHECK_INVALID")
    identity_check = checks["database_identity"]
    if not str(identity_check.get("serverVersion") or "").startswith("18."):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SERVER_VERSION_INVALID")
    inventory_check = checks["public_table_inventory"]
    if inventory_check.get("publicTableCount") != proof["publicTableCount"]:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_TABLE_COUNT_MISMATCH")
    if inventory_check.get("rlsEnabledTableCount") != inventory_check.get("forceRlsEnabledTableCount"):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RLS_FORCE_MISMATCH")
    migration_check = checks["migration_ledger_read"]
    if migration_check.get("migration068Present") is not True or migration_check.get("migrations063to067And069Absent") is not True:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_MIGRATION_BASELINE_INVALID")
    runtime_check = checks["runtime_role_boundary"]
    if runtime_check.get("runtimeRoleSuperuser") is not False or runtime_check.get("runtimeRoleBypassRls") is not False:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RUNTIME_ROLE_INVALID")
    if runtime_check.get("organizationsVisibleWithoutTenantContext") != 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RUNTIME_RLS_DEFAULT_DENY_FAILED")
    core_check = checks["core_table_read"]
    if not isinstance(core_check.get("organizationsCount"), int) or core_check["organizationsCount"] <= 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_CORE_TABLE_CHECK_INVALID")

    tested_at = parse_iso(proof.get("testedAt"), "PRODUCTION_PRIMARY_RESTORE_PROOF_TIMESTAMP_INVALID")
    now = datetime.now(timezone.utc)
    age_seconds = (now - tested_at).total_seconds()
    if age_seconds < 0 or age_seconds > 24 * 60 * 60:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_STALE", {"age_seconds": int(age_seconds)})

    snapshots = neon_request(key, "/snapshots").get("snapshots") or []
    matching_snapshots = [item for item in snapshots if item.get("id") == snapshot_id]
    if len(matching_snapshots) != 1 or matching_snapshots[0].get("source_branch_id") != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_PRIMARY_RESTORE_SNAPSHOT_NO_LONGER_AVAILABLE")

    restore_branch = neon_request(key, "/branches/" + restored_branch_id).get("branch") or {}
    if restore_branch.get("id") != restored_branch_id:
        fail("PRODUCTION_RESTORE_BRANCH_NOT_FOUND")
    if restore_branch.get("primary") or restore_branch.get("default"):
        fail("PRODUCTION_RESTORE_BRANCH_IS_PRIMARY")
    if str(restore_branch.get("current_state") or "").lower() != "ready":
        fail("PRODUCTION_RESTORE_BRANCH_NOT_READY")
    if restore_branch.get("restored_from") != snapshot_id or str(restore_branch.get("restore_status") or "").lower() != "restored":
        fail("PRODUCTION_RESTORE_BRANCH_SNAPSHOT_PROVENANCE_MISMATCH")
    if restore_branch.get("restored_as") != PRIMARY_BRANCH_ID:
        fail("PRODUCTION_RESTORE_BRANCH_TARGET_MISMATCH")

    print("PRODUCTION_RESTORE_PROOF=PASS")
    print("PRODUCTION_RESTORE_PROOF_SHA256=" + actual_digest)
    print("PRODUCTION_RESTORE_SNAPSHOT_ID=" + snapshot_id)
    print("PRODUCTION_RESTORE_BRANCH_ID=" + restored_branch_id)
    return actual_digest


def get_direct_primary_uri(key):
    branches = neon_request(key, "/branches?limit=100").get("branches") or []
    matching = [item for item in branches if item.get("id") == PRIMARY_BRANCH_ID]
    if len(matching) != 1:
        fail("PRODUCTION_PRIMARY_BRANCH_NOT_UNIQUE")
    branch = matching[0]
    if not branch.get("primary") or not branch.get("default") or str(branch.get("current_state") or "").lower() != "ready":
        fail("PRODUCTION_PRIMARY_BRANCH_IDENTITY_INVALID")
    response = neon_request(
        key,
        "/connection_uri?branch_id=" + PRIMARY_BRANCH_ID
        + "&database_name=" + DATABASE_NAME
        + "&role_name=" + ROLE_NAME
        + "&pooled=false",
    )
    uri = str(response.get("uri") or "")
    parsed = urlparse(uri)
    hostname = str(parsed.hostname or "").strip().lower()
    if parsed.scheme not in ("postgres", "postgresql") or not hostname or "-pooler" in hostname:
        fail("PRODUCTION_DIRECT_NEON_ENDPOINT_REQUIRED")
    database = parsed.path.lstrip("/").split("/", 1)[0]
    if database != DATABASE_NAME:
        fail("PRODUCTION_DATABASE_IDENTITY_MISMATCH", {"database": database})
    return uri, hostname


def invoke_runner(root, env, apply):
    runner = root / "backend" / "scripts" / "apply-postgres-migrations.js"
    if not runner.is_file():
        fail("OFFICIAL_POSTGRES_MIGRATION_RUNNER_MISSING")
    args = ["node", str(runner)]
    if apply:
        args.append("--apply")
    result = subprocess.run(
        args,
        cwd=str(root / "backend"),
        env=env,
        capture_output=True,
        text=True,
        timeout=900,
    )
    if result.returncode != 0:
        fail(
            "OFFICIAL_PRODUCTION_MIGRATION_RUNNER_FAILED",
            {"return_code": result.returncode, "stderr_tail": result.stderr[-2000:]},
        )
    try:
        return json.loads(result.stdout)
    except Exception:
        fail("OFFICIAL_PRODUCTION_MIGRATION_RUNNER_REPORT_INVALID", {"stdout_tail": result.stdout[-3000:]})


def main():
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        fail("PRODUCTION_MIGRATION_WORKFLOW_MUST_RUN_FROM_MAIN")
    if os.environ.get("OPSC_CONFIRM_PRODUCTION_MIGRATION") != "APPLY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS":
        fail("PRODUCTION_MIGRATION_EXPLICIT_CONFIRMATION_REQUIRED")

    key = str(os.environ.get("NEON_API_KEY") or "").strip()
    if not key:
        fail("NEON_API_KEY_MISSING")

    root = Path(os.environ.get("GITHUB_WORKSPACE") or ".").resolve()
    proof_sha = load_and_verify_restore_proof(key)
    uri, host = get_direct_primary_uri(key)

    env = os.environ.copy()
    env.update({
        "OPSC_MIGRATION_DATABASE_URL": uri,
        "OPSC_MIGRATION_TARGET_CLASS": "production",
        "OPSC_MIGRATION_ALLOW_PRODUCTION": "1",
        "OPSC_MIGRATION_EXPECTED_DATABASE": DATABASE_NAME,
        "OPSC_MIGRATION_CONFIRM_DATABASE": DATABASE_NAME,
        "OPSC_MIGRATION_EXPECTED_HOST": host,
        "OPSC_MIGRATION_CONFIRM_HOST": host,
        "OPSC_MIGRATION_EXPECTED_PROJECT_ID": PROJECT_ID,
        "OPSC_MIGRATION_CONFIRM_PROJECT_ID": PROJECT_ID,
        "OPSC_MIGRATION_EXPECTED_BRANCH_ID": PRIMARY_BRANCH_ID,
        "OPSC_MIGRATION_CONFIRM_BRANCH_ID": PRIMARY_BRANCH_ID,
    })

    # No writes occur until the official runner has proven that exactly the
    # reviewed six migrations are pending and no unrelated migration is queued.
    plan = invoke_runner(root, env, False)
    if plan.get("status") != "DRY_RUN_PASS":
        fail("PRODUCTION_MIGRATION_DRY_RUN_NOT_PASS", {
            "status": plan.get("status"),
            "blockers": plan.get("blockers"),
        })
    pending_rows = plan.get("pending") or []
    pending = {str(item.get("filename") or "") for item in pending_rows if isinstance(item, dict)}
    if len(pending_rows) != len(REQUIRED_PENDING) or pending != REQUIRED_PENDING:
        fail("PRODUCTION_MIGRATION_PENDING_SET_MISMATCH", {
            "pending": sorted(pending),
            "required": sorted(REQUIRED_PENDING),
        })

    print("PRODUCTION_MIGRATION_DRY_RUN=PASS")
    print("PRODUCTION_MIGRATION_TARGET=exact-primary")
    print("PRODUCTION_MIGRATION_RESTORE_PROOF_SHA256=" + proof_sha)
    for item in sorted(pending_rows, key=lambda row: row.get("filename", "")):
        print("PRODUCTION_MIGRATION_PENDING", item["filename"], item["sha256"])

    report = invoke_runner(root, env, True)
    if report.get("status") != "APPLIED_AND_VERIFIED":
        fail("PRODUCTION_MIGRATION_APPLY_POSTCONDITIONS_NOT_PASS", {
            "status": report.get("status"),
            "postconditions": report.get("postconditions"),
        })
    applied = report.get("applied") or []
    applied_by_name = {str(item.get("filename") or ""): item for item in applied}
    if set(applied_by_name) != REQUIRED_PENDING:
        fail("PRODUCTION_MIGRATION_APPLIED_SET_MISMATCH", {
            "applied": sorted(applied_by_name),
            "required": sorted(REQUIRED_PENDING),
        })
    for filename in sorted(REQUIRED_PENDING):
        digest = str(applied_by_name[filename].get("sha256") or "").lower()
        if not SHA_RE.fullmatch(digest):
            fail("PRODUCTION_MIGRATION_LEDGER_SHA_INVALID", {"filename": filename})
        print("PRODUCTION_MIGRATION_LEDGER_APPLIED", filename, digest)

    print("PRODUCTION_MIGRATION_APPLY=PASS")
    print("PRODUCTION_PRIMARY_BRANCH_UNCHANGED=" + PRIMARY_BRANCH_ID)
    print("PRODUCTION_MIGRATION_DEPLOYMENT_NOT_STARTED=true")


if __name__ == "__main__":
    main()
