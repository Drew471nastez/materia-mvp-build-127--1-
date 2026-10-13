"use client"

/**
 * ===========================================================================
 *  THE BAND AT THE TOP OF A MEMBER'S PROFILE, INSIDE A COMMUNITY
 * ===========================================================================
 * Round J1. The owner: "some of them, even though they have covers, that
 * thing is empty", and "make sure the cover doesn't cause lag and doesn't
 * load with delay".
 *
 *   ONE SHAPE, DRAWN FIRST   the band is a box of a fixed shape (2:1 on a
 *                            phone, 16:5 wider up) before anything loads, so
 *                            nothing under it ever moves, with or without a
 *                            picture.
 *   NEVER A FLAT GREY        under the picture, and in its place for somebody
 *                            with no cover at all: a soft wash of a colour
 *                            taken from their name. Never a blurred photo
 *                            (the owner: no blur).
 *   THE PICTURE AT ONCE      in the server's HTML with fetchpriority high,
 *                            preloaded in the head with the same srcset and
 *                            sizes (lib/communities/member-cover.ts), so it is
 *                            asked for with the page's first bytes and never
 *                            waits for script. Drawn by the server it is shown
 *                            as it loads, like any picture of the page.
 *   OPENED INSIDE THE APP    the place is drawn in the browser: a cover decoded
 *                            before (a hovered link warmed it) is there on the
 *                            first frame; one still on its way starts clear
 *                            and fades in over 180ms once decode() says it is
 *                            whole, over the wash, never painted in strips.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { preload } from "react-dom"
import { coverCropStyle, type CoverCrop } from "@/lib/images/cover-crop"
import { markMemberCoverReady, memberCoverReady, memberCoverSource } from "@/lib/communities/member-cover"
import { cn } from "@/lib/utils"

const never = () => () => {}

/** The fade of a cover that arrives after the band was drawn. */
export const MEMBER_COVER_FADE_MS = 180

/** A hue from a name, so a person with no photo and no cover keeps one colour of their own everywhere. */
export function nameHue(name: string): number {
  let h = 0
  for (const ch of name || "member") h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

/** The wash for somebody with no photo: two soft tints of their hue, light enough that the photo's ring and the name read on it. */
export function nameWash(name: string): string {
  const h = nameHue(name)
  return `linear-gradient(135deg, hsl(${h} 42% 90%) 0%, hsl(${(h + 28) % 360} 38% 84%) 55%, hsl(${(h + 52) % 360} 34% 80%) 100%)`
}

function CoverPicture({ url, crop, name }: { url: string; crop: CoverCrop; name: string }) {
  const source = memberCoverSource(url, crop.zoom)
  /* In the head of the server's HTML, so the browser asks for the right file before it has read the body. */
  preload(source.src, { as: "image", fetchPriority: "high", imageSrcSet: source.srcSet, imageSizes: source.sizes })
  /* True only on the server and while hydrating its HTML: that picture is already on its way with the page. */
  const fromServer = useSyncExternalStore(never, () => false, () => true)
  const [state, setState] = useState(() => ({ shown: fromServer || memberCoverReady(url), fade: false }))
  const img = useRef<HTMLImageElement | null>(null)
  useLayoutEffect(() => {
    const el = img.current
    if (!el || !el.complete || el.naturalWidth <= 0) return
    /* In the cache when it was put on the page: shown on this frame, with nothing to fade from. */
    markMemberCoverReady(url)
    setState((s) => (s.shown ? s : { shown: true, fade: false }))
  }, [url])
  const reveal = () => {
    const el = img.current
    markMemberCoverReady(url)
    if (state.shown) return
    const show = () => setState((s) => (s.shown ? s : { shown: true, fade: true }))
    if (el && typeof el.decode === "function") el.decode().then(show, show)
    else show()
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={source.src}
      srcSet={source.srcSet}
      sizes={source.sizes}
      alt={`${name}'s cover`}
      fetchPriority="high"
      decoding={state.shown && !state.fade ? "sync" : "async"}
      draggable={false}
      onLoad={reveal}
      style={{ ...coverCropStyle(crop), objectFit: "cover" }}
      data-member-cover-image={state.shown ? "shown" : "loading"}
      className={cn(
        "max-w-none select-none",
        state.fade && "transition-opacity duration-[180ms] ease-out motion-reduce:transition-none",
        state.shown ? "opacity-100" : "opacity-0",
      )}
    />
  )
}

export function MemberCover({ url, crop, name }: { url: string | null; crop: CoverCrop; name: string; avatarUrl?: string | null }) {
  /*
    NO BLUR (the owner: "the images don't have that blur thing"). Under the cover, and in its place for somebody with none,
    a soft wash of a colour of their own, from their name: flat, no blurred photo, no extra layer to paint.
  */
  return (
    <div
      className="relative aspect-[2/1] w-full overflow-hidden bg-[#eef0f3] sm:aspect-[16/5]"
      style={{ backgroundImage: nameWash(name) }}
      data-member-profile-cover={url ? "image" : "name-wash"}
    >
      {url ? <CoverPicture key={url} url={url} crop={crop} name={name} /> : null}
    </div>
  )
}
