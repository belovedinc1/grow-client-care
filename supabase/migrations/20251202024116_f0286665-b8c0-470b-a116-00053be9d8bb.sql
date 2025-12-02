-- Allow clients to read their own client mapping row so the client dashboard can find its admin
CREATE POLICY "Clients can view their own client mapping"
ON public.clients
FOR SELECT
USING (auth.uid() = client_id);