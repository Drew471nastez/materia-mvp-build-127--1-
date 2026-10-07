"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY VIDEO PLAYER (round 13)
 * ===========================================================================
 * One <video> with Storelib's own controls, for a video a community holds
 * (a post's, an event's replay, the About page's cover): the browser's own
 * controls look different everywhere and cannot be quiet.
 *
 *   SURFACE    a click plays and pauses; a tap shows or hides the controls;
 *              a double tap on either side skips ten seconds; a double
 *              click is fullscreen.
 *   BAR        play and pause, the time, a scrub line with what is loaded
 *              (dragged with a finger or a mouse, the time under a mouse),
 *              sound (a slider beside it on a computer; on a phone the
 *              phone's own buttons are the volume), captions when there are
 *              some, picture in picture where the browser has it,
 *              fullscreen (the element's own, or the iPhone's system player).
 *   KEYS       while the player has focus or was the last one pressed:
 *              Space or K, J and L or the arrows (ten seconds), M, F, C,
 *              0 to 9 (a tenth of the way in each).
 *   ADDRESS    signed and good for an hour: renewed five minutes before it
 *              expires and swapped in while paused, or at once after a
 *              failed request, keeping the time and play or pause.
 *
 * The controls fade after a little while playing and come back on any
 * movement. Only opacity and the scrub line's scale move.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { Captions, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react"
import { SKIP_SECONDS, bufferedEnd, clampTime, formatTime, refreshDelay } from "@/lib/courses/playback"

export interface PlayerSource {
  url: string
  expiresAt: number
  mime: string | null
  captions: string | null
}

export interface VideoPlayerProps {
  source: PlayerSource
  poster?: string | null
  /** Seconds to start at. */
  startAt?: number
  autoPlay?: boolean
  /** Read by screen readers. */
  title?: string
  /** Width over height; the box keeps it (the video is letterboxed inside). */
  ratio?: number
  /** A fresh address for the same video, or null when it could not be had. */
  renew: () => Promise<PlayerSource | null>
  /** The place, on pause, after a seek and every fifteen seconds while playing. */
  onPlace?: (position: number, duration: number) => void
  /** Written on every frame of time. */
  live?: { current: { position: number; duration: number } }
  /** Rounded corners of the box (the lightbox has none). */
  rounded?: boolean
}

/** How long the controls stay after the last movement while it plays. */
export const CONTROLS_IDLE_MS = 2400
const SAVE_EVERY_MS = 15_000
const PREF_KEY = "storelib.video.sound"
/** The player whose keys work when no player has focus: the last one pressed. */
let lastPressed: string | null = null

function readSound(): { volume: number; muted: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as { volume?: unknown; muted?: unknown }
    return { volume: typeof raw.volume === "number" && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : 1, muted: raw.muted === true }
  } catch {
    return { volume: 1, muted: false }
  }
}

function writeSound(s: { volume: number; muted: boolean }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(s))
  } catch {
    /* Private mode: it forgets. */
  }
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el?.tagName) return false
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
}

type Vid = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
  webkitSetPresentationMode?: (m: string) => void
  webkitPresentationMode?: string
  webkitSupportsPresentationMode?: (m: string) => boolean
}

