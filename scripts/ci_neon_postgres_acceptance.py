#!/usr/bin/env python3
"""Provision and remove a disposable Neon branch for live PostgreSQL CI tests.

The only database used by this workflow is a child of the dedicated
opscore-acceptance project. It is never a child of the Production project.
The generated connection strings are written only to GitHub Actions' masked
environment file and are never printed.
"""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ID = "sweet-union-58466913"
PARENT_BRANCH_ID = "br-solitary-band-bbczy982"
DATABASE_NAME = "opscore_acceptance"
RUNTIME_ROLE = "opscore_runtime"
CLEANUP_ROLE = "neondb_owner"
BRANCH_PREFIX = "opscore-ci-pg-"
ACTIVE_BRANCH_LIMIT = 10
PRODUCTION_HOST_MARKER = "ep-winter-leaf-b4d0bwgk"


class NeonApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, detail: str):
        super().__init__(f"NEON_API_{method}_{status}:{path}:{detail[:500]}")
        self.status = status


def metadata_path() -> Path:
    runner_temp = Path(os.environ.get("RUNNER_TEMP", "/tmp")).resolve()
    return runner_temp / "opscore-neon-acceptance-branch.json"


def api(method: str, path: str, body: dict | None = None, query: dict | None = None):
    token = os.environ.get("NEON_API_KEY", "").strip()
    if not token:
        raise RuntimeError("NEON_API_KEY_MISSING")
    suffix = "?" + urllib.parse.urlencode(query or {}) if query else ""
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}{path}{suffix}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            raw = response.read().decode("utf-8") or "{}"
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise NeonApiError(method, path, error.code, detail) from None


def list_branches():
    status, payload = api("GET", "/branches", query={"limit": 100})
    if status != 200:
        raise RuntimeError("NEON_BRANCH_LIST_FAILED")
    rows = payload.get("branches") or []
    if not isinstance(rows, list):
        raise RuntimeError("NEON_BRANCH_LIST_RESPONSE_INVALID")
    return rows


def get_branch(branch_id: str):
    status, payload = api("GET", f"/branches/{branch_id}")
    branch = payload.get("branch") or payload
    if status != 200 or not isinstance(branch, dict):
        raise RuntimeError("NEON_BRANCH_LOOKUP_INVALID")
    return branch


def get_endpoints(branch_id: str):
    status, payload = api("GET", f"/branches/{branch_id}/endpoints")
    rows = payload.get("endpoints") or []
    if status != 200 or not isinstance(rows, list):
        raise RuntimeError("NEON_ENDPOINT_LIST_INVALID")
    return rows


def wait_for_branch(branch_id: str):
    for _ in range(60):
        branch = get_branch(branch_id)
        if branch.get("primary") or branch.get("default") or branch.get("protected"):
            raise RuntimeError("CI_BRANCH_IS_NOT_DISPOSABLE")
        if str(branch.get("parent_id") or "") != PARENT_BRANCH_ID:
            raise RuntimeError("CI_BRANCH_PARENT_MISMATCH")
        if str(branch.get("current_state") or "").lower() in ("ready", "active"):
            return
        time.sleep(2)
    raise RuntimeError("CI_BRANCH_NOT_READY")


def ensure_read_write_endpoint(branch_id: str):
    endpoints = get_endpoints(branch_id)
    matching = [
        item for item in endpoints
        if str(item.get("branch_id") or "") == branch_id
        and str(item.get("type") or "").lower() == "read_write"
    ]
    if not matching:
        status, _ = api(
            "POST",
            "/endpoints",
            {"endpoint": {"branch_id": branch_id, "type": "read_write"}},
        )
        if status not in (200, 201):
            raise RuntimeError("CI_BRANCH_ENDPOINT_CREATE_FAILED")
    for _ in range(60):
        endpoints = get_endpoints(branch_id)
        matching = [
            item for item in endpoints
            if str(item.get("branch_id") or "") == branch_id
            and str(item.get("type") or "").lower() == "read_write"
        ]
        if len(matching) == 1 and str(matching[0].get("current_state") or "").lower() in ("active", "idle", "ready"):
            return
        if len(matching) > 1:
            raise RuntimeError("CI_BRANCH_HAS_MULTIPLE_READ_WRITE_ENDPOINTS")
        time.sleep(2)
    raise RuntimeError("CI_BRANCH_ENDPOINT_NOT_READY")


