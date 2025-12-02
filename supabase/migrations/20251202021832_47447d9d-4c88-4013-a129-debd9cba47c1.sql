-- Add INSERT policy for admins to create client relationships
CREATE POLICY "Admins can create client relationships"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = admin_id);