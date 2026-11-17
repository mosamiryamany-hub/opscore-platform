#!/usr/bin/env python3
"""Create a disposable Neon branch from primary and apply 063-067 SQL files.

Does NOT touch the primary branch. Uses NEON_API_KEY + connection via branch endpoints.
"""
import json, os, sys, time, urllib.request, urllib.error, subprocess, tempfile
from pathlib import Path

key = os.environ["NEON_API_KEY"]
proj = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
primary = os.environ.get("OPSC_PRODUCTION_NEON_BRANCH_ID") or "br-proud-salad-bcshhdap"
repo = Path(os.environ.get("GITHUB_WORKSPACE") or ".")
sql_dir = repo / "backend" / "sql" / "postgres"
files = [
    "063_signed_tenant_context_verifier.sql",
    "064_signed_tenant_context_work_orders_routing.sql",
    "065_signed_tenant_context_evidence_upload_chunks.sql",
    "066_signed_tenant_context_verifier_search_path_hardening.sql",
    "067_signed_tenant_context_rls_policy_accessor_alignment.sql",
]

def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{proj}{path}",
        data=data, method=method,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

# Capacity check
code, br = api("GET", "/branches")
branches = br.get("branches") or []
print("branch_count", len(branches))
if len(branches) >= 10:
    print("BRANCH_CAPACITY_FULL")
    sys.exit(2)

name = "opscore-mig-signed-ctx-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
code, created = api("POST", "/branches", {"branch": {"parent_id": primary, "name": name}})
print("create_branch_http", code, json.dumps(created)[:500])
if code not in (200, 201):
    sys.exit(1)
branch = created.get("branch") or {}
bid = branch.get("id")
print("branch_id", bid, "name", branch.get("name"))

# Wait for operable
for i in range(30):
    time.sleep(2)
    c, b = api("GET", f"/branches/{bid}")
    state = (b.get("branch") or b).get("current_state") or (b.get("branch") or b).get("state")
    print("state", state)
    if state in ("ready", "active"):
        break
else:
    print("BRANCH_NOT_READY")
    sys.exit(1)

# Connection URI
code, ends = api("GET", f"/connection_uri?branch_id={bid}&database_name=opscore_acceptance&role_name=neondb_owner")
# API may vary - try endpoints list
if code != 200:
    code, ends = api("GET", f"/branches/{bid}/endpoints")
    print("endpoints_http", code, json.dumps(ends)[:400])
    # fallback: get project connection with branch param
    code, cu = api("GET", f"/connection_uri?branch_id={bid}&database_name=opscore_acceptance&role_name=neondb_owner")
    print("connection_uri_http", code)
else:
    cu = ends
uri = (cu.get("uri") or cu.get("connection_uri") or "")
if not uri:
    # try list databases / role password path used elsewhere
    code, cu = api("GET", f"/branches/{bid}")
    print("branch_detail", json.dumps(cu)[:600])
    print("NO_CONNECTION_URI")
    sys.exit(1)
print("uri_host", uri.split("@")[-1][:80] if "@" in uri else "redacted")

for fn in files:
    path = sql_dir / fn
    if not path.exists():
        print("MISSING", fn)
        sys.exit(1)
    print("apply", fn)
    r = subprocess.run(
        ["psql", uri, "-v", "ON_ERROR_STOP=1", "-f", str(path)],
        capture_output=True, text=True,
    )
    print("psql_rc", r.returncode)
    if r.stdout:
        print(r.stdout[-500:])
    if r.returncode != 0:
        print(r.stderr[-800:])
        sys.exit(1)

# Verify
verify = """
SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='opscore_security') AS has_schema;
SELECT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='opscore_security' AND p.proname='verified_tenant_context'
) AS has_verifier;
SELECT filename FROM schema_migrations WHERE filename LIKE '063%' OR filename LIKE '064%' OR filename LIKE '065%' OR filename LIKE '066%' OR filename LIKE '067%' ORDER BY 1;
"""
r = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-c", verify], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr)
    sys.exit(1)
print("MIGRATION_BRANCH_PASS", bid, name)
# write output for workflow
Path("/tmp/migration_branch_id.txt").write_text(bid)
