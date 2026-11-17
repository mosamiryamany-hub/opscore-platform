#!/usr/bin/env python3
"""Rotate Free-plan manual snapshot slot onto the primary branch.

Safety:
- Never deletes a snapshot whose source is the primary branch id.
- Deletes at most one non-primary snapshot when at the plan limit.
- Creates a new snapshot on the primary branch.
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

key = os.environ["NEON_API_KEY"]
proj = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
primary = os.environ.get("OPSC_PRODUCTION_NEON_BRANCH_ID") or "br-proud-salad-bcshhdap"

def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{proj}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return e.code, json.loads(body) if body else {"message": str(e)}

code, snaps_payload = api("GET", "/snapshots")
print("list_snapshots_http", code)
snaps = snaps_payload.get("snapshots") or []
print("snapshot_count", len(snaps))
for s in snaps:
    print(
        "snapshot",
        s.get("id"),
        s.get("name"),
        "source=" + str(s.get("source_branch_id") or s.get("branch_id")),
        s.get("created_at"),
    )

# Try create first
name = "opscore-primary-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
code, created = api(
    "POST",
    f"/branches/{primary}/snapshot",
    {"snapshot": {"name": name, "expires_at": None}},
)
print("create_http", code, json.dumps(created)[:400])
if code in (200, 201):
    print("PRIMARY_SNAPSHOT_OK", created.get("snapshot", created).get("id") if isinstance(created, dict) else "")
    sys.exit(0)

if code != 422 and "SNAPSHOTS_LIMIT" not in json.dumps(created):
    print("CREATE_FAILED")
    sys.exit(1)

# At limit: delete one non-primary snapshot only
deleted = False
for s in snaps:
    src = s.get("source_branch_id") or s.get("branch_id")
    sid = s.get("id")
    if not sid:
        continue
    if src == primary:
        print("keep_primary_source_snapshot", sid)
        continue
    dcode, dbody = api("DELETE", f"/snapshots/{sid}")
    print("delete_http", dcode, sid, json.dumps(dbody)[:200])
    if dcode in (200, 201, 204):
        deleted = True
        break

if not deleted:
    print("NO_NON_PRIMARY_SNAPSHOT_TO_DELETE")
    sys.exit(1)

code, created = api(
    "POST",
    f"/branches/{primary}/snapshot",
    {"snapshot": {"name": name, "expires_at": None}},
)
print("create_after_delete_http", code, json.dumps(created)[:400])
if code not in (200, 201):
    print("PRIMARY_SNAPSHOT_FAILED_AFTER_DELETE")
    sys.exit(1)
print("PRIMARY_SNAPSHOT_OK", (created.get("snapshot") or created).get("id"))
