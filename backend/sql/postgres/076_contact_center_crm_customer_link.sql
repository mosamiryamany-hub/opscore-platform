-- 076: Explicit tenant-scoped CRM customer association for contact-center cases.
-- The customer is linked only through an authenticated, audited supervisor action.
BEGIN;
ALTER TABLE public.ai_contact_conversations
  ADD COLUMN IF NOT EXISTS customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_id_org_contact_center
  ON public.customers(id, organization_id);
ALTER TABLE public.ai_contact_conversations
  ADD CONSTRAINT ai_contact_conversations_customer_tenant_fk
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES public.customers(id, organization_id)
  ON DELETE SET NULL (customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_customer
  ON public.ai_contact_conversations(organization_id, customer_id);
COMMIT;
