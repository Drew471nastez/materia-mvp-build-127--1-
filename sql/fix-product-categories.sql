-- SQL to auto-assign categories to products based on their title, description, and tags
-- Run this in your Supabase SQL Editor to fix the "0 products available" issue on category pages

-- First, let's see what categories are currently set
-- SELECT category, count(*) FROM products WHERE status = 'published' GROUP BY category;

-- Update products that have no category set, using keyword matching on title and description
-- Priority order: check title first (most reliable), then description

-- Productivity
UPDATE products
SET category = 'productivity'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%notion%'
    OR LOWER(title) LIKE '%planner%'
    OR LOWER(title) LIKE '%calendar%'
    OR LOWER(title) LIKE '%checklist%'
    OR LOWER(title) LIKE '%tracker%'
    OR LOWER(title) LIKE '%dashboard%'
    OR LOWER(title) LIKE '%airtable%'
    OR LOWER(title) LIKE '%productivity%'
    OR LOWER(title) LIKE '%todo%'
    OR LOWER(title) LIKE '%task%'
    OR LOWER(title) LIKE '%schedule%'
    OR LOWER(title) LIKE '%workflow%'
    OR LOWER(title) LIKE '%organization%'
    OR (LOWER(description) LIKE '%notion template%')
    OR (LOWER(description) LIKE '%productivity%' AND LOWER(description) LIKE '%template%')
  );

-- Design
UPDATE products
SET category = 'design'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%design%'
    OR LOWER(title) LIKE '%ui kit%'
    OR LOWER(title) LIKE '%ux%'
    OR LOWER(title) LIKE '%figma%'
    OR LOWER(title) LIKE '%canva%'
    OR LOWER(title) LIKE '%graphic%'
    OR LOWER(title) LIKE '%mockup%'
    OR LOWER(title) LIKE '%logo%'
    OR LOWER(title) LIKE '%brand%'
    OR LOWER(title) LIKE '%icon%'
    OR LOWER(title) LIKE '%font%'
    OR LOWER(title) LIKE '%typography%'
    OR LOWER(title) LIKE '%illustration%'
    OR LOWER(title) LIKE '%photoshop%'
    OR LOWER(title) LIKE '%illustrator%'
  );

-- Development
UPDATE products
SET category = 'development'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%code%'
    OR LOWER(title) LIKE '%developer%'
    OR LOWER(title) LIKE '%react%'
    OR LOWER(title) LIKE '%nextjs%'
    OR LOWER(title) LIKE '%next.js%'
    OR LOWER(title) LIKE '%javascript%'
    OR LOWER(title) LIKE '%typescript%'
    OR LOWER(title) LIKE '%wordpress%'
    OR LOWER(title) LIKE '%shopify theme%'
    OR LOWER(title) LIKE '%html%'
    OR LOWER(title) LIKE '%css%'
    OR LOWER(title) LIKE '%web template%'
    OR LOWER(title) LIKE '%plugin%'
    OR LOWER(title) LIKE '%script%'
    OR LOWER(title) LIKE '%api%'
    OR LOWER(title) LIKE '%saas%'
    OR LOWER(title) LIKE '%software%'
  );

-- Marketing
UPDATE products
SET category = 'marketing'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%marketing%'
    OR LOWER(title) LIKE '%email template%'
    OR LOWER(title) LIKE '%newsletter%'
    OR LOWER(title) LIKE '%landing page%'
    OR LOWER(title) LIKE '%seo%'
    OR LOWER(title) LIKE '%copywriting%'
    OR LOWER(title) LIKE '%funnel%'
    OR LOWER(title) LIKE '%ad creative%'
    OR LOWER(title) LIKE '%ads%'
  );

