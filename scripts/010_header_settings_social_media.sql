-- Migration: Add social media and header settings columns to store_builder_configs
-- This stores header settings like avatar size choices, social media links, and icon colors

-- Note: The store_builder_configs table already stores header settings in the draft_config and published_config JSONB columns.
-- These JSONB columns contain the full ShopHeaderSettings object which now includes:
-- - avatarSizeChoice: 'small' | 'medium' | 'large' (for desktop)
-- - mobileAvatarSizeChoice: 'small' | 'medium' | 'large' (for mobile)
-- - showSocialMedia: boolean
-- - showSocialIconsOnMobile: boolean (NEW - toggle for mobile social icons visibility)
-- - socialMediaIconColor: string (hex color)
-- - socialLinks: object with platform-specific enabled flags and URLs
-- - faviconUrl: string (NEW - custom favicon URL)

-- No new tables needed since all settings are stored in the existing JSONB config columns.
-- The ShopHeaderSettings type in lib/store-builder/types.ts has been updated to include these fields.

-- This script is a documentation placeholder - the actual data is stored in:
-- store_builder_configs.draft_config.headerSettings
-- store_builder_configs.published_config.headerSettings

-- Example structure in headerSettings:
-- {
--   "avatarSizeChoice": "medium",
--   "mobileAvatarSizeChoice": "medium", 
--   "showSocialMedia": true,
--   "showSocialIconsOnMobile": true,
--   "socialMediaIconColor": "#ffffff",
--   "faviconUrl": "https://...",
--   "socialLinks": {
--     "instagram": { "enabled": true, "url": "https://instagram.com/username" },
--     "tiktok": { "enabled": true, "url": "https://tiktok.com/@username" },
--     "youtube": { "enabled": true, "url": "https://youtube.com/@username" },
--     "twitter": { "enabled": true, "url": "https://x.com/username" },
--     "spotify": { "enabled": false, "url": "" }
--   }
-- }

SELECT 'Header settings migration - using existing JSONB structure with new fields: showSocialIconsOnMobile, faviconUrl' as message;
