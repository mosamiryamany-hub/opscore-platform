#!/usr/bin/env python3
import json, os, sys, time, urllib.request, urllib.error, subprocess, urllib.parse
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

def api(method, path, body=None, query=None):
    q = ("?" + urllib.parse.urlencode(query)) if query else ""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{proj}{path}{q}",
        data=data, method=method,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"raw": raw[:500]}
        return e.code, payload

code, br = api("GET", "/branches")
branches = br.get("branches") or []
print("branch_count", len(branches))
# Delete prior failed mig branches to keep capacity
for b in branches:
    name = (b.get("name") or "").lower()
    bid = b.get("id")
    if b.get("primary") or b.get("protected"):
        continue
    if "opscore-mig-signed-ctx" in name or "mig-signed" in name:
        dcode, _ = api("DELETE", f"/branches/{bid}")
        print("cleanup_old_mig", bid, dcode)
        time.sleep(2)

code, br = api("GET", "/branches")
branches = br.get("branches") or []
print("branch_count_after_cleanup", len(branches))
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
print("branch_id", bid)

for i in range(45):
    time.sleep(2)
    c, b = api("GET", f"/branches/{bid}")
    node = b.get("branch") or b
    state = node.get("current_state") or node.get("state")
    print("state", state)
    if state in ("ready", "active"):
        break
else:
    print("BRANCH_NOT_READY")
    sys.exit(1)

# Ensure compute endpoint exists on the branch
code, ends = api("GET", f"/branches/{bid}/endpoints")
eps = ends.get("endpoints") or []
print("endpoints_before", len(eps), json.dumps(ends)[:300])
if not eps:
    code, ep = api("POST", "/endpoints", {"endpoint": {"branch_id": bid, "type": "read_write"}})
    print("create_endpoint_http", code, json.dumps(ep)[:400])
    if code not in (200, 201):
        sys.exit(1)
    for i in range(30):
        time.sleep(2)
        code, ends = api("GET", f"/branches/{bid}/endpoints")
        eps = ends.get("endpoints") or []
        st = (eps[0].get("current_state") if eps else None) or (eps[0].get("state") if eps else None)
        print("endpoint_state", st)
        if st in ("active", "idle", "ready"):
            break

# Prefer official connection_uri endpoint
uri = ""
for attempt in range(15):
    code, cu = api(
        "GET",
        "/connection_uri",
        query={
            "branch_id": bid,
            "database_name": "opscore_acceptance",
            "role_name": "neondb_owner",
        },
    )
    print("connection_uri_http", code, json.dumps(cu)[:300])
    uri = cu.get("uri") or cu.get("connection_uri") or ""
    if uri:
        break
    # endpoints fallback
    code, ends = api("GET", f"/branches/{bid}/endpoints")
    print("endpoints", code, json.dumps(ends)[:300])
    time.sleep(2)

if not uri:
    print("NO_CONNECTION_URI")
    sys.exit(1)

for fn in files:
    path = sql_dir / fn
    if not path.exists():
        print("MISSING", fn)
        sys.exit(1)
    print("apply", fn)
    r = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-f", str(path)], capture_output=True, text=True)
    print("psql_rc", r.returncode)
    if r.stdout:
        print(r.stdout[-400:])
    if r.returncode != 0:
        print(r.stderr[-800:])
        sys.exit(1)

verify = """
SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='opscore_security') AS has_schema;
SELECT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('opscore_security','public') AND p.proname='verified_tenant_context'
) AS has_verifier;
SELECT filename FROM schema_migrations WHERE filename ~ '^(063|064|065|066|067)_' ORDER BY 1;
"""
r = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-c", verify], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr)
    sys.exit(1)
print("MIGRATION_BRANCH_PASS", bid, name)