-- Business
UPDATE products
SET category = 'business'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%business%'
    OR LOWER(title) LIKE '%spreadsheet%'
    OR LOWER(title) LIKE '%excel%'
    OR LOWER(title) LIKE '%presentation%'
    OR LOWER(title) LIKE '%powerpoint%'
    OR LOWER(title) LIKE '%invoice%'
    OR LOWER(title) LIKE '%proposal%'
    OR LOWER(title) LIKE '%contract%'
    OR LOWER(title) LIKE '%pitch deck%'
    OR LOWER(title) LIKE '%finance%'
  );

-- AI
UPDATE products
SET category = 'ai'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%ai %'
    OR LOWER(title) LIKE '%chatgpt%'
    OR LOWER(title) LIKE '%gpt%'
    OR LOWER(title) LIKE '%prompt%'
    OR LOWER(title) LIKE '%midjourney%'
    OR LOWER(title) LIKE '%dall-e%'
    OR LOWER(title) LIKE '%automation%'
    OR LOWER(title) LIKE '%artificial intelligence%'
  );

-- Social Media
UPDATE products
SET category = 'social-media'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%instagram%'
    OR LOWER(title) LIKE '%tiktok%'
    OR LOWER(title) LIKE '%youtube%'
    OR LOWER(title) LIKE '%twitter%'
    OR LOWER(title) LIKE '%linkedin%'
    OR LOWER(title) LIKE '%pinterest%'
    OR LOWER(title) LIKE '%social media%'
    OR LOWER(title) LIKE '%reels%'
    OR LOWER(title) LIKE '%content creator%'
  );

-- Photography
UPDATE products
SET category = 'photography'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%photo%'
    OR LOWER(title) LIKE '%lightroom%'
    OR LOWER(title) LIKE '%preset%'
    OR LOWER(title) LIKE '%overlay%'
    OR LOWER(title) LIKE '%lut%'
    OR LOWER(title) LIKE '%stock photo%'
  );

-- Video
UPDATE products
SET category = 'video'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%video%'
    OR LOWER(title) LIKE '%motion graphic%'
    OR LOWER(title) LIKE '%after effects%'
    OR LOWER(title) LIKE '%premiere%'
    OR LOWER(title) LIKE '%davinci%'
    OR LOWER(title) LIKE '%transition%'
    OR LOWER(title) LIKE '%animation%'
  );

-- Audio & Music
UPDATE products
SET category = 'audio-music'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%music%'
    OR LOWER(title) LIKE '%audio%'
    OR LOWER(title) LIKE '%sound effect%'
    OR LOWER(title) LIKE '%sfx%'
    OR LOWER(title) LIKE '%loop%'
    OR LOWER(title) LIKE '%sample%'
    OR LOWER(title) LIKE '%podcast%'
    OR LOWER(title) LIKE '%beat%'
  );

-- Education
UPDATE products
SET category = 'education'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%course%'
    OR LOWER(title) LIKE '%ebook%'
    OR LOWER(title) LIKE '%e-book%'
    OR LOWER(title) LIKE '%tutorial%'
    OR LOWER(title) LIKE '%worksheet%'
    OR LOWER(title) LIKE '%guide%'
    OR LOWER(title) LIKE '%learn%'
    OR LOWER(title) LIKE '%training%'
  );

-- E-commerce
UPDATE products
SET category = 'ecommerce'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null')
  AND (
    LOWER(title) LIKE '%ecommerce%'
    OR LOWER(title) LIKE '%e-commerce%'
    OR LOWER(title) LIKE '%shopify%'
    OR LOWER(title) LIKE '%store theme%'
    OR LOWER(title) LIKE '%woocommerce%'
    OR LOWER(title) LIKE '%product mockup%'
  );

-- Set remaining uncategorized products to 'other'
UPDATE products
SET category = 'other'
WHERE status = 'published'
  AND (category IS NULL OR category = '' OR category = 'null');

-- Verify the results
SELECT category, count(*) as product_count
FROM products
WHERE status = 'published'
GROUP BY category
ORDER BY product_count DESC;
