/** Public background media supplied for the homepage. This is a signed asset
 * URL, not a Supabase API key. Replace here when rotating the asset URL.
 * No alternate mobile file was supplied; only one source is loaded.
 */
export const HERO_VIDEO = {
  src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/product-files/1794426925775466.mp4?token=eyJraWQiOiI0NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0LWZpbGVzLzE3OTQ0MjY5MjU3NzU0NjYubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5NDQyNzA0OCwiZXhwIjo0OTE2NDkxMDQ4fQ.2ttTZEXRWiPlj_wWtLm6RU2ox4oC5dEkSyndEXFIYbU",
  // Neutral local fallback until the opening frame can be retrieved from the CDN.
  poster: "/marketing/hero/cinematic-poster.svg",
  desktopPosition: "50% 50%",
  mobilePosition: "50% 50%",
} as const

export const HERO_PHRASES = [
  "website.",
  "online store.",
  "link in bio.",
  "community.",
  "landing page.",
  "brand.",
  "business.",
] as const
export const HERO_ROTATION_MS = 2000
