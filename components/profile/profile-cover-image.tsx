"use client"

/**
 * ===========================================================================
 *  THE COVER ARRIVES WITHOUT A POP
 * ===========================================================================
 * "Opening a user profile page ... the avatar/cover appear without popping."
 * The photo already fades in (components/app/app-avatar); the cover was a
 * bare <img>, so on a profile opened from a community the band sat grey and
 * then the picture landed on it in one frame.
 *
 *   DRAWN ON THE SERVER   (a cold load) the picture is shown as it loads, as
 *                         any page's picture is: hiding it until the script
 *                         runs would only make it later
 *   ALREADY DECODED       (seen a moment ago, or decoded ahead by the tab bar,
 *                         components/account/cover-warm.ts) it is there on
 *                         the first frame, whole, with no fade at all
 *   STILL ON ITS WAY      it starts clear and fades in over 200ms once it has
 *                         loaded, on the band's own grey
 *
 * ROUND 18, THE OWNER: "get rid of the flash when I land on the account page,
 * in the cover". Filmed at 4x CPU in a real Next build, the account page
 * arriving from the community drew this <img> clear and faded it in over
 * 200ms even when the picture was in the cache: `loaded` began false, the
 * layout effect that found it complete set it true in the same commit, and a
 * layout read between the two (the page's scroll pin) had already resolved
 * the clear style, so the transition ran from nothing. Now a picture that is
 * decoded or complete when it mounts never carries a transition at all; the
 * fade is only for one that arrives after it was drawn. And a decoded one is
 * decoded in step with the page (`decoding="sync"`), so it is not painted a
 * frame after the band around it.
 *
 * Opacity only, so the compositor does the fade; reduced motion skips it.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type React from "react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { parseProfileCover } from "@/lib/profile/cover"
import { coverReady, markCoverReady } from "@/components/account/cover-warm"

const never = () => () => {}

/** The address the cover is drawn from, for a stored cover value (the one profile-hero.tsx draws), or null for none. */
export function profileCoverSrc(stored: string | null | undefined): string | null {
  const cover = parseProfileCover(stored)
  return cover.url ? optimizedImageUrl(cover.url, 1600) : null
}

type Shown = { src: string; shown: boolean; fade: boolean }

export function ProfileCoverImage({ src, style, className }: { src: string; style?: React.CSSProperties; className?: string }) {
  /* True only while hydrating server HTML: that picture is already on its way in the page. */
  const fromServer = useSyncExternalStore(never, () => false, () => true)
  const [state, setState] = useState<Shown>(() => ({ src, shown: fromServer || coverReady(src), fade: false }))
  /* A new address starts over, decided the same way. */
  const now: Shown = state.src === src ? state : { src, shown: coverReady(src), fade: false }
  if (now !== state) setState(now)
  const img = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    if (!img.current?.complete || img.current.naturalWidth <= 0) return
    markCoverReady(src)
    /* In the cache when it was put on the page: shown on this frame, with no transition to run from clear. */
    setState((s) => (s.src === src && s.shown ? s : { src, shown: true, fade: false }))
  }, [src])
  const warm = now.shown && !now.fade
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt=""
      decoding={warm ? "sync" : "async"}
      fetchPriority="high"
      draggable={false}
      onLoad={() => {
        markCoverReady(src)
        setState((s) => (s.src !== src || s.shown ? s : { src, shown: true, fade: true }))
      }}
      style={style}
      data-profile-cover-image={now.shown ? "shown" : "loading"}
      className={cn(
        "select-none",
        now.fade && "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        now.shown ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  )
}