def connection_uri(branch_id: str, role_name: str) -> tuple[str, str]:
    status, payload = api(
        "GET",
        "/connection_uri",
        query={
            "branch_id": branch_id,
            "database_name": DATABASE_NAME,
            "role_name": role_name,
            "pooled": "false",
        },
    )
    uri = str(payload.get("uri") or payload.get("connection_uri") or "")
    parsed = urllib.parse.urlparse(uri)
    host = str(parsed.hostname or "").lower()
    database = urllib.parse.unquote(parsed.path.lstrip("/").split("/", 1)[0])
    user = urllib.parse.unquote(parsed.username or "")
    if status != 200 or not uri or parsed.scheme not in ("postgres", "postgresql"):
        raise RuntimeError(f"CI_CONNECTION_URI_INVALID:{role_name}")
    if not host or "-pooler" in host or host == PRODUCTION_HOST_MARKER or PRODUCTION_HOST_MARKER in host:
        raise RuntimeError("CI_DIRECT_NON_PRODUCTION_ENDPOINT_REQUIRED")
    if database != DATABASE_NAME or user != role_name:
        raise RuntimeError(f"CI_CONNECTION_IDENTITY_MISMATCH:{role_name}")
    return uri, host


def write_metadata(branch_id: str, branch_name: str):
    metadata_path().write_text(
        json.dumps({
            "project_id": PROJECT_ID,
            "branch_id": branch_id,
            "branch_name": branch_name,
            "parent_branch_id": PARENT_BRANCH_ID,
        }, separators=(",", ":")),
        encoding="utf-8",
    )


