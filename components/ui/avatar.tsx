"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  ONE NUMBER, AND BOTH HALVES OF THE SWAP READ IT
 * ===========================================================================
 * How long Radix waits before it paints the initials. It is declared here
 * rather than inline on the fallback because the fade below is a decision
 * ABOUT this number: a cross-fade is worth playing only if there is something
 * on screen to cross-fade out of, and that is true exactly when the picture
 * took longer than this to arrive.
 */
const FALLBACK_DELAY_MS = 600

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        /**
         * A GROUND, SO THE CIRCLE IS NEVER A HOLE.
         *
         * The fallback below waits 600ms before it paints, deliberately — that
         * is what stops a cached photo flashing initials first. But during
         * those 600ms the fallback renders NOTHING, and the root had no
         * background of its own, so the circle was transparent: on the creator
         * page it showed the cover through it, and on a white page it was a
         * white disc. That is the flash before the picture arrives.
         *
         * `bg-muted` is what the fallback already paints, so nothing changes
         * when the fallback does appear, and nothing changes once the photo
         * covers it. It is only ever visible in the gap.
         */
        "bg-muted",
        "aspect-square",
        // Default to size-8 if no size class provided
        className?.includes("h-") || className?.includes("w-") || className?.includes("size-") ? "" : "size-8",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Swaps `src` only once the NEW image has decoded.
 *
 * Radix resets its loading status the moment `src` changes, so a picture that
 * was already on screen was replaced by the fallback while the replacement
 * downloaded — pick a new avatar in the store builder and it blinked to grey
 * initials before the new photo appeared. The delayed fallback below cannot
 * help there, because by then the fallback has long since been allowed to
 * render.
 *
 * So the element keeps showing what it has while a detached Image decodes the
 * new one; the DOM `src` moves across only when there is something to move to.
 * Radix therefore never sees a loading state for an avatar that already has a
 * picture, and there is nothing to flash.
 *
 * A failure still hands the new src through, so a genuinely broken URL reaches
 * Radix, reports an error, and the fallback takes over as it should.
 */
function AvatarImage({
  className,
  src,
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A FADE THAT DOES NOT REPLAY EVERY TIME YOU COME BACK
   * ═════════════════════════════════════════════════════════════════════════
   * The creator page's big avatar carried `animate-in fade-in duration-300`
   * unconditionally. Its reason is sound: Radix mounts the <img> only once the
   * photo has decoded and swaps it over the initials on a single frame, and on
   * a slow first load that is a snap.
   *
   * But an entrance animation runs on every MOUNT, and going back from a
   * product page mounts the whole listing again. Sampled on production with
   * document.getAnimations(), twenty times a second, for two and a half
   * seconds after a back navigation, this was the ONLY animation on the page:
   *
   *      52ms .. 302ms   running   `enter`, 300ms, on the avatar
   *     352ms .. 2560ms  finished  (it lingers because animate-in fills both)
   *
   * So the picture you were already looking at fades itself in again, out of
   * nothing, every single time you return. That is the flash on the way back.
   *
   * The condition it always wanted is "were the initials actually showing?".
   * They are painted at FALLBACK_DELAY_MS and not before, so a photo that
   * arrives sooner — a cached one, which is every back navigation — has
   * nothing to cross-fade out of and must not animate at all. A cold load on a
   * slow connection still gets its fade, because that is the case the fade was
   * written for.
   *
   * Left off by default: an avatar that is 32px in a list has no snap worth
   * animating, and adding one everywhere would be the opposite of the fix.
   */
  crossFadeFromFallback = false,
  onLoadingStatusChange,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image> & { crossFadeFromFallback?: boolean }) {
  const [shown, setShown] = React.useState(src)

  /*
    A REF, NOT STATE, AND THAT IS THE WHOLE MECHANISM.

    Radix reports the status from an effect, which runs AFTER the render that
    mounts the <img>. So a className derived from state would arrive one frame
    late — the photo would paint at full opacity, then jump to zero and fade,
    which is a worse flash than the one being removed. A ref is written
    immediately and is only ever READ by the timer below, which fires long
    after the image has had its chance. The class is therefore decided before
    the <img> exists, and it is correct on its first painted frame.
  */
  const loaded = React.useRef(false)
  const [initialsWereShown, setInitialsWereShown] = React.useState(false)

  React.useEffect(() => {
    if (!crossFadeFromFallback) return
    const id = window.setTimeout(() => {
      if (!loaded.current) setInitialsWereShown(true)
    }, FALLBACK_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [crossFadeFromFallback])

  React.useEffect(() => {
    // Nothing to preload: cleared, or already what we are showing.
    if (!src || src === shown) {
      if (src !== shown) setShown(src)
      return
    }
    let cancelled = false
    const settle = () => {
      if (!cancelled) setShown(src)
    }
    const probe = new window.Image()
    probe.onload = settle
    probe.onerror = settle
    probe.src = src
    // A cached image can be complete before the handlers are attached.
    if (probe.complete) settle()
    return () => {
      cancelled = true
      probe.onload = null
      probe.onerror = null
    }
  }, [src, shown])

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      src={shown}
      onLoadingStatusChange={(status) => {
        if (status === "loaded" || status === "error") loaded.current = true
        onLoadingStatusChange?.(status)
      }}
      className={cn(
        "aspect-square size-full object-cover",
        initialsWereShown && "animate-in fade-in duration-300 ease-sheet",
        className,
      )}
      {...props}
    />
  )
}

/**
 * `delayMs` defaults to FALLBACK_DELAY_MS, and that default is the whole point.
 *
 * Radix mounts AvatarImage only once the image has decoded, and shows the
 * fallback until then. With no delay — Radix's own default, which this
 * component used to inherit — every avatar in the app painted grey initials
 * first and then popped to the photo, on every mount, even when the image was
 * already in cache. That flash is what made the store-builder profile avatar
 * look like it was glitching: the canvas remounts often, and each remount
 * replayed initials -> photo.
 *
 * A delay means a cached or fast image never shows initials at all, and a
 * genuinely missing one still falls back — just after long enough that it
 * reads as a decision rather than a flicker.
 *
 * Pass `delayMs={0}` explicitly if you want initials up front.
 */
function AvatarFallback({
  className,
  delayMs = FALLBACK_DELAY_MS,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & { delayMs?: number }) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      delayMs={delayMs}
      className={cn("bg-muted flex size-full items-center justify-center rounded-full", className)}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
