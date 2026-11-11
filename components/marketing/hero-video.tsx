"use client"

import { useEffect, useRef, useState } from "react"
import { HERO_VIDEO } from "@/lib/marketing/hero-video"

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string }

/** One native decoder. No video bytes are requested until preferences are known. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const video = ref.current
    const hero = video?.closest("[data-home-hero]")
    if (!video || !hero) return
    setMounted(true)
    ;(
      video as HTMLVideoElement & { __heroBootCleanup?: () => void }
    ).__heroBootCleanup?.()
    if (video.dataset.ready === "true") setReady(true)
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const data = matchMedia("(prefers-reduced-data: reduce)")
    const connection = (navigator as Navigator & { connection?: Connection })
      .connection
    let visible = true,
      failed = false,
      disposed = false,
      frame: number | undefined,
      stallTimer: ReturnType<typeof setTimeout> | undefined,
      retryTimer: ReturnType<typeof setTimeout> | undefined,
      retries = 0,
      attempt = 0,
      autoplayBlocked = false,
      resumeFrame = 0,
      lastProgress = performance.now(),
      lastTime = video.currentTime,
      stallRecoveries = 0
    const allowed = () =>
      !motion.matches &&
      !data.matches &&
      !connection?.saveData &&
      !["slow-2g", "2g"].includes(connection?.effectiveType || "")
    const update = () => {
      clearTimeout(stallTimer)
      const enabled = allowed()
      if (!enabled) {
        attempt++
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
        attempt++
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
      const ticket = ++attempt
      video.play()?.catch((error: unknown) => {
        if (
          !disposed &&
          ticket === attempt &&
          !document.hidden &&
          visible &&
          hero.getAttribute("data-motion-paused") !== "true" &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          autoplayBlocked =
            error instanceof DOMException && error.name === "NotAllowedError"
          failed = true
          setReady(false)
        }
      })
    }
    const playing = () => {
      clearTimeout(stallTimer)
      if (failed || !allowed()) return
      if (video.requestVideoFrameCallback)
        frame = video.requestVideoFrameCallback(() => {
          if (!disposed && !failed && allowed()) setReady(true)
        })
      else setReady(true)
    }
    const retry = () => {
      clearTimeout(retryTimer)
      if (
        disposed ||
        !failed ||
        ![2, 4].includes(video.error?.code || 0) ||
        retries >= 2 ||
        !allowed() ||
        !visible ||
        document.hidden ||
        hero.getAttribute("data-motion-paused") === "true"
      )
        return
      retries++
      failed = false
      const position = video.currentTime
      video.load()
      try {
        if (Number.isFinite(position) && position > 0)
          video.currentTime = position
      } catch {
        /* The opening-frame poster remains a safe fallback. */
      }
      update()
    }
    const waiting = () => {
      clearTimeout(stallTimer)
      if (video.paused || video.readyState >= 3) return
      stallTimer = setTimeout(() => {
        if (!disposed && video.readyState < 3) setReady(false)
      }, 4000)
    }
    const error = () => {
      clearTimeout(stallTimer)
      failed = true
      setReady(false)
      if ([2, 4].includes(video.error?.code || 0) && retries < 2) {
        clearTimeout(retryTimer)
        retryTimer = setTimeout(retry, 1500 * (retries + 1))
      }
    }
    const resume = () => {
      if (document.hidden || disposed) return
      const rect = hero.getBoundingClientRect()
      visible = rect.bottom > 0 && rect.top < innerHeight
      if (autoplayBlocked) {
        autoplayBlocked = false
        failed = false
      }
      if (failed) {
        retry()
        return
      }
      update()
    }
    const onResume = () => {
      if (document.hidden) {
        attempt++
        video.pause()
        return
      }
      resume()
      cancelAnimationFrame(resumeFrame)
      resumeFrame = requestAnimationFrame(resume)
    }
    const gestureResume = () => {
      if (autoplayBlocked) resume()
    }
    const progress = () => {
      const current = video.currentTime
      if (Math.abs(current - lastTime) > 0.025) {
        lastTime = current
        lastProgress = performance.now()
        stallRecoveries = 0
      }
    }
    const unexpectedPause = () => {
      if (
        disposed ||
        !video.paused ||
        document.hidden ||
        !visible ||
        !allowed() ||
        hero.getAttribute("data-motion-paused") === "true" ||
        autoplayBlocked
      )
        return
      cancelAnimationFrame(resumeFrame)
      resumeFrame = requestAnimationFrame(resume)
    }
    // Some mobile engines stop the playback clock without raising an error.
    // Only recover buffered decoder stalls; reloading a slow download would
    // discard its buffer and make the connection problem worse.
    const watchdog = setInterval(() => {
      if (disposed || document.hidden || !allowed() || autoplayBlocked) return
      const rect = hero.getBoundingClientRect()
      visible = rect.bottom > 0 && rect.top < innerHeight
      if (!visible || hero.getAttribute("data-motion-paused") === "true") {
        lastProgress = performance.now()
        return
      }
      progress()
      if (failed) {
        retry()
        return
      }
      if (video.paused) {
        resume()
        return
      }
      if (performance.now() - lastProgress < 6500 || stallRecoveries >= 2)
        return
      let bufferedAhead = 0
      for (let i = 0; i < video.buffered.length; i++)
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i) > video.currentTime
        )
          bufferedAhead = video.buffered.end(i) - video.currentTime
      if (video.readyState < 3 || bufferedAhead < 0.3) return
      stallRecoveries++
      lastProgress = performance.now()
      if (stallRecoveries === 1) {
        video.pause()
        update()
      } else {
        const position = video.currentTime
        video.load()
        try {
          video.currentTime = position
        } catch {}
        update()
      }
    }, 2000)
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
    document.addEventListener("visibilitychange", onResume)
    document.addEventListener("resume", onResume)
    window.addEventListener("pageshow", onResume)
    window.addEventListener("focus", onResume)
    video.addEventListener("playing", playing)
    video.addEventListener("timeupdate", progress)
    video.addEventListener("pause", unexpectedPause)
    video.addEventListener("canplay", unexpectedPause)
    document.addEventListener("pointerup", gestureResume, { passive: true })
    video.addEventListener("error", error)
    video.addEventListener("waiting", waiting)
    video.addEventListener("stalled", waiting)
    window.addEventListener("online", retry)
    update()
    if (video.error) error()
    else if (video.readyState >= 2 && !video.paused) playing()
    return () => {
      disposed = true
      clearInterval(watchdog)
      attempt++
      cancelAnimationFrame(resumeFrame)
      clearTimeout(stallTimer)
      clearTimeout(retryTimer)
      observer?.disconnect()
      mutation.disconnect()
      video.pause()
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame)
      motion.removeEventListener("change", update)
      data.removeEventListener("change", update)
      connection?.removeEventListener("change", update)
      document.removeEventListener("visibilitychange", onResume)
      document.removeEventListener("resume", onResume)
      window.removeEventListener("pageshow", onResume)
      window.removeEventListener("focus", onResume)
      video.removeEventListener("playing", playing)
      video.removeEventListener("timeupdate", progress)
      video.removeEventListener("pause", unexpectedPause)
      video.removeEventListener("canplay", unexpectedPause)
      document.removeEventListener("pointerup", gestureResume)
      video.removeEventListener("error", error)
      video.removeEventListener("waiting", waiting)
      video.removeEventListener("stalled", waiting)
      window.removeEventListener("online", retry)
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
          data-video-src={HERO_VIDEO.src}
          suppressHydrationWarning
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
        style={{ visibility: mounted ? "visible" : "hidden" }}
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
