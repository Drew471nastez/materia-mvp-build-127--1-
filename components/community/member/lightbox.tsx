"use client"

/**
 * ===========================================================================
 *  A POST'S PICTURES AND VIDEOS, ONE AT A TIME
 * ===========================================================================
 * Pressing a thumbnail in an opened post opens this over everything: the
 * picture as large as the screen allows on black, the post's other
 * pictures, GIFs and videos a swipe (or an arrow key, or the side buttons)
 * away. On a phone two fingers zoom and one finger then moves the picture;
 * a double tap zooms in and out; a swipe down closes. Escape, the close
 * button and the browser's Back close it too (it is one step of history,
 * useHistoryLayer), and the page under it never moves.
 *
 * Only the picture on screen and its two neighbours are mounted. Pictures
 * come through the image optimizer at the size the screen needs
 * (optimizedSrcSet), videos only start loading when pressed (StorelibVideo),
 * and a video by address only loads its player when pressed, or at once
 * when the viewer was opened by pressing that video (`autoplay`).
 *
 * Round 8: it is the community's one viewer for anything somebody presses
 * to look at, not only a post's grid: a picture or a video linked in a
 * comment, a chat, a message, the about page or a lesson's notes, a lesson's
 * picture file (media-viewer.tsx opens it from anywhere). A picture from a
 * member only route or a short lived signed address is shown as it is
 * (`raw`), never through the optimizer, and a video file by its address
 * plays in the browser's own player (`clip`).
 *
 * Moves are compositor only (opacity, translate, scale), and with reduced
 * motion the open and close are a plain fade.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react"
import { StorelibVideo } from "@/components/video/storelib-video"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { embedPlayerSrc, type ViewerItem } from "@/lib/communities/post-media"

/**
 * ONE STEP OF HISTORY FOR SOMETHING OPEN OVER THE PAGE. Opening pushes an
 * entry (at `url` when given, so the address shows what is open; the same
 * address otherwise); the browser's Back (or a phone's back swipe) closes
 * it; closing it any other way steps back over that entry, so Back after
 * closing goes where it went before. Layers nest: a lightbox over an opened
 * post is a second entry. The entry carries Next's own state with it, so
 * the router sees the page it already has and loads nothing.
 */
export function useHistoryLayer(open: boolean, onClose: () => void, url?: string | null): void {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open || typeof window === "undefined") return
    const marker = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let mine = true
    try {
      window.history.pushState({ ...(window.history.state ?? {}), storelibLayer: marker }, "", url || window.location.href)
    } catch {
      mine = false
    }
    const onPop = () => {
      if ((window.history.state as { storelibLayer?: string } | null)?.storelibLayer === marker) return
      mine = false
      close.current()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (mine && (window.history.state as { storelibLayer?: string } | null)?.storelibLayer === marker) window.history.back()
    }
  }, [open, url])
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduced
}

const OPEN_MS = 200
const CLOSE_MS = 170
const SWIPE = 60
const MAX_ZOOM = 4

