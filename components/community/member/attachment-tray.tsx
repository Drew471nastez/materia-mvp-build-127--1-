"use client"

/**
 * ===========================================================================
 *  WHAT A POST CARRIES, WHILE IT IS WRITTEN (round 13)
 * ===========================================================================
 * The pictures, videos, GIFs, linked videos and files under the composer's
 * words (new post and Edit post alike), as one row of equal tiles that wraps:
 *
 *   MOVE      drag a tile to its place. With a mouse it lifts after a few
 *             pixels; with a finger after a short hold (LIFT_HOLD_MS), so a
 *             swipe across the tiles still scrolls the editor. The lifted
 *             tile follows the pointer, a little larger and with a soft
 *             shadow; the others slide to where they will be; letting go
 *             settles it in its slot and only then is the order kept.
 *             Arrow keys move a focused tile, Delete takes it off.
 *   REMOVE    the cross on each tile (a 40px target); an upload under way
 *             stops (media-upload.ts stopUpload).
 *   ADD       the last tile opens the file picker while there is room.
 *   PROGRESS  a picture shows a small spinner; a video its percent and a
 *             thin bar, then "Processing" while a video service works on
 *             it; a failure stays on the tile, in red, with the reason
 *             under the row, and Post waits until it is taken off.
 *
 * Only translate, scale and box-shadow move, all on the compositor, inline
 * on the tiles while a drag lasts and gone the moment it ends. Nothing
 * moves with reduced motion; the order still changes.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { flushSync } from "react-dom"
import { AlertCircle, FileText, GripVertical, Loader2, Play, Plus, X } from "lucide-react"
import { EMBED_NAMES, fileSizeLabel } from "@/lib/communities/post-media"
import { hapticTap } from "@/lib/native-bridge"
import type { PostMedia } from "@/lib/communities/types"
import { ProviderMark } from "./media-providers"
import { stopUpload } from "./media-upload"

export interface TrayItem {
  key: string
  kind: "image" | "video" | "file" | "gif" | "embed"
  name: string
  size: number
  preview?: string
  progress: number
  media?: PostMedia
  error?: string
}

/** A finger holds this long before a tile lifts; moving sooner is a scroll. */
export const LIFT_HOLD_MS = 150
/** A mouse lifts a tile once it has moved this far. */
export const MOUSE_LIFT_PX = 4
/** A finger that moves this far before the hold is over is scrolling. */
export const TOUCH_SLOP_PX = 10
/** How long the neighbours take to slide, and the tile to settle. */
export const SLIDE_MS = 160
export const SETTLE_MS = 150
export const LIFT_SCALE = 1.06
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"

/** The list with `key` moved to index `to` (clamped), as a new array; the same list when nothing moves. */
export function moveKey<T extends { key: string }>(list: readonly T[], key: string, to: number): T[] {
  const from = list.findIndex((x) => x.key === key)
  if (from === -1) return list as T[]
  const at = Math.max(0, Math.min(list.length - 1, to))
  if (at === from) return list as T[]
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(at, 0, x)
  return next
}

/** Where the tile now at `i` sits while the one at `from` is held over slot `to`. */
export function slotWhileMoving(i: number, from: number, to: number): number {
  if (i === from) return to
  if (from < to && i > from && i <= to) return i - 1
  if (from > to && i >= to && i < from) return i + 1
  return i
}

