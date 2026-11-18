/**
 * The homepage's background film (landing round 9, the owner: "when I load
 * storelib.com it first shows a solid background with grain and then plays
 * the video. It should show the video instantly").
 *
 * Why it was late. The supplied file (`original`, a signed asset URL, not a
 * Supabase API key) is 17.5 MB of 1080p at 60 frames with a sound track, on
 * another host, and its index (the moov box) is at the END of the file: a
 * browser has to open a connection to that host, read the head, then ask
 * again for the tail before it can draw one frame. Until then the page
 * showed the poster, which was a flat grey rectangle.
 *
 * Now the film is two files of our own, made from that one with ffmpeg and
 * served from this site (same connection as the page, no second host):
 *
 *   src        1600x900, 30 frames, no sound, index first (faststart): 2.7 MB
 *   phoneSrc   the middle 720x1080 of the frame (what a phone held upright
 *              shows of it anyway, object-fit: cover), same settings: 1.6 MB
 *
 * and each has a poster that IS its first frame (taken from the encoded
 * file, so the hand-over from picture to film changes no pixel): 16 KB and
 * 8 KB of WebP, preloaded at high priority, so the first paint is already
 * the picture. `phoneMedia` is where the phone pair is used; it is the
 * hero's own phone breakpoint (hero.tsx, max-width: 639px).
 *
 * To replace the film: put the new master in `original`, then
 *   ffmpeg -i master.mp4 -an -vf "fps=30,scale=1600:900:flags=lanczos" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 25 -preset slow -g 60 -movflags +faststart cinematic-1600.mp4
 *   ffmpeg -i master.mp4 -an -vf "fps=30,crop=720:1080" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -g 60 -movflags +faststart cinematic-phone.mp4
 *   ffmpeg -i cinematic-1600.mp4 -frames:v 1 f.png   (then WebP, quality 74)
 */
export const HERO_VIDEO = {
  src: "/marketing/hero/cinematic-1600.mp4",
  phoneSrc: "/marketing/hero/cinematic-phone.mp4",
  poster: "/marketing/hero/cinematic-poster-1600.webp",
  phonePoster: "/marketing/hero/cinematic-poster-phone.webp",
  phoneMedia: "(max-width: 639px)",
  original:
    "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/product-files/1794426925775466.mp4?token=eyJraWQiOiI0NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0LWZpbGVzLzE3OTQ0MjY5MjU3NzU0NjYubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5NDQyNzA0OCwiZXhwIjo0OTE2NDkxMDQ4fQ.2ttTZEXRWiPlj_wWtLm6RU2ox4oC5dEkSyndEXFIYbU",
  desktopPosition: "50% 50%",
  mobilePosition: "50% 50%",
} as const

/** The film for this screen: the phone cut where the hero is in its phone layout. Browser only. */
export function heroVideoSource() {
  return typeof matchMedia === "function" && matchMedia(HERO_VIDEO.phoneMedia).matches ? HERO_VIDEO.phoneSrc : HERO_VIDEO.src
}

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
