-- 1. Drop service_requests entirely
DROP TABLE IF EXISTS public.service_requests CASCADE;
DROP TYPE IF EXISTS public.service_request_status CASCADE;

-- 2. Allow tickets from guests (inbound email senders without an auth account)
ALTER TABLE public.tickets
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';

-- Either created_by OR guest_email must be present
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_creator_present;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_creator_present
  CHECK (created_by IS NOT NULL OR guest_email IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON public.tickets(company_id);

-- 3. Ticket rating enum + table
DO $$ BEGIN
  CREATE TYPE public.ticket_rating AS ENUM ('poor', 'bad', 'okay', 'good');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ticket_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE,
  company_id UUID NOT NULL,
  rated_by UUID,
  guest_email TEXT,
  rating public.ticket_rating NOT NULL,
  feedback TEXT,
  ai_analysis JSONB,
  ai_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view company ratings"
  ON public.ticket_ratings FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Clients rate their own tickets"
  ON public.ticket_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    rated_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND t.company_id = ticket_ratings.company_id
        AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins update ratings (for AI analysis)"
  ON public.ticket_ratings FOR UPDATE
  TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'admin'::company_role)
    OR public.has_company_role(auth.uid(), company_id, 'agent'::company_role)
  );

-- 4. Bootstrap function: when belovedstudioinc@gmail.com logs in, ensure company + admin membership exist
CREATE OR REPLACE FUNCTION public.bootstrap_owner_admin()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _user_email TEXT;
  _company_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  IF lower(_user_email) <> 'belovedstudioinc@gmail.com' THEN
    RAISE EXCEPTION 'Only the owner can bootstrap';
  END IF;

  -- Check existing membership
  SELECT company_id INTO _company_id
  FROM public.company_members
  WHERE user_id = _user_id
  LIMIT 1;

  IF _company_id IS NOT NULL THEN
    RETURN _company_id;
  END IF;

  -- Look for existing "Beloved Studio" company or create one
  SELECT id INTO _company_id FROM public.companies WHERE lower(name) = 'beloved studio' LIMIT 1;

  IF _company_id IS NULL THEN
    INSERT INTO public.companies (name) VALUES ('Beloved Studio') RETURNING id INTO _company_id;
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, full_name, email)
  VALUES (_company_id, _user_id, 'admin', 'Beloved Studio Admin', _user_email)
  ON CONFLICT DO NOTHING;

  RETURN _company_id;
END;
$$;

-- 5. Allow inbound webhook (service role) to insert tickets/messages even without auth
-- Service role bypasses RLS, but we add explicit policies for clarity.
CREATE POLICY "Service role inserts inbound tickets"
  ON public.tickets FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role inserts inbound messages"
  ON public.ticket_messages FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 6. Helper: get default company for inbound email routing (returns single company)
CREATE OR REPLACE FUNCTION public.get_inbound_company()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies
  WHERE lower(name) = 'beloved studio'
  LIMIT 1
$$;

-- 7. Trigger to auto-generate ticket_number on insert (was already a function, ensure trigger is attached)
DROP TRIGGER IF EXISTS trg_tickets_generate_number ON public.tickets;
CREATE TRIGGER trg_tickets_generate_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ticket_number();

-- Ensure sequence exists
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1;