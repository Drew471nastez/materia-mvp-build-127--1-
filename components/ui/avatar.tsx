"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
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
function AvatarImage({ className, src, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  const [shown, setShown] = React.useState(src)

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
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

/**
 * `delayMs` defaults to 600, and that default is the whole point.
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
  delayMs = 600,
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
