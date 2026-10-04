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
 *   OPENED IN THE APP     it starts clear and fades in over 200ms once it
 *                         has loaded, on the band's own grey
 *   ALREADY LOADED        (seen a moment ago, back and forth) it is there on
 *                         the first frame, with no fade to replay
 *
 * Opacity only, so the compositor does the fade; reduced motion skips it.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type React from "react"
import { cn } from "@/lib/utils"

const never = () => () => {}

export function ProfileCoverImage({ src, style, className }: { src: string; style?: React.CSSProperties; className?: string }) {
  /* True only while hydrating server HTML: that picture is already on its way in the page. */
  const fromServer = useSyncExternalStore(never, () => false, () => true)
  const [loaded, setLoaded] = useState(fromServer)
  const img = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true)
  }, [src])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt=""
      decoding="async"
      fetchPriority="high"
      draggable={false}
      onLoad={() => setLoaded(true)}
      style={style}
      data-profile-cover-image={loaded ? "shown" : "loading"}
      className={cn(
        "select-none transition-opacity duration-200 ease-out motion-reduce:transition-none",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  )
}
