"use client"

/**
 * ===========================================================================
 *  A SLIDER AND THE NUMBER IT IS ON
 * ===========================================================================
 * The editor's one slider: every padding, gap, size and radius in the
 * sidebar is this control. The probe that measures its frames mounts the
 * same module (scripts/check-slider-drag.mjs).
 *
 * "It should feel smoother when I'm dragging the slider left and right for
 * the padding and all these things."
 *
 * WHAT A DRAG COSTS NOW: NOTHING IN REACT. The Radix slider this replaced
 * was a controlled component, so every `pointermove` was a state update, a
 * render of the slider, and the thumb waited for React to put it where the
 * finger already was. Here the finger writes three things straight to the
 * DOM, once per frame at most:
 *
 *   the thumb     a transform, on a rail as wide as the track less the thumb
 *   the fill      a transform, scaleX from the left
 *   the number    the readout's own text
 *
 * All three are compositor work or a text node, so nothing is laid out while
 * a finger is down. React hears about the drag once, when it ends.
 *
 * WHAT GOES UP TO THE EDITOR goes through useFrameCommit: at most once a
 * frame, and less when the canvas takes longer than a frame to redraw, so a
 * slow page cannot back the drag up behind it. The last value always lands:
 * a release flushes.
 *
 * THE FINGER IS THE SLIDER'S. The pointer is captured, so a drag that leaves
 * the track keeps moving it, and `data-sheet-no-drag` tells the phone sheet
 * not to take the gesture. A touch that starts on the TRACK and goes up or
 * down scrolls the panel instead (`touch-action: pan-y`): the value only
 * moves once the finger has clearly gone sideways, or on a tap. A touch on
 * the thumb is a drag from the first pixel.
 *
 * KEYBOARD. The thumb is a real `role="slider"`: arrows step, Shift or Page
 * keys step by ten, Home and End go to the ends. Every value lands on the
 * schema's step, and the number beside it takes a typed value too.
 *
 * NO HAPTICS. A tick per step crossed sounded right and is not: a drag
 * crosses a lot of steps and you are already watching the number.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useFrameCommit } from "./use-frame-commit"

/** Decimal places in a step, so 0.1 steps do not print 0.30000000000000004. */
function places(step: number): number {
  const s = String(step)
  const dot = s.indexOf(".")
  return dot < 0 ? 0 : s.length - dot - 1
}

/** A raw number onto the scale: clamped, on a step, and printable. */
export function snapToStep(raw: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(raw)) return min
  const clamped = Math.min(max, Math.max(min, raw))
  if (!(step > 0)) return clamped
  const snapped = Math.round((clamped - min) / step) * step + min
  return Math.min(max, Math.max(min, Number(snapped.toFixed(places(step)))))
}

/** Where a value sits along the track, 0 to 1. */
function fraction(value: number, min: number, max: number): number {
  return max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
}

/** How far a finger on the track travels sideways before it is a drag and not a scroll. */
const SIDEWAYS_PX = 4
/** How far it may wander and still be a tap. */
const TAP_PX = 8

