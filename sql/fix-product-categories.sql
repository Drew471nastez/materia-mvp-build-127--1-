-- =============================================================================
-- COMPLETE SQL to fix and normalize all product categories
-- Run this in your Supabase SQL Editor
-- =============================================================================
-- This script does TWO things:
-- 1. Normalizes existing non-standard category values (e.g. "Digital Art" → "design")
-- 2. Auto-assigns categories to products with NULL/empty category based on title keywords
-- =============================================================================

-- =====================================================
-- STEP 1: Normalize existing non-standard category values
-- =====================================================
-- These products already HAVE a category but it's a display name, not a code ID

-- Design variants
UPDATE products SET category = 'design'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'digital art', 'graphic design', 'graphics', 'ui/ux', 'ui ux',
    'ui/ux design', 'web design', 'illustration', 'branding', 'typography',
    'art', 'creative', 'visual design', 'print design', 'logo design'
  );

-- Development variants
UPDATE products SET category = 'development'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'web development', 'software', 'software development', 'coding',
    'programming', 'web templates', 'tech', 'website', 'code',
    'developer tools', 'web apps', 'mobile apps'
  );

-- Marketing variants
UPDATE products SET category = 'marketing'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'digital marketing', 'seo', 'email marketing', 'content marketing',
    'advertising', 'ads', 'copywriting', 'growth'
  );

-- Business variants
UPDATE products SET category = 'business'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'spreadsheets', 'spreadsheet', 'presentations', 'presentation',
    'finance', 'documents', 'corporate', 'startup', 'entrepreneur'
  );

-- AI variants
UPDATE products SET category = 'ai'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'artificial intelligence', 'machine learning', 'prompts', 'ai prompts',
    'chatgpt', 'gpt', 'automation', 'llm'
  );

-- Social Media variants
UPDATE products SET category = 'social-media'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'social media', 'social', 'instagram', 'tiktok', 'youtube',
    'twitter', 'linkedin', 'content creator'
  );

-- Productivity variants
UPDATE products SET category = 'productivity'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'templates', 'notion', 'notion templates', 'planners', 'planner',
    'organization', 'workflow', 'tools'
  );

-- Photography variants
UPDATE products SET category = 'photography'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'photo', 'photos', 'photo editing', 'lightroom', 'presets',
    'lightroom presets', 'camera', 'stock photos'
  );

-- Video variants
UPDATE products SET category = 'video'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'video editing', 'motion graphics', 'animation', 'film',
    'after effects', 'premiere', 'davinci'
  );

-- Audio & Music variants
UPDATE products SET category = 'audio-music'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'audio & music', 'audio', 'music', 'sound', 'podcast',
    'sound effects', 'beats', 'samples'
  );

-- Education variants
UPDATE products SET category = 'education'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'courses', 'online courses', 'ebooks', 'ebook', 'e-book',
    'tutorials', 'tutorial', 'learning', 'training', 'teaching'
  );

-- Ecommerce variants
UPDATE products SET category = 'ecommerce'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'e-commerce', 'online store', 'store', 'shop', 'retail',
    'shopify', 'woocommerce'
  );

-- Freebies variants
UPDATE products SET category = 'freebies'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'free', 'freebie', 'giveaway', 'free resources'
  );

-- Other variants (normalize capitalization)
UPDATE products SET category = 'other'
WHERE status = 'published'
  AND LOWER(TRIM(category)) IN (
    'other', 'misc', 'miscellaneous', 'general', 'various', 'uncategorized'
  );

-- =====================================================
-- STEP 2: Auto-assign categories for NULL/empty products
-- =====================================================
-- These products have no category at all - assign based on title keywords

-- Productivity
UPDATE products SET category = 'productivity'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
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
    OR LOWER(title) LIKE '%task manager%'
    OR LOWER(title) LIKE '%schedule%'
    OR LOWER(title) LIKE '%workflow%'
    OR LOWER(title) LIKE '%organizer%'
    OR LOWER(title) LIKE '%habit tracker%'
    OR LOWER(title) LIKE '%journal%'
    OR (LOWER(description) LIKE '%notion template%')
    OR (LOWER(description) LIKE '%productivity%' AND LOWER(description) LIKE '%template%')
  );

-- Design
UPDATE products SET category = 'design'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
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
    OR LOWER(title) LIKE '%icon pack%'
    OR LOWER(title) LIKE '%font%'
    OR LOWER(title) LIKE '%typography%'
    OR LOWER(title) LIKE '%illustration%'
    OR LOWER(title) LIKE '%photoshop%'
    OR LOWER(title) LIKE '%illustrator%'
    OR LOWER(title) LIKE '%sketch%'
    OR LOWER(title) LIKE '%wireframe%'
    OR LOWER(title) LIKE '%banner%'
    OR LOWER(title) LIKE '%poster%'
    OR LOWER(title) LIKE '%flyer%'
  );

