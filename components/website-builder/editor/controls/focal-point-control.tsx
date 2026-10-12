"use client"

/**
 * ===========================================================================
 *  WHERE THE PICTURE SHOULD STAY IN VIEW
 * ===========================================================================
 * The control for `focal_point`. A wide hero cropped to a phone keeps its
 * middle, and the middle is often a wall: the face was on the left. This is
 * the picture itself with a point on it; press anywhere to move the point
 * there, or drag it. Arrow keys move it by one percent, and ten with Shift,
 * so it can be set without a pointer at all.
 *
 * The picture is the section's own, read from the setting this one names in
 * its `image` key. With no picture chosen yet there is nothing to point at,
 * and it says so.
 *
 * The point moves on the compositor (a transform), and the value is sent
 * once a frame at most while dragging, so the canvas redraws at the speed a
 * finger moves rather than at the speed of pointer events.
 */
import * as React from "react"

import { cleanFocalPoint } from "@/lib/storelib-theme/values"
import { NOTE, TEXT_BUTTON } from "./styles"
import { useSiblingSettings } from "./context"
import { tt } from "@/lib/i18n/text"

function parts(v: string): [number, number] {
  const m = cleanFocalPoint(v).match(/^([\d.]+)% ([\d.]+)%$/)
  return m ? [Number(m[1]), Number(m[2])] : [50, 50]
}

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)))

export function FocalPointControl({
  value,
  onChange,
  imageSetting,
  label,
}: {
  value: string
  onChange: (v: string) => void
  /** The id of the picture setting beside this one. */
  imageSetting?: string
  label?: string
}) {
  const siblings = useSiblingSettings()
  const image = imageSetting && typeof siblings?.[imageSetting] === "string" ? String(siblings[imageSetting]) : ""
  const [point, setPoint] = React.useState<[number, number]>(() => parts(value))
  const box = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef(0)
  const pending = React.useRef<string | null>(null)

  React.useEffect(() => { setPoint(parts(value)) }, [value])

  const send = React.useCallback((x: number, y: number) => {
    pending.current = `${x}% ${y}%`
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (pending.current) onChange(pending.current)
    })
  }, [onChange])
  React.useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /*
    THE BOX'S SIZE, IN TWO CUSTOM PROPERTIES, so the point's move is a
    transform rather than a left and a top. Observed, because the picture
    loads after the box is drawn and the sidebar can be resized by hand.
  */
  React.useLayoutEffect(() => {
    const b = box.current
    if (!b || typeof ResizeObserver === "undefined") return
    const set = () => {
      b.style.setProperty("--fw", `${b.clientWidth}px`)
      b.style.setProperty("--fh", `${b.clientHeight}px`)
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(b)
    return () => ro.disconnect()
  }, [image])

  const fromEvent = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return
    const x = clamp(((e.clientX - r.left) / r.width) * 100)
    const y = clamp(((e.clientY - r.top) / r.height) * 100)
    setPoint([x, y])
    send(x, y)
  }

  if (!image) {
    return <p className={NOTE}>{tt("Choose a picture first, then mark the part of it that should stay in view.")}</p>
  }

  const [x, y] = point
  return (
    <div className="space-y-1.5">
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label={label ?? tt("Focus")}
        aria-valuetext={tt("{x}% from the left, {y}% from the top", { x, y })}
        aria-valuenow={x}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative w-full select-none overflow-hidden rounded-lg border border-border bg-muted touch-none cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromEvent(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromEvent(e)
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          const d = move[e.key]
          if (!d) return
          e.preventDefault()
          const nx = clamp(x + d[0])
          const ny = clamp(y + d[1])
          setPoint([nx, ny])
          send(nx, ny)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" draggable={false} decoding="async" className="block max-h-[200px] w-full object-contain pointer-events-none" />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.3)] will-change-transform"
          style={{ transform: `translate(calc(${x / 100} * var(--fw, 0px) - 50%), calc(${y / 100} * var(--fh, 0px) - 50%))` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className={NOTE}>{tt("{x}% across, {y}% down", { x, y })}</p>
        {(x !== 50 || y !== 50) && (
          <button type="button" className={TEXT_BUTTON} onClick={() => { setPoint([50, 50]); onChange("50% 50%") }}>
            {tt("Centre")}
          </button>
        )}
      </div>
    </div>
  )
}