def setup():
    branches = list_branches()
    primary = [item for item in branches if item.get("id") == PARENT_BRANCH_ID]
    if len(primary) != 1 or not str(primary[0].get("name") or "").startswith("acceptance/"):
        raise RuntimeError("ACCEPTANCE_PARENT_BRANCH_IDENTITY_INVALID")
    if primary[0].get("primary") or primary[0].get("default"):
        raise RuntimeError("ACCEPTANCE_PARENT_MUST_NOT_BE_PRODUCTION_OR_DEFAULT")
    if len(branches) >= ACTIVE_BRANCH_LIMIT:
        raise RuntimeError(f"NEON_ACCEPTANCE_BRANCH_CAPACITY_FULL:{len(branches)}/{ACTIVE_BRANCH_LIMIT}")

    run_id = os.environ.get("GITHUB_RUN_ID", "").strip()
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1").strip()
    if not run_id.isdigit() or not attempt.isdigit():
        raise RuntimeError("GITHUB_RUN_IDENTITY_MISSING")
    branch_name = f"{BRANCH_PREFIX}{run_id}-{attempt}"
    if any(str(item.get("name") or "") == branch_name for item in branches):
        raise RuntimeError("CI_BRANCH_NAME_ALREADY_EXISTS_NO_REUSE")

    status, payload = api(
        "POST",
        "/branches",
        {"branch": {"parent_id": PARENT_BRANCH_ID, "name": branch_name}},
    )
    branch = payload.get("branch") or {}
    branch_id = str(branch.get("id") or "")
    if status not in (200, 201) or not branch_id.startswith("br-"):
        raise RuntimeError(f"CI_BRANCH_CREATE_FAILED:{status}")
    # Persist the deletion target immediately so the always-run cleanup can
    # remove it even if endpoint creation or connection preparation fails.
    write_metadata(branch_id, branch_name)

    wait_for_branch(branch_id)
    ensure_read_write_endpoint(branch_id)
    runtime_uri, host = connection_uri(branch_id, RUNTIME_ROLE)
    cleanup_uri, cleanup_host = connection_uri(branch_id, CLEANUP_ROLE)
    if cleanup_host != host:
        raise RuntimeError("CI_CLEANUP_ENDPOINT_HOST_MISMATCH")

    github_env = os.environ.get("GITHUB_ENV")
    if not github_env:
        raise RuntimeError("GITHUB_ENV_MISSING")
    # Integration tests need to exercise the signed RLS-session binding path.
    # Use a fresh one-run key: never copy Production signing material into CI.
    test_hmac_key = secrets.token_hex(32)
    test_key_id = f"ci-{run_id}-{attempt}"

    # The acceptance branch inherits the verifier schema but no key material.
    # Seed only this generated one-run key into its protected key table using
    # the exact-target neondb_owner connection; runtime remains unable to read it.
    seed_env = os.environ.copy()
    seed_env.update({
        "OPSC_TENANT_CONTEXT_HMAC_KEY": test_hmac_key,
        "OPSC_TENANT_CONTEXT_KEY_ID": test_key_id,
        "OPSC_PG_ACCEPTANCE_CLEANUP_URL": cleanup_uri,
        "OPSC_PG_ACCEPTANCE_CLEANUP_HOST": cleanup_host,
        "OPSC_PG_ACCEPTANCE_HOST": host,
    })
    seed = subprocess.run(
        ["node", "backend/scripts/ci-seed-tenant-context-key.js"],
        check=False,
        capture_output=True,
        text=True,
        env=seed_env,
        timeout=60,
    )
    if seed.stdout:
        print(seed.stdout.rstrip())
    if seed.returncode != 0:
        safe_error = "\\n".join(
            line for line in (seed.stderr or "").splitlines()
            if "CI_TENANT_CONTEXT_KEY_SEEDED=" in line
        )
        raise RuntimeError("CI_SIGNING_KEY_SEED_FAILED:" + (safe_error or "NO_SAFE_DIAGNOSTIC"))

    values = {
        "OPSC_TENANT_CONTEXT_HMAC_KEY": test_hmac_key,
        "OPSC_TENANT_CONTEXT_KEY_ID": test_key_id,
        "OPSC_PG_ACCEPTANCE_URL": runtime_uri,
        "OPSC_PG_ACCEPTANCE_HOST": host,
        "OPSC_PG_ACCEPTANCE_CLEANUP_URL": cleanup_uri,
        "OPSC_PG_ACCEPTANCE_CLEANUP_ROLE": CLEANUP_ROLE,
        "OPSC_PG_ACCEPTANCE_CLEANUP_HOST": host,
        "OPSC_PG_ACCEPTANCE_STRICT": "true",
        "OPSC_PG_SSL_MODE": "require",
        "OPSC_EXPECTED_INSTANCES": "1",
    }
    with open(github_env, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise RuntimeError(f"GITHUB_ENV_VALUE_INVALID:{key}")
            handle.write(f"{key}={value}\n")

    print("NEON_LIVE_ACCEPTANCE_SETUP=PASS")
    print("database=opscore_acceptance")
    print("runtime_role=opscore_runtime")
    print("cleanup_role=neondb_owner")
    print("branch_state=ready")
    print("endpoint=direct")
    print("production_database_touched=false")
    print("branch_id_recorded_for_always_cleanup=true")


def cleanup():
    path = metadata_path()
    if not path.exists():
        print("NEON_LIVE_ACCEPTANCE_CLEANUP=NOT_REQUIRED branch_was_not_created")
        return
    metadata = json.loads(path.read_text(encoding="utf-8"))
    branch_id = str(metadata.get("branch_id") or "")
    branch_name = str(metadata.get("branch_name") or "")
    if (
        metadata.get("project_id") != PROJECT_ID
        or metadata.get("parent_branch_id") != PARENT_BRANCH_ID
        or not branch_id.startswith("br-")
        or not branch_name.startswith(BRANCH_PREFIX)
    ):
        raise RuntimeError("CI_BRANCH_CLEANUP_METADATA_INVALID")

    try:
        branch = get_branch(branch_id)
    except NeonApiError as error:
        if error.status == 404:
            print("NEON_LIVE_ACCEPTANCE_CLEANUP=PASS branch_already_absent")
            return
        raise

    if (
        branch.get("id") != branch_id
        or branch.get("name") != branch_name
        or branch.get("parent_id") != PARENT_BRANCH_ID
        or branch.get("primary")
        or branch.get("default")
        or branch.get("protected")
    ):
        raise RuntimeError("CI_BRANCH_CLEANUP_IDENTITY_GUARD_FAILED")

    status, _ = api("DELETE", f"/branches/{branch_id}")
    if status not in (200, 202, 204):
        raise RuntimeError(f"CI_BRANCH_DELETE_FAILED:{status}")

    for _ in range(30):
        try:
            get_branch(branch_id)
        except NeonApiError as error:
            if error.status == 404:
                path.unlink(missing_ok=True)
                print("NEON_LIVE_ACCEPTANCE_CLEANUP=PASS")
                print("deleted_ephemeral_branch_only=true")
                print("branch_name_prefix_verified=true")
                return
            raise
        time.sleep(2)
    raise RuntimeError("CI_BRANCH_DELETE_NOT_CONFIRMED")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("setup", "cleanup"):
        raise SystemExit("Usage: ci_neon_postgres_acceptance.py setup|cleanup")
    try:
        setup() if sys.argv[1] == "setup" else cleanup()
    except Exception as exc:
        # Never include connection URI or token material in errors.
        print(f"NEON_LIVE_ACCEPTANCE_{sys.argv[1].upper()}_FAILED={type(exc).__name__}:{str(exc)[:600]}")
        raise SystemExit(1)
