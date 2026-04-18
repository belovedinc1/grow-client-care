-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.company_role AS ENUM ('admin', 'agent', 'client');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'cancelled', 'expired');
CREATE TYPE public.ticket_status AS ENUM ('open', 'pending', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- =============================================
-- COMPANIES
-- =============================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- =============================================
-- COMPANY MEMBERS (user <-> company with role)
-- =============================================
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.company_role NOT NULL DEFAULT 'client',
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_company_members_user ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);

-- =============================================
-- INVITES
-- =============================================
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.company_role NOT NULL DEFAULT 'client',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invites_token ON public.invites(token);
CREATE INDEX idx_invites_company ON public.invites(company_id);

-- =============================================
-- TICKETS
-- =============================================
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  assigned_to UUID,
  subject TEXT NOT NULL,
  description TEXT,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tickets_company ON public.tickets(company_id);
CREATE INDEX idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX idx_tickets_status ON public.tickets(status);

-- =============================================
-- TICKET MESSAGES
-- =============================================
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_email TEXT,
  sender_name TEXT,
  message TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  email_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);

-- =============================================
-- SECURITY DEFINER HELPER FUNCTIONS (avoid RLS recursion)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_company_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_user_id UUID, _company_id UUID, _role public.company_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_role(_user_id UUID, _company_id UUID)
RETURNS public.company_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.company_members
  WHERE user_id = _user_id AND company_id = _company_id LIMIT 1
$$;

-- =============================================
-- RLS POLICIES: companies
-- =============================================
CREATE POLICY "Members can view their company" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id));

CREATE POLICY "Admins can update their company" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.has_company_role(auth.uid(), id, 'admin'));

-- (No public INSERT/DELETE — companies are created via SECURITY DEFINER function)

-- =============================================
-- RLS POLICIES: company_members
-- =============================================
CREATE POLICY "Members can view co-members" ON public.company_members
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins can insert members" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin'));

CREATE POLICY "Admins can update members" ON public.company_members
  FOR UPDATE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

CREATE POLICY "Admins can delete members" ON public.company_members
  FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- =============================================
-- RLS POLICIES: invites
-- =============================================
CREATE POLICY "Admins can view company invites" ON public.invites
  FOR SELECT TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

CREATE POLICY "Admins can create invites" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_role(auth.uid(), company_id, 'admin')
    AND invited_by = auth.uid()
  );

CREATE POLICY "Admins can update invites" ON public.invites
  FOR UPDATE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

CREATE POLICY "Admins can delete invites" ON public.invites
  FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- (Public lookup-by-token is via SECURITY DEFINER function, not RLS)

-- =============================================
-- RLS POLICIES: tickets
-- =============================================
CREATE POLICY "Admins/agents view all company tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.has_company_role(auth.uid(), company_id, 'agent')
  );

CREATE POLICY "Clients view own tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Members create tickets in their company" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins/agents update company tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.has_company_role(auth.uid(), company_id, 'agent')
  );

CREATE POLICY "Clients update own open tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins delete company tickets" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- =============================================
-- RLS POLICIES: ticket_messages
-- =============================================
CREATE POLICY "View messages on visible tickets" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
        AND (
          public.has_company_role(auth.uid(), t.company_id, 'admin')
          OR public.has_company_role(auth.uid(), t.company_id, 'agent')
          OR (t.created_by = auth.uid() AND ticket_messages.is_internal_note = false)
        )
    )
  );

CREATE POLICY "Members add messages on visible tickets" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
        AND (
          public.has_company_role(auth.uid(), t.company_id, 'admin')
          OR public.has_company_role(auth.uid(), t.company_id, 'agent')
          OR t.created_by = auth.uid()
        )
    )
  );

-- =============================================
-- TICKET NUMBER AUTO-GENERATION
-- =============================================
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.ticket_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_set_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_number();

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- CREATE COMPANY + ADMIN (used by signup)
-- =============================================
CREATE OR REPLACE FUNCTION public.create_company_with_admin(
  _company_name TEXT,
  _admin_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company_id UUID;
  _user_id UUID := auth.uid();
  _user_email TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block if already in a company
  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'User already belongs to a company';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  INSERT INTO public.companies (name)
  VALUES (_company_name)
  RETURNING id INTO _company_id;

  INSERT INTO public.company_members (company_id, user_id, role, full_name, email)
  VALUES (_company_id, _user_id, 'admin', _admin_full_name, _user_email);

  RETURN _company_id;
END;
$$;

-- =============================================
-- INVITE LOOKUP (public, by token)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token TEXT)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  company_name TEXT,
  email TEXT,
  role public.company_role,
  status public.invite_status,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.company_id, c.name, i.email, i.role, i.status, i.expires_at
  FROM public.invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = _token
$$;

-- =============================================
-- ACCEPT INVITE (called after user authenticates)
-- =============================================
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT, _full_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite RECORD;
  _user_id UUID := auth.uid();
  _user_email TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  SELECT * INTO _invite FROM public.invites WHERE token = _token;

  IF _invite IS NULL THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  IF _invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is no longer valid (status: %)', _invite.status;
  END IF;

  IF _invite.expires_at < now() THEN
    UPDATE public.invites SET status = 'expired' WHERE id = _invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(_invite.email) <> lower(_user_email) THEN
    RAISE EXCEPTION 'Invite was sent to a different email address';
  END IF;

  -- Add user to company (idempotent on conflict)
  INSERT INTO public.company_members (company_id, user_id, role, full_name, email)
  VALUES (_invite.company_id, _user_id, _invite.role, _full_name, _user_email)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  UPDATE public.invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = _invite.id;

  RETURN _invite.company_id;
END;
$$;

-- =============================================
-- BACKFILL: existing admin user gets a workspace
-- =============================================
DO $$
DECLARE
  _admin_user_id UUID;
  _admin_email TEXT;
  _admin_name TEXT;
  _company_id UUID;
BEGIN
  -- Find any existing admin from the legacy user_roles table
  SELECT ur.user_id, p.email, p.full_name
  INTO _admin_user_id, _admin_email, _admin_name
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
  LIMIT 1;

  IF _admin_user_id IS NOT NULL THEN
    INSERT INTO public.companies (name) VALUES ('My Workspace') RETURNING id INTO _company_id;
    INSERT INTO public.company_members (company_id, user_id, role, full_name, email)
    VALUES (_company_id, _admin_user_id, 'admin', COALESCE(_admin_name, 'Admin'), _admin_email)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;