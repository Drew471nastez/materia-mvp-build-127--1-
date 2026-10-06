"use client"

/**
 * ===========================================================================
 *  THE LESSON PLAYER
 * ===========================================================================
 * One <video>, Storelib's own controls over it. The browser's own controls
 * look different in every browser and cannot show a buffered bar, a speed
 * list or a "next lesson" card, so they are off and these are drawn instead.
 *
 * WHERE THE VIDEO COMES FROM. A signed address on storage, good for an hour
 * (app/api/courses/lessons/[id]/play). Storage answers Range requests, so
 * seeking jumps straight to the bytes it needs and nothing streams through
 * a function. Five minutes before the address expires a new one is asked
 * for and kept aside. It goes in while the video is paused, or when the old
 * one is about to stop, or at once if a request on the old one has already
 * failed; the time, the speed and play or pause come back with it
 * (lib/courses/playback swapNow). A lesson watched for three hours plays
 * through.
 *
 * PHONES. `playsinline` (and the older webkit spelling), so iOS and the
 * Capacitor shell play in the page instead of taking the screen. Fullscreen
 * is the element's own where the browser has it and the video's
 * webkitEnterFullscreen on an iPhone, which has no element fullscreen. A tap
 * shows or hides the controls; a double tap on either side skips ten
 * seconds. There is no volume slider on a touch screen, where the buttons
 * on the side of the phone are the volume.
 *
 * KEYS (not while typing in a field): Space or K play and pause, J and L or
 * the arrows skip ten seconds, up and down the volume, M mute, F fullscreen,
 * C captions, < and > the speed, 0 to 9 a tenth of the way in each.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Captions, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react"
import { AUTO_COMPLETE_RATIO } from "@/lib/courses/progress"
import {
  NEXT_COUNTDOWN_SECONDS,
  SAVE_EVERY_MS,
  SKIP_SECONDS,
  SPEEDS,
  bufferedEnd,
  clampTime,
  formatTime,
  refreshDelay,
  speedLabel,
  stepSpeed,
  swapNow,
} from "@/lib/courses/playback"

export interface VideoSource {
  url: string
  expiresAt: number
  mime: string | null
  captions: string | null
}

export interface LessonVideoProps {
  source: VideoSource
  /** Seconds to start at: where they left off. */
  startAt: number
  autoPlay: boolean
  poster?: string | null
  next: { title: string; number: number } | null
  /** A fresh address for the same lesson, or null when it could not be had. */
  renew: () => Promise<VideoSource | null>
  /** The place, whenever it is worth saving: while playing, on pause, after a seek. */
  onPlace: (position: number, duration: number) => void
  /** Written on every frame of time, for the page's beacon when it is hidden. */
  live?: { current: { position: number; duration: number } }
  /** Once, the first time the video passes 90%. */
  onNearEnd: () => void
  onNext: () => void
  /** Extra classes on the player shell (e.g. rounded-xl in a community). */
  className?: string
}

type Flash = { dir: -1 | 1; key: number } | null

const PREF_KEY = "storelib.player"

function readPrefs(): { rate: number; volume: number; muted: boolean; captions: boolean } {
  const base = { rate: 1, volume: 1, muted: false, captions: false }
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as Partial<typeof base>
    return {
      rate: SPEEDS.includes(raw.rate as (typeof SPEEDS)[number]) ? (raw.rate as number) : 1,
      volume: typeof raw.volume === "number" && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : 1,
      muted: raw.muted === true,
      captions: raw.captions === true,
    }
  } catch {
    return base
  }
}

function writePrefs(p: { rate: number; volume: number; muted: boolean; captions: boolean }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* Private mode: the player still works, it just forgets. */
  }
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest?.("[role=dialog],[data-no-player-keys]")
}

