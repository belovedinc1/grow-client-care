-- Allow admins to view profiles of users who are their clients
CREATE POLICY "Admins can view their clients profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.admin_id = auth.uid()
    AND clients.client_id = profiles.id
  )
);