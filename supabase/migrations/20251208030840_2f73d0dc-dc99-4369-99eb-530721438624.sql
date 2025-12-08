-- ===========================================
-- FIX 1: Role Escalation Vulnerability
-- Create user_roles table with proper security
-- ===========================================

-- Create app_role enum (reusing existing user_role but as a separate type for clarity)
-- Note: Using existing user_role enum for compatibility

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.user_role NOT NULL DEFAULT 'client',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create SECURITY DEFINER function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create SECURITY DEFINER function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS policies for user_roles table
-- Users can only view their own role
CREATE POLICY "Users can view their own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only the system (via trigger) can insert roles - no direct user insert
-- Admin assignment should be done via a separate secured process

-- Migrate existing roles from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- Update handle_new_user trigger to ALWAYS insert 'client' role
-- Never trust user-supplied role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile (always without role consideration from metadata)
  INSERT INTO public.profiles (id, full_name, email, phone_number, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email,
    NEW.phone,
    'client' -- ALWAYS default to client, ignore user-supplied role
  );
  
  -- Insert into user_roles table (always as client)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$;

-- ===========================================
-- FIX 2: Update update_updated_at_column to have proper search_path
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ===========================================
-- FIX 3: Secure UPI QR Codes Storage
-- ===========================================
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view UPI QR codes" ON storage.objects;

-- Create secure policy - only invoice parties can view QR codes
CREATE POLICY "Invoice parties can view UPI QR codes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'upi-qr-codes'
  AND (
    -- Admin who owns the folder can view
    (auth.uid())::text = (storage.foldername(name))[1]
    OR 
    -- Client linked to an invoice with this QR code can view
    EXISTS (
      SELECT 1 FROM public.invoices 
      WHERE invoices.upi_qr_url LIKE '%' || storage.objects.name || '%'
      AND (invoices.admin_id = auth.uid() OR invoices.client_id = auth.uid())
    )
  )
);

-- ===========================================
-- FIX 4: Create public view for services (hide admin_id)
-- ===========================================
CREATE OR REPLACE VIEW public.public_services AS 
SELECT id, name, description, default_price, is_active 
FROM public.services 
WHERE is_active = true;

-- Grant access to the view
GRANT SELECT ON public.public_services TO anon, authenticated;