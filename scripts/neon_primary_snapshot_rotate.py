#!/usr/bin/env python3
"""Create a manual snapshot on the Production Primary; any fallback deletion is exact-ID and separately approved."""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

key = str(os.environ.get("NEON_API_KEY") or "").strip()
project_id = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
primary = os.environ.get("OPSC_PRODUCTION_NEON_BRANCH_ID") or "br-proud-salad-bcshhdap"
delete_snapshot_id = str(os.environ.get("OPSC_NON_PRIMARY_SNAPSHOT_DELETE_ID") or "").strip()
delete_confirmation = str(os.environ.get("OPSC_CONFIRM_NON_PRIMARY_SNAPSHOT_DELETE") or "").strip()

if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
    print("NEON_SNAPSHOT_MAIN_MANUAL_DISPATCH_REQUIRED")
    raise SystemExit(2)
if not key:
    print("NEON_API_KEY_MISSING")
    raise SystemExit(2)


def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{project_id}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8") or "{}"
            return response.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"detail": raw[:500]}
        return error.code, payload


code, snapshots_payload = api("GET", "/snapshots")
if code != 200:
    print("LIST_SNAPSHOTS_FAILED", code)
    raise SystemExit(1)
snapshots = snapshots_payload.get("snapshots") or []
print("snapshot_count", len(snapshots))
for snapshot in snapshots:
    print(
        "snapshot",
        snapshot.get("id"),
        snapshot.get("name"),
        "source=" + str(snapshot.get("source_branch_id") or snapshot.get("branch_id")),
        snapshot.get("created_at"),
    )

# First attempt the non-destructive operation: create the new Primary snapshot.
name = "opscore-primary-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
code, created = api(
    "POST",
    f"/branches/{primary}/snapshot",
    {"snapshot": {"name": name, "expires_at": None}},
)
print("create_http", code, json.dumps(created)[:400])
if code in (200, 201):
    snapshot = created.get("snapshot", created) if isinstance(created, dict) else {}
    print("PRIMARY_SNAPSHOT_OK", snapshot.get("id") or "")
    raise SystemExit(0)

if code != 422 and "SNAPSHOTS_LIMIT" not in json.dumps(created):
    print("CREATE_FAILED")
    raise SystemExit(1)

# Never choose an arbitrary non-Primary snapshot. The caller must identify the exact
# snapshot and supply a separate typed confirmation; protected snapshots remain ineligible.
if delete_confirmation != "DELETE_ONE_NON_PRIMARY_SNAPSHOT":
    print("NON_PRIMARY_SNAPSHOT_DELETE_CONFIRMATION_REQUIRED")
    raise SystemExit(2)
if not delete_snapshot_id.startswith("snap-"):
    print("NON_PRIMARY_SNAPSHOT_DELETE_ID_REQUIRED")
    raise SystemExit(2)

matches = [snapshot for snapshot in snapshots if snapshot.get("id") == delete_snapshot_id]
if len(matches) != 1:
    print("NON_PRIMARY_SNAPSHOT_DELETE_ID_NOT_UNIQUE_OR_NOT_FOUND")
    raise SystemExit(2)

candidate = matches[0]
candidate_source = candidate.get("source_branch_id") or candidate.get("branch_id")
candidate_name = str(candidate.get("name") or "").strip().lower()
protected_snapshot_markers = (
    "prod", "primary", "restore", "recovery", "backup", "migration",
    "signed", "commercial", "release", "handoff",
)
if candidate_source == primary:
    print("REFUSE_DELETE_PRIMARY_SOURCE_SNAPSHOT", delete_snapshot_id)
    raise SystemExit(2)
if any(marker in candidate_name for marker in protected_snapshot_markers):
    print("REFUSE_DELETE_PROTECTED_SNAPSHOT_NAME", delete_snapshot_id)
    raise SystemExit(2)

delete_code, delete_body = api("DELETE", f"/snapshots/{delete_snapshot_id}")
print("delete_http", delete_code, delete_snapshot_id, json.dumps(delete_body)[:200])
if delete_code not in (200, 201, 202, 204):
    print("NON_PRIMARY_SNAPSHOT_DELETE_FAILED")
    raise SystemExit(1)

time.sleep(3)
code, refreshed = api("GET", "/snapshots")
remaining = refreshed.get("snapshots") or []
if code != 200 or any(item.get("id") == delete_snapshot_id for item in remaining):
    print("NON_PRIMARY_SNAPSHOT_DELETE_NOT_VERIFIED")
    raise SystemExit(1)

code, created = api(
    "POST",
    f"/branches/{primary}/snapshot",
    {"snapshot": {"name": name, "expires_at": None}},
)
print("create_after_delete_http", code, json.dumps(created)[:400])
if code not in (200, 201):
    print("PRIMARY_SNAPSHOT_FAILED_AFTER_DELETE")
    raise SystemExit(1)
print("PRIMARY_SNAPSHOT_OK", (created.get("snapshot") or created).get("id") or "")
