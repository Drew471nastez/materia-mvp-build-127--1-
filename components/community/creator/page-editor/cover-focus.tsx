"use client"

/**
 * ===========================================================================
 *  WHAT STAYS IN VIEW WHEN THE COVER IS CROPPED (round 33)
 * ===========================================================================
 * The owner: "allow adjusting the cover's focal position (drag to
 * reposition), used everywhere the cover renders."
 *
 * The cover is shown in a 16:9 frame wherever it is cropped (the side card
 * on the About page, the community card, Explore), so it is moved in one:
 * the picture is drawn exactly as those frames draw it (object-fit: cover at
 * object-position x% y%), and a drag slides it under the frame. A drag of
 * one pixel moves it one pixel: the position changes by the drag over the
 * part of the picture that is outside the frame on that side, so the
 * picture stays under the finger. An axis with nothing outside the frame
 * does not move. The arrow keys move it 2% a press (10% with Shift), and
 * Centre puts it back in the middle. Stored as two whole percentages
 * (lib/communities/page-look.ts).
 */
import * as React from "react"
import { Move } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { buttonSecondary } from "../parts"

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

export function CoverFocus({ url, x, y, onChange }: { url: string; x: number; y: number; onChange: (x: number, y: number) => void }) {
  const frame = React.useRef<HTMLDivElement>(null)
  const img = React.useRef<HTMLImageElement>(null)
  const drag = React.useRef<{ id: number; sx: number; sy: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)

  /* The part of the picture outside the frame, in px, along each axis. */
  const overflow = () => {
    const f = frame.current
    const i = img.current
    if (!f || !i || !i.naturalWidth || !i.naturalHeight) return { ox: 0, oy: 0 }
    const s = Math.max(f.clientWidth / i.naturalWidth, f.clientHeight / i.naturalHeight)
    return { ox: i.naturalWidth * s - f.clientWidth, oy: i.naturalHeight * s - f.clientHeight }
  }

  return (
    <div data-cover-focus="">
      <div
        ref={frame}
        role="slider"
        tabIndex={0}
        aria-label={tt("Cover position")}
        aria-valuetext={tt("{x}% across, {y}% down", { x, y })}
        aria-valuenow={x}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const { ox, oy } = overflow()
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x, y, ox, oy }
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const nx = d.ox > 0 ? d.x - ((e.clientX - d.sx) / d.ox) * 100 : d.x
          const ny = d.oy > 0 ? d.y - ((e.clientY - d.sy) / d.oy) * 100 : d.y
          onChange(clamp(nx), clamp(ny))
        }}
        onPointerUp={(e) => {
          if (drag.current?.id === e.pointerId) drag.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragging(false)
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          const m = move[e.key]
          if (!m) return
          e.preventDefault()
          onChange(clamp(x + m[0]), clamp(y + m[1]))
        }}
        className={cn(
          "group/focus relative aspect-[16/9] w-full touch-none select-none overflow-hidden rounded-xl bg-[#1a1a2e] outline-none shadow-[0_0_0_1px_rgba(16,24,40,0.06)] focus-visible:shadow-[0_0_0_2px_#1a1a2e,0_0_0_6px_rgba(26,26,46,0.10)]",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        data-cover-focus-frame=""
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={optimizedImageUrl(url, 1200)} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} decoding="async" />
        {/* The thirds while it moves, so it is easy to put a face where the eye goes. */}
        <span aria-hidden className={cn("pointer-events-none absolute inset-0 transition-opacity duration-150", dragging ? "opacity-100" : "opacity-0")} style={{ backgroundImage: "linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)), linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))" }} />
        <span aria-hidden className={cn("pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[12px] font-medium text-white transition-opacity duration-150", dragging ? "opacity-0" : "opacity-100")}>
          <Move className="h-3.5 w-3.5" strokeWidth={2} />
          {tt("Drag to move")}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[12.5px] tabular-nums text-[#6b7280]" data-cover-focus-value="">
          {x === 50 && y === 50 ? tt("Centred") : tt("{x}% across, {y}% down", { x, y })}
        </p>
        {x !== 50 || y !== 50 ? (
          <button type="button" onClick={() => onChange(50, 50)} className={cn(buttonSecondary, "h-9 sm:h-8")} data-cover-focus-reset="">
            {tt("Centre")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
