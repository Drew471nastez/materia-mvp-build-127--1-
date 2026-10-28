/**
 * The first frame of a video, as a JPEG, taken in the browser when the video
 * is saved (components/onepage/crop-upload.tsx). The whole frame, not the
 * crop: the page draws the poster through the same crop as the video
 * (lib/onepage/poster-video.ts), so the two always line up.
 *
 * Resolves with null rather than failing: a video whose frame cannot be read
 * (a codec the browser plays but will not draw, a slow file, a cross origin
 * address without CORS) is saved without a poster and the page falls back to
 * the video's own first frame.
 */
export async function captureVideoPoster(src: string, opts: { maxSide?: number; timeoutMs?: number; quality?: number } = {}): Promise<Blob | null> {
  if (typeof document === "undefined") return null
  const maxSide = opts.maxSide ?? 720
  const timeoutMs = opts.timeoutMs ?? 8000
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  /* A library file lives on storage, which answers CORS; without this the canvas would be tainted. */
  if (/^https?:/i.test(src)) video.crossOrigin = "anonymous"
  video.src = src
  try {
    const ready = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      const done = (ok: boolean) => {
        clearTimeout(timer)
        resolve(ok)
      }
      video.addEventListener("error", () => done(false), { once: true })
      video.addEventListener(
        "loadeddata",
        () => {
          /* Just past zero: some files have a black frame at exactly 0. */
          const at = Number.isFinite(video.duration) && video.duration > 0.2 ? 0.05 : 0
          if (at === 0) return done(true)
          video.addEventListener("seeked", () => done(true), { once: true })
          video.currentTime = at
        },
        { once: true },
      )
      video.load()
    })
    if (!ready || !video.videoWidth || !video.videoHeight) return null
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", opts.quality ?? 0.82)
      } catch {
        resolve(null)
      }
    })
    canvas.width = 0
    canvas.height = 0
    return blob && blob.size > 0 ? blob : null
  } catch {
    return null
  } finally {
    video.removeAttribute("src")
    video.load()
  }
}
