"use client"

/**
 * ===========================================================================
 *  A COMMUNITY VIDEO, PLAYED
 * ===========================================================================
 * Any video a community holds (a post's, a resource, an event's replay, the
 * About page's cover) in the community player (components/media/
 * video-player.tsx): poster first, then Storelib's own controls.
 *
 * THE ADDRESS IS ASKED FOR WHEN IT IS NEEDED. A feed can hold many videos;
 * each one shows its poster and a play button, and only one that is
 * pressed (or previewed) asks the server (/api/community/<id>/videos/
 * <videoId>/play), which decides again whether this person may watch it.
 * An answer is kept for this page until five minutes before it expires, so
 * a preview and then a press ask once. `eager` asks at once (an event
 * replay, the only video on its page).
 *
 * THE PREVIEW (round 13). A short muted loop of the video's first seconds
 * plays over the poster: on a computer while the pointer rests on it, on a
 * phone while it is most of the way on screen (one at a time). It fades in
 * once frames are actually playing, so a slow network shows the poster,
 * never a black box. Never with reduced motion, Save Data or a 2G network.
 *
 * THE RIGHT FILE. On Save Data or a slow network, and always for a
 * preview, the play route is asked for the lighter rendition (`q=low`),
 * which a video service with renditions answers with a smaller file.
 *
 * ONE AT A TIME. Pressing play on one puts any other back to its poster.
 * RESUME. The place in each video is kept in this browser and the next
 * press starts there (not in the last ten seconds, which starts again).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Loader2, Play } from "lucide-react"
import { VideoPlayer, type PlayerSource } from "@/components/media/video-player"
import { optimizedSrcSet } from "@/lib/images/optimized-url"
import { drawnStill } from "@/lib/images/drawn-stills"
import { videoClock, type VideoPlayback } from "@/lib/video/types"

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "playing"; source: PlayerSource; startAt: number }
  | { kind: "processing" }
  | { kind: "message"; text: string; retry: boolean }

const ACTIVATE = "storelib:video-activate"
const PREVIEW = "storelib:video-preview"
const PLACE_KEY = (id: string) => `storelib.video.${id}`

/** Seconds of the start that the preview loops. */
export const PREVIEW_SECONDS = 4
/** A pointer rests this long before the preview starts (a pass over the feed starts nothing). */
export const PREVIEW_HOVER_MS = 220
/** On a phone the video is this much on screen, for this long, before its preview starts. */
export const PREVIEW_VISIBLE_RATIO = 0.7
export const PREVIEW_VISIBLE_MS = 450
/** The preview fades in over this long once its frames play. */
export const PREVIEW_FADE_MS = 260

export function readPlace(videoId: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem(PLACE_KEY(videoId)) || "null") as { at?: number; of?: number } | null
    if (!raw || typeof raw.at !== "number" || raw.at < 5) return 0
    if (typeof raw.of === "number" && raw.of > 0 && raw.at > raw.of - 10) return 0
    return raw.at
  } catch {
    return 0
  }
}

function savePlace(videoId: string, at: number, of: number) {
  try {
    localStorage.setItem(PLACE_KEY(videoId), JSON.stringify({ at: Math.floor(at), of: Math.floor(of) }))
  } catch {
    /* Private mode: it starts from the beginning next time. */
  }
}

type Connection = { saveData?: boolean; effectiveType?: string }
function connection(): Connection {
  return typeof navigator !== "undefined" ? ((navigator as Navigator & { connection?: Connection }).connection ?? {}) : {}
}

/** Whether this device and network should get the lighter file. */
export function wantsLight(c: Connection = connection()): boolean {
  return !!c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g"
}

/** Whether a preview may play here at all. */
export function previewAllowed(c: Connection = connection(), reduced: boolean = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches): boolean {
  return !reduced && !c.saveData && c.effectiveType !== "slow-2g" && c.effectiveType !== "2g"
}

/* Answers kept for the page, by video and quality, until five minutes before they expire. */
const KEPT = new Map<string, VideoPlayback>()
const KEEP_MARGIN_MS = 5 * 60_000
type Answer = { ok: true; playback: VideoPlayback } | { ok: false; status: number; error: string }
/* Questions on their way (round 32): the card, a warm, the player and its preview asking at once ask the server once. */
const ASKING = new Map<string, Promise<Answer>>()
/* Where the files come from, connected to ahead (round 32): the press starts on a warm connection. */
const WARMED = new Set<string>()

