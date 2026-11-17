#!/usr/bin/env python3
import json, os, urllib.request, sys

key = os.environ["NEON_API_KEY"]
proj = os.environ.get("NEON_PROJECT_ID") or "summer-leaf-18448271"
mode = (os.environ.get("MODE") or "both").lower()
KEEP = {
    "br-proud-salad-bcshhdap",
    "br-wispy-term-bcrqqj84",
    "br-fragrant-king-bcr9928f",
}
MARKERS = (
    "recovery-point",
    "opscore-prod-recovery",
    "digital-twin",
    "tmp-",
    "test-accept",
    "accept-recovery",
    "ephemeral",
    "restore-drill",
    "opscore-restore-drill",
    "preview/",
    "preview-",
    "catalog-proof",
    "integrated-commercial-gates",
)

def get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

def delete(bid):
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{proj}/branches/{bid}",
        method="DELETE",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status

branches = get(f"https://console.neon.tech/api/v2/projects/{proj}/branches").get("branches") or []
print("branch_count", len(branches))
for b in branches:
    print(
        "branch",
        b.get("id"),
        b.get("name"),
        "primary=" + str(b.get("primary")),
        "protected=" + str(b.get("protected")),
        "parent=" + str(b.get("parent_id")),
        "size=" + str(b.get("logical_size")),
    )
try:
    snaps = get(f"https://console.neon.tech/api/v2/projects/{proj}/snapshots").get("snapshots") or []
except Exception as e:
    print("snapshots_error", e)
    snaps = []
print("snapshot_count", len(snaps))
for s in snaps:
    print("snapshot", s.get("id"), s.get("name"), s.get("source_branch_id") or s.get("branch_id"), s.get("created_at"))

if mode not in ("prune_ephemeral", "both"):
    print("list_only_done")
    sys.exit(0)

deleted = 0
for b in branches:
    bid = b.get("id") or ""
    name = (b.get("name") or "").lower()
    if b.get("primary") or b.get("protected") or bid in KEEP:
        continue
    if not any(m in name for m in MARKERS):
        continue
    try:
        status = delete(bid)
        print("deleted", bid, name, status)
        deleted += 1
    except Exception as e:
        body = e.read().decode()[:240] if hasattr(e, "read") else str(e)
        print("delete_fail", bid, body)
print("deleted_count", deleted)
after = get(f"https://console.neon.tech/api/v2/projects/{proj}/branches").get("branches") or []
print("branch_count_after", len(after))
