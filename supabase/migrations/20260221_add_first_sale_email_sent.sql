-- Add first_sale_email_sent flag to creators table
-- This flag ensures the first sale notification email is only sent once per seller lifetime
ALTER TABLE creators ADD COLUMN IF NOT EXISTS first_sale_email_sent BOOLEAN DEFAULT FALSE;
