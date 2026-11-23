-- 072: Deployment release evidence store.
-- A durable owner-only audit chain binding each FINAL production deployment
-- (its immutable dpl_ identifier) to the commit, pipeline, and evidence digest
-- verified when that deployment was promoted. This closes the gap in which
-- promotion-time evidence was bound to a held candidate deployment instead of
-- the deployment actually serving traffic. One row per deployment; RLS is
-- forced with an owner-only policy and no runtime privilege, mirroring the
-- migration ledger semantics.
BEGIN;

CREATE TABLE IF NOT EXISTS public.deployment_release_evidence (
  deployment_id text PRIMARY KEY CHECK (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  evidence_schema_version text NOT NULL CHECK (evidence_schema_version = 'opscore.deployment-release-evidence.v1'),
  source_commit_sha text NOT NULL CHECK (source_commit_sha ~ '^[a-f0-9]{40}$'),
  pipeline_id text NOT NULL CHECK (pipeline_id ~ '^[0-9]{1,15}$'),
  environment text NOT NULL CHECK (environment = 'production'),
  promoted_domain text NOT NULL CHECK (promoted_domain IN ('opscore-platform.vercel.app')),
  gates_summary jsonb NOT NULL CHECK (gates_summary ? 'allGatesPass' AND gates_summary ? 'evidenceDigestSha256'),
  evidence_digest_sha256 text NOT NULL CHECK (evidence_digest_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT current_user
);

ALTER TABLE public.deployment_release_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_release_evidence FORCE ROW LEVEL SECURITY;

-- Owner-only policy: runtime roles get no policy, therefore no access.
CREATE POLICY deployment_release_evidence_owner_all
  ON public.deployment_release_evidence
  FOR ALL
  USING (current_user = 'neondb_owner')
  WITH CHECK (current_user = 'neondb_owner');

REVOKE ALL ON public.deployment_release_evidence FROM PUBLIC;
-- Migrations 049/059 installed DEFAULT PRIVILEGES for neondb_owner in the
-- public schema (to opscore_app and opscore_runtime). Without an explicit
-- revoke, every new table is born pre-granted and the least-privilege
-- contract below would fail. Measured: run 45134208932 job 137556473544
-- failed with OPSC_DEPLOYMENT_EVIDENCE_STORE_CONTRACT_FAILED for exactly
-- this reason.
REVOKE ALL ON public.deployment_release_evidence FROM opscore_app;
REVOKE ALL ON public.deployment_release_evidence FROM opscore_runtime;

DO $verify$
DECLARE
  forced boolean;
  runtime_visible boolean;
  policy_count integer;
BEGIN
  SELECT c.relforcerowsecurity INTO forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'deployment_release_evidence';
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'deployment_release_evidence';
  SELECT has_table_privilege('opscore_runtime', 'public.deployment_release_evidence', 'SELECT')
    INTO runtime_visible;
  IF forced IS DISTINCT FROM true
     OR policy_count <> 1
     OR runtime_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OPSC_DEPLOYMENT_EVIDENCE_STORE_CONTRACT_FAILED';
  END IF;
END
$verify$;

COMMIT;
