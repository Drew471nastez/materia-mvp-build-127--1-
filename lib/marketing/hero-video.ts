/** Public background media supplied for the homepage. This is a signed asset
 * URL, not a Supabase API key. Replace here when rotating the asset URL.
 * No alternate mobile file was supplied; only one source is loaded.
 */
export const HERO_VIDEO = {
  src: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/product-files/1794404095596918.mp4?token=eyJraWQiOiI0NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0LWZpbGVzLzE3OTQ0MDQwOTU1OTY5MTgubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5NDQwNDI3NCwiZXhwIjo0NjMyNjQ0Mjc0fQ.FB7eTA4dQCSORmBeAZhZriECCNPxWqcDr3UihW9qRTs",
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
