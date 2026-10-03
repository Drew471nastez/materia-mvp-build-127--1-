"use client"

/**
 * ===========================================================================
 *  A COMMUNITY VIDEO, PLAYED
 * ===========================================================================
 * The lesson player (components/courses/lesson-video.tsx) for any video a
 * community holds: a post's video, a resource, an event's replay, the cover
 * video. It brings everything the lesson player has: play and pause,
 * seeking with a buffered bar, volume, speed, fullscreen, picture in
 * picture, captions, the keyboard (Space, K, J, L, arrows, M, F, C, < >,
 * 0 to 9) and a signed address renewed before its hour is up.
 *
 * THE ADDRESS IS ASKED FOR ON PRESS. A feed can hold many videos; each one
 * shows its poster and a play button, and only the one pressed asks the
 * server (/api/community/<id>/videos/<videoId>/play), which decides again
 * whether this person may watch it. `eager` asks at once (an event replay,
 * the only video on its page).
 *
 * ONE AT A TIME. Pressing play on one puts any other back to its poster, so
 * the keys never drive two players.
 *
 * RESUME. The place in each video is kept in this browser and the next
 * press starts there (not in the last ten seconds, which starts again).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Loader2, Play } from "lucide-react"
import { LessonVideo, type VideoSource } from "@/components/courses/lesson-video"
import { videoClock, type VideoPlayback } from "@/lib/video/types"

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "playing"; source: VideoSource; startAt: number }
  | { kind: "processing" }
  | { kind: "message"; text: string; retry: boolean }

const ACTIVATE = "storelib:video-activate"
const PLACE_KEY = (id: string) => `storelib.video.${id}`

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

export async function fetchPlayback(communityId: string, videoId: string): Promise<{ ok: true; playback: VideoPlayback } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`/api/community/${communityId}/videos/${videoId}/play`, { cache: "no-store", credentials: "same-origin" })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, status: res.status, error: String(body.error || "failed") }
    return { ok: true, playback: body as unknown as VideoPlayback }
  } catch {
    return { ok: false, status: 0, error: "offline" }
  }
}

function sourceOf(p: VideoPlayback): VideoSource {
  return { url: p.url, expiresAt: Number(p.expiresAt) || Date.now() + 3_000_000, mime: p.mime, captions: p.captions }
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
}

export function StorelibVideo({ communityId, videoId, poster, durationSeconds, title, eager = false }: StorelibVideoProps) {
  const [state, setState] = useState<State>({ kind: "idle" })
  const [posterUrl, setPosterUrl] = useState<string | null>(poster ?? null)
  const me = useId()
  const live = useRef({ position: 0, duration: 0 })

  const load = useCallback(
    async (autoPlay: boolean) => {
      setState({ kind: "loading" })
      if (autoPlay) window.dispatchEvent(new CustomEvent(ACTIVATE, { detail: me }))
      const got = await fetchPlayback(communityId, videoId)
      if (got.ok) {
        if (got.playback.poster) setPosterUrl((p) => p ?? got.playback.poster)
        setState({ kind: "playing", source: sourceOf(got.playback), startAt: readPlace(videoId) })
        return
      }
      if (got.status === 409 && got.error === "not_ready") return setState({ kind: "processing" })
      if (got.status === 409) return setState({ kind: "message", text: "This video could not be processed.", retry: false })
      if (got.status === 403 && got.error === "not_yet") return setState({ kind: "message", text: "The replay is here once the event is over.", retry: false })
      if (got.status === 404) return setState({ kind: "message", text: "This video is not available.", retry: false })
      if (got.status === 401) return setState({ kind: "message", text: "Sign in to watch this video.", retry: false })
      setState({ kind: "message", text: "The video did not load. Check your connection and try again.", retry: true })
    },
    [communityId, videoId, me],
  )

  const [autoPlay, setAutoPlay] = useState(false)
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
    const got = await fetchPlayback(communityId, videoId)
    return got.ok ? sourceOf(got.playback) : null
  }, [communityId, videoId])

  const onPlace = useCallback((position: number, duration: number) => savePlace(videoId, position, duration), [videoId])

  if (state.kind === "playing") {
    return (
      <div data-storelib-video={videoId} onPointerDownCapture={() => window.dispatchEvent(new CustomEvent(ACTIVATE, { detail: me }))}>
        <LessonVideo
          source={state.source}
          startAt={state.startAt}
          autoPlay={autoPlay}
          poster={posterUrl}
          next={null}
          renew={renew}
          onPlace={onPlace}
          live={live}
          onNearEnd={() => undefined}
          onNext={() => undefined}
        />
      </div>
    )
  }

  const busy = state.kind === "loading"
  return (
    <div data-storelib-video={videoId} data-video-state={state.kind} className="relative aspect-video w-full overflow-hidden bg-[#0f0f17] sm:rounded-2xl">
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      ) : null}
      {state.kind === "idle" || state.kind === "loading" ? (
        <button
          type="button"
          onClick={() => {
            setAutoPlay(true)
            void load(true)
          }}
          disabled={busy}
          aria-label={title ? `Play ${title}` : "Play video"}
          className="group/play absolute inset-0 flex items-center justify-center focus-visible:outline-none"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-[scale] duration-150 group-hover/play:scale-105 group-focus-visible/play:ring-4 group-focus-visible/play:ring-white/50 motion-reduce:transition-none">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </span>
          {durationSeconds ? (
            <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white">{videoClock(durationSeconds)}</span>
          ) : null}
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-6 text-center text-white">
          {state.kind === "processing" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-white/80" />
              <p className="text-[14px] font-semibold">This video is still processing</p>
              <button type="button" onClick={() => void load(true)} className="h-10 rounded-[10px] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
                Check again
              </button>
            </>
          ) : (
            <>
              <p className="max-w-[360px] text-[14px] font-semibold">{state.text}</p>
              {state.retry ? (
                <button type="button" onClick={() => void load(true)} className="h-10 rounded-[10px] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
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
