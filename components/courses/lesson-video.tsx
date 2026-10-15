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
 * C captions, < and > the speed, 0 to 9 a tenth of the way in each. On the
 * volume slider the arrows, Home and End move the volume instead.
 *
 * ROUND 29, SMOOTH (the owner: media that "loads smoothly, no glitches, no
 * flashes", controls "smoother, modern"):
 *   - the 16:9 box is there before anything loads, black, so nothing moves;
 *     the video reads only its length and first frame until it is played
 *     (preload="metadata", and #t=0.001 so iOS draws that frame), and it
 *     fades in once it has a frame at the second it opens on (loadeddata and
 *     any resume seek done), so a resume never shows second 0 first;
 *   - the controls fade in with the length known, never "0:00 / 0:00";
 *   - the played bar, the buffered bar and the knob are scaled and moved
 *     with a transform each, painted from the video's own clock on every frame
 *     while they show, so the bar glides instead of stepping four times a
 *     second; the bar thickens on hover by a scale, not a height;
 *   - the volume is a slider of our own on pointer events, the speed list
 *     fades and scales in from its button and closes on a press outside;
 *   - the player looks the same in the light and the dark look: its blacks
 *     and whites are rgb values, which app/theme-dark.css does not remap
 *     (it maps bg-white and bg-black, and drew the played bar charcoal).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { Captions, Check, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react"
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
  /* The video has a frame at the second it opens on: until then it is hidden over the black box. */
  const [framed, setFramed] = useState(false)
  const nearEndSent = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const v = () => videoRef.current
  const noteFrame = () => {
    const el = videoRef.current
    if (el && el.readyState >= 2 && !el.seeking) setFramed(true)
  }

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

  /*
    PUT AWAY, IT STOPS (round 18). Going back from a lesson keeps its screen mounted and hidden (the community's place host
    holds it under <Activity>, whose hiding runs this cleanup), and a hidden video went on playing its sound under Learn.
  */
  useEffect(() => {
    const el = videoRef.current
    return () => el?.pause()
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
    /* Waiting for a press is not waiting for data: the play button shows as soon as the length is known. */
    if (r ? r.play : autoPlay) void el.play().catch(() => setPlaying(false))
    else setWaiting(false)
    applyCaptions(prefs.captions)
    noteFrame()
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

  /* Already in hand on the first render (read ahead, or the browser's cache): shown with no wait. */
  useEffect(() => {
    noteFrame()
  }, [])

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
    const el = v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void; webkitDisplayingFullscreen?: boolean }) | null
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
    /* The app: the system player only. Fullscreen of the box as well stacks a second layer over Storelib. */
    if (native && el?.webkitEnterFullscreen) {
      el.webkitEnterFullscreen()
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

  /* ─── The speed list closes on a press anywhere else, and on Escape ─── */

  const speedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!speedOpen) return
    const away = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setSpeedOpen(false)
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", esc, true)
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", esc, true)
    }
  }, [speedOpen])

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
  const playedRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const scrubRef = useRef<number | null>(null)
  /** The played bar and its knob at a time: a scale and a move, written straight to the two layers, no render. */
  const paint = useCallback((t: number, d: number) => {
    const f = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0
    if (playedRef.current) playedRef.current.style.transform = `scaleX(${f})`
    if (knobRef.current) knobRef.current.style.transform = `translateX(${f * 100}%)`
  }, [])
  /* On every frame while it plays and the bar shows, from the video's own clock (timeupdate comes four times a second). */
  const barShown = controls && !ended
  useEffect(() => {
    if (!playing || !barShown) return
    let id = 0
    const tick = () => {
      const el = videoRef.current
      if (el && scrubRef.current === null) paint(el.currentTime, el.duration || 0)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, barShown, paint])
  /* And whenever the time, the length or a drag changes it: from the video's clock too, so it never steps back a frame. */
  useLayoutEffect(() => {
    const el = videoRef.current
    paint(scrub ?? (el && el.readyState >= 1 ? el.currentTime : time), duration)
  }, [scrub, time, duration, barShown, paint])

  const timeAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    return clampTime(((clientX - rect.left) / rect.width) * duration, duration)
  }
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = timeAt(e.clientX)
    scrubRef.current = t
    setScrub(t)
    reveal()
  }
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (rect && e.pointerType === "mouse") setHover({ x: Math.min(Math.max(0, e.clientX - rect.left), rect.width), t: timeAt(e.clientX) })
    if (scrubRef.current !== null) {
      const t = timeAt(e.clientX)
      scrubRef.current = t
      setScrub(t)
    }
  }
  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubRef.current === null) return
    seekTo(timeAt(e.clientX))
    scrubRef.current = null
    setScrub(null)
  }
  const onBarCancel = () => {
    scrubRef.current = null
    setScrub(null)
  }
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Home") seekTo(0)
    else if (e.key === "End" && duration > 0) seekTo(duration - 0.5)
    else return
    e.preventDefault()
  }

  /* ─── The volume: a slider of our own ─── */

  const volRef = useRef<HTMLDivElement>(null)
  const volDrag = useRef(false)
  const volAt = (clientX: number) => {
    const rect = volRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return prefs.volume
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }
  const onVolDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    volDrag.current = true
    setVolume(volAt(e.clientX))
  }
  const onVolMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (volDrag.current) setVolume(volAt(e.clientX))
  }
  const onVolUp = () => {
    volDrag.current = false
  }
  const onVolKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const now = prefs.muted ? 0 : prefs.volume
    let to: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowUp") to = now + 0.05
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = now - 0.05
    else if (e.key === "Home") to = 0
    else if (e.key === "End") to = 1
    if (to === null) return
    /* The arrows move the volume here, not the video. */
    e.preventDefault()
    e.stopPropagation()
    setVolume(Math.round(to * 100) / 100)
    reveal()
  }

  const shown = scrub ?? time
  const loaded = duration > 0 ? Math.min(1, buffered / duration) : 0
  const vol = prefs.muted ? 0 : prefs.volume
  /* The controls arrive with the length, never as "0:00 / 0:00" over an empty box. */
  const known = duration > 0
  const centrePlay = !playing && !waiting && !failed && !ended && known
  const iconBtn =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/95 transition-[background-color,scale] duration-150 ease-out hover:bg-[rgba(255,255,255,0.14)] active:scale-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,255,255,0.7)] [-webkit-tap-highlight-color:transparent]"
  /* A tap-friendly media fragment: iOS draws the first frame only when the address asks for a start time. */
  const src = url.includes("#") ? url : `${url}#t=0.001`

  return (
    <div
      ref={wrapRef}
      data-lesson-video
      data-controls={controls ? "shown" : "hidden"}
      className={`group/player relative isolate aspect-video w-full select-none overflow-hidden bg-[rgb(0,0,0)] ${fullscreen ? "" : className ?? "sm:rounded-2xl"} ${controls ? "" : "cursor-none"}`}
      onPointerMove={(e) => e.pointerType === "mouse" && reveal()}
      onMouseLeave={() => playing && setControls(false)}
    >
      <style>{`@keyframes lesson-flash{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}[data-lesson-video] video::cue{font-family:Inter,system-ui,sans-serif;font-size:clamp(14px,2.4vw,22px);line-height:1.35;color:#fff;background:rgba(10,10,20,.72)}`}</style>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ease-out motion-reduce:transition-none ${framed ? "opacity-100" : "opacity-0"}`}
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        /* Round 29: only the length and the first frame until it plays; play() reads the rest as it goes. */
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onLoadedData={noteFrame}
        onSeeked={() => {
          onProgress()
          noteFrame()
        }}
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
        onPlaying={() => {
          setWaiting(false)
          noteFrame()
        }}
        onCanPlay={() => {
          setWaiting(false)
          noteFrame()
        }}
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
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-[rgba(0,0,0,0.55)] px-3.5 py-2 text-[13px] font-semibold tabular-nums text-white motion-safe:animate-[lesson-flash_700ms_ease-out_forwards] ${flash.dir < 0 ? "left-[12%]" : "right-[12%]"}`}
        >
          {flash.dir < 0 ? <RotateCcw className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
          {SKIP_SECONDS}s
        </div>
      ) : null}

      {/* Waiting: the same small spinner as the lesson's still (course-player.tsx), and only past 300ms, so a video read ahead never blinks one. */}
      {waiting && !failed && !ended ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-100 transition-opacity delay-300 duration-300 starting:opacity-0 motion-reduce:transition-none">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-label="Loading" />
        </div>
      ) : null}

      {/* The big play button fades and settles in and out; while hidden it takes no presses and no focus. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label="Play"
        aria-hidden={!centrePlay}
        tabIndex={centrePlay ? 0 : -1}
        data-centre-play=""
        className={`absolute left-1/2 top-1/2 -ml-8 -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,255,255,0.95)] text-[rgb(17,17,19)] shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-[opacity,scale,background-color] duration-200 ease-out hover:bg-[rgb(255,255,255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,255,255,0.5)] active:scale-95 motion-reduce:transition-none ${
          centrePlay ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
        }`}
      >
        <Play className="ml-1 h-7 w-7" fill="currentColor" />
      </button>

      {resumed !== null && !failed ? (
        <div
          className={`pointer-events-none absolute left-3 top-3 rounded-full bg-[rgba(0,0,0,0.6)] px-3 py-1.5 text-[12px] font-medium tabular-nums text-white transition-opacity duration-300 sm:left-4 sm:top-4 ${!playing && known ? "opacity-100" : "opacity-0"}`}
        >
          Resuming at {formatTime(resumed)}
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[rgba(0,0,0,0.8)] px-6 text-center text-white">
          <p className="text-[15px] font-semibold">This video did not load.</p>
          <p className="max-w-[320px] text-[13px] text-white/70">Check your connection, then try again.</p>
          <button
            type="button"
            className="mt-1 h-10 rounded-xl bg-[rgba(255,255,255,0.95)] px-4 text-[14px] font-semibold text-[rgb(17,17,19)] transition-[background-color,scale] duration-150 hover:bg-[rgb(255,255,255)] active:scale-[0.97]"
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
        <div data-next-card className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.75)] px-5 text-white opacity-100 transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none">
          {next && countdown !== null ? (
            <div className="flex w-full max-w-[360px] flex-col items-center text-center">
              <Countdown seconds={countdown} />
              <p className="mt-3 text-[12px] font-medium text-white/60">Up next</p>
              <p className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug sm:text-[18px]">
                Lesson {next.number}: {next.title}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={onNext} className="h-10 rounded-xl bg-[rgba(255,255,255,0.95)] px-4 text-[14px] font-semibold text-[rgb(17,17,19)] transition-[background-color,scale] duration-150 hover:bg-[rgb(255,255,255)] active:scale-[0.97]">
                  Play now
                </button>
                <button type="button" onClick={() => setCountdown(null)} className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/85 transition-[background-color,scale] duration-150 hover:bg-[rgba(255,255,255,0.1)] active:scale-[0.97]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[16px] font-semibold">{next ? "Paused before the next lesson" : "That was the last lesson"}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={togglePlay} className="h-10 rounded-xl bg-[rgba(255,255,255,0.15)] px-4 text-[14px] font-semibold transition-[background-color,scale] duration-150 hover:bg-[rgba(255,255,255,0.25)] active:scale-[0.97]">
                  Watch again
                </button>
                {next ? (
                  <button type="button" onClick={onNext} className="h-10 rounded-xl bg-[rgba(255,255,255,0.95)] px-4 text-[14px] font-semibold text-[rgb(17,17,19)] transition-[background-color,scale] duration-150 hover:bg-[rgb(255,255,255)] active:scale-[0.97]">
                    Next lesson
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/*
        The controls. The shade behind them takes no presses, only the bar and the buttons do: on a phone the shade
        reaches the big Play in the middle, and a tap there has to reach Play, not the shade.
      */}
      <div
        data-player-controls
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-1.5 pt-12 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:px-3 sm:pb-2 ${barShown && known ? "opacity-100 [&>*]:pointer-events-auto" : "opacity-0"}`}
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
          className="group/bar relative mx-1.5 flex h-6 cursor-pointer touch-none items-center outline-none focus-visible:[&>[data-track]]:ring-2 focus-visible:[&>[data-track]]:ring-[rgba(255,255,255,0.6)]"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={onBarCancel}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onBarKey}
        >
          <div
            data-track=""
            className={`relative h-[5px] w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.25)] transition-transform duration-150 ease-out motion-reduce:transition-none ${touch || scrub !== null ? "scale-y-100" : "scale-y-[0.6] group-hover/bar:scale-y-100"}`}
          >
            <div data-buffered className="absolute inset-0 origin-left bg-[rgba(255,255,255,0.35)] transition-transform duration-300 ease-out" style={{ transform: `scaleX(${loaded})` }} />
            <div ref={playedRef} data-played className="absolute inset-0 origin-left bg-[rgb(255,255,255)]" style={{ transform: "scaleX(0)" }} />
          </div>
          <div ref={knobRef} className="pointer-events-none absolute inset-y-0 left-0 w-full" style={{ transform: "translateX(0%)" }} aria-hidden>
            <div
              className={`absolute left-0 top-1/2 -ml-[7px] -mt-[7px] h-[14px] w-[14px] rounded-full bg-[rgb(255,255,255)] shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-[scale] duration-150 ease-out motion-reduce:transition-none ${
                scrub !== null ? "scale-110" : touch ? "scale-100" : "scale-0 group-hover/bar:scale-100"
              }`}
            />
          </div>
          {hover && scrub === null ? (
            <div className="pointer-events-none absolute -top-7 left-0" style={{ transform: `translateX(${hover.x}px)` }} aria-hidden>
              <div className="-translate-x-1/2 rounded-md bg-[rgba(0,0,0,0.8)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">{formatTime(hover.t)}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-center gap-0.5">
          <button type="button" className={iconBtn} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} /> : <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" className={iconBtn} onClick={() => skip(-1)} aria-label={`Back ${SKIP_SECONDS} seconds`}>
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className={iconBtn} onClick={() => skip(1)} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
            <RotateCw className="h-[18px] w-[18px]" />
          </button>

          {!touch ? (
            <div className="hidden items-center sm:flex">
              <button type="button" className={iconBtn} onClick={() => setVolume(prefs.volume || 1, !prefs.muted)} aria-label={prefs.muted ? "Unmute" : "Mute"}>
                {prefs.muted || prefs.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <div
                ref={volRef}
                role="slider"
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(vol * 100)}
                aria-valuetext={`${Math.round(vol * 100)}%`}
                tabIndex={0}
                data-volume=""
                className="group/vol relative mr-1 flex h-8 w-[68px] cursor-pointer touch-none items-center outline-none focus-visible:[&>[data-track]]:ring-2 focus-visible:[&>[data-track]]:ring-[rgba(255,255,255,0.6)]"
                onPointerDown={onVolDown}
                onPointerMove={onVolMove}
                onPointerUp={onVolUp}
                onPointerCancel={onVolUp}
                onKeyDown={onVolKey}
              >
                <div data-track="" className="relative h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.25)]">
                  <div className="absolute inset-0 origin-left bg-[rgb(255,255,255)]" style={{ transform: `scaleX(${vol})` }} />
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-full" style={{ transform: `translateX(${vol * 100}%)` }} aria-hidden>
                  <div className="absolute left-0 top-1/2 -ml-[6px] -mt-[6px] h-3 w-3 rounded-full bg-[rgb(255,255,255)] shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-[scale] duration-150 ease-out scale-0 group-hover/vol:scale-100 group-focus-visible/vol:scale-100 motion-reduce:transition-none" />
                </div>
              </div>
            </div>
          ) : null}

          <span className="ml-1.5 whitespace-nowrap text-[12px] font-medium tabular-nums text-white/90 sm:text-[13px]" data-time>
            {formatTime(shown)} <span className="text-white/55">/ {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            <div className="relative" ref={speedRef}>
              <button
                type="button"
                className={`${iconBtn} w-auto min-w-10 px-2.5 text-[13px] font-semibold tabular-nums ${speedOpen ? "bg-[rgba(255,255,255,0.14)]" : ""}`}
                onClick={() => setSpeedOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                aria-label={`Speed ${speedLabel(prefs.rate)}`}
              >
                {speedLabel(prefs.rate)}
              </button>
              <div
                role="menu"
                aria-label="Speed"
                aria-hidden={!speedOpen}
                inert={!speedOpen}
                data-speed-menu={speedOpen ? "open" : "closed"}
                className={`absolute bottom-full right-0 mb-2 w-[132px] origin-bottom-right rounded-xl bg-[rgba(0,0,0,0.85)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)] ring-1 ring-[rgba(255,255,255,0.1)] transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none ${
                  speedOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                }`}
              >
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s === prefs.rate}
                    onClick={() => setRate(s)}
                    className={`flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] tabular-nums transition-colors duration-100 hover:bg-[rgba(255,255,255,0.1)] ${s === prefs.rate ? "font-semibold text-white" : "text-white/75"}`}
                  >
                    {speedLabel(s)}
                    {s === prefs.rate ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                  </button>
                ))}
              </div>
            </div>
            {source.captions ? (
              <button type="button" className={`${iconBtn} ${prefs.captions ? "bg-[rgba(255,255,255,0.14)]" : ""}`} onClick={toggleCaptions} aria-pressed={prefs.captions} aria-label="Captions">
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
