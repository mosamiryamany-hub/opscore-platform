#!/usr/bin/env python3
"""Verify the signed-context migration state already recorded in Neon Production.

This is an approval-gated, read-only workflow helper. It requires an owner-created,
hash-pinned Neon snapshot restore proof and the repository's guarded migration
runner to prove that the exact reviewed migrations are already applied.
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

import neon_primary_restore_proof as restore_proof

PROJECT_ID = "summer-leaf-18448271"
PRIMARY_BRANCH_ID = "br-proud-salad-bcshhdap"
DATABASE_NAME = "opscore_acceptance"
ROLE_NAME = "neondb_owner"
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

    if proof.get("schemaVersion") != "opscore.neon-primary-restore-proof.v2":
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

    for field in ("schemaSha256", "tableInventorySha256", "dataContentSha256"):
        if not SHA_RE.fullmatch(str(proof.get(field) or "").lower()):
            fail("PRODUCTION_PRIMARY_RESTORE_PROOF_HASH_INVALID", {"field": field})
    if not isinstance(proof.get("publicTableCount"), int) or proof["publicTableCount"] <= 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_TABLE_COUNT_INVALID")
    if not isinstance(proof.get("schemaInventoryItemCount"), int) or proof["schemaInventoryItemCount"] <= 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SCHEMA_INVENTORY_COUNT_INVALID")

    required_checks = {
        "snapshot_provenance",
        "restore_branch_ready",
        "database_identity",
        "schema_catalog_read",
        "public_table_inventory",
        "migration_ledger_read",
        "signed_context_schema",
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
    schema_check = checks["schema_catalog_read"]
    if (
        schema_check.get("schemaItemCount") != proof["schemaInventoryItemCount"]
        or schema_check.get("definitionParityWithPrimary") is not True
    ):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SCHEMA_INVENTORY_INVALID")
    identity_check = checks["database_identity"]
    if not str(identity_check.get("serverVersion") or "").startswith("18."):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SERVER_VERSION_INVALID")
    inventory_check = checks["public_table_inventory"]
    if inventory_check.get("publicTableCount") != proof["publicTableCount"]:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_TABLE_COUNT_MISMATCH")
    extension_excluded = inventory_check.get("rlsExcludedExtensionOwnedTableCount")
    if not isinstance(extension_excluded, int) or extension_excluded < 0:
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RLS_EXTENSION_EXCLUSION_INVALID")
    rls_required_count = proof["publicTableCount"] - extension_excluded
    if (
        inventory_check.get("rlsEnabledTableCount") != rls_required_count
        or inventory_check.get("forceRlsEnabledTableCount") != rls_required_count
    ):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_RLS_FORCE_MISMATCH")
    if (
        inventory_check.get("rowContentSha256") != proof["dataContentSha256"]
        or inventory_check.get("rowContentParityWithPrimary") is not True
    ):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_ROW_CONTENT_INVENTORY_INVALID")
    migration_check = checks["migration_ledger_read"]
    if (
        migration_check.get("requiredMigrationsPresentAndChecksummed") is not True
        or migration_check.get("technicianLocationTrailPresent") is not True
        or migration_check.get("requiredMigrationCount") != len(restore_proof.REQUIRED_APPLIED_MIGRATIONS)
    ):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_MIGRATION_SOURCE_MISMATCH")
    signed_context_check = checks["signed_context_schema"]
    required_signed_checks = [
        "verifierFunctionValid",
        "tenantAccessorUsesVerifier",
        "authDefinerRoleValid",
        "hmacKeyTableValid",
        "technicianTrailForcedRls",
        "technicianTrailPoliciesValid",
    ]
    if (
        any(signed_context_check.get(name) is not True for name in required_signed_checks)
        or signed_context_check.get("directTenantGucPolicyResidualCount") != 0
    ):
        fail("PRODUCTION_PRIMARY_RESTORE_PROOF_SIGNED_CONTEXT_SCHEMA_INVALID")
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

    # Recompare the exact current Primary against the restored snapshot branch
    # immediately before the Production migration dry-run/write sequence.
    # A stale but correctly hash-pinned proof must not authorize a rollback point
    # that no longer contains the current public-table data or schema.
    restore_proof.KEY = key
    primary_uri = restore_proof.direct_connection_uri(PRIMARY_BRANCH_ID)
    restore_uri = restore_proof.direct_connection_uri(restored_branch_id)
    primary_schema_count, primary_schema_sha = restore_proof.schema_inventory(primary_uri)
    restore_schema_count, restore_schema_sha = restore_proof.schema_inventory(restore_uri)
    if (
        primary_schema_count != restore_schema_count
        or primary_schema_sha != restore_schema_sha
        or primary_schema_sha != proof.get("schemaSha256")
        or restore_schema_sha != proof.get("schemaSha256")
    ):
        fail("PRODUCTION_RESTORE_PROOF_SCHEMA_NO_LONGER_MATCHES_PRIMARY")
    primary_tables, primary_table_sha, primary_data_sha = restore_proof.table_data_inventory(primary_uri)
    restore_tables, restore_table_sha, restore_data_sha = restore_proof.table_data_inventory(restore_uri)
    if (
        primary_tables != restore_tables
        or primary_table_sha != restore_table_sha
        or primary_table_sha != proof.get("tableInventorySha256")
        or primary_data_sha != restore_data_sha
        or primary_data_sha != proof.get("dataContentSha256")
        or restore_data_sha != proof.get("dataContentSha256")
    ):
        fail("PRODUCTION_RESTORE_PROOF_PUBLIC_TABLE_DATA_NO_LONGER_MATCHES_PRIMARY")

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
            {
                "return_code": result.returncode,
                # The official runner reports structured failures as JSON on
                # stdout and exits non-zero with an empty stderr. Surface stdout
                # too, otherwise the real cause is discarded.
                "stdout_tail": result.stdout[-4000:],
                "stderr_tail": result.stderr[-2000:],
            },
        )
    try:
        return json.loads(result.stdout)
    except Exception:
        fail("OFFICIAL_PRODUCTION_MIGRATION_RUNNER_REPORT_INVALID", {"stdout_tail": result.stdout[-3000:]})


def main():
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        fail("PRODUCTION_MIGRATION_WORKFLOW_MUST_RUN_FROM_MAIN")
    if os.environ.get("OPSC_CONFIRM_PRODUCTION_MIGRATION") != "VERIFY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS":
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

    # These migrations were found already recorded on both the live Primary
    # and the exact non-finalizing snapshot restore. Never reapply them. The
    # guarded runner must report a clean no-pending plan and exact checksum skips.
    plan = invoke_runner(root, env, False)
    if plan.get("status") != "DRY_RUN_PASS":
        fail("PRODUCTION_MIGRATION_DRY_RUN_NOT_PASS", {
            "status": plan.get("status"),
            "blockers": plan.get("blockers"),
        })
    pending_rows = plan.get("pending") or []
    pending = {str(item.get("filename") or "") for item in pending_rows if isinstance(item, dict)}
    if pending:
        fail("PRODUCTION_MIGRATION_UNEXPECTED_PENDING_SET", {
            "pending": sorted(pending),
            "required_state": "already-applied-and-checksum-verified",
        })

    skipped_rows = plan.get("skipped") or []
    skipped_by_name = {
        str(item.get("filename") or ""): item
        for item in skipped_rows
        if isinstance(item, dict)
    }
    unverified = {
        filename: skipped_by_name.get(filename, {}).get("reason")
        for filename in restore_proof.REQUIRED_APPLIED_MIGRATIONS
        if skipped_by_name.get(filename, {}).get("reason") != "exact-ledger-checksum-match"
    }
    if unverified:
        fail("PRODUCTION_MIGRATION_ALREADY_APPLIED_CHECKSUM_PLAN_INVALID", {"migrations": unverified})

    ledger_rows = restore_proof.psql(
        uri,
        "SELECT filename || '|' || lower(sha256) FROM public.schema_migrations WHERE filename IN ("
        + ",".join("'" + name.replace("'", "''") + "'" for name in restore_proof.REQUIRED_APPLIED_MIGRATIONS)
        + ") ORDER BY filename",
    )
    actual_ledger = {}
    for line in ledger_rows.splitlines():
        parts = line.split("|", 1)
        if len(parts) != 2:
            fail("PRODUCTION_MIGRATION_LEDGER_ROW_INVALID", {"row": line[:300]})
        actual_ledger[parts[0]] = parts[1].lower()
    if actual_ledger != restore_proof.REQUIRED_APPLIED_MIGRATIONS:
        fail("PRODUCTION_MIGRATION_LEDGER_SOURCE_MISMATCH", {
            "missing": sorted(set(restore_proof.REQUIRED_APPLIED_MIGRATIONS) - set(actual_ledger)),
            "unexpected": sorted(set(actual_ledger) - set(restore_proof.REQUIRED_APPLIED_MIGRATIONS)),
            "checksum_mismatches": {
                name: {"ledger": actual_ledger.get(name), "source": digest}
                for name, digest in restore_proof.REQUIRED_APPLIED_MIGRATIONS.items()
                if name in actual_ledger and actual_ledger[name] != digest
            },
        })

    signed_catalog = restore_proof.verify_signed_context_catalog(uri)
    print("PRODUCTION_MIGRATION_PLAN=DRY_RUN_PASS")
    print("PRODUCTION_MIGRATIONS_ALREADY_APPLIED_AND_VERIFIED=PASS")
    print("PRODUCTION_MIGRATION_TARGET=exact-primary")
    print("PRODUCTION_MIGRATION_RESTORE_PROOF_SHA256=" + proof_sha)
    print("PRODUCTION_MIGRATION_LEDGER_ROWS_VERIFIED=" + str(len(actual_ledger)))
    print("PRODUCTION_SIGNED_CONTEXT_CATALOG=PASS")
    print("PRODUCTION_HMAC_KEY_ROWS=" + str(signed_catalog["hmacKeyRowCount"]))
    print("PRODUCTION_SCHEMA_WRITES=0")
    print("PRODUCTION_PRIMARY_BRANCH_UNCHANGED=" + PRIMARY_BRANCH_ID)
    print("PRODUCTION_MIGRATION_DEPLOYMENT_NOT_STARTED=true")


if __name__ == "__main__":
    main()
