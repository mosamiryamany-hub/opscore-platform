-- Keep shared login rate-limit housekeeping indexed on PostgreSQL.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_firewall_rate_buckets_updated_at
  ON public.firewall_rate_buckets (updated_at);
COMMIT;
