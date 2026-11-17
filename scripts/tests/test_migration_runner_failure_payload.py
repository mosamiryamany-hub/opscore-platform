"""Regression: a non-zero exit from the official runner must surface its
stdout JSON cause, because the runner emits structured failures on stdout and
exits non-zero with empty stderr. Without this the apply-phase cause is lost.
"""
import contextlib, importlib.util, io, pathlib, sys

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
WRAPPER = SCRIPTS / "neon_apply_production_signed_context_migrations.py"
# The wrapper imports sibling modules by bare name (e.g. neon_primary_restore_proof).
sys.path.insert(0, str(SCRIPTS))


def _load():
    spec = importlib.util.spec_from_file_location("wrapper", WRAPPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_runner_failure_payload_carries_stdout_cause():
    module = _load()

    class Result:
        returncode = 1
        stdout = '{"status":"FAIL","reason":"MIGRATION_APPLY_FAILED:063_a.sql:42501"}'
        stderr = ""

    module.subprocess.run = lambda *a, **k: Result()
    buffer = io.StringIO()
    code = 0
    try:
        with contextlib.redirect_stdout(buffer):
            module.invoke_runner(pathlib.Path(".").resolve(), {}, True)
    except SystemExit as exit_signal:
        code = exit_signal.code
    rendered = buffer.getvalue()
    assert code != 0
    assert "OFFICIAL_PRODUCTION_MIGRATION_RUNNER_FAILED" in rendered
    assert "MIGRATION_APPLY_FAILED:063_a.sql:42501" in rendered
