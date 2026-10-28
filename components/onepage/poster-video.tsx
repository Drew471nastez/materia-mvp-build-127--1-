"use client"

/**
 * ===========================================================================
 *  A VIDEO THAT FADES IN FROM ITS OWN FIRST FRAME
 * ===========================================================================
 * The profile video, round or as the hero, on the live page, in the editor's
 * preview and on the Design tab's own button. The rules are
 * lib/onepage/poster-video.ts; this is the element.
 *
 *   ONE BOX. The poster and the video fill the same box with the same style
 *   (the crop the creator framed, or the hero's position), so the frame
 *   under the video is exactly where the video's first frame lands.
 *
 *   OPACITY ONLY. The video goes from 0 to 1 over 300ms on `playing`, on the
 *   compositor. No blur, no scale, nothing that moves the layout.
 *
 *   ITS OWN STACKING CONTEXT (isolate). The old video carried z-index 1 with
 *   nothing around it to contain it, so in the hero it was painted over the
 *   name, the bio and the social row pulled up onto it, and on the Design
 *   tab over the pencil on the avatar's corner.
 *
 *   PLAYED BY THE PAGE, NOT BY THE ATTRIBUTE. No autoplay attribute: play()
 *   is called once the page is running, so `playing` is always heard (an
 *   autoplay that started before hydration fired it to nobody, and the video
 *   stayed hidden until a fallback timer), so reduced motion and data saver
 *   are asked first, and so it pauses off screen, in a background tab, and
 *   resumes when the page comes back from the back/forward cache.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { firstFrameSrc, posterPlan, prefersStill } from "@/lib/onepage/poster-video"

function subscribeStill(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener?.("change", onChange)
  return () => mq.removeEventListener?.("change", onChange)
}
const stillNow = () => prefersStill(typeof window === "undefined" ? null : (window as never))
const stillOnServer = () => false

export function PosterVideo({
  src,
  poster,
  fallback,
  alt = "",
  mediaStyle,
  fallbackStyle,
  className,
  priority = false,
}: {
  src: string
  /** The video's first frame, drawn with `mediaStyle` exactly as the video is. */
  poster?: string | null
  /** A picture for when the video will not play (reduced motion, data saver, an error). */
  fallback?: string | null
  alt?: string
  /** How the video is placed in the box: the crop, or an object position. */
  mediaStyle?: React.CSSProperties
  fallbackStyle?: React.CSSProperties
  className?: string
  /** The hero: the poster is the largest thing on the first screen. */
  priority?: boolean
}) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const still = React.useSyncExternalStore(subscribeStill, stillNow, stillOnServer)
  const [shown, setShown] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  /* play() refused (iOS Low Power Mode): it stays on its first frame, as a still. */
  const [blocked, setBlocked] = React.useState(false)
  /* A new video starts hidden again, decided while rendering rather than a frame later. */
  const [forSrc, setForSrc] = React.useState(src)
  if (forSrc !== src) {
    setForSrc(src)
    setShown(false)
    setFailed(false)
    setBlocked(false)
  }

  const plan = posterPlan({ poster: poster || null, fallback: fallback || null, still: still || blocked, failed })

  React.useEffect(() => {
    const v = ref.current
    if (!v || !plan.video) return
    if (still || blocked) {
      v.pause()
      /* Its first frame may already be there: show it as the still. */
      if (v.readyState >= 2) setShown(true)
      return
    }
    let onScreen = true
    const play = () => {
      if (!onScreen || document.hidden) return
      const p = v.play()
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === "NotAllowedError") setBlocked(true)
        })
      }
    }
    /* Already running (a cached file the browser started early): show it now. */
    if (!v.paused && v.readyState >= 2) setShown(true)
    play()
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((e) => e.isIntersecting)
            if (onScreen) play()
            else v.pause()
          })
        : null
    io?.observe(v)
    const onVisibility = () => (document.hidden ? v.pause() : play())
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) play()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [src, still, blocked, plan.video])

  const base = plan.base === "poster" ? poster : plan.base === "fallback" ? fallback : null
  return (
    <span className={cn("absolute inset-0 isolate block overflow-hidden", className)} data-poster-video={shown ? "playing" : "poster"}>
      {base ? (
        <img
          src={base}
          alt={alt}
          draggable={false}
          decoding="async"
          loading={priority ? "eager" : undefined}
          fetchPriority={priority ? "high" : undefined}
          className="absolute inset-0 h-full w-full object-cover"
          style={plan.base === "poster" ? mediaStyle : fallbackStyle}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden"
          }}
        />
      ) : null}
      {plan.video ? (
        <video
          ref={ref}
          src={poster ? src : firstFrameSrc(src)}
          poster={poster || undefined}
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="metadata"
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none"
          style={{ ...mediaStyle, opacity: shown ? 1 : 0 }}
          onPlaying={() => setShown(true)}
          onLoadedData={plan.reveal === "loadeddata" ? () => setShown(true) : undefined}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  )
}
