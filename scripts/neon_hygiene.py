#!/usr/bin/env python3
"""List Neon branch/snapshot inventory; prune only narrowly named, explicitly confirmed ephemeral branches."""
import json
import os
import sys
import urllib.request

PROJECT_ID = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
MODE = (os.environ.get("MODE") or "list").strip().lower()
PRUNE_CONFIRMATION = "DELETE_EPHEMERAL_NEON_BRANCHES"

# Keep the currently known production, recovery, migration and preview branches
# even if their names later happen to match a temporary prefix.
KEEP_IDS = {
    "br-proud-salad-bcshhdap",  # primary
    "br-wispy-credit-bckacgvt",  # vercel-dev
}

# This is deliberately a very narrow allowlist. Broad markers such as "preview",
# "restore", "migration", "catalog" or "digital-twin" must never select a branch.
PRUNE_PREFIXES = ("tmp-", "test-accept-", "ephemeral-", "preview/", "opscore-mig-signed-ctx-", "opscore-commercial-closeout-", "opscore-prepromotion-", "opscore-signed-context-063", "opscore-production-restore-drill")
PROTECTED_NAME_MARKERS = (
    "prod", "production", "restore", "recovery", "snapshot", "migration",
    "signed", "commercial", "preview", "catalog", "release", "handoff",
    "backup", "vercel", "digital-twin",
)


def fail(code):
    print(code)
    raise SystemExit(2)


if MODE not in ("list", "prune_ephemeral"):
    fail("NEON_HYGIENE_MODE_INVALID")

if MODE == "prune_ephemeral":
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
        fail("NEON_PRUNE_MAIN_MANUAL_DISPATCH_REQUIRED")
    if os.environ.get("CONFIRM_PRUNE") != PRUNE_CONFIRMATION:
        fail("NEON_PRUNE_CONFIRMATION_REQUIRED")

key = str(os.environ.get("NEON_API_KEY") or "").strip()
if not key:
    fail("NEON_API_KEY_MISSING")


def get(url):
    request = urllib.request.Request(
        url,
        headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def delete(branch_id):
    request = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/branches/{branch_id}",
        method="DELETE",
        headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status


branches_payload = get(f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/branches?limit=100")
branches = branches_payload.get("branches") or []
if not isinstance(branches, list):
    fail("NEON_BRANCH_INVENTORY_INVALID")

print("branch_count", len(branches))
for branch in branches:
    print(
        "branch",
        branch.get("id"),
        branch.get("name"),
        "primary=" + str(branch.get("primary")),
        "protected=" + str(branch.get("protected")),
        "parent=" + str(branch.get("parent_id")),
        "size=" + str(branch.get("logical_size")),
    )

try:
    snapshots = get(f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/snapshots").get("snapshots") or []
except Exception as error:
    print("snapshots_error", type(error).__name__)
    snapshots = []
print("snapshot_count", len(snapshots))
for snapshot in snapshots:
    print(
        "snapshot",
        snapshot.get("id"),
        snapshot.get("name"),
        snapshot.get("source_branch_id") or snapshot.get("branch_id"),
        snapshot.get("created_at"),
    )

if MODE == "list":
    print("list_only_done")
    raise SystemExit(0)

deleted = 0
for branch in branches:
    branch_id = str(branch.get("id") or "")
    name = str(branch.get("name") or "").strip().lower()
    if branch.get("primary") or branch.get("protected") or branch_id in KEEP_IDS:
        print("skip_protected_identity", branch_id, name)
        continue
    # Disposable prefixes win over broad protected markers (capacity recovery).
    if not any(name.startswith(prefix) or prefix.rstrip("-") in name for prefix in PRUNE_PREFIXES):
        if any(marker in name for marker in PROTECTED_NAME_MARKERS):
            print("skip_protected_name", branch_id, name)
            continue
        print("skip_not_ephemeral", branch_id, name)
        continue
    if not name.startswith(PRUNE_PREFIXES):
        continue
    try:
        status = delete(branch_id)
        print("deleted", branch_id, name, status)
        deleted += 1
    except Exception as error:
        detail = error.read().decode("utf-8", errors="replace")[:240] if hasattr(error, "read") else type(error).__name__
        print("delete_fail", branch_id, detail)

print("deleted_count", deleted)
after = get(f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/branches?limit=100").get("branches") or []
print("branch_count_after", len(after))
