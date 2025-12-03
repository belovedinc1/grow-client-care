-- Allow admins to insert invoice items for their invoices
CREATE POLICY "Admins can insert invoice items"
ON public.invoice_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_items.invoice_id
    AND invoices.admin_id = auth.uid()
  )
);

-- Allow admins to update invoice items for their invoices
CREATE POLICY "Admins can update invoice items"
ON public.invoice_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_items.invoice_id
    AND invoices.admin_id = auth.uid()
  )
);

-- Allow admins to delete invoice items for their invoices
CREATE POLICY "Admins can delete invoice items"
ON public.invoice_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_items.invoice_id
    AND invoices.admin_id = auth.uid()
  )
);