export function LessonVideo({ source, startAt, autoPlay, poster, next, renew, onPlace, live, onNearEnd, onNext, className }: LessonVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState(source.url)
  const current = useRef<VideoSource>(source)
  const fresh = useRef<VideoSource | null>(null)
  const restore = useRef<{ time: number; play: boolean } | null>(startAt > 0 ? { time: startAt, play: autoPlay } : null)
  const recoveries = useRef<number[]>([])

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(startAt)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(true)
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [controls, setControls] = useState(true)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [prefs, setPrefs] = useState(() => ({ rate: 1, volume: 1, muted: false, captions: false }))
  const [fullscreen, setFullscreen] = useState(false)
  const [pip, setPip] = useState<{ can: boolean; on: boolean }>({ can: false, on: false })
  const [touch, setTouch] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [resumed, setResumed] = useState<number | null>(startAt > 0 ? startAt : null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const nearEndSent = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const v = () => videoRef.current

  /* The viewer's own speed, volume and captions, from the last lesson. */
  useEffect(() => {
    const p = readPrefs()
    setPrefs(p)
    setTouch(window.matchMedia?.("(hover: none), (pointer: coarse)").matches ?? false)
    const el = videoRef.current
    if (el) {
      el.playbackRate = p.rate
      el.defaultPlaybackRate = p.rate
      el.volume = p.volume
      el.muted = p.muted
    }
    const doc = document as Document & { pictureInPictureEnabled?: boolean }
    const vid = el as (HTMLVideoElement & { webkitSupportsPresentationMode?: (m: string) => boolean }) | null
    setPip({ can: !!doc.pictureInPictureEnabled || !!vid?.webkitSupportsPresentationMode?.("picture-in-picture"), on: false })
  }, [])

  const savePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((p) => {
      const nextPrefs = { ...p, ...patch }
      writePrefs(nextPrefs)
      return nextPrefs
    })
  }, [])

  /* ─── The address: renewed before it expires, swapped in when nobody will see ─── */

  const playingRef = useRef(false)
  /* The last known place, for a swap after the element has already reset itself on an error. */
  const lastTime = useRef(startAt)

  const swap = useCallback((reason: "paused" | "failed" | "due") => {
    const el = videoRef.current
    const next = fresh.current
    if (!el || !next || !swapNow({ hasFresh: true, paused: el.paused, failed: reason === "failed", expiresAt: current.current.expiresAt, now: Date.now() })) return false
    restore.current = { time: el.currentTime || lastTime.current, play: reason === "failed" ? playingRef.current : !el.paused }
    current.current = next
    fresh.current = null
    setFailed(false)
    setUrl(next.url)
    return true
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const got = await renew()
      if (cancelled || !got) return
      fresh.current = got
      swap("paused")
    }, refreshDelay(current.current.expiresAt, Date.now()))
    /* And once the old address is close to its end, whatever the video is doing. */
    const due = setTimeout(() => swap("due"), Math.max(0, current.current.expiresAt - 60_000 - Date.now()))
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(due)
    }
  }, [url, renew, swap])

  const recover = useCallback(async () => {
    /* At most three recoveries a minute: past that it is not the address, and the error shows. */
    const now = Date.now()
    recoveries.current = recoveries.current.filter((t) => now - t < 60_000)
    if (recoveries.current.length >= 3) return false
    recoveries.current.push(now)
    if (!fresh.current) fresh.current = await renew()
    return swap("failed")
  }, [renew, swap])

  /* ─── Video events ─── */

  const onLoaded = () => {
    const el = v()
    if (!el) return
    setDuration(el.duration || 0)
    el.playbackRate = prefs.rate
    el.defaultPlaybackRate = prefs.rate
    const r = restore.current
    restore.current = null
    if (r && r.time > 0 && Number.isFinite(el.duration)) el.currentTime = Math.min(r.time, Math.max(0, el.duration - 1))
    if (r ? r.play : autoPlay) void el.play().catch(() => setPlaying(false))
    applyCaptions(prefs.captions)
  }

  const onTimeUpdate = () => {
    const el = v()
    if (!el) return
    const t = el.currentTime
    setTime(t)
    if (t > 0) lastTime.current = t
    if (live) live.current = { position: t, duration: el.duration || 0 }
    if (!nearEndSent.current && el.duration > 0 && t / el.duration >= AUTO_COMPLETE_RATIO) {
      nearEndSent.current = true
      onNearEnd()
    }
    if (resumed !== null && Math.abs(t - resumed) > 8) setResumed(null)
  }

  const onProgress = () => {
    const el = v()
    if (!el) return
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++) ranges.push([el.buffered.start(i), el.buffered.end(i)])
    setBuffered(bufferedEnd(ranges, el.currentTime))
  }

  /* The place, every fifteen seconds while it plays. */
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const el = v()
      if (el && !el.paused) onPlace(el.currentTime, el.duration || 0)
    }, SAVE_EVERY_MS)
    return () => clearInterval(id)
  }, [playing, onPlace])

  /* Picture in picture and fullscreen, however the browser says so. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const enter = () => setPip((p) => ({ ...p, on: true }))
    const leave = () => setPip((p) => ({ ...p, on: false }))
    const fsIn = () => setFullscreen(true)
    const fsOut = () => setFullscreen(false)
    const docFs = () => setFullscreen(!!document.fullscreenElement || !!(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement)
    el.addEventListener("enterpictureinpicture", enter)
    el.addEventListener("leavepictureinpicture", leave)
    el.addEventListener("webkitbeginfullscreen", fsIn)
    el.addEventListener("webkitendfullscreen", fsOut)
    document.addEventListener("fullscreenchange", docFs)
    document.addEventListener("webkitfullscreenchange", docFs)
    return () => {
      el.removeEventListener("enterpictureinpicture", enter)
      el.removeEventListener("leavepictureinpicture", leave)
      el.removeEventListener("webkitbeginfullscreen", fsIn)
      el.removeEventListener("webkitendfullscreen", fsOut)
      document.removeEventListener("fullscreenchange", docFs)
      document.removeEventListener("webkitfullscreenchange", docFs)
    }
  }, [])

  /* ─── Actions ─── */

  const togglePlay = useCallback(() => {
    const el = v()
    if (!el) return
    if (ended) {
      setEnded(false)
      setCountdown(null)
      el.currentTime = 0
    }
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  }, [ended])

  const seekTo = useCallback(
    (target: number) => {
      const el = v()
      if (!el) return
      /* A renewed address waiting to go in goes in now: a seek is a new request anyway. */
      if (fresh.current && Date.now() > current.current.expiresAt - REFRESH_MARGIN) {
        restore.current = { time: clampTime(target, el.duration), play: !el.paused }
        current.current = fresh.current
        fresh.current = null
        setUrl(current.current.url)
        return
      }
      el.currentTime = clampTime(target, el.duration)
      setTime(el.currentTime)
      if (ended && el.currentTime < el.duration - 0.5) {
        setEnded(false)
        setCountdown(null)
      }
      onPlace(el.currentTime, el.duration || 0)
    },
    [ended, onPlace],
  )

  const skip = useCallback(
    (dir: -1 | 1) => {
      const el = v()
      if (!el) return
      seekTo(el.currentTime + dir * SKIP_SECONDS)
      setFlash({ dir, key: Date.now() })
    },
    [seekTo],
  )

  const setRate = useCallback(
    (rate: number) => {
      const el = v()
      if (el) {
        el.playbackRate = rate
        el.defaultPlaybackRate = rate
      }
      savePrefs({ rate })
      setSpeedOpen(false)
    },
    [savePrefs],
  )

  const setVolume = useCallback(
    (volume: number, muted?: boolean) => {
      const el = v()
      const vol = Math.min(1, Math.max(0, volume))
      const m = muted ?? vol === 0
      if (el) {
        el.volume = vol
        el.muted = m
      }
      savePrefs({ volume: vol, muted: m })
    },
    [savePrefs],
  )

  const applyCaptions = (on: boolean) => {
    const el = v()
    const track = el?.textTracks?.[0]
    if (track) track.mode = on ? "showing" : "hidden"
  }

  const toggleCaptions = useCallback(() => {
    if (!source.captions) return
    const on = !prefs.captions
    applyCaptions(on)
    savePrefs({ captions: on })
  }, [prefs.captions, savePrefs, source.captions])

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
    const el = v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      return
    }
    if (wrap?.requestFullscreen) void wrap.requestFullscreen().catch(() => el?.webkitEnterFullscreen?.())
    else if (wrap?.webkitRequestFullscreen) wrap.webkitRequestFullscreen()
    /* iPhone: only the video itself can go fullscreen, in the system player. */
    else el?.webkitEnterFullscreen?.()
  }, [])

  const togglePip = useCallback(async () => {
    const el = v() as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void; webkitPresentationMode?: string }) | null
    if (!el) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else if (el.requestPictureInPicture) await el.requestPictureInPicture()
      else el.webkitSetPresentationMode?.(el.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture")
    } catch {
      /* Refused (no gesture, or not allowed): nothing to show. */
    }
  }, [])

  /* ─── Controls that fade while it plays ─── */

  const reveal = useCallback(() => {
    setControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (playingRef.current) {
        setControls(false)
        setSpeedOpen(false)
      }
    }, 2600)
  }, [])

  useEffect(() => {
    playingRef.current = playing
    if (playing) reveal()
    else setControls(true)
  }, [playing, reveal])

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  /* Captions move up while the controls are showing, so a line is never under the bar. */
  const liftCues = useCallback(() => {
    const cues = videoRef.current?.textTracks?.[0]?.cues
    if (!cues) return
    const line = controlsRef.current ? -4 : "auto"
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i] as VTTCue
      try {
        if (cue.line !== line) cue.line = line
      } catch {
        /* A browser that will not move a cue draws it where it was. */
      }
    }
  }, [])
  const controlsRef = useRef(true)
  const trackRef = useRef<HTMLTrackElement>(null)
  useEffect(() => {
    controlsRef.current = controls && !ended
    liftCues()
  }, [controls, ended, liftCues])
  /* The cues arrive when the file does, after captions are switched on: lifted then too. */
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    track.addEventListener("load", liftCues)
    return () => track.removeEventListener("load", liftCues)
  }, [liftCues])

  /* ─── Keys ─── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      const el = v()
      if (!el) return
      const k = e.key
      let handled = true
      if (k === " " || k === "k" || k === "K") togglePlay()
      else if (k === "ArrowLeft" || k === "j" || k === "J") skip(-1)
      else if (k === "ArrowRight" || k === "l" || k === "L") skip(1)
      else if (k === "ArrowUp") setVolume(el.volume + 0.1, false)
      else if (k === "ArrowDown") setVolume(el.volume - 0.1)
      else if (k === "m" || k === "M") setVolume(el.volume || 1, !el.muted)
      else if (k === "f" || k === "F") toggleFullscreen()
      else if (k === "c" || k === "C") toggleCaptions()
      else if (k === ">" || (k === "." && e.shiftKey)) setRate(stepSpeed(el.playbackRate, 1))
      else if (k === "<" || (k === "," && e.shiftKey)) setRate(stepSpeed(el.playbackRate, -1))
      else if (/^[0-9]$/.test(k) && el.duration > 0) seekTo((Number(k) / 10) * el.duration)
      else handled = false
      if (handled) {
        e.preventDefault()
        reveal()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePlay, skip, setVolume, toggleFullscreen, toggleCaptions, setRate, seekTo, reveal])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(id)
  }, [flash])

  /* ─── Next lesson ─── */

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      onNext()
      return
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(id)
  }, [countdown, onNext])

  /* ─── Taps ─── */

  const lastTap = useRef<{ t: number; x: number } | null>(null)
  const onSurfaceUp = (e: ReactPointerEvent<HTMLDivElement>) => {
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
    if (controls && playingRef.current) {
      setControls(false)
      setSpeedOpen(false)
    } else reveal()
  }

  /* ─── The bar ─── */

  const barRef = useRef<HTMLDivElement>(null)
  const timeAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    return clampTime(((clientX - rect.left) / rect.width) * duration, duration)
  }
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrub(timeAt(e.clientX))
    reveal()
  }
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (rect && e.pointerType === "mouse") setHover({ x: Math.min(Math.max(0, e.clientX - rect.left), rect.width), t: timeAt(e.clientX) })
    if (scrub !== null) setScrub(timeAt(e.clientX))
  }
  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub === null) return
    seekTo(timeAt(e.clientX))
    setScrub(null)
  }

  const shown = scrub ?? time
  const played = duration > 0 ? (shown / duration) * 100 : 0
  const loaded = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0
  const iconBtn =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/95 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"

  return (
    <div
      ref={wrapRef}
      data-lesson-video
      data-controls={controls ? "shown" : "hidden"}
      className={`group/player relative aspect-video w-full select-none overflow-hidden bg-black ${fullscreen ? "" : className ?? "sm:rounded-2xl"} ${controls ? "" : "cursor-none"}`}
      onPointerMove={(e) => e.pointerType === "mouse" && reveal()}
      onMouseLeave={() => playing && setControls(false)}
    >
      <style>{`@keyframes lesson-flash{0%{opacity:1}70%{opacity:1}100%{opacity:0}}[data-lesson-video] video::cue{font-family:Inter,system-ui,sans-serif;font-size:clamp(14px,2.4vw,22px);line-height:1.35;color:#fff;background:rgba(10,10,20,.72)}`}</style>
      <video
        ref={videoRef}
        src={url}
        poster={poster ?? undefined}
        className="absolute inset-0 h-full w-full"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onDurationChange={() => setDuration(v()?.duration || 0)}
        onTimeUpdate={onTimeUpdate}
        onProgress={onProgress}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
          setCountdown(null)
        }}
        onPause={() => {
          setPlaying(false)
          const el = v()
          if (el && !el.ended) onPlace(el.currentTime, el.duration || 0)
          swap("paused")
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={onProgress}
        onEnded={() => {
          setPlaying(false)
          setEnded(true)
          const el = v()
          if (el) onPlace(el.duration || 0, el.duration || 0)
          if (next) setCountdown(NEXT_COUNTDOWN_SECONDS)
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
        {source.captions ? <track ref={trackRef} kind="captions" src={source.captions} srcLang="en" label="Captions" /> : null}
      </video>

      {/* The surface: a click plays or pauses, a tap shows the controls, a double tap on a side skips. */}
      <div className="absolute inset-0" onPointerUp={onSurfaceUp} onDoubleClick={() => !touch && toggleFullscreen()} aria-hidden />

      {flash ? (
        <div
          key={flash.key}
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/55 px-3 py-2 text-[13px] font-semibold text-white motion-safe:animate-[lesson-flash_700ms_ease-out_forwards] ${flash.dir < 0 ? "left-[12%]" : "right-[12%]"}`}
        >
          {flash.dir < 0 ? <RotateCcw className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
          {SKIP_SECONDS}s
        </div>
      ) : null}

      {waiting && !failed && !ended ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-white/85" aria-label="Loading" />
        </div>
      ) : null}

      {!playing && !waiting && !failed && !ended ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-[scale] hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        >
          <Play className="ml-1 h-7 w-7" fill="currentColor" />
        </button>
      ) : null}

      {resumed !== null && !playing && !failed ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-[12px] font-medium text-white sm:left-4 sm:top-4">
          Resuming at {formatTime(resumed)}
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <p className="text-[15px] font-semibold">This video did not load.</p>
          <p className="max-w-[320px] text-[13px] text-white/70">Check your connection, then try again.</p>
          <button
            type="button"
            className="mt-1 h-10 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]"
            onClick={() => {
              recoveries.current = []
              setFailed(false)
              setWaiting(true)
              void recover().then((ok) => {
                if (!ok) {
                  const el = v()
                  if (el) {
                    restore.current = { time: el.currentTime || time, play: true }
                    el.load()
                  }
                }
              })
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {ended ? (
        <div data-next-card className="absolute inset-0 flex items-center justify-center bg-black/75 px-5 text-white">
          {next && countdown !== null ? (
            <div className="flex w-full max-w-[360px] flex-col items-center text-center">
              <Countdown seconds={countdown} />
              <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-white/60">Up next</p>
              <p className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug sm:text-[18px]">
                Lesson {next.number}: {next.title}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={onNext} className="h-10 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
                  Play now
                </button>
                <button type="button" onClick={() => setCountdown(null)} className="h-10 rounded-lg px-4 text-[14px] font-medium text-white/85 hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[16px] font-semibold">{next ? "Paused before the next lesson" : "That was the last lesson"}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={togglePlay} className="h-10 rounded-lg bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
                  Watch again
                </button>
                {next ? (
                  <button type="button" onClick={onNext} className="h-10 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
                    Next lesson
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* The controls */}
      <div
        data-player-controls
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-1.5 pt-10 transition-opacity duration-200 sm:px-3 sm:pb-2 ${controls && !ended ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          ref={barRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
          tabIndex={0}
          data-seek-bar
          className="group/bar relative mx-1.5 flex h-5 cursor-pointer touch-none items-center"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={() => setScrub(null)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5">
            <div data-buffered className="absolute inset-y-0 left-0 bg-white/45" style={{ width: `${loaded}%` }} />
            <div data-played className="absolute inset-y-0 left-0 bg-[#8b5cf6]" style={{ width: `${played}%` }} />
          </div>
          <div
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ${touch || scrub !== null ? "scale-100" : "scale-0 group-hover/bar:scale-100"} transition-[scale]`}
            style={{ left: `${played}%` }}
          />
          {hover && scrub === null ? (
            <div className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white" style={{ left: hover.x }}>
              {formatTime(hover.t)}
            </div>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-center gap-0.5">
          <button type="button" className={iconBtn} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </button>
          <button type="button" className={iconBtn} onClick={() => skip(-1)} aria-label={`Back ${SKIP_SECONDS} seconds`}>
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className={iconBtn} onClick={() => skip(1)} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
            <RotateCw className="h-[18px] w-[18px]" />
          </button>

          {!touch ? (
            <div className="group/vol hidden items-center sm:flex">
              <button type="button" className={iconBtn} onClick={() => setVolume(prefs.volume || 1, !prefs.muted)} aria-label={prefs.muted ? "Unmute" : "Mute"}>
                {prefs.muted || prefs.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.muted ? 0 : prefs.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="h-1 w-0 cursor-pointer accent-white opacity-0 transition-[width,opacity] duration-150 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
              />
            </div>
          ) : null}

          <span className="ml-1.5 whitespace-nowrap text-[12px] font-medium tabular-nums text-white/90 sm:text-[13px]" data-time>
            {formatTime(shown)} <span className="text-white/55">/ {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            <div className="relative">
              <button
                type="button"
                className={`${iconBtn} w-auto px-2 text-[13px] font-semibold tabular-nums`}
                onClick={() => setSpeedOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                aria-label={`Speed ${speedLabel(prefs.rate)}`}
              >
                {speedLabel(prefs.rate)}
              </button>
              {speedOpen ? (
                <div role="menu" className="absolute bottom-full right-0 mb-2 w-[112px] overflow-hidden rounded-lg bg-[#1a1a2e]/95 py-1 shadow-xl ring-1 ring-white/10">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitemradio"
                      aria-checked={s === prefs.rate}
                      onClick={() => setRate(s)}
                      className={`flex h-9 w-full items-center justify-between px-3 text-left text-[13px] tabular-nums hover:bg-white/10 ${s === prefs.rate ? "font-semibold text-white" : "text-white/80"}`}
                    >
                      {speedLabel(s)}
                      {s === prefs.rate ? <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {source.captions ? (
              <button type="button" className={`${iconBtn} ${prefs.captions ? "bg-white/15" : ""}`} onClick={toggleCaptions} aria-pressed={prefs.captions} aria-label="Captions">
                <Captions className="h-5 w-5" />
              </button>
            ) : null}
            {pip.can ? (
              <button type="button" className={`${iconBtn} max-sm:hidden`} onClick={togglePip} aria-pressed={pip.on} aria-label="Picture in picture">
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            ) : null}
            <button type="button" className={iconBtn} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A ring that empties over the countdown, one step a second. */
function Countdown({ seconds }: { seconds: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const left = Math.max(0, seconds) / NEXT_COUNTDOWN_SECONDS
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[18px] font-semibold tabular-nums">{Math.max(0, seconds)}</span>
    </div>
  )
}

/** Past this close to the old address's end, a seek takes the renewed one. */
const REFRESH_MARGIN = 2 * 60 * 1000
