"use client"

/**
 * ===========================================================================
 *  PLACING A NEW PROFILE PHOTO IN ITS CIRCLE
 * ===========================================================================
 * The owner: "uploading a profile photo is smooth and modern (picker, crop
 * to circle, upload progress, instant preview, no layout jump)". The photo
 * used to be cut to its centre square without asking, so a face off to one
 * side came out as half a face.
 *
 * Now the picture chosen opens here first: the photo under a circle, the
 * circle showing exactly what the profile will show. One finger (or the
 * mouse) moves it, two fingers pinch it closer, the wheel and the slider
 * zoom on a computer, the arrow keys nudge and + and - zoom. Use photo cuts
 * the circle's square out at 512px and hands it back; the circle in
 * Settings shows it at once while it uploads (components/account/
 * account-photo.tsx). Cancel, Escape or the dim ground leave everything as
 * it was.
 *
 * A SHEET ON A PHONE, A CARD ON A COMPUTER, both over the page (fixed), so
 * nothing on the page moves when it opens or closes. Every finger move is
 * written straight onto the picture inside one animation frame:
 * no React render per finger move, no layout read during a drag. The circle
 * can never show an edge of nothing: the picture is held so it always
 * covers it. Reduced motion: no slide, no fade.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

/** The side of the square the photo is saved at, as the photo route has always stored it. */
export const PHOTO_SIDE = 512
const MAX_ZOOM = 4

type View = { x: number; y: number; zoom: number }

/** The square of the source picture (in its own pixels) that the circle shows. Pure, so the tests can hold it. */
export function cropSquare(input: { width: number; height: number; circle: number; view: View }): { sx: number; sy: number; side: number } {
  const { width, height, circle, view } = input
  const base = Math.max(circle / width, circle / height)
  const scale = base * view.zoom
  const side = circle / scale
  const sx = width / 2 + (-circle / 2 - view.x) / scale
  const sy = height / 2 + (-circle / 2 - view.y) / scale
  return { sx: Math.max(0, Math.min(width - side, sx)), sy: Math.max(0, Math.min(height - side, sy)), side: Math.min(side, width, height) }
}

/** Held so the picture always covers the circle: no edge of nothing inside it. */
export function clampView(input: { width: number; height: number; circle: number; view: View }): View {
  const { width, height, circle } = input
  const zoom = Math.max(1, Math.min(MAX_ZOOM, input.view.zoom))
  const base = Math.max(circle / width, circle / height)
  const w = width * base * zoom
  const h = height * base * zoom
  const mx = Math.max(0, (w - circle) / 2)
  const my = Math.max(0, (h - circle) / 2)
  return { zoom, x: Math.max(-mx, Math.min(mx, input.view.x)), y: Math.max(-my, Math.min(my, input.view.y)) }
}

/** Draws the circle's square at PHOTO_SIDE as a JPEG on white (a transparent PNG does not go black). */
async function render(bitmap: ImageBitmap, square: { sx: number; sy: number; side: number }): Promise<Blob> {
  const out = Math.min(PHOTO_SIDE, Math.round(square.side)) || PHOTO_SIDE
  const canvas = document.createElement("canvas")
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  ctx.imageSmoothingQuality = "high"
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, out, out)
  ctx.drawImage(bitmap, square.sx, square.sy, square.side, square.side, 0, 0, out, out)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.9))
}

export function PhotoCropSheet({ bitmap, src, onCancel, onDone }: { bitmap: ImageBitmap; src: string; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const circleRef = useRef(280)
  const frame = useRef(0)
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [circle, setCircle] = useState(280)

  /* The circle's size from the stage, once, before the first paint: the stage is square and its size only changes with the window. */
  useLayoutEffect(() => {
    const measure = () => {
      const side = stageRef.current?.clientWidth ?? 320
      const c = Math.round(side - 40)
      circleRef.current = c
      setCircle(c)
      view.current = clampView({ width: bitmap.width, height: bitmap.height, circle: c, view: view.current })
      paint()
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap])

  /* In on the next frame, so the slide starts from below rather than landing. */
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    /* The dialog takes the focus (Escape, Enter and the arrows work at once) without drawing a ring on the picture. */
    dialogRef.current?.focus({ preventScroll: true })
    return () => {
      cancelAnimationFrame(id)
      cancelAnimationFrame(frame.current)
      html.style.overflow = before
    }
  }, [])

  const paint = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const img = imgRef.current
      if (!img) return
      const { x, y, zoom } = view.current
      img.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${zoom})`
      if (sliderRef.current && document.activeElement !== sliderRef.current) sliderRef.current.value = String(zoom)
    })
  }, [])

  const set = useCallback(
    (next: View) => {
      view.current = clampView({ width: bitmap.width, height: bitmap.height, circle: circleRef.current, view: next })
      paint()
    },
    [bitmap, paint],
  )

  /* Pointers: one moves, two pinch. Positions kept in a map; nothing is measured while they move. */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom }
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId)
    if (!last) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      set({ ...view.current, zoom: pinch.current.zoom * (distance / Math.max(1, pinch.current.distance)) })
      return
    }
    set({ ...view.current, x: view.current.x + (now.x - last.x), y: view.current.y + (now.y - last.y) })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  /* The wheel zooms (a trackpad's pinch arrives as a wheel with ctrl). Not passive, so the page under it does not scroll. */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
      set({ ...view.current, zoom: view.current.zoom * factor })
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [set])

  const close = useCallback(
    (then: () => void) => {
      setClosing(true)
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      window.setTimeout(then, reduce ? 0 : 200)
    },
    [],
  )
  const cancel = useCallback(() => {
    if (saving) return
    close(onCancel)
  }, [close, onCancel, saving])
  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const blob = await render(bitmap, cropSquare({ width: bitmap.width, height: bitmap.height, circle: circleRef.current, view: view.current }))
      close(() => onDone(blob))
    } catch {
      setSaving(false)
      close(onCancel)
    }
  }, [bitmap, close, onCancel, onDone, saving])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 24 : 6
    const v = view.current
    if (e.key === "Escape") return void (e.preventDefault(), cancel())
    const onPicture = e.target === stageRef.current || e.target === dialogRef.current
    if (e.key === "Enter" && onPicture) return void (e.preventDefault(), void save())
    if (!onPicture) return
    if (e.key === "ArrowLeft") set({ ...v, x: v.x + step })
    else if (e.key === "ArrowRight") set({ ...v, x: v.x - step })
    else if (e.key === "ArrowUp") set({ ...v, y: v.y + step })
    else if (e.key === "ArrowDown") set({ ...v, y: v.y - step })
    else if (e.key === "+" || e.key === "=") set({ ...v, zoom: v.zoom * 1.1 })
    else if (e.key === "-") set({ ...v, zoom: v.zoom / 1.1 })
    else return
    e.preventDefault()
  }

  const open = shown && !closing
  const base = Math.max(circle / bitmap.width, circle / bitmap.height)

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[120] flex items-end justify-center outline-none sm:items-center" role="dialog" aria-modal="true" aria-label="Place your photo" onKeyDown={onKeyDown} data-photo-crop="">
      <div
        aria-hidden
        onClick={cancel}
        className={cn("absolute inset-0 bg-[#0f1117]/45 transition-opacity duration-200 ease-out motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}
      />
      <div
        className={cn(
          "relative w-full max-w-[440px] rounded-t-[22px] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_-12px_rgba(16,24,40,0.28)] sm:rounded-[20px] sm:px-5 sm:pb-5 sm:pt-4 sm:shadow-[0_24px_64px_-24px_rgba(16,24,40,0.45)]",
          "transition-[translate,opacity,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          open ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full opacity-100 sm:translate-y-0 sm:scale-[0.97] sm:opacity-0",
        )}
        data-photo-crop-panel=""
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#e3e5e9] sm:hidden" aria-hidden />
        <p className="text-center text-[15px] font-semibold text-[#1a1a2e]">Place your photo</p>
        <p className="mt-0.5 text-center text-[13px] text-[#6b7280]">
          <span className="pointer-fine:hidden">Drag to move, pinch to zoom</span>
          <span className="hidden pointer-fine:inline">Drag to move, scroll to zoom</span>
        </p>

        {/* The stage: the picture under the circle, the ground outside it dimmed. */}
        <div
          ref={stageRef}
          tabIndex={0}
          aria-label="Photo. Arrow keys move it, plus and minus zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative mx-auto mt-3 aspect-square w-full max-w-[360px] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#14161b] outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2"
          data-photo-crop-stage=""
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none will-change-transform"
            style={{ width: bitmap.width * base, height: bitmap.height * base, transform: "translate(-50%, -50%)" }}
            data-photo-crop-image=""
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_9999px_rgba(15,17,23,0.55)] ring-[1.5px] ring-white/85"
            style={{ width: circle, height: circle }}
            data-photo-crop-circle=""
          />
        </div>

        {/* Zoom: the slider, with a step either side for a thumb. */}
        <div className="mx-auto mt-3 flex max-w-[360px] items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => set({ ...view.current, zoom: view.current.zoom / 1.15 })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#4b5563] transition-colors pointer-fine:hover:bg-[#f3f4f6] active:bg-[#eceef1]">
            <Minus className="h-4 w-4" strokeWidth={2} />
          </button>
          <input
            ref={sliderRef}
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            defaultValue={1}
            aria-label="Zoom"
            onInput={(e) => set({ ...view.current, zoom: Number((e.target as HTMLInputElement).value) })}
            className="h-10 min-w-0 flex-1 cursor-pointer accent-[#1a1a2e]"
            data-photo-crop-zoom=""
          />
          <button type="button" aria-label="Zoom in" onClick={() => set({ ...view.current, zoom: view.current.zoom * 1.15 })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#4b5563] transition-colors pointer-fine:hover:bg-[#f3f4f6] active:bg-[#eceef1]">
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mx-auto mt-3 flex max-w-[360px] gap-2">
          <button type="button" onClick={cancel} disabled={saving} className={cn(secondaryDepth, "h-11 flex-1 rounded-xl text-[15px]")} data-photo-crop-cancel="">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.24)] transition-colors duration-100 pointer-fine:hover:bg-[#25253d] active:bg-[#12121f] disabled:opacity-70"
            data-photo-crop-save=""
          >
            Use photo
          </button>
        </div>
      </div>
    </div>
  )
}
