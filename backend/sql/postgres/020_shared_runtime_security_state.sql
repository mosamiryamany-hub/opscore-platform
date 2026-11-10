BEGIN;
CREATE TABLE IF NOT EXISTS gateway_circuit_states (gateway_name TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS firewall_rate_buckets (bucket_key TEXT PRIMARY KEY, window_start BIGINT NOT NULL, requests BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
COMMIT;
