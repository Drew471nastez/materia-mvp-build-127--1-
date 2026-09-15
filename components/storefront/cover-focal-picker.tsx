"use client"

/**
 * ===========================================================================
 *  WHERE THE COVER SITS IN ITS BAND
 * ===========================================================================
 * A cover is uploaded at whatever shape the camera produced and drawn into a
 * 3:1 strip, so most of it is cropped away. Which part survives was decided
 * by `object-position: 50% 50%` and nothing else — the middle, which for a
 * photograph of a person is usually their chest.
 *
 * `coverFocalPoint` already existed and was already applied. What was missing
 * was any way to set it. This is that: drag the picture and the band follows.
 *
 * IT SHOWS THE REAL CROP, not a diagram of one. The box is the same 3:1 the
 * page draws, with the same object-fit, so what is in this box is what will
 * be on the page. A control that previews an approximation of the crop is a
 * control you have to save and check.
 */
import * as React from "react"
import { Move } from "lucide-react"

export interface FocalPoint {
  x: number
  y: number
}

export function CoverFocalPicker({
  src,
  value,
  onChange,
}: {
  src: string
  value?: FocalPoint | null
  onChange: (next: FocalPoint) => void
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const point = value ?? { x: 50, y: 50 }

  /*
    The picture moves the OPPOSITE way to the finger, because what is being
    dragged is the image behind a window, not the window. Dragging down should
    bring what is above into view, which means the focal point moves up.
  */
  const applyFromDelta = (dx: number, dy: number, from: FocalPoint) => {
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const next = {
      x: Math.round(Math.min(100, Math.max(0, from.x - (dx / rect.width) * 100))),
      y: Math.round(Math.min(100, Math.max(0, from.y - (dy / rect.height) * 100))),
    }
    if (next.x !== point.x || next.y !== point.y) onChange(next)
  }

  const start = React.useRef<{ x: number; y: number; from: FocalPoint } | null>(null)

  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          start.current = { x: event.clientX, y: event.clientY, from: point }
          setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
          event.preventDefault()
        }}
        onPointerMove={(event) => {
          const from = start.current
          if (!from) return
          applyFromDelta(event.clientX - from.x, event.clientY - from.y, from.from)
        }}
        onPointerUp={(event) => {
          start.current = null
          setDragging(false)
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            /* Already released; nothing to do. */
          }
        }}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
        }}
        /* touch-none, or the browser scrolls the sheet instead of moving the
           picture, and the control does nothing at all on a phone. */
        className="relative aspect-[3/1] w-full touch-none select-none overflow-hidden rounded-lg bg-muted"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
          style={{ objectPosition: `${point.x}% ${point.y}%` }}
        />

        {/* The affordance, and it gets out of the way while you use it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150"
          style={{ opacity: dragging ? 0 : 1 }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            <Move className="h-3.5 w-3.5" />
            Drag to position
          </span>
        </span>
      </div>

      {/*
        The keyboard way in. A drag is unreachable without a pointer, and this
        control decides what a visitor sees first on the page.
      */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {point.x}% across, {point.y}% down
        </span>
        <button
          type="button"
          onClick={() => onChange({ x: 50, y: 50 })}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Centre
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={point.y}
        aria-label="Cover vertical position"
        onChange={(event) => onChange({ x: point.x, y: Number(event.target.value) })}
        className="w-full accent-foreground"
      />
    </div>
  )
}
