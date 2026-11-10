-- 040: Scope decision for the four tables intentionally WITHOUT rowsecurity.
-- Decision recorded 2026-10-24 after live introspection (128 tables, 124 with RLS, 260 policies):
--   login_throttle             — global auth-throttle state keyed by throttle_key (no tenant column by design;
--                                per-tenant scoping would let attackers fingerprint tenants via throttle behavior).
--   firewall_rate_buckets      — global firewall buckets keyed by bucket_key (platform-edge rate limiting,
--                                shared budget before tenant resolution; no tenant_id column exists).
--   worker_guard_system_events — platform system-queue telemetry (operator plane; never tenant data).
--   spatial_ref_sys            — PostGIS standard catalog (read-only reference; documented here only —
--                                no COMMENT statement to avoid cross-owner privilege issues).
-- No schema objects are added or altered (keeps Postgres/SQLite table parity at 127=127).
-- COMMENTs are exception-wrapped so bootstrap/migration as a non-owner role can never fail.
DO $$ BEGIN
  COMMENT ON TABLE login_throttle IS 'SECURITY SCOPE 040: global auth-throttle state (no tenant column by design; not tenant data).';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  COMMENT ON TABLE firewall_rate_buckets IS 'SECURITY SCOPE 040: global firewall rate buckets (platform edge state; not tenant data).';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  COMMENT ON TABLE worker_guard_system_events IS 'SECURITY SCOPE 040: platform system queue telemetry (operator plane; not tenant data).';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
