-- Allow clients to view their admin's profile
CREATE POLICY "Clients can view their admin profile"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.client_id = auth.uid()
    AND clients.admin_id = profiles.id
  )
);