export function SliderNumberControl({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  className,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  /** What the slider is for, read by a screen reader. The visible label is the caller's. */
  label?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  /**
   * What React draws. It follows the prop, and it is set once at the end of
   * a drag; DURING a drag the DOM is ahead of it, written directly.
   */
  const [shown, setShown] = useState(value)
  /** The value the DOM is showing right now, drag or no drag. */
  const live = useRef(value)
  /** The number box is being typed in: its text is the person's, not ours. */
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState("")

  const { emit, flush } = useFrameCommit(onChange)
  /** The last value this control sent, so its own echo is not a new value. */
  const sent = useRef<number | null>(null)

  useEffect(() => {
    if (sent.current !== null && value === sent.current) return
    sent.current = null
    live.current = value
    setShown(value)
  }, [value])

  /** The three things a drag moves, written without React. */
  const paint = useCallback(
    (v: number) => {
      const p = fraction(v, min, max)
      if (railRef.current) railRef.current.style.transform = `translate3d(${p * 100}%, 0, 0)`
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`
      thumbRef.current?.setAttribute("aria-valuenow", String(v))
      thumbRef.current?.setAttribute("aria-valuetext", `${v}${unit ?? ""}`)
      if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.value = `${v}${unit ?? ""}`
    },
    [min, max, unit],
  )

  /** A new value from anywhere in this control: drawn now, sent at the frame's pace. */
  const move = useCallback(
    (v: number) => {
      if (v === live.current) return
      live.current = v
      paint(v)
      sent.current = v
      emit(v)
    },
    [emit, paint],
  )

  /** The end of a gesture: what is pending goes, and React catches up once. */
  const settle = useCallback(() => {
    flush()
    setShown(live.current)
  }, [flush])

  /* ── Pointer ─────────────────────────────────────────────────────────── */

  const gesture = useRef<{
    id: number
    x: number
    y: number
    /** Decided: this is a drag of the value. */
    dragging: boolean
    /** A mouse drags from the first press; a finger on the track waits to see which way it goes. */
    immediate: boolean
    /** The track's box and the thumb's size, read once at the start, not per move. */
    left: number
    width: number
    thumb: number
  } | null>(null)
  const frame = useRef(0)
  const pendingX = useRef<number | null>(null)

  const valueAt = useCallback(
    (clientX: number, g = gesture.current) => {
      if (!g || g.width <= 0) return live.current
      /* The thumb's centre travels the track less one thumb, so that is the scale. */
      const span = Math.max(1, g.width - g.thumb)
      const p = (clientX - g.left - g.thumb / 2) / span
      return snapToStep(min + p * (max - min), min, max, step)
    },
    [min, max, step],
  )

  const moveTo = useCallback(
    (clientX: number) => {
      /* One write per frame however many moves the digitizer reports. */
      pendingX.current = clientX
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const x = pendingX.current
        pendingX.current = null
        if (x !== null) move(valueAt(x))
      })
    },
    [move, valueAt],
  )

  const startDrag = (el: HTMLElement, pointerId: number) => {
    const g = gesture.current
    if (!g || g.dragging) return
    g.dragging = true
    try {
      el.setPointerCapture(pointerId)
    } catch {
      /* a pointer that has already gone: the next move simply does not come */
    }
    rootRef.current?.setAttribute("data-dragging", "")
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return
    const track = trackRef.current
    if (!track) return
    const r = track.getBoundingClientRect()
    const onThumb = !!thumbRef.current?.contains(e.target as Node)
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      immediate: e.pointerType === "mouse" || onThumb,
      left: r.left,
      width: r.width,
      thumb: thumbRef.current?.offsetWidth || 18,
    }
    if (gesture.current.immediate) {
      /* A mouse press jumps the thumb there, as every slider does; a thumb press keeps its place. */
      if (e.pointerType === "mouse") e.preventDefault()
      startDrag(e.currentTarget, e.pointerId)
      if (!onThumb) move(valueAt(e.clientX))
      thumbRef.current?.focus({ preventScroll: true })
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.dragging) {
      const dx = Math.abs(e.clientX - g.x)
      const dy = Math.abs(e.clientY - g.y)
      /* Sideways, clearly: a drag. Up or down: a scroll, which the browser already has. */
      if (dx > SIDEWAYS_PX && dx > dy) startDrag(e.currentTarget, e.pointerId)
      else return
    }
    moveTo(e.clientX)
  }

  const end = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    rootRef.current?.removeAttribute("data-dragging")
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    if (g.dragging) {
      /* The last position, not the one before it: it may still be waiting for its frame. */
      if (!cancelled) move(valueAt(pendingX.current ?? e.clientX, g))
      pendingX.current = null
      settle()
      return
    }
    /* A tap on the track: the thumb goes there. */
    if (!cancelled && Math.hypot(e.clientX - g.x, e.clientY - g.y) < TAP_PX) {
      move(valueAt(e.clientX, g))
      settle()
    }
  }

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const big = step * 10
    const at = live.current
    let next: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = at + (e.shiftKey ? big : step)
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = at - (e.shiftKey ? big : step)
    else if (e.key === "PageUp") next = at + big
    else if (e.key === "PageDown") next = at - big
    else if (e.key === "Home") next = min
    else if (e.key === "End") next = max
    if (next === null) return
    e.preventDefault()
    move(snapToStep(next, min, max, step))
    settle()
  }

  /* ── The number ──────────────────────────────────────────────────────── */

  const commitTyped = (raw: string) => {
    const n = Number(raw.replace(unit ?? "", "").replace(/[^0-9.\-]/g, ""))
    if (raw.trim() !== "" && Number.isFinite(n)) {
      move(snapToStep(n, min, max, step))
      settle()
    }
    setTyping(false)
  }

  const p = fraction(shown, min, max)
  const readout = `${shown}${unit ?? ""}`

  return (
    <div ref={rootRef} className={cn("wb-slider flex items-center gap-2.5", className)}>
      {/*
        The hit area is taller than the line. `data-slot` names are the ones
        the phone sheet's stylesheet sizes for a thumb (app/globals.css).
      */}
      <div
        ref={trackRef}
        data-slot="slider"
        data-sheet-no-drag
        className="relative flex-1 min-w-0 h-7 cursor-pointer select-none [touch-action:pan-y] [-webkit-tap-highlight-color:transparent]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => {
          if (gesture.current?.dragging) end(e, false)
        }}
      >
        <div data-slot="slider-track" className="wb-slider-track absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[#e5e7eb]">
          {/* The fill starts under the thumb's centre at the left end, so it never peeks out behind it. */}
          <div
            ref={fillRef}
            data-slot="slider-range"
            className="wb-slider-fill absolute inset-y-0 origin-left rounded-full bg-[#1a1a2e]"
            style={{ transform: `scaleX(${p})` }}
          />
        </div>
        {/* The rail is the track less one thumb: 100% of it is the far end. */}
        <div className="wb-slider-rail pointer-events-none absolute inset-y-0 left-0">
          <div ref={railRef} className="h-full w-full will-change-transform" style={{ transform: `translate3d(${p * 100}%, 0, 0)` }}>
            <div
              ref={thumbRef}
              role="slider"
              tabIndex={0}
              aria-label={label}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={shown}
              aria-valuetext={readout}
              aria-orientation="horizontal"
              data-slot="slider-thumb"
              onKeyDown={onKeyDown}
              className="wb-slider-thumb pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white outline-none"
            />
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="decimal"
        aria-label={label ? `${label}, value` : "Value"}
        className="h-8 w-[58px] shrink-0 rounded-md border border-[#e5e7eb] bg-white px-2 text-center text-xs tabular-nums text-[#1a1a2e] transition-colors focus:border-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-black/5"
        value={typing ? draft : readout}
        onFocus={(e) => {
          setDraft(String(live.current))
          setTyping(true)
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commitTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setTyping(false)
            e.currentTarget.blur()
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault()
            const next = snapToStep(live.current + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? step * 10 : step), min, max, step)
            move(next)
            settle()
            setDraft(String(next))
          }
        }}
      />
    </div>
  )
}
