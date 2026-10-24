"use client"

/**
 * ===========================================================================
 *  THE ONEPAGE CROPPER: A PICTURE OR A PLAYING VIDEO, A BOX, EIGHT HANDLES
 * ===========================================================================
 * One cropper for the profile photo, the profile video, the logo and the
 * wallpaper video, on a phone and on a computer.
 *
 * WHY IT IS BUILT THIS WAY. The croppers it replaced listened for mouse
 * events and touch events separately, on `window`, with passive touch
 * listeners, and kept the box in React state:
 *
 *   - a passive touchmove cannot stop the page, so on an iPhone the sheet
 *     scrolled under the finger while a corner was dragged;
 *   - the wallpaper's had no touch handlers at all, so on a phone its corners
 *     did nothing;
 *   - every move re-rendered the whole design tab, which on a slow phone is
 *     what made the box lag behind and jump;
 *   - the box was placed in pixels of a 300px square, so the save step
 *     re-did the maths and the result was not always what was drawn.
 *
 * Here: pointer events on the frame (one path for mouse, pen and touch),
 * `setPointerCapture` so a finger that leaves the frame keeps its drag,
 * `touch-action: none` on the frame and every handle so the browser never
 * scrolls or zooms underneath, the frame's own rectangle read once per drag
 * (getBoundingClientRect, so a sheet that is itself transformed or a page
 * that is zoomed still maps the finger exactly), and the box moved by
 * writing its style in a requestAnimationFrame, with React told only when the
 * finger lifts. A second finger turns a drag into a pinch.
 *
 * The maths is lib/onepage/media-crop.ts; a crop is percent of the whole
 * frame (`v: 2`), the same numbers the canvas and the live page use.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import {
  CROP_HANDLES,
  initialCrop,
  moveCrop,
  pinchCrop,
  resizeCrop,
  type CropHandle,
  type CropLimits,
  type MediaCrop,
} from "@/lib/onepage/media-crop"

export interface MediaCropperProps {
  kind: "image" | "video"
  src: string
  /** The crop's own width over height in real pixels; null for free. */
  aspect: number | null
  /** A circle for a profile picture; the handles stay on its square. */
  shape?: "circle" | "rect"
  /** A crop to start from (v2). Missing: the largest centred one. */
  initial?: MediaCrop | null
  /** Called when a drag ends, and once when the media is ready. */
  onChange: (crop: MediaCrop) => void
  /** The media's own size, once it is known. */
  onReady?: (size: { width: number; height: number }) => void
  /** The tallest the frame is drawn, in CSS pixels. */
  maxHeight?: number
  className?: string
}

type Drag =
  | { mode: "move"; start: MediaCrop; x0: number; y0: number }
  | { mode: "resize"; handle: CropHandle; start: MediaCrop; x0: number; y0: number }
  | { mode: "pinch"; start: MediaCrop; d0: number; mx0: number; my0: number }

const CURSOR: Record<CropHandle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" }

function handlePos(h: CropHandle): React.CSSProperties {
  const left = h.includes("w") ? "0%" : h.includes("e") ? "100%" : "50%"
  const top = h.includes("n") ? "0%" : h.includes("s") ? "100%" : "50%"
  return { left, top }
}

export function MediaCropper({ kind, src, aspect, shape = "rect", initial, onChange, onReady, maxHeight = 360, className }: MediaCropperProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [avail, setAvail] = useState(0)
  const [failed, setFailed] = useState(false)
  const cropRef = useRef<MediaCrop | null>(null)
  const [crop, setCrop] = useState<MediaCrop | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const rectRef = useRef<DOMRect | null>(null)
  const frameReq = useRef(0)
  const pending = useRef<MediaCrop | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  /* The width there is, so the frame fits a 320px phone and a wide dialog alike. */
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setAvail(Math.floor(el.clientWidth))
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setNatural(null)
    setFailed(false)
    cropRef.current = null
    setCrop(null)
  }, [src])

  const frameAspect = natural ? natural.width / natural.height : 1
  const limits: CropLimits = { frameAspect, aspect, minPct: 10 }
  const limitsRef = useRef(limits)
  limitsRef.current = limits

  let frameW = Math.max(160, (avail || 324) - 24)
  let frameH = frameW / frameAspect
  if (frameH > maxHeight) {
    frameH = maxHeight
    frameW = frameH * frameAspect
  }

  const ready = (width: number, height: number) => {
    if (!width || !height) return
    setNatural({ width, height })
    onReadyRef.current?.({ width, height })
  }

  /* The first crop, once the frame's shape is known. */
  useEffect(() => {
    if (!natural || cropRef.current) return
    const l: CropLimits = { frameAspect: natural.width / natural.height, aspect, minPct: 10 }
    const first = initial && initial.v === 2 ? initial : initialCrop(l)
    cropRef.current = first
    setCrop(first)
    onChangeRef.current(first)
  }, [natural, aspect, initial])

  const paint = (c: MediaCrop) => {
    const box = boxRef.current
    if (!box) return
    for (const el of [box, dimRef.current]) {
      if (!el) continue
      el.style.left = `${c.x}%`
      el.style.top = `${c.y}%`
      el.style.width = `${c.width}%`
      el.style.height = `${c.height}%`
    }
    box.dataset.crop = `${c.x.toFixed(2)},${c.y.toFixed(2)},${c.width.toFixed(2)},${c.height.toFixed(2)}`
  }
  const schedule = (c: MediaCrop) => {
    pending.current = c
    cropRef.current = c
    if (frameReq.current) return
    frameReq.current = requestAnimationFrame(() => {
      frameReq.current = 0
      if (pending.current) paint(pending.current)
    })
  }
  useEffect(() => () => cancelAnimationFrame(frameReq.current), [])

  const pct = (clientX: number, clientY: number) => {
    const r = rectRef.current
    if (!r || !r.width || !r.height) return { x: 0, y: 0 }
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 }
  }

  const startPinch = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2 || !cropRef.current) return
    const [a, b] = pts
    const d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const m = pct((a.x + b.x) / 2, (a.y + b.y) / 2)
    dragRef.current = { mode: "pinch", start: cropRef.current, d0, mx0: m.x, my0: m.y }
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropRef.current || (e.pointerType === "mouse" && e.button !== 0)) return
    const frame = frameRef.current
    if (!frame) return
    e.preventDefault()
    try {
      frame.setPointerCapture(e.pointerId)
    } catch {
      /* A pointer that is already gone: nothing to hold. */
    }
    rectRef.current = frame.getBoundingClientRect()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) return startPinch()
    const handle = (e.target as HTMLElement).closest?.("[data-crop-handle]")?.getAttribute("data-crop-handle") as CropHandle | null
    const p = pct(e.clientX, e.clientY)
    dragRef.current = handle
      ? { mode: "resize", handle, start: cropRef.current, x0: p.x, y0: p.y }
      : { mode: "move", start: cropRef.current, x0: p.x, y0: p.y }
    frame.dataset.dragging = handle || "move"
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    const l = limitsRef.current
    if (d.mode === "pinch") {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const [a, b] = pts
      /* Fingers apart, a bigger box: the box is what the fingers hold. */
      const scale = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / d.d0
      const m = pct((a.x + b.x) / 2, (a.y + b.y) / 2)
      schedule(pinchCrop(d.start, scale, m.x - d.mx0, m.y - d.my0, l))
      return
    }
    const p = pct(e.clientX, e.clientY)
    const dx = p.x - d.x0
    const dy = p.y - d.y0
    schedule(d.mode === "move" ? moveCrop(d.start, dx, dy) : resizeCrop(d.start, d.handle, dx, dy, l))
  }, [])

  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    try {
      frameRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* Already released. */
    }
    if (pointers.current.size === 1 && dragRef.current?.mode === "pinch" && cropRef.current) {
      /* One finger left after a pinch: it moves the box from here, without a jump. */
      const [rest] = [...pointers.current.values()]
      const p = pct(rest.x, rest.y)
      dragRef.current = { mode: "move", start: cropRef.current, x0: p.x, y0: p.y }
      return
    }
    if (pointers.current.size > 0) return
    dragRef.current = null
    if (frameRef.current) delete frameRef.current.dataset.dragging
    const c = cropRef.current
    if (c) {
      if (frameReq.current) {
        cancelAnimationFrame(frameReq.current)
        frameReq.current = 0
      }
      paint(c)
      setCrop(c)
      onChangeRef.current(c)
    }
  }, [])

  /* Arrow keys move the box; with Shift, further. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const c = cropRef.current
    if (!c) return
    const step = e.shiftKey ? 5 : 1
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
    if (!dx && !dy) return
    e.preventDefault()
    const next = moveCrop(c, dx, dy)
    cropRef.current = next
    paint(next)
    setCrop(next)
    onChangeRef.current(next)
  }

  const shown = crop
  const place = (c: MediaCrop): React.CSSProperties => ({ left: `${c.x}%`, top: `${c.y}%`, width: `${c.width}%`, height: `${c.height}%` })
  return (
    /* Room around the frame so a corner's finger target is whole even when the box fills the frame. */
    <div ref={wrapRef} className={cn("w-full px-3 py-3", className)}>
      <div
        ref={frameRef}
        data-media-cropper={kind}
        data-sheet-no-drag=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        className="relative mx-auto select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
        style={{ width: Math.round(frameW), height: Math.round(frameH), touchAction: "none", overscrollBehavior: "contain" }}
      >
        {/* The media and the dimming, clipped to the frame. */}
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-[#0f0f12]" style={{ touchAction: "none" }}>
          {kind === "video" ? (
            <video
              key={src}
              src={src}
              className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => ready(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              onError={() => setFailed(true)}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              onLoad={(e) => ready(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              onError={() => setFailed(true)}
            />
          )}
          {failed ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13.5px] leading-snug text-white/85">
              {kind === "video" ? tt("This video can't play in this browser. You can still save it.") : tt("This picture can't be shown here.")}
            </div>
          ) : null}
          {shown ? (
            <div
              ref={dimRef}
              aria-hidden
              className={cn("pointer-events-none absolute", shape === "circle" ? "rounded-full" : "rounded-[2px]")}
              style={{ ...place(shown), boxShadow: "0 0 0 9999px rgba(10,10,14,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.95)" }}
            />
          ) : null}
        </div>

        {shown ? (
          <div
            ref={boxRef}
            data-crop-box=""
            data-crop={`${shown.x.toFixed(2)},${shown.y.toFixed(2)},${shown.width.toFixed(2)},${shown.height.toFixed(2)}`}
            tabIndex={0}
            role="group"
            aria-label={tt("Crop area. Drag to move, drag a corner to resize.")}
            onKeyDown={onKeyDown}
            className="absolute cursor-move rounded-[2px] outline-none focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
            style={{ ...place(shown), touchAction: "none" }}
          >
            {shape === "circle" ? <div aria-hidden className="pointer-events-none absolute inset-0 border border-white/35" /> : null}
            {/* Thirds, faint. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
              <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
              <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
              <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
              <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
            </div>
            {CROP_HANDLES.map((h) => {
              const corner = h.length === 2
              return (
                <div
                  key={h}
                  data-crop-handle={h}
                  aria-hidden
                  className="absolute z-[2] grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
                  style={{ ...handlePos(h), cursor: CURSOR[h], touchAction: "none" }}
                >
                  {corner ? (
                    <span
                      className="block h-[18px] w-[18px]"
                      style={{
                        borderColor: "#fff",
                        borderStyle: "solid",
                        borderWidth: `${h.includes("n") ? 3 : 0}px ${h.includes("e") ? 3 : 0}px ${h.includes("s") ? 3 : 0}px ${h.includes("w") ? 3 : 0}px`,
                        translate: `${h.includes("w") ? 7 : -7}px ${h.includes("n") ? 7 : -7}px`,
                        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))",
                      }}
                    />
                  ) : (
                    <span
                      className="block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                      style={h === "n" || h === "s" ? { width: 22, height: 4 } : { width: 4, height: 22 }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