-- Development
UPDATE products SET category = 'development'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
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
    OR LOWER(title) LIKE '%boilerplate%'
    OR LOWER(title) LIKE '%starter kit%'
    OR LOWER(title) LIKE '%component%'
  );

-- Marketing
UPDATE products SET category = 'marketing'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%marketing%'
    OR LOWER(title) LIKE '%email template%'
    OR LOWER(title) LIKE '%newsletter%'
    OR LOWER(title) LIKE '%landing page%'
    OR LOWER(title) LIKE '%seo%'
    OR LOWER(title) LIKE '%copywriting%'
    OR LOWER(title) LIKE '%funnel%'
    OR LOWER(title) LIKE '%ad creative%'
    OR LOWER(title) LIKE '%ads template%'
    OR LOWER(title) LIKE '%lead magnet%'
  );

-- Business
UPDATE products SET category = 'business'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
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
    OR LOWER(title) LIKE '%startup%'
    OR LOWER(title) LIKE '%business plan%'
  );

-- AI
UPDATE products SET category = 'ai'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%ai %'
    OR LOWER(title) LIKE '%chatgpt%'
    OR LOWER(title) LIKE '%gpt%'
    OR LOWER(title) LIKE '%prompt%'
    OR LOWER(title) LIKE '%midjourney%'
    OR LOWER(title) LIKE '%dall-e%'
    OR LOWER(title) LIKE '%automation%'
    OR LOWER(title) LIKE '%artificial intelligence%'
    OR LOWER(title) LIKE '%machine learning%'
    OR LOWER(title) LIKE '%openai%'
    OR LOWER(title) LIKE '%claude%'
    OR LOWER(title) LIKE '%llm%'
  );

-- Social Media
UPDATE products SET category = 'social-media'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
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
    OR LOWER(title) LIKE '%influencer%'
  );

-- Photography
UPDATE products SET category = 'photography'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%photo%'
    OR LOWER(title) LIKE '%lightroom%'
    OR LOWER(title) LIKE '%preset%'
    OR LOWER(title) LIKE '%overlay%'
    OR LOWER(title) LIKE '%lut%'
    OR LOWER(title) LIKE '%stock photo%'
    OR LOWER(title) LIKE '%camera%'
    OR LOWER(title) LIKE '%portrait%'
  );

-- Video
UPDATE products SET category = 'video'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%video%'
    OR LOWER(title) LIKE '%motion graphic%'
    OR LOWER(title) LIKE '%after effects%'
    OR LOWER(title) LIKE '%premiere%'
    OR LOWER(title) LIKE '%davinci%'
    OR LOWER(title) LIKE '%transition%'
    OR LOWER(title) LIKE '%animation%'
    OR LOWER(title) LIKE '%intro template%'
    OR LOWER(title) LIKE '%vfx%'
  );

-- Audio & Music
UPDATE products SET category = 'audio-music'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%music%'
    OR LOWER(title) LIKE '%audio%'
    OR LOWER(title) LIKE '%sound effect%'
    OR LOWER(title) LIKE '%sfx%'
    OR LOWER(title) LIKE '%loop%'
    OR LOWER(title) LIKE '%sample pack%'
    OR LOWER(title) LIKE '%podcast%'
    OR LOWER(title) LIKE '%beat%'
    OR LOWER(title) LIKE '%royalty free%'
  );

-- Education
UPDATE products SET category = 'education'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%course%'
    OR LOWER(title) LIKE '%ebook%'
    OR LOWER(title) LIKE '%e-book%'
    OR LOWER(title) LIKE '%tutorial%'
    OR LOWER(title) LIKE '%worksheet%'
    OR LOWER(title) LIKE '%guide%'
    OR LOWER(title) LIKE '%learn%'
    OR LOWER(title) LIKE '%training%'
    OR LOWER(title) LIKE '%lesson%'
    OR LOWER(title) LIKE '%masterclass%'
  );

-- E-commerce
UPDATE products SET category = 'ecommerce'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null')
  AND (
    LOWER(title) LIKE '%ecommerce%'
    OR LOWER(title) LIKE '%e-commerce%'
    OR LOWER(title) LIKE '%shopify%'
    OR LOWER(title) LIKE '%store theme%'
    OR LOWER(title) LIKE '%woocommerce%'
    OR LOWER(title) LIKE '%product mockup%'
    OR LOWER(title) LIKE '%online store%'
  );

-- Set remaining uncategorized products to 'other'
UPDATE products SET category = 'other'
WHERE status = 'published'
  AND (category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'null');

-- =====================================================
-- STEP 3: Also tag free products (price_cents = 0) as freebies
-- This is optional - only if you want free products to show in Freebies category
-- =====================================================
-- UPDATE products SET category = 'freebies'
-- WHERE status = 'published' AND price_cents = 0;

-- =====================================================
-- VERIFY: Check the results
-- =====================================================
SELECT category, COUNT(*) as product_count
FROM products
WHERE status = 'published'
GROUP BY category
ORDER BY product_count DESC;
