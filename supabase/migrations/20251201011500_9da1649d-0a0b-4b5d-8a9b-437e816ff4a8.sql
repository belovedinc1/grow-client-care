-- Create storage bucket for UPI QR codes
INSERT INTO storage.buckets (id, name, public)
VALUES ('upi-qr-codes', 'upi-qr-codes', true);

-- Create storage policies for UPI QR codes
CREATE POLICY "Admins can upload UPI QR codes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'upi-qr-codes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view UPI QR codes"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'upi-qr-codes');

CREATE POLICY "Admins can update their UPI QR codes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'upi-qr-codes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can delete their UPI QR codes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'upi-qr-codes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);