function preconnect(url: string): void {
  if (typeof document === "undefined") return
  let origin = ""
  try {
    origin = new URL(url, location.href).origin
  } catch {
    return
  }
  if (!origin || origin === location.origin || WARMED.has(origin)) return
  WARMED.add(origin)
  /* Both kinds of connection: the player's (with the page's credentials) and a first frame's (anonymous, so it can be kept as a picture). */
  for (const cors of [false, true]) {
    const link = document.createElement("link")
    link.rel = "preconnect"
    link.href = origin
    if (cors) link.crossOrigin = "anonymous"
    document.head.appendChild(link)
  }
}

export async function fetchPlayback(communityId: string, videoId: string, opts: { light?: boolean; fresh?: boolean } = {}): Promise<Answer> {
  const key = `${communityId}/${videoId}/${opts.light ? "low" : "auto"}`
  const kept = KEPT.get(key)
  if (!opts.fresh && kept && Number(kept.expiresAt) - KEEP_MARGIN_MS > Date.now()) return { ok: true, playback: kept }
  const asking = ASKING.get(key)
  if (!opts.fresh && asking) return asking
  const ask = (async (): Promise<Answer> => {
    try {
      const res = await fetch(`/api/community/${communityId}/videos/${videoId}/play${opts.light ? "?q=low" : ""}`, { cache: "no-store", credentials: "same-origin" })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) return { ok: false, status: res.status, error: String(body.error || "failed") }
      const playback = body as unknown as VideoPlayback
      KEPT.set(key, playback)
      if (playback.url) preconnect(playback.url)
      return { ok: true, playback }
    } catch {
      return { ok: false, status: 0, error: "offline" }
    }
  })()
  ASKING.set(key, ask)
  void ask.finally(() => {
    if (ASKING.get(key) === ask) ASKING.delete(key)
  })
  return ask
}

/**
 * ===========================================================================
 *  A VIDEO WITH NO STILL, ITS FIRST FRAME KEPT FOR THE PAGE (round 32)
 * ===========================================================================
 * The owner: "a video attachment, its cover or the video as a whole takes too
 * much to load, always". A video with no still of its own showed its first
 * frame on the card (media.tsx VideoFrame) by loading the file, and the
 * opened post then loaded the file again for the same frame, on a quiet
 * ground meanwhile. The card's frame is now drawn once into a picture and
 * kept for the page by the video's id (an object address, decoded ahead), so
 * the opened post, the viewer and the player's own poster draw it in their
 * first frame.
 */
const FRAME_STILLS = new Map<string, { src: string; w: number; h: number }>()
const HELD_FRAMES: HTMLImageElement[] = []
/* Frames being drawn into a picture now: each video once, however many of its events arrive. */
const KEEPING = new Set<string>()
export function videoFrameStill(videoId: string): { src: string; w: number; h: number } | null {
  return FRAME_STILLS.get(videoId) ?? null
}

/** Keeps the frame `video` shows now as the picture for this video, once. Quietly nothing when the file may not be read back (another site's, without CORS). */
export function keepVideoFrame(videoId: string, video: HTMLVideoElement): void {
  if (FRAME_STILLS.has(videoId) || KEEPING.has(videoId) || typeof document === "undefined") return
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return
  KEEPING.add(videoId)
  const done = () => void KEEPING.delete(videoId)
  try {
    const scale = Math.min(1, 1280 / vw)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(vw * scale))
    canvas.height = Math.max(1, Math.round(vh * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return done()
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob || FRAME_STILLS.has(videoId)) return done()
        const src = URL.createObjectURL(blob)
        /* Decoded before anyone draws it, so the first frame that draws it has it. */
        const img = new Image()
        img.src = src
        /* The decoded picture held for the page, so the browser keeps it ready to draw. */
        const keep = () => {
          FRAME_STILLS.set(videoId, { src, w: vw, h: vh })
          HELD_FRAMES.push(img)
          done()
        }
        if (typeof img.decode === "function")
          img.decode().then(keep, () => {
            URL.revokeObjectURL(src)
            done()
          })
        else keep()
      },
      "image/jpeg",
      0.86,
    )
  } catch {
    /* A frame from another site without CORS cannot be read back: the next one loads the file, as before. */
    done()
  }
}

function sourceOf(p: VideoPlayback): PlayerSource {
  return { url: p.url, expiresAt: Number(p.expiresAt) || Date.now() + 3_000_000, mime: p.mime, captions: p.captions }
}

/** The poster's file widths and slot, one rule for the player and for whoever fetches it ahead (media.tsx warmPostMedia). */
const POSTER_WIDTHS = [384, 640, 828, 1080, 1200]
const POSTER_SIZES = "(max-width: 640px) 100vw, 640px"

/** The poster's <img> attributes: the address as given, and the optimizer's widths for the browser to pick from when it can. */
export function posterSource(url: string): { src: string; srcSet?: string; sizes?: string } {
  const srcSet = optimizedSrcSet(url, POSTER_WIDTHS)
  return srcSet ? { src: url, srcSet, sizes: POSTER_SIZES } : { src: url }
}

/** The poster's fade when it arrives after a copy of it already stood in. */
export const POSTER_IN_MS = 180

/**
 * THE POSTER, WITH THE FEED'S COPY UNDER IT (round 13 of the desktop post, the owner: "gray and then the image/video
 * appears"). When this poster is already on screen elsewhere in the tab, a feed card's thumbnail say
 * (lib/images/drawn-stills.ts), that copy is drawn at once from the cache and the poster's own file waits until it is
 * loaded and decoded, then comes in over it with a short fade. With no copy anywhere it is drawn as it always was.
 */
function PosterPicture({ url }: { url: string }) {
  const source = posterSource(url)
  const [still] = useState(() => drawnStill(url))
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<"wait" | "in" | "shown">(() => (still ? "wait" : "shown"))
  /* Already in hand when it was put on the page: shown on this frame, nothing to fade. */
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth > 0) setState("shown")
  }, [])
  useEffect(() => {
    if (state !== "in") return
    const t = window.setTimeout(() => setState("shown"), POSTER_IN_MS + 60)
    return () => window.clearTimeout(t)
  }, [state])
  const arrived = () => {
    const el = ref.current
    const show = () => setState((s) => (s === "wait" ? "in" : s))
    if (el && typeof el.decode === "function") el.decode().then(show, show)
    else show()
  }
  return (
    <>
      {still && state !== "shown" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still.src} referrerPolicy={still.referrerPolicy} alt="" aria-hidden draggable={false} decoding="sync" className="absolute inset-0 h-full w-full object-cover" data-video-still="" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={source.src}
        srcSet={source.srcSet}
        sizes={source.sizes}
        alt=""
        decoding="async"
        onLoad={arrived}
        onError={() => setState("shown")}
        className={`absolute inset-0 h-full w-full object-cover ${state === "wait" ? "opacity-0" : "opacity-100"} ${state === "in" ? "transition-opacity duration-[180ms] ease-out motion-reduce:transition-none" : ""}`}
        data-video-poster=""
      />
    </>
  )
}

export interface StorelibVideoProps {
  communityId: string
  videoId: string
  /** A picture to show before it plays. */
  poster?: string | null
  /** The video's length, shown on the poster when known. */
  durationSeconds?: number | null
  /** Read by screen readers on the play button. */
  title?: string
  /** Ask for the address at once and start paused on the first frame (an event replay). */
  eager?: boolean
  /** The video's own size, when known: the box keeps its shape (within 4:5 and 2.4:1). */
  width?: number | null
  height?: number | null
  /** The short muted loop over the poster; on unless a page says otherwise. */
  preview?: boolean
  /** Round 32: the play mark waits, invisible, until the caller has a picture under it (an opened post: never a play mark on an empty box). */
  holdMark?: boolean
}

/** The box's width over height: the video's own shape, kept between a tall 4:5 and a wide 2.4:1. */
export function boxRatio(width?: number | null, height?: number | null): number {
  if (!width || !height) return 16 / 9
  return Math.min(2.4, Math.max(0.8, width / height))
}

