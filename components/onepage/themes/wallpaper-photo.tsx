"use client"

/**
 * ===========================================================================
 *  A PHOTO WALLPAPER THAT ARRIVES WHOLE, AND CHANGES WITHOUT A BLANK
 * ===========================================================================
 * Round 40, the owner: "Images in the wallpaper more optimized, no glitching,
 * appear smooth, no lag."
 *
 * The wallpaper was one element with the photo as its CSS background, so:
 *
 *   - a new photo (picked in the editor) replaced the old one at once, and
 *     the preview showed the bare page colour, then the photo painting in
 *     from the top as it arrived;
 *   - on a computer the fixed layer also had background-attachment: fixed,
 *     which on an element that is already fixed changes nothing on screen
 *     but makes the browser repaint the photo on every frame of a scroll;
 *   - nothing asked for the photo until the style was worked out.
 *
 * Now the photo is asked for at once, ahead of the page's other pictures
 * (react-dom preload, high priority), from the optimizer's copy the layer
 * draws (lib/onepage/wallpaper-layers wallpaperImage, 960px). The first one
 * is drawn as it always was, so the server's page shows it with no wait. A
 * new one is fetched and decoded out of sight while the old stays; then it
 * fades in over it (opacity only, on the compositor) and the old is let go.
 * Nothing is blank between the two, and nothing is drawn half way.
 */
import * as React from "react"
import { preload } from "react-dom"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { wallpaperImage } from "@/components/onepage/wallpaper-layers"

/** The fade from one photo to the next. */
export const WALLPAPER_FADE_MS = 320

/** The address the layer draws: the same one wallpaperImage puts in its url(). */
export const wallpaperPhotoSrc = (url: string) => optimizedImageUrl(url, 960, 75)

function decoded(src: string): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve()
  const img = new Image()
  img.decoding = "async"
  img.src = src
  return typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve()
}

export function WallpaperPhoto({ url, style }: { url: string; style: React.CSSProperties }) {
  const src = wallpaperPhotoSrc(url)
  preload(src, { as: "image", fetchPriority: "high" })
  /* `shown` is drawn underneath at full strength; `next`, once decoded, fades in over it. */
  const [shown, setShown] = React.useState(url)
  const [next, setNext] = React.useState<{ url: string; ready: boolean } | null>(null)

  React.useEffect(() => {
    if (url === shown) return
    let live = true
    setNext({ url, ready: false })
    decoded(wallpaperPhotoSrc(url)).then(() => {
      if (live) setNext((n) => (n && n.url === url ? { url, ready: true } : n))
    })
    return () => {
      live = false
    }
  }, [url, shown])

  /* The fade's end makes the new photo the one underneath; a timer stands in where no transition runs (reduced motion). */
  React.useEffect(() => {
    if (!next?.ready) return
    const t = window.setTimeout(() => {
      setShown(next.url)
      setNext(null)
    }, WALLPAPER_FADE_MS + 40)
    return () => window.clearTimeout(t)
  }, [next])

  /* Never background-attachment: fixed. A fixed layer is already fixed; the attachment only costs a repaint per scrolled frame. */
  const base: React.CSSProperties = { ...style, backgroundAttachment: undefined, backgroundSize: style.backgroundSize ?? "cover", backgroundPosition: style.backgroundPosition ?? "center", backgroundRepeat: "no-repeat" }
  return (
    <>
      <div aria-hidden data-wallpaper-photo="" style={{ ...base, backgroundImage: wallpaperImage(shown) }} />
      {next ? (
        <div
          aria-hidden
          data-wallpaper-photo="next"
          style={{
            ...base,
            backgroundImage: wallpaperImage(next.url),
            opacity: next.ready ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: `${WALLPAPER_FADE_MS}ms`,
            transitionTimingFunction: "cubic-bezier(0.2, 0.7, 0.2, 1)",
          }}
        />
      ) : null}
    </>
  )
}
