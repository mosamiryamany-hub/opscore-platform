-- 070: durable PostgreSQL-backed evidence and attachment content for serverless runtimes.
-- Vercel function filesystems are not a durable, shared attachment store. The
-- PostgreSQL runtime stores new uploads as BYTEA while existing local rows remain
-- readable without migration or data movement. All rows remain under existing RLS.
BEGIN;

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS content BYTEA;

DO $constraints$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.attachments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%storage_provider%'
  LOOP
    EXECUTE format('ALTER TABLE public.attachments DROP CONSTRAINT %I', item.conname);
  END LOOP;
END
$constraints$;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_storage_provider_check
  CHECK (storage_provider IN ('local', 'postgres'));

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_storage_content_check
  CHECK (
    (storage_provider = 'local' AND content IS NULL)
    OR
    (storage_provider = 'postgres' AND content IS NOT NULL)
  );

ALTER TABLE public.evidence_uploads
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local';

ALTER TABLE public.evidence_uploads
  ADD CONSTRAINT evidence_uploads_storage_provider_check
  CHECK (storage_provider IN ('local', 'postgres'));

ALTER TABLE public.evidence_upload_chunks
  ADD COLUMN IF NOT EXISTS content BYTEA;

ALTER TABLE public.evidence_upload_chunks
  ADD CONSTRAINT evidence_upload_chunks_content_size_check
  CHECK (content IS NULL OR octet_length(content) = bytes);

COMMENT ON COLUMN public.attachments.content IS
  'Durable binary payload for PostgreSQL-backed attachments; NULL for legacy local-file attachments.';
COMMENT ON COLUMN public.evidence_uploads.storage_provider IS
  'Storage backend used for this upload; PostgreSQL stores binary chunks in evidence_upload_chunks.content.';
COMMENT ON COLUMN public.evidence_upload_chunks.content IS
  'Durable binary evidence chunk for PostgreSQL-backed uploads; NULL for legacy local-file chunks.';

COMMIT;
