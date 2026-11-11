"use client"

import { useEffect, useRef, useState } from "react"
import { HERO_VIDEO } from "@/lib/marketing/hero-video"

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string }

/** One native decoder. No video bytes are requested until preferences are known. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const video = ref.current
    const hero = video?.closest("[data-home-hero]")
    if (!video || !hero) return
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const data = matchMedia("(prefers-reduced-data: reduce)")
    const connection = (navigator as Navigator & { connection?: Connection })
      .connection
    let visible = true,
      failed = false,
      disposed = false,
      frame: number | undefined
    const allowed = () =>
      !motion.matches &&
      !data.matches &&
      !connection?.saveData &&
      !["slow-2g", "2g"].includes(connection?.effectiveType || "")
    const update = () => {
      const enabled = allowed()
      if (!enabled) {
        video.pause()
        if (video.hasAttribute("src")) {
          video.removeAttribute("src")
          video.load()
        }
        setReady(false)
        return
      }
      if (
        document.hidden ||
        !visible ||
        hero.getAttribute("data-motion-paused") === "true"
      ) {
        video.pause()
        return
      }
      if (failed) return
      if (!video.hasAttribute("src")) {
        video.muted = true
        video.src = HERO_VIDEO.src
        video.load()
      }
      // Autoplay policies may reject even a muted video. Keep the poster and form.
      video.play()?.catch((error: unknown) => {
        if (
          !disposed &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          failed = true
          setReady(false)
        }
      })
    }
    const playing = () => {
      if (failed || !allowed()) return
      if (video.requestVideoFrameCallback)
        frame = video.requestVideoFrameCallback(() => {
          if (!disposed && !failed && allowed()) setReady(true)
        })
      else setReady(true)
    }
    const error = () => {
      failed = true
      setReady(false)
    }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            update()
          })
        : null
    const mutation = new MutationObserver(() => {
      failed = false
      update()
    })
    observer?.observe(hero)
    mutation.observe(hero, {
      attributes: true,
      attributeFilter: ["data-motion-paused"],
    })
    motion.addEventListener("change", update)
    data.addEventListener("change", update)
    connection?.addEventListener("change", update)
    document.addEventListener("visibilitychange", update)
    video.addEventListener("playing", playing)
    video.addEventListener("error", error)
    update()
    return () => {
      disposed = true
      observer?.disconnect()
      mutation.disconnect()
      video.pause()
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame)
      motion.removeEventListener("change", update)
      data.removeEventListener("change", update)
      connection?.removeEventListener("change", update)
      document.removeEventListener("visibilitychange", update)
      video.removeEventListener("playing", playing)
      video.removeEventListener("error", error)
    }
  }, [])
  return (
    <>
      <div className="cinematic-media" aria-hidden="true">
        {/* A local poster paints before hydration, even if the CDN or autoplay fails. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="cinematic-poster"
          src={HERO_VIDEO.poster}
          alt=""
          width={1600}
          height={900}
          fetchPriority="high"
        />
        <video
          ref={ref}
          className="cinematic-video"
          data-ready={ready}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
        />
      </div>
      <button
        type="button"
        className="cinematic-motion"
        aria-label={
          paused ? "Resume background motion" : "Pause background motion"
        }
        aria-pressed={paused}
        onClick={() => {
          const next = !paused
          ref.current
            ?.closest("[data-home-hero]")
            ?.setAttribute("data-motion-paused", String(next))
          setPaused(next)
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          {paused ? (
            <path d="m5 3 8 5-8 5Z" />
          ) : (
            <>
              <rect x="4" y="3" width="3" height="10" rx=".7" />
              <rect x="10" y="3" width="3" height="10" rx=".7" />
            </>
          )}
        </svg>
      </button>
    </>
  )
}