export function VideoPlayer({ source, poster, startAt = 0, autoPlay = false, title, ratio, renew, onPlace, live, rounded = true }: VideoPlayerProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const video = useRef<Vid>(null)
  const bar = useRef<HTMLDivElement>(null)
  const id = useRef(`p${Math.random().toString(36).slice(2)}`)
  const [url, setUrl] = useState(source.url)
  const current = useRef(source)
  const fresh = useRef<PlayerSource | null>(null)
  const restore = useRef<{ time: number; play: boolean } | null>(startAt > 0 || autoPlay ? { time: startAt, play: autoPlay } : null)
  const recoveries = useRef<number[]>([])
  const lastTime = useRef(startAt)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(startAt)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(autoPlay)
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [shown, setShown] = useState(true)
  const [sound, setSound] = useState({ volume: 1, muted: false })
  const [captions, setCaptions] = useState(false)
  const [full, setFull] = useState(false)
  const [pip, setPip] = useState({ can: false, on: false })
  const [touch, setTouch] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [skipFlash, setSkipFlash] = useState<{ dir: -1 | 1; key: number } | null>(null)
  const playingRef = useRef(false)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    const s = readSound()
    setSound(s)
    setTouch(window.matchMedia?.("(hover: none), (pointer: coarse)").matches ?? false)
    const el = video.current
    if (el) {
      el.volume = s.volume
      el.muted = s.muted
    }
    const doc = document as Document & { pictureInPictureEnabled?: boolean }
    setPip({ can: !!doc.pictureInPictureEnabled || !!el?.webkitSupportsPresentationMode?.("picture-in-picture"), on: false })
  }, [])

  /* ─── The address ─── */

  const swap = useCallback((force: boolean) => {
    const el = video.current
    const next = fresh.current
    if (!el || !next) return false
    if (!force && !el.paused && Date.now() < current.current.expiresAt - 60_000) return false
    restore.current = { time: el.currentTime || lastTime.current, play: force ? playingRef.current : !el.paused }
    current.current = next
    fresh.current = null
    setFailed(false)
    setUrl(next.url)
    return true
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(async () => {
      const got = await renew()
      if (cancelled || !got) return
      fresh.current = got
      swap(false)
    }, refreshDelay(current.current.expiresAt, Date.now()))
    const due = window.setTimeout(() => swap(true), Math.max(0, current.current.expiresAt - 60_000 - Date.now()))
    return () => {
      cancelled = true
      window.clearTimeout(t)
      window.clearTimeout(due)
    }
  }, [url, renew, swap])

  const recover = useCallback(async () => {
    const now = Date.now()
    recoveries.current = recoveries.current.filter((t) => now - t < 60_000)
    if (recoveries.current.length >= 3) return false
    recoveries.current.push(now)
    if (!fresh.current) fresh.current = await renew()
    return swap(true)
  }, [renew, swap])

  /* ─── Controls that fade while it plays ─── */

  const reveal = useCallback(() => {
    setShown(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (playingRef.current) setShown(false)
    }, CONTROLS_IDLE_MS)
  }, [])

  useEffect(() => {
    playingRef.current = playing
    if (playing) reveal()
    else setShown(true)
  }, [playing, reveal])

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  /* The place, every fifteen seconds while it plays. */
  useEffect(() => {
    if (!playing || !onPlace) return
    const t = window.setInterval(() => {
      const el = video.current
      if (el && !el.paused) onPlace(el.currentTime, el.duration || 0)
    }, SAVE_EVERY_MS)
    return () => window.clearInterval(t)
  }, [playing, onPlace])

  /* Fullscreen and picture in picture, however the browser says so. */
  useEffect(() => {
    const el = video.current
    if (!el) return
    const pipOn = () => setPip((p) => ({ ...p, on: true }))
    const pipOff = () => setPip((p) => ({ ...p, on: false }))
    const fsIn = () => setFull(true)
    const fsOut = () => setFull(false)
    const docFs = () => setFull(!!document.fullscreenElement || !!(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement)
    el.addEventListener("enterpictureinpicture", pipOn)
    el.addEventListener("leavepictureinpicture", pipOff)
    el.addEventListener("webkitbeginfullscreen", fsIn)
    el.addEventListener("webkitendfullscreen", fsOut)
    document.addEventListener("fullscreenchange", docFs)
    document.addEventListener("webkitfullscreenchange", docFs)
    return () => {
      el.removeEventListener("enterpictureinpicture", pipOn)
      el.removeEventListener("leavepictureinpicture", pipOff)
      el.removeEventListener("webkitbeginfullscreen", fsIn)
      el.removeEventListener("webkitendfullscreen", fsOut)
      document.removeEventListener("fullscreenchange", docFs)
      document.removeEventListener("webkitfullscreenchange", docFs)
    }
  }, [])

  /* ─── Actions ─── */

  const togglePlay = useCallback(() => {
    const el = video.current
    if (!el) return
    if (el.ended) el.currentTime = 0
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [])

  const seekTo = useCallback(
    (target: number) => {
      const el = video.current
      if (!el) return
      el.currentTime = clampTime(target, el.duration)
      setTime(el.currentTime)
      if (el.currentTime < (el.duration || 0) - 0.5) setEnded(false)
      onPlace?.(el.currentTime, el.duration || 0)
    },
    [onPlace],
  )

  const skip = useCallback(
    (dir: -1 | 1) => {
      const el = video.current
      if (!el) return
      seekTo(el.currentTime + dir * SKIP_SECONDS)
      setSkipFlash({ dir, key: Date.now() })
    },
    [seekTo],
  )

  const setVolume = useCallback((volume: number, muted?: boolean) => {
    const el = video.current
    const vol = Math.min(1, Math.max(0, volume))
    const m = muted ?? vol === 0
    if (el) {
      el.volume = vol
      el.muted = m
    }
    const next = { volume: vol, muted: m }
    setSound(next)
    writeSound(next)
  }, [])

  const toggleCaptions = useCallback(() => {
    if (!source.captions) return
    setCaptions((on) => {
      const track = video.current?.textTracks?.[0]
      if (track) track.mode = on ? "hidden" : "showing"
      return !on
    })
  }, [source.captions])

  const toggleFull = useCallback(() => {
    const box = wrap.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
    const el = video.current
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    const native = document.documentElement.classList.contains("capacitor")
    if (el?.webkitDisplayingFullscreen) {
      el.webkitExitFullscreen?.()
      return
    }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      return
    }
    /*
      In the iOS app, fullscreen of the box AND the system player is two
      layers, and the second one stays over the rest of Storelib. The system
      player is the one screen.
    */
    if (native && el?.webkitEnterFullscreen) {
      el.webkitEnterFullscreen()
      return
    }
    if (box?.requestFullscreen) void box.requestFullscreen().catch(() => el?.webkitEnterFullscreen?.())
    else if (box?.webkitRequestFullscreen) box.webkitRequestFullscreen()
    else el?.webkitEnterFullscreen?.()
  }, [])

  const togglePip = useCallback(async () => {
    const el = video.current
    if (!el) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else if (el.requestPictureInPicture) await el.requestPictureInPicture()
      else el.webkitSetPresentationMode?.(el.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture")
    } catch {
      /* Refused: nothing to show. */
    }
  }, [])

  /* ─── Keys: the focused player, or the last one pressed ─── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      const inside = !!wrap.current && wrap.current.contains(document.activeElement)
      if (!inside && lastPressed !== id.current) return
      if (!inside && document.activeElement && document.activeElement !== document.body) return
      const el = video.current
      if (!el) return
      const k = e.key
      let handled = true
      if (k === " " || k === "k" || k === "K") {
        if (inside && (e.target as HTMLElement).tagName === "BUTTON" && k === " ") return
        togglePlay()
      } else if (k === "ArrowLeft" || k === "j" || k === "J") skip(-1)
      else if (k === "ArrowRight" || k === "l" || k === "L") skip(1)
      else if (k === "ArrowUp" && inside) setVolume(el.volume + 0.1, false)
      else if (k === "ArrowDown" && inside) setVolume(el.volume - 0.1)
      else if (k === "m" || k === "M") setVolume(el.volume || 1, !el.muted)
      else if (k === "f" || k === "F") toggleFull()
      else if (k === "c" || k === "C") toggleCaptions()
      else if (/^[0-9]$/.test(k) && el.duration > 0) seekTo((Number(k) / 10) * el.duration)
      else handled = false
      if (handled) {
        e.preventDefault()
        reveal()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePlay, skip, setVolume, toggleFull, toggleCaptions, seekTo, reveal])

  useEffect(() => {
    if (!skipFlash) return
    const t = window.setTimeout(() => setSkipFlash(null), 650)
    return () => window.clearTimeout(t)
  }, [skipFlash])

  /* ─── Video events ─── */

  const onLoaded = () => {
    const el = video.current
    if (!el) return
    setDuration(el.duration || 0)
    const r = restore.current
    restore.current = null
    if (r && r.time > 0 && Number.isFinite(el.duration)) el.currentTime = Math.min(r.time, Math.max(0, el.duration - 1))
    if (r?.play) void el.play().catch(() => setWaiting(false))
    else setWaiting(false)
    const track = el.textTracks?.[0]
    if (track) track.mode = captions ? "showing" : "hidden"
  }

  const onProgress = () => {
    const el = video.current
    if (!el) return
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++) ranges.push([el.buffered.start(i), el.buffered.end(i)])
    setBuffered(bufferedEnd(ranges, el.currentTime))
  }

  /* ─── Taps on the picture ─── */

  const lastTap = useRef<{ t: number; x: number } | null>(null)
  const onSurfaceUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPressed = id.current
    if (e.pointerType === "mouse") {
      if (e.button === 0) togglePlay()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const now = Date.now()
    const prev = lastTap.current
    if (prev && now - prev.t < 320 && (x < 0.34 || x > 0.66)) {
      skip(x < 0.34 ? -1 : 1)
      lastTap.current = null
      return
    }
    lastTap.current = { t: now, x }
    if (!playingRef.current) togglePlay()
    else if (shown) setShown(false)
    else reveal()
  }

  /* ─── The scrub line ─── */

  const timeAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    return clampTime(((clientX - rect.left) / rect.width) * duration, duration)
  }
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrub(timeAt(e.clientX))
    reveal()
  }
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = bar.current?.getBoundingClientRect()
    if (rect && e.pointerType === "mouse") setHover({ x: Math.min(Math.max(0, e.clientX - rect.left), rect.width), t: timeAt(e.clientX) })
    if (scrub !== null) setScrub(timeAt(e.clientX))
  }
  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub === null) return
    seekTo(timeAt(e.clientX))
    setScrub(null)
  }
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      e.stopPropagation()
      skip(e.key === "ArrowLeft" ? -1 : 1)
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      seekTo(e.key === "Home" ? 0 : duration)
    }
  }

  const at = scrub ?? time
  const played = duration > 0 ? Math.min(1, at / duration) : 0
  const loaded = duration > 0 ? Math.min(1, buffered / duration) : 0
  const controlsOn = shown || !playing || scrub !== null
  const quiet = sound.muted || sound.volume === 0
  const VolumeIcon = quiet ? VolumeX : sound.volume < 0.5 ? Volume1 : Volume2
  const btn =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white outline-none transition-colors duration-150 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 [-webkit-tap-highlight-color:transparent]"

  return (
    <div
      ref={wrap}
      data-video-player=""
      data-controls={controlsOn ? "shown" : "hidden"}
      data-playing={playing ? "true" : "false"}
      role="region"
      aria-label={title ? `Video: ${title}` : "Video"}
      className={`group/vp relative w-full select-none overflow-hidden bg-[#0a0a0a] [dynamic-range-limit:standard] ${full ? "" : rounded ? "rounded-2xl shadow-[0_8px_28px_-14px_rgba(0,0,0,0.35)] ring-1 ring-black/10" : ""} ${controlsOn ? "" : "cursor-none"}`}
      style={full ? { height: "100%" } : { aspectRatio: String(ratio && ratio > 0 ? ratio : 16 / 9) }}
      onPointerMove={(e) => e.pointerType === "mouse" && reveal()}
      onPointerDownCapture={() => (lastPressed = id.current)}
      onMouseLeave={() => playingRef.current && setShown(false)}
    >
      <style>{`[data-video-player] video::cue{font-family:Inter,system-ui,sans-serif;font-size:clamp(14px,2.4vw,22px);line-height:1.35;color:#fff;background:rgba(10,10,20,.72)}@keyframes vp-skip{0%{opacity:0;scale:.9}20%{opacity:1;scale:1}75%{opacity:1}100%{opacity:0}}`}</style>
      <video
        ref={video}
        src={url}
        poster={poster ?? undefined}
        className="absolute inset-0 h-full w-full object-contain"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        preload="auto"
        aria-label={title}
        onLoadedMetadata={onLoaded}
        onDurationChange={() => setDuration(video.current?.duration || 0)}
        onTimeUpdate={() => {
          const el = video.current
          if (!el) return
          setTime(el.currentTime)
          if (el.currentTime > 0) lastTime.current = el.currentTime
          if (live) live.current = { position: el.currentTime, duration: el.duration || 0 }
        }}
        onProgress={onProgress}
        onSeeked={onProgress}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
        }}
        onPause={() => {
          setPlaying(false)
          const el = video.current
          if (el && !el.ended) onPlace?.(el.currentTime, el.duration || 0)
          swap(false)
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => {
          setPlaying(false)
          setEnded(true)
          const el = video.current
          if (el) onPlace?.(el.duration || 0, el.duration || 0)
        }}
        onError={() => {
          void recover().then((ok) => {
            if (!ok) {
              setFailed(true)
              setWaiting(false)
            }
          })
        }}
      >
        {source.captions ? <track kind="captions" src={source.captions} srcLang="en" label="Captions" /> : null}
      </video>

      <div className="absolute inset-0" onPointerUp={onSurfaceUp} onDoubleClick={() => !touch && toggleFull()} aria-hidden data-video-surface="" />

      {skipFlash ? (
        <div
          key={skipFlash.key}
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/55 px-3 py-2 text-[13px] font-semibold text-white motion-safe:animate-[vp-skip_650ms_ease-out_forwards] ${skipFlash.dir < 0 ? "left-[10%]" : "right-[10%]"}`}
        >
          {skipFlash.dir < 0 ? <RotateCcw className="h-4 w-4" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}
          {SKIP_SECONDS}s
        </div>
      ) : null}

      {waiting && !failed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-video-waiting="">
          <Loader2 className="h-8 w-8 animate-spin text-white/85" aria-label="Loading" />
        </div>
      ) : null}

      {!playing && !waiting && !failed ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={ended ? "Play again" : "Play"}
          className="group/big absolute left-1/2 top-1/2 flex h-[4.25rem] w-[4.25rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1a1a2e] shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)] outline-none transition-[transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.06] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-white/50 motion-reduce:transition-none"
          data-video-big-play=""
        >
          {ended ? <RotateCcw className="h-6 w-6" aria-hidden /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden />}
        </button>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white" data-video-failed="">
          <p className="max-w-[320px] text-[14px] font-semibold">The video stopped loading.</p>
          <button
            type="button"
            onClick={() => {
              recoveries.current = []
              void recover().then((ok) => !ok && setFailed(true))
            }}
            className="h-10 rounded-full bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* The bar: over a soft shade, fading while it plays. */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 motion-reduce:transition-none ${controlsOn && !failed ? "opacity-100" : "pointer-events-none opacity-0"}`}
        data-video-bar=""
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/35 to-transparent" aria-hidden />
        <div className="relative px-2 pb-1.5 sm:px-3 sm:pb-2">
          <div
            ref={bar}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(at)}
            aria-valuetext={`${formatTime(at)} of ${formatTime(duration)}`}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerCancel={() => setScrub(null)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onBarKey}
            className="group/bar relative mx-1 flex h-6 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            data-video-scrub=""
          >
            <div className={`relative h-[4px] w-full overflow-hidden rounded-full bg-white/30 transition-[scale] duration-150 group-hover/bar:scale-y-[1.5] motion-reduce:transition-none ${scrub !== null ? "scale-y-[1.5]" : ""}`}>
              <div className="absolute inset-y-0 left-0 w-full origin-left bg-white/40" style={{ scale: `${loaded} 1` }} />
              <div className="absolute inset-y-0 left-0 w-full origin-left bg-white" style={{ scale: `${played} 1` }} data-video-played="" />
            </div>
            <span
              className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-opacity duration-150 group-hover/bar:opacity-100 ${scrub !== null || touch ? "opacity-100" : "opacity-0"}`}
              style={{ left: `${played * 100}%` }}
              aria-hidden
            />
            {hover && scrub === null ? (
              <span className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white" style={{ left: hover.x }}>
                {formatTime(hover.t)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" className={btn} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} data-video-toggle="">
              {playing ? <Pause className="h-[18px] w-[18px]" fill="currentColor" aria-hidden /> : <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" aria-hidden />}
            </button>
            <div className="group/vol flex items-center">
              <button type="button" className={btn} onClick={() => setVolume(sound.volume || 1, !quiet)} aria-label={quiet ? "Unmute" : "Mute"} data-video-mute="">
                <VolumeIcon className="h-[18px] w-[18px]" aria-hidden />
              </button>
              {!touch ? (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={quiet ? 0 : sound.volume}
                  onChange={(e) => setVolume(Number(e.target.value), Number(e.target.value) === 0)}
                  aria-label="Volume"
                  className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 opacity-0 accent-white transition-[width,opacity] duration-150 group-hover/vol:mr-2 group-hover/vol:w-[72px] group-hover/vol:opacity-100 focus-visible:mr-2 focus-visible:w-[72px] focus-visible:opacity-100 motion-reduce:transition-none"
                  data-video-volume=""
                />
              ) : null}
            </div>
            <span className="ml-1 text-[12.5px] font-medium tabular-nums text-white/90" data-video-time="">
              {formatTime(at)}
              <span className="text-white/55"> / {formatTime(duration)}</span>
            </span>
            <span className="flex-1" />
            {source.captions ? (
              <button type="button" className={`${btn} ${captions ? "text-white" : "text-white/70"}`} onClick={toggleCaptions} aria-label={captions ? "Hide captions" : "Show captions"} aria-pressed={captions}>
                <Captions className="h-[18px] w-[18px]" aria-hidden />
              </button>
            ) : null}
            {pip.can ? (
              <button type="button" className={btn} onClick={() => void togglePip()} aria-label={pip.on ? "Leave picture in picture" : "Picture in picture"} data-video-pip="">
                <PictureInPicture2 className="h-[18px] w-[18px]" aria-hidden />
              </button>
            ) : null}
            <button type="button" className={btn} onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} data-video-full="">
              {full ? <Minimize className="h-[18px] w-[18px]" aria-hidden /> : <Maximize className="h-[18px] w-[18px]" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
