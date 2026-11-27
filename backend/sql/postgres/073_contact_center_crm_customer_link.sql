-- 073: Explicit tenant-scoped CRM customer association for contact-center cases.
-- The customer is linked only through an authenticated, audited supervisor action.
BEGIN;
ALTER TABLE public.ai_contact_conversations
  ADD COLUMN IF NOT EXISTS customer_id text
  REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_customer
  ON public.ai_contact_conversations(organization_id, customer_id);
COMMIT;
