-- Add FAQs field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;

-- Add comment to describe the structure
COMMENT ON COLUMN products.faqs IS 'Array of FAQ objects with question and answer fields: [{"question": "...", "answer": "..."}]';
