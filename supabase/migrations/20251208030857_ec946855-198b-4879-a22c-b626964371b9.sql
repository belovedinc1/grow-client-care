-- Fix the SECURITY DEFINER VIEW issue by using SECURITY INVOKER (default)
-- Drop and recreate the view with explicit SECURITY INVOKER
DROP VIEW IF EXISTS public.public_services;

CREATE VIEW public.public_services 
WITH (security_invoker = true)
AS 
SELECT id, name, description, default_price, is_active 
FROM public.services 
WHERE is_active = true;

-- Grant access to the view
GRANT SELECT ON public.public_services TO anon, authenticated;