export function Lightbox({ items, start, communityId, onClose, autoplay = false }: { items: ViewerItem[]; start: number; communityId: string; onClose: () => void; autoplay?: boolean }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(start, items.length - 1)))
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening")
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 })
  const reduced = useReducedMotion()
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ kind: "swipe" | "pan" | "pinch" | null; x0: number; y0: number; d0: number; s0: number; zx: number; zy: number; axis: "x" | "y" | null }>({ kind: null, x0: 0, y0: 0, d0: 0, s0: 1, zx: 0, zy: 0, axis: null })
  const lastTap = useRef(0)
  const closing = useRef(false)

  const finish = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setPhase("closing")
    window.setTimeout(onClose, reduced ? 0 : CLOSE_MS)
  }, [onClose, reduced])

  useHistoryLayer(true, finish)

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase((p) => (p === "opening" ? "open" : p))))
    return () => cancelAnimationFrame(id)
  }, [])

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= items.length) return
      setZoom({ s: 1, x: 0, y: 0 })
      setIndex(to)
    },
    [items.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        finish()
      } else if (e.key === "ArrowRight") go(index + 1)
      else if (e.key === "ArrowLeft") go(index - 1)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [finish, go, index])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, iframe, video, [data-lightbox-media-control]")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2 && items[index]?.kind === "image") {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      gesture.current = { kind: "pinch", x0: 0, y0: 0, d0: d || 1, s0: zoom.s, zx: zoom.x, zy: zoom.y, axis: null }
      setDrag(null)
      return
    }
    if (pts.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 280 && items[index]?.kind === "image") {
        lastTap.current = 0
        setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))
        return
      }
      lastTap.current = now
      gesture.current = { kind: zoom.s > 1 ? "pan" : "swipe", x0: e.clientX, y0: e.clientY, d0: 0, s0: zoom.s, zx: zoom.x, zy: zoom.y, axis: null }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const s = Math.max(1, Math.min(MAX_ZOOM, g.s0 * (d / g.d0)))
      setZoom({ s, x: s === 1 ? 0 : g.zx, y: s === 1 ? 0 : g.zy })
    } else if (g.kind === "pan") {
      setZoom((z) => ({ ...z, x: g.zx + (e.clientX - g.x0), y: g.zy + (e.clientY - g.y0) }))
    } else if (g.kind === "swipe") {
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
      if (g.axis === "x") setDrag({ x: dx, y: 0 })
      else if (g.axis === "y" && dy > 0) setDrag({ x: 0, y: dy })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g.kind === "swipe" && drag) {
      if (g.axis === "x" && drag.x < -SWIPE) go(index + 1)
      else if (g.axis === "x" && drag.x > SWIPE) go(index - 1)
      else if (g.axis === "y" && drag.y > SWIPE * 1.5) finish()
    }
    if (pointers.current.size === 0) {
      gesture.current = { ...g, kind: null, axis: null }
      setDrag(null)
    } else if (g.kind === "pinch") {
      const [p] = [...pointers.current.values()]
      gesture.current = { kind: "pan", x0: p.x, y0: p.y, d0: 0, s0: zoom.s, zx: zoom.x, zy: zoom.y, axis: null }
    }
  }

  if (typeof document === "undefined" || !items.length) return null
  const shown = phase === "open"
  const ms = reduced ? 0 : phase === "closing" ? CLOSE_MS : OPEN_MS
  const fade = drag && drag.y > 0 ? Math.max(0.35, 1 - drag.y / 500) : 1

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={items.some((i) => i.kind !== "image" && i.kind !== "gif") ? "Pictures and videos" : "Pictures"}
      data-lightbox=""
      data-lightbox-phase={phase}
      className="fixed inset-0 z-[160] touch-none select-none overscroll-contain"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div aria-hidden className="absolute inset-0 bg-[#0b0c0f]" style={{ opacity: shown ? 0.94 * fade : 0, transition: `opacity ${ms}ms ease-out` }} onClick={finish} />
      <div
        className="absolute inset-0"
        style={{
          opacity: shown ? 1 : 0,
          scale: shown || reduced ? "1" : "0.97",
          translate: drag ? `0 ${drag.y}px` : "0 0",
          transition: drag ? "none" : `opacity ${ms}ms ease-out, scale ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1), translate ${ms}ms ease-out`,
        }}
      >
        <div
          className="absolute inset-0 flex"
          data-lightbox-track=""
          style={{
            width: `${items.length * 100}%`,
            translate: `calc(${(-index * 100) / items.length}% + ${drag?.x ?? 0}px) 0`,
            transition: drag ? "none" : reduced ? "none" : "translate 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {items.map((item, i) => (
            <div key={i} className="relative flex h-full items-center justify-center px-0 sm:px-16" style={{ width: `${100 / items.length}%` }} onClick={(e) => e.target === e.currentTarget && finish()}>
              {Math.abs(i - index) <= 1 ? <Slide item={item} communityId={communityId} active={i === index} autoplay={autoplay && i === start} zoom={i === index ? zoom : null} /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))]" style={{ opacity: shown ? 1 : 0, transition: `opacity ${ms}ms ease-out` }}>
        <span className="px-3 text-[13.5px] font-medium tabular-nums text-white/80" data-lightbox-count="">
          {items.length > 1 ? `${index + 1} / ${items.length}` : ""}
        </span>
        <button type="button" aria-label="Close" onClick={finish} className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40" data-lightbox-close="">
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>
      {items.length > 1 ? (
        <>
          <button type="button" aria-label="Previous" disabled={index === 0} onClick={() => go(index - 1)} className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white outline-none transition-[background-color,opacity] hover:bg-white/20 disabled:opacity-0 sm:flex" data-lightbox-prev="">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button type="button" aria-label="Next" disabled={index === items.length - 1} onClick={() => go(index + 1)} className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white outline-none transition-[background-color,opacity] hover:bg-white/20 disabled:opacity-0 sm:flex" data-lightbox-next="">
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

function Slide({ item, communityId, active, autoplay, zoom }: { item: ViewerItem; communityId: string; active: boolean; autoplay: boolean; zoom: { s: number; x: number; y: number } | null }) {
  /* The first slide plays at once only the first time it is shown; moving away and back waits for a press. */
  const [first, setFirst] = useState(autoplay)
  useEffect(() => {
    if (!active) setFirst(false)
  }, [active])
  if (item.kind === "image" || item.kind === "gif") {
    const own = item.kind === "image" && !item.raw
    const srcSet = own ? optimizedSrcSet(item.url, [640, 828, 1080, 1200, 1920, 2048]) : ""
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={own ? optimizedImageUrl(item.url, 1080) : item.url}
        srcSet={srcSet || undefined}
        sizes={srcSet ? "100vw" : undefined}
        alt=""
        draggable={false}
        decoding="async"
        referrerPolicy={item.kind === "gif" ? "no-referrer" : undefined}
        width={item.w}
        height={item.h}
        className="max-h-[calc(100dvh-112px)] max-w-full object-contain"
        style={zoom ? { scale: String(zoom.s), translate: `${zoom.x}px ${zoom.y}px`, transition: "scale 120ms ease-out" } : undefined}
        data-lightbox-image=""
      />
    )
  }
  const box = "w-full max-w-[min(1100px,calc((100dvh-140px)*16/9))] overflow-hidden bg-black sm:rounded-xl"
  if (item.kind === "video") {
    return (
      <div className={box} data-lightbox-media-control="">
        <StorelibVideo communityId={communityId} videoId={item.videoId} poster={item.poster} key={active ? "on" : "off"} />
      </div>
    )
  }
  if (item.kind === "clip") {
    return (
      <div className={`${box} flex items-center justify-center`} data-lightbox-media-control="">
        {active ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={item.url} poster={item.poster} controls playsInline preload="metadata" autoPlay={first} className="max-h-[calc(100dvh-140px)] w-full bg-black" data-lightbox-clip="" />
        ) : null}
      </div>
    )
  }
  return (
    <div className={box} data-lightbox-media-control="">
      <EmbedPlayer key={active ? "on" : "off"} item={item} autoplay={active && first} posterWidth={960} />
    </div>
  )
}

/**
 * A YouTube or Vimeo video in a 16:9 box: its picture and a play button,
 * and the privacy player only once pressed (or at once with `autoplay`),
 * so a post with a video loads none of YouTube's page until somebody asks.
 */
export function EmbedPlayer({ item, autoplay = false, posterWidth = 720, className = "" }: { item: Extract<ViewerItem, { kind: "embed" }>; autoplay?: boolean; posterWidth?: number; className?: string }) {
  const [play, setPlay] = useState(autoplay)
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-black ${className}`} data-embed-player={item.provider} data-embed-state={play ? "playing" : "idle"}>
      {play ? (
        <iframe src={embedPlayerSrc(item)} title={item.title || "Video"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <button type="button" onClick={() => setPlay(true)} aria-label={item.title ? `Play ${item.title}` : "Play video"} className="group/play absolute inset-0 flex cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60" data-embed-play="">
          {item.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImageUrl(item.thumb, posterWidth)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white transition-[scale] duration-150 group-hover/play:scale-105 motion-reduce:transition-none">
            <Play className="ml-1 h-6 w-6 fill-current" />
          </span>
        </button>
      )}
    </div>
  )
}