export function StorelibVideo({ communityId, videoId, poster, durationSeconds, title, eager = false, width, height, preview = true, holdMark = false }: StorelibVideoProps) {
  const [state, setState] = useState<State>({ kind: "idle" })
  const [posterUrl, setPosterUrl] = useState<string | null>(poster ?? null)
  const me = useId()
  const live = useRef({ position: 0, duration: 0 })
  const box = useRef<HTMLDivElement>(null)
  const ratio = boxRatio(width, height)

  /* The play address, asked as the poster nears the screen, at the same quality a press uses. The press then starts from a file that is already on its way. */
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void fetchPlayback(communityId, videoId, { light: wantsLight() })
    }, { rootMargin: "240px" })
    io.observe(el)
    return () => io.disconnect()
  }, [communityId, videoId])

  const load = useCallback(
    async (autoPlay: boolean) => {
      setState({ kind: "loading" })
      if (autoPlay) window.dispatchEvent(new CustomEvent(ACTIVATE, { detail: me }))
      const got = await fetchPlayback(communityId, videoId, { light: wantsLight() })
      if (got.ok) {
        if (got.playback.poster) setPosterUrl((p) => p ?? got.playback.poster)
        setState({ kind: "playing", source: sourceOf(got.playback), startAt: readPlace(videoId) })
        return
      }
      const { status, error } = got as { status: number; error: string }
      if (status === 409 && error === "not_ready") return setState({ kind: "processing" })
      if (status === 409) return setState({ kind: "message", text: "This video could not be processed.", retry: false })
      if (status === 403 && error === "not_yet") return setState({ kind: "message", text: "The replay is here once the event is over.", retry: false })
      if (status === 404) return setState({ kind: "message", text: "This video is not available.", retry: false })
      if (status === 401) return setState({ kind: "message", text: "Sign in to watch this video.", retry: false })
      setState({ kind: "message", text: "The video did not load. Check your connection and try again.", retry: true })
    },
    [communityId, videoId, me],
  )

  const [autoPlay, setAutoPlay] = useState(false)
  /*
    THE PLAYER STARTS ON THE PICTURE ALREADY ON SCREEN (round 32). The player draws its poster from the address it is given,
    and the address given was the poster as stored, a file the page had not fetched (it shows the optimizer's copy): the box
    went dark between the press and the first frame. Read on the press, the file the poster is drawn from now is given
    instead, from the cache in the frame the player appears.
  */
  const [playerPoster, setPlayerPoster] = useState<string | null>(null)
  const notePoster = () => {
    const el = box.current?.querySelector<HTMLImageElement>("img[data-video-poster]")
    if (el && el.complete && el.naturalWidth > 0 && el.currentSrc) setPlayerPoster(el.currentSrc)
  }
  useEffect(() => {
    if (eager) void load(false)
  }, [eager, load])

  /* Another player pressed: this one goes back to its poster, keeping its place. */
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail === me) return
      setState((s) => {
        if (s.kind !== "playing") return s
        if (live.current.position > 0) savePlace(videoId, live.current.position, live.current.duration)
        return { kind: "idle" }
      })
    }
    window.addEventListener(ACTIVATE, onOther)
    return () => window.removeEventListener(ACTIVATE, onOther)
  }, [me, videoId])

  const renew = useCallback(async () => {
    const got = await fetchPlayback(communityId, videoId, { light: wantsLight(), fresh: true })
    return got.ok ? sourceOf(got.playback) : null
  }, [communityId, videoId])

  const onPlace = useCallback((position: number, duration: number) => savePlace(videoId, position, duration), [videoId])

  if (state.kind === "playing") {
    return (
      <div ref={box} data-storelib-video={videoId} data-video-state="playing" onPointerDownCapture={() => window.dispatchEvent(new CustomEvent(ACTIVATE, { detail: me }))}>
        <VideoPlayer source={state.source} startAt={state.startAt} autoPlay={autoPlay} poster={playerPoster ?? posterUrl ?? videoFrameStill(videoId)?.src ?? null} title={title} ratio={ratio} renew={renew} onPlace={onPlace} live={live} />
      </div>
    )
  }

  const busy = state.kind === "loading"
  return (
    <div
      ref={box}
      data-storelib-video={videoId}
      data-video-state={state.kind}
      /* Round 32: the ground as a property, not a colour class, so the dark look keeps it near black instead of the grey it gives a dark fill. */
      className="relative w-full overflow-hidden rounded-xl [background-color:#0f0f17] [dynamic-range-limit:standard]"
      data-video-mark={holdMark ? "held" : "shown"}
      style={{ aspectRatio: String(ratio) }}
    >
      {posterUrl ? <PosterPicture key={posterUrl} url={posterUrl} /> : null}
      {preview && (state.kind === "idle" || state.kind === "loading") ? <PreviewLoop communityId={communityId} videoId={videoId} /> : null}
      {state.kind === "idle" || state.kind === "loading" ? (
        <button
          type="button"
          onClick={() => {
            notePoster()
            setAutoPlay(true)
            void load(true)
          }}
          disabled={busy}
          aria-label={title ? `Play ${title}` : "Play video"}
          className="group/play absolute inset-0 flex items-center justify-center outline-none"
          data-video-play=""
        >
          <span className={`flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_6px_24px_rgba(0,0,0,0.3)] transition-[scale,opacity] duration-150 group-hover/play:scale-105 group-focus-visible/play:opacity-100 group-focus-visible/play:ring-4 group-focus-visible/play:ring-white/50 motion-reduce:transition-none ${holdMark ? "opacity-0" : "opacity-100"}`} data-video-play-mark="">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </span>
          {durationSeconds ? (
            <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white">{videoClock(durationSeconds)}</span>
          ) : null}
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-6 text-center text-white" data-video-message="">
          {state.kind === "processing" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-white/80" />
              <p className="text-[14px] font-semibold">This video is still processing</p>
              <button type="button" onClick={() => void load(true)} className="h-10 rounded-full bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
                Check again
              </button>
            </>
          ) : (
            <>
              <p className="max-w-[360px] text-[14px] font-semibold">{state.text}</p>
              {state.retry ? (
                <button type="button" onClick={() => void load(true)} className="h-10 rounded-full bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
                  Try again
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The muted loop over the poster. Starts on a resting pointer or, on a
 * phone, when it is most of the way on screen; stops and fades away when
 * the pointer leaves, it scrolls away or another one starts. Nothing is
 * asked of the server until it starts.
 */
export function PreviewLoop({
  communityId,
  videoId,
  mode = "auto",
  seconds = PREVIEW_SECONDS,
}: {
  communityId: string
  videoId: string
  /** "auto": a resting pointer on a computer, on screen on a phone. "visible": on screen everywhere (the About page's cover video). */
  mode?: "auto" | "visible"
  /** How much of the start loops. */
  seconds?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const me = useId()
  const [src, setSrc] = useState<string | null>(null)
  const [want, setWant] = useState(false)
  const [shown, setShown] = useState(false)

  /* Wanting: a resting pointer on a computer, most of the way on screen on a phone. */
  useEffect(() => {
    const el = box.current?.parentElement
    if (!el || !previewAllowed()) return
    const fine = mode === "auto" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
    let timer = 0
    if (fine) {
      const enter = () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setWant(true), PREVIEW_HOVER_MS)
      }
      const leave = () => {
        window.clearTimeout(timer)
        setWant(false)
      }
      el.addEventListener("pointerenter", enter)
      el.addEventListener("pointerleave", leave)
      return () => {
        window.clearTimeout(timer)
        el.removeEventListener("pointerenter", enter)
        el.removeEventListener("pointerleave", leave)
      }
    }
    if (typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer)
        if (entry.intersectionRatio >= PREVIEW_VISIBLE_RATIO) timer = window.setTimeout(() => setWant(true), PREVIEW_VISIBLE_MS)
        else setWant(false)
      },
      { threshold: [0, PREVIEW_VISIBLE_RATIO, 1] },
    )
    io.observe(el)
    return () => {
      window.clearTimeout(timer)
      io.disconnect()
    }
  }, [mode])

  /* One preview on the page at a time: a newer one puts this one away. */
  useEffect(() => {
    if (!want) return
    window.dispatchEvent(new CustomEvent(PREVIEW, { detail: me }))
    const other = (e: Event) => (e as CustomEvent).detail !== me && setWant(false)
    window.addEventListener(PREVIEW, other)
    return () => window.removeEventListener(PREVIEW, other)
  }, [want, me])

  useEffect(() => {
    if (!want) {
      setShown(false)
      vid.current?.pause()
      return
    }
    if (src) {
      const el = vid.current
      if (el) {
        el.currentTime = 0
        void el.play().catch(() => undefined)
      }
      return
    }
    let cancelled = false
    void fetchPlayback(communityId, videoId, { light: true }).then((got) => {
      if (!cancelled && got.ok) setSrc(got.playback.url)
    })
    return () => {
      cancelled = true
    }
  }, [want, src, communityId, videoId])

  return (
    <div ref={box} className="pointer-events-none absolute inset-0" aria-hidden data-video-preview={shown ? "playing" : want ? "wanted" : "off"}>
      {src ? (
        <video
          ref={vid}
          src={src}
          muted
          playsInline
          autoPlay={want}
          preload="metadata"
          disablePictureInPicture
          className="h-full w-full object-cover transition-opacity ease-out motion-reduce:transition-none"
          style={{ opacity: shown ? 1 : 0, transitionDuration: `${PREVIEW_FADE_MS}ms` }}
          onPlaying={() => want && setShown(true)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            if (el.currentTime >= seconds || (el.duration > 0 && el.currentTime >= el.duration - 0.1)) {
              el.currentTime = 0
              void el.play().catch(() => undefined)
            }
          }}
          onEnded={(e) => {
            e.currentTarget.currentTime = 0
            void e.currentTarget.play().catch(() => undefined)
          }}
          onError={() => setShown(false)}
        />
      ) : null}
    </div>
  )
}
