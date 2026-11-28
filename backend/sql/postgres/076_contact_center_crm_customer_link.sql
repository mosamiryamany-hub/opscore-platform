-- 076: Explicit tenant-scoped CRM customer association for contact-center cases.
-- The customer is linked only through an authenticated, audited supervisor action.
BEGIN;
ALTER TABLE public.ai_contact_conversations
  ADD COLUMN IF NOT EXISTS customer_id text;
-- Reuse the tenant-composite unique index already present in the application schema.
-- Only create one when this migration is run against a compatible reduced schema.
DO $customer_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    WHERE i.indrelid = 'public.customers'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ordinality)
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ordinality <= i.indnkeyatts
      ) = ARRAY['id', 'organization_id']::text[]
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_id_org_contact_center
      ON public.customers(id, organization_id);
  END IF;
END
$customer_key$;
ALTER TABLE public.ai_contact_conversations
  ADD CONSTRAINT ai_contact_conversations_customer_tenant_fk
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES public.customers(id, organization_id)
  ON DELETE SET NULL (customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_customer
  ON public.ai_contact_conversations(organization_id, customer_id);
COMMIT;
