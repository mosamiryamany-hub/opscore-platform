#!/usr/bin/env python3
"""Create a disposable Neon child branch and run the repository's guarded migration runner.

This workflow never targets the Production primary. It deliberately does not delete
older migration branches to make room; branch-capacity pressure is a hard stop.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

KEY = os.environ["NEON_API_KEY"]
PROJECT = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
PRIMARY = os.environ.get("OPSC_PRODUCTION_NEON_BRANCH_ID") or "br-proud-salad-bcshhdap"
DATABASE = "opscore_acceptance"
REQUIRED_MIGRATIONS = [
    "063_signed_tenant_context_verifier.sql",
    "064_signed_tenant_context_work_orders_routing.sql",
    "065_signed_tenant_context_evidence_upload_chunks.sql",
    "066_signed_tenant_context_verifier_search_path_hardening.sql",
    "067_signed_tenant_context_rls_policy_accessor_alignment.sql",
    # The manifest includes technician trail read/write routes. PostgreSQL refuses
    # those routes when this persistence schema is absent, so 069 is part of the
    # same candidate schema even though it is not a signed-context verifier migration.
    "069_technician_location_trail_tenant_persistence.sql",
]
ROOT = Path(os.environ.get("GITHUB_WORKSPACE") or ".").resolve()
BACKEND = ROOT / "backend"


def api(method, path, body=None, query=None):
    suffix = "?" + urllib.parse.urlencode(query) if query else ""
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{PROJECT}{path}{suffix}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8") or "{}"
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail) if detail else {}
        except Exception:
            parsed = {"detail": detail[:500]}
        return error.code, parsed


def fail(code, detail=None):
    print(code)
    if detail is not None:
        print(json.dumps(detail, sort_keys=True)[:2000])
    sys.exit(1)


def list_all_branches():
    """Read every active branch page; never decide capacity from one page."""
    result = []
    cursor = None
    seen_cursors = set()
    for page_number in range(100):
        query = {"limit": 100}
        if cursor:
            query["cursor"] = cursor
        status, page = api("GET", "/branches", query=query)
        if status != 200:
            fail("NEON_BRANCH_LIST_FAILED", {"http_status": status, "page": page_number + 1, "detail": page})
        rows = page.get("branches") or []
        if not isinstance(rows, list):
            fail("NEON_BRANCH_LIST_RESPONSE_INVALID", {"page": page_number + 1})
        result.extend(rows)
        pagination = page.get("pagination") or {}
        next_cursor = pagination.get("next")
        if not next_cursor:
            return result
        next_cursor = str(next_cursor)
        if next_cursor in seen_cursors:
            fail("NEON_BRANCH_PAGINATION_CURSOR_REPEATED", {"page": page_number + 1})
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    fail("NEON_BRANCH_PAGINATION_PAGE_LIMIT_EXCEEDED", {"page_limit": 100})


if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
    fail("MIGRATION_BRANCH_WORKFLOW_MAIN_MANUAL_DISPATCH_REQUIRED")

branches = list_all_branches()
print("active_branch_count", len(branches))
print("active_branch_limit", 10)
if len(branches) >= 10:
    fail("BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION")
primary_rows = [item for item in branches if item.get("id") == PRIMARY]
if len(primary_rows) != 1 or not primary_rows[0].get("primary") or not primary_rows[0].get("default"):
    fail("EXPECTED_PRIMARY_BRANCH_IDENTITY_MISMATCH")

name = "opscore-mig-signed-ctx-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
status, created = api("POST", "/branches", {"branch": {"parent_id": PRIMARY, "name": name}})
print("create_branch_http", status)
if status not in (200, 201):
    fail("MIGRATION_BRANCH_CREATE_FAILED", created)
branch = created.get("branch") or {}
branch_id = str(branch.get("id") or "")
if not branch_id.startswith("br-"):
    fail("MIGRATION_BRANCH_ID_INVALID", {"name": name, "branch_id": branch_id})
print("branch_id", branch_id)
print("branch_name", name)
print("parent_primary", PRIMARY)

for attempt in range(45):
    time.sleep(2)
    status, response = api("GET", f"/branches/{branch_id}")
    node = response.get("branch") or response
    state = node.get("current_state") or node.get("state")
    if status == 200 and state in ("ready", "active"):
        if node.get("primary") or node.get("default") or node.get("protected"):
            fail("MIGRATION_BRANCH_NOT_DISPOSABLE", {
                "branch_id": branch_id, "state": state,
                "primary": node.get("primary"), "default": node.get("default"),
                "protected": node.get("protected"),
            })
        print("branch_state", state)
        break
else:
    fail("MIGRATION_BRANCH_NOT_READY")

status, endpoints_payload = api("GET", f"/branches/{branch_id}/endpoints")
endpoints = endpoints_payload.get("endpoints") or []
print("endpoints_before", len(endpoints))
if not endpoints:
    status, endpoint_response = api(
        "POST", "/endpoints", {"endpoint": {"branch_id": branch_id, "type": "read_write"}}
    )
    print("create_endpoint_http", status)
    if status not in (200, 201):
        fail("MIGRATION_BRANCH_ENDPOINT_CREATE_FAILED", endpoint_response)

for attempt in range(30):
    status, endpoints_payload = api("GET", f"/branches/{branch_id}/endpoints")
    endpoints = endpoints_payload.get("endpoints") or []
    matching = [
        endpoint for endpoint in endpoints
        if str(endpoint.get("branch_id") or endpoint.get("branch_slug") or "") in (branch_id, branch.get("slug"))
        and str(endpoint.get("type") or "").lower() == "read_write"
    ]
    if len(matching) == 1:
        endpoint_state = matching[0].get("current_state") or matching[0].get("state")
        if endpoint_state in ("active", "idle", "ready"):
            break
    time.sleep(2)
else:
    fail("MIGRATION_BRANCH_RW_ENDPOINT_NOT_READY")

uri = ""
for attempt in range(15):
    status, connection = api(
        "GET",
        "/connection_uri",
        query={
            "branch_id": branch_id,
            "database_name": DATABASE,
            "role_name": "neondb_owner",
            "pooled": "false",
        },
    )
    uri = str(connection.get("uri") or connection.get("connection_uri") or "")
    if status == 200 and uri:
        break
    time.sleep(2)
if not uri:
    fail("DIRECT_CONNECTION_URI_NOT_AVAILABLE", {"http_status": status})
parsed = urllib.parse.urlparse(uri)
host = str(parsed.hostname or "").strip().lower()
if not host or "-pooler" in host:
    fail("MIGRATION_REQUIRES_DIRECT_NEON_ENDPOINT", {"host": host or None})
if not parsed.path.lstrip("/").split("/", 1)[0] == DATABASE:
    fail("MIGRATION_DATABASE_URI_MISMATCH", {"database": parsed.path.lstrip("/").split("/", 1)[0]})

migration_env = os.environ.copy()
migration_env.update({
    "NEON_API_KEY": KEY,
    "OPSC_MIGRATION_DATABASE_URL": uri,
    "OPSC_MIGRATION_TARGET_CLASS": "preview",
    "OPSC_MIGRATION_EXPECTED_DATABASE": DATABASE,
    "OPSC_MIGRATION_CONFIRM_DATABASE": DATABASE,
    "OPSC_MIGRATION_EXPECTED_HOST": host,
    "OPSC_MIGRATION_CONFIRM_HOST": host,
    "OPSC_MIGRATION_EXPECTED_PROJECT_ID": PROJECT,
    "OPSC_MIGRATION_CONFIRM_PROJECT_ID": PROJECT,
    "OPSC_MIGRATION_EXPECTED_BRANCH_ID": branch_id,
    "OPSC_MIGRATION_CONFIRM_BRANCH_ID": branch_id,
})
migration_path = BACKEND / "scripts" / "apply-postgres-migrations.js"
if not migration_path.is_file():
    fail("OFFICIAL_MIGRATION_RUNNER_MISSING")
print("connection_mode direct")
print("migration_target_class preview")
print("migration_database", DATABASE)
print("migration_endpoint_host", host)
print("running_official_migration_runner", migration_path.relative_to(ROOT).as_posix())

result = subprocess.run(
    ["node", str(migration_path), "--apply"],
    cwd=str(BACKEND),
    env=migration_env,
    capture_output=True,
    text=True,
    timeout=900,
)
if result.stdout:
    print(result.stdout[-14000:])
if result.stderr:
    print("migration_runner_stderr", result.stderr[-4000:])
if result.returncode != 0:
    fail("OFFICIAL_MIGRATION_RUNNER_FAILED", {"return_code": result.returncode})

try:
    report = json.loads(result.stdout)
except Exception:
    fail("MIGRATION_RUNNER_REPORT_INVALID")

if report.get("status") != "APPLIED_AND_VERIFIED":
    fail("MIGRATION_RUNNER_NOT_APPLIED_AND_VERIFIED", {
        "status": report.get("status"),
        "reason": report.get("reason"),
        "pending": report.get("pending"),
    })

applied = report.get("applied") or []
applied_by_name = {str(item.get("filename") or ""): item for item in applied}
missing = sorted(set(REQUIRED_MIGRATIONS) - set(applied_by_name))
if missing:
    fail("REQUIRED_SIGNED_CONTEXT_MIGRATIONS_NOT_APPLIED", {
        "missing": missing,
        "applied": sorted(applied_by_name),
    })

for filename in REQUIRED_MIGRATIONS:
    item = applied_by_name[filename]
    digest = str(item.get("sha256") or "")
    if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest.lower()):
        fail("MIGRATION_SHA256_ATTESTATION_INVALID", {"filename": filename})
    print("MIGRATION_LEDGER_APPLIED", filename, digest)

print("MIGRATION_BRANCH_PASS", branch_id, name)
print("MIGRATION_RUNNER_STATUS", report.get("status"))
print("MIGRATION_APPLIED_COUNT", len(applied))
print("MIGRATION_LEDGER_SHA256_BOUND=true")
print("MIGRATION_PRODUCTION_UNTOUCHED=true")