/** The slot whose centre is nearest to a point. */
export function nearestSlot(centres: readonly { x: number; y: number }[], x: number, y: number): number {
  let best = 0
  let bestD = Infinity
  centres.forEach((c, i) => {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

interface Drag {
  key: string
  from: number
  to: number
  pointerId: number
  touch: boolean
  startX: number
  startY: number
  lifted: boolean
  timer: number
  tile: HTMLElement
  els: HTMLElement[]
  rects: DOMRect[]
  /** Lets go of the window listeners and the hold timer. */
  off: () => void
}

export function AttachmentTray<T extends TrayItem>({
  items,
  onMove,
  onRemove,
  onAdd,
  className = "",
}: {
  items: T[]
  /** Moves the item with this key to this index. */
  onMove: (key: string, to: number) => void
  onRemove: (item: T) => void
  /** Opens the file picker; left out when the post is full. */
  onAdd?: () => void
  className?: string
}) {
  const strip = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const placeRaf = useRef(0)
  const placePending = useRef<{ d: Drag; x: number; y: number } | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [said, setSaid] = useState("")
  const failed = items.find((x) => x.error)

  /* Settling after a drop: a new drag waits for it. */
  const settling = useRef(false)
  /* The tray going away mid drag: its window listeners go with it. */
  useEffect(
    () => () => {
      if (placeRaf.current) cancelAnimationFrame(placeRaf.current)
      drag.current?.off()
    },
    [],
  )

  const tiles = () => Array.from(strip.current?.querySelectorAll<HTMLElement>(":scope > [data-tray-tile]") ?? [])

  function clearStyles(els: HTMLElement[]) {
    for (const el of els) {
      el.style.translate = ""
      el.style.scale = ""
      el.style.transition = ""
      el.style.zIndex = ""
      el.style.boxShadow = ""
      el.style.willChange = ""
    }
  }

  function lift(d: Drag) {
    d.els = tiles()
    d.rects = d.els.map((el) => el.getBoundingClientRect())
    d.lifted = true
    const quiet = reducedMotion()
    d.els.forEach((el, i) => {
      el.style.willChange = "translate"
      if (i === d.from) {
        el.style.zIndex = "5"
        el.style.transition = quiet ? "none" : `scale 160ms ${EASE}, box-shadow 160ms ${EASE}`
        el.style.scale = String(LIFT_SCALE)
        el.style.boxShadow = "0 12px 28px -10px rgba(17,24,39,0.35), 0 2px 6px rgba(17,24,39,0.08)"
      } else {
        el.style.transition = quiet ? "none" : `translate ${SLIDE_MS}ms ${EASE}`
      }
    })
    setHeld(d.key)
    /* The lift is felt as well as seen: Capacitor Haptics in the app, a short buzz on Android, nothing on an iPhone's browser. */
    if (d.touch) hapticTap("soft")
  }

  function applyPlace(d: Drag, x: number, y: number) {
    const dx = x - d.startX
    const dy = y - d.startY
    d.els[d.from].style.translate = `${dx}px ${dy}px`
    const r = d.rects[d.from]
    const centres = d.rects.map((q) => ({ x: q.left + q.width / 2, y: q.top + q.height / 2 }))
    const to = nearestSlot(centres, r.left + r.width / 2 + dx, r.top + r.height / 2 + dy)
    if (to === d.to) return
    d.to = to
    d.els.forEach((el, i) => {
      if (i === d.from) return
      const s = slotWhileMoving(i, d.from, to)
      el.style.translate = s === i ? "0px 0px" : `${d.rects[s].left - d.rects[i].left}px ${d.rects[s].top - d.rects[i].top}px`
    })
  }

  function place(d: Drag, x: number, y: number) {
    placePending.current = { d, x, y }
    if (placeRaf.current) return
    placeRaf.current = requestAnimationFrame(() => {
      placeRaf.current = 0
      const p = placePending.current
      if (!p || drag.current !== p.d || !p.d.lifted) return
      applyPlace(p.d, p.x, p.y)
    })
  }

  function end(d: Drag, commit: boolean) {
    if (drag.current !== d) return
    drag.current = null
    d.off()
    if (!d.lifted) return
    const to = commit ? d.to : d.from
    const el = d.els[d.from]
    settling.current = true
    const done = () => {
      settling.current = false
      /* The order and the tiles' places change in one frame: the new order is drawn where the tiles already are. */
      flushSync(() => {
        setHeld(null)
        if (to !== d.from) {
        onMove(d.key, to)
        if (d.touch) hapticTap("light")
      }
      })
      clearStyles(d.els)
      if (to !== d.from) setSaid(`Moved to ${to + 1} of ${d.els.length}`)
    }
    if (!el || reducedMotion()) return done()
    el.style.transition = `translate ${SETTLE_MS}ms ${EASE}, scale ${SETTLE_MS}ms ${EASE}, box-shadow ${SETTLE_MS}ms ${EASE}`
    el.style.translate = `${d.rects[to].left - d.rects[d.from].left}px ${d.rects[to].top - d.rects[d.from].top}px`
    el.style.scale = "1"
    el.style.boxShadow = ""
    if (!commit) d.els.forEach((x, i) => i !== d.from && (x.style.translate = "0px 0px"))
    window.setTimeout(done, SETTLE_MS)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, index: number, key: string) {
    if (drag.current || settling.current || items.length < 2) return
    if (e.pointerType === "mouse" && e.button !== 0) return
    if ((e.target as HTMLElement).closest("[data-tray-remove]")) return
    const touch = e.pointerType !== "mouse"
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return
      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY
      if (!d.lifted) {
        if (d.touch) {
          if (Math.hypot(dx, dy) > TOUCH_SLOP_PX) end(d, false)
          return
        }
        if (Math.hypot(dx, dy) < MOUSE_LIFT_PX) return
        lift(d)
      }
      place(d, ev.clientX, ev.clientY)
    }
    const up = (ev: PointerEvent) => ev.pointerId === d.pointerId && end(d, true)
    const cancel = (ev: PointerEvent) => ev.pointerId === d.pointerId && end(d, false)
    /* While a tile is lifted by a finger the page must not scroll under it. */
    const still = (ev: TouchEvent) => d.lifted && ev.cancelable && ev.preventDefault()
    const tile = e.currentTarget
    const d: Drag = {
      key,
      from: index,
      to: index,
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      lifted: false,
      timer: 0,
      tile,
      els: [],
      rects: [],
      off: () => {
        window.clearTimeout(d.timer)
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", cancel)
        window.removeEventListener("touchmove", still)
        try {
          if (tile.hasPointerCapture(d.pointerId)) tile.releasePointerCapture(d.pointerId)
        } catch {
          /* gone with the tile */
        }
      },
    }
    drag.current = d
    if (touch) {
      try {
        tile.setPointerCapture(e.pointerId)
      } catch {
        /* older webviews */
      }
      d.timer = window.setTimeout(() => drag.current === d && lift(d), LIFT_HOLD_MS)
    } else e.preventDefault()
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("touchmove", still, { passive: false })
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>, index: number, item: T) {
    if (e.target !== e.currentTarget) return
    const to = e.key === "ArrowLeft" || e.key === "ArrowUp" ? index - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? index + 1 : null
    if (to !== null) {
      e.preventDefault()
      if (to < 0 || to >= items.length) return
      onMove(item.key, to)
      setSaid(`Moved to ${to + 1} of ${items.length}`)
      return
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      remove(item)
    }
  }

  function remove(item: T) {
    stopUpload(item.key)
    onRemove(item)
  }

  return (
    <div className={className} data-attachment-tray="">
      <div
        ref={strip}
        role="list"
        aria-label="Attachments"
        className={`flex gap-2 ${items.length > 2 ? "max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:pb-0.5 max-sm:scrollbar-hide max-sm:snap-x max-sm:snap-mandatory" : "flex-wrap"} sm:flex-wrap`}
        data-composer-uploads=""
      >
        {items.map((item, i) => (
          <div
            key={item.key}
            role="listitem"
            tabIndex={0}
            aria-label={`${labelOf(item)}, ${i + 1} of ${items.length}${items.length > 1 ? ". Arrow keys move it" : ""}`}
            onPointerDown={(e) => onPointerDown(e, i, item.key)}
            onKeyDown={(e) => onKeyDown(e, i, item)}
            onContextMenu={(e) => drag.current && e.preventDefault()}
            className={`relative h-[88px] w-[88px] shrink-0 select-none rounded-[10px] outline-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 max-sm:snap-start sm:h-[84px] sm:w-[84px] ${items.length > 1 ? (held === item.key ? "cursor-grabbing touch-none" : "cursor-grab touch-manipulation") : "touch-manipulation"}`}
            style={items.length > 1 ? ({ touchAction: held === item.key ? "none" : "manipulation" } as const) : undefined}
            data-tray-tile={item.kind}
            data-attachment={item.kind}
            data-key={item.key}
            data-ready={item.media ? "true" : "false"}
            data-lifted={held === item.key ? "" : undefined}
          >
            <Tile item={item} />
            {items.length > 1 && held !== item.key ? (
              <span className="pointer-events-none absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[6px] bg-black/40 px-1 py-0.5 text-white/90 sm:hidden" aria-hidden data-tray-grip="">
                <GripVertical className="h-3 w-3" strokeWidth={2.5} />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => remove(item)}
              aria-label={`Remove ${labelOf(item).toLowerCase()}`}
              className="absolute -right-1.5 -top-1.5 flex h-10 w-10 items-center justify-center outline-none [-webkit-tap-highlight-color:transparent]"
              data-tray-remove=""
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a2e]/75 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] ring-[1.5px] ring-white transition-colors hover:bg-[#1a1a2e]">
                <X className="h-[11px] w-[11px]" strokeWidth={3} aria-hidden />
              </span>
            </button>
          </div>
        ))}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add more"
            className="flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border border-[#e3e5e9] bg-white text-[#6b7280] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-colors hover:bg-[#f6f7f8] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 touch-manipulation max-sm:snap-start sm:h-[84px] sm:w-[84px] [-webkit-tap-highlight-color:transparent]"
            data-tray-add=""
          >
            <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="text-[12px] font-medium">Add</span>
          </button>
        ) : null}
      </div>
      {failed ? (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[#b42318]" role="alert" data-tray-error="">
          <AlertCircle className="mt-[1px] h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            {failed.error} Remove it to post.
          </span>
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  )
}

function labelOf(item: TrayItem): string {
  if (item.kind === "image") return "Picture"
  if (item.kind === "gif") return "GIF"
  if (item.kind === "video") return "Video"
  if (item.media?.type === "embed") return `${EMBED_NAMES[item.media.provider]} video`
  return item.name || "File"
}

function Tile({ item }: { item: TrayItem }) {
  const sending = !item.media && !item.error
  const processing = sending && item.kind === "video" && item.progress >= 100
  if (item.kind === "file") {
    return (
      <div className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border bg-white p-2 ${item.error ? "border-[#f3c4bf]" : "border-[#e8e9ec]"}`}>
        <FileText className={`h-5 w-5 ${item.error ? "text-[#b42318]" : "text-[#6b7280]"}`} strokeWidth={1.75} aria-hidden />
        <span className="min-w-0">
          <span className="line-clamp-2 break-words text-[11.5px] font-medium leading-[14px] text-[#1a1a2e]">{item.name}</span>
          <span className="mt-0.5 block text-[11px] tabular-nums text-[#6b7280]">{item.error ? "Failed" : sending ? `${Math.round(item.progress)}%` : fileSizeLabel(item.size)}</span>
        </span>
      </div>
    )
  }
  const motion = item.kind === "video" || item.kind === "embed"
  const showUpload = sending && (item.kind === "video" || item.kind === "image" || item.kind === "gif")
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[10px] bg-[#eef0f2] ring-1 ring-inset ring-black/[0.06]">
      {item.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview}
          alt=""
          draggable={false}
          referrerPolicy={item.kind === "gif" || item.kind === "embed" ? "no-referrer" : undefined}
          className={`pointer-events-none h-full w-full object-cover [dynamic-range-limit:standard] ${sending ? "opacity-70" : ""}`}
        />
      ) : motion ? (
        <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
      ) : null}
      {motion && item.media ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
        </span>
      ) : null}
      {item.kind === "gif" ? <span className="pointer-events-none absolute bottom-1 left-1 rounded-[5px] bg-black/55 px-1 text-[10px] font-semibold leading-[15px] text-white">GIF</span> : null}
      {item.media?.type === "embed" ? (
        <span className="pointer-events-none absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/95 shadow-[0_1px_1px_rgba(0,0,0,0.15)]" aria-label={EMBED_NAMES[item.media.provider]} data-attachment-site={item.media.provider}>
          <ProviderMark provider={item.media.provider} size={14} />
        </span>
      ) : null}
      {showUpload ? (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 text-white" aria-label={processing ? "Processing" : `Uploading, ${Math.round(item.progress)}%`} data-tray-progress={processing ? "processing" : "uploading"}>
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span className="text-[11px] font-medium">Processing</span>
            </>
          ) : (
            <span className="text-[12px] font-semibold tabular-nums">{Math.round(item.progress)}%</span>
            {item.kind === "video" ? (
              <span className="text-[11px] font-medium leading-tight">
                Uploading
                {item.size > 0 ? <span className="mt-0.5 block font-normal tabular-nums opacity-90">{fileSizeLabel(Math.round((item.size * item.progress) / 100))} of {fileSizeLabel(item.size)}</span> : null}
              </span>
            ) : null}
          )}
          {!processing ? (
            <span className="absolute inset-x-2 bottom-2 h-[3px] overflow-hidden rounded-full bg-white/30">
              <span className="block h-full origin-left rounded-full bg-white will-change-[scale] motion-reduce:transition-none" style={{ scale: `${Math.max(0.02, item.progress / 100)} 1`, transition: "scale 80ms linear" }} />
            </span>
          ) : null}
        </span>
      ) : sending ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-label="Uploading">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </span>
        </span>
      ) : null}
      {item.error ? (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/55 text-white ring-2 ring-inset ring-[#e5484d]" data-tray-failed="">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e5484d]">
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-[11px] font-semibold">Failed</span>
        </span>
      ) : null}
    </div>
  )
}
