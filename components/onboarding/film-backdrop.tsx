"use client"

import { useEffect, useRef, useState } from "react"
import { HERO_VIDEO, heroVideoSource } from "@/lib/marketing/hero-video"

const FILM_GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

/**
 * THE FILM BEHIND THE SETUP: the home page's own hero film, darker and a
 * little blurred, so the white card is what is read. Its poster paints at
 * once; the film follows only when motion and data allow, and pauses when
 * the tab is hidden.
 */

export function OnboardingBackdrop() {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(prefers-reduced-data: reduce)").matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    if (calm || saveData) return
    video.src = heroVideoSource()
    const play = () => {
      if (document.visibilityState === "visible") void video.play().catch(() => undefined)
      else video.pause()
    }
    play()
    document.addEventListener("visibilitychange", play)
    return () => {
      document.removeEventListener("visibilitychange", play)
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [])
  return (
    <div aria-hidden="true" data-onboarding-backdrop="" className="pointer-events-none absolute inset-0 overflow-clip bg-[#0b0b0f]">
      <picture>
        <source media={HERO_VIDEO.phoneMedia} srcSet={HERO_VIDEO.phonePoster} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO_VIDEO.poster} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-[1.08] object-cover [filter:blur(10px)_brightness(0.5)]" />
      </picture>
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        tabIndex={-1}
        onPlaying={() => setPlaying(true)}
        className="absolute inset-0 h-full w-full scale-[1.08] object-cover transition-opacity duration-700 ease-out [filter:blur(10px)_brightness(0.5)] motion-reduce:transition-none"
        style={{ opacity: playing ? 1 : 0 }}
      />
      <div className="absolute inset-0 bg-[rgba(9,9,13,0.64)]" />
      {/* A little film grain over it, still, so the dark reads as a picture and not a flat fill. */}
      <div className="absolute inset-0 opacity-[0.11] mix-blend-overlay" style={{ backgroundImage: FILM_GRAIN, backgroundSize: "180px 180px" }} />
    </div>
  )
}
