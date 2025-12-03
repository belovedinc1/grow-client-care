-- Allow admins to update their clients' profiles
CREATE POLICY "Admins can update their clients profiles"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.admin_id = auth.uid()
    AND clients.client_id = profiles.id
  )
);

-- Allow admins to delete client relationships
CREATE POLICY "Admins can delete client relationships"
ON public.clients
FOR DELETE
USING (auth.uid() = admin_id);