"use client"

/**
 * ===========================================================================
 *  A GRADIENT YOU MAKE BY TOUCHING IT
 * ===========================================================================
 * This was a preview, two range sliders and a grid of preset rectangles: a
 * number to aim at for the angle, a number to aim at for each stop, and a
 * row of tabs to start from. Every one of those is a control you operate by
 * looking somewhere other than the thing you are changing, and on a phone a
 * range input inside a bottom sheet is a thumb-width target that fights the
 * sheet for the same gesture.
 *
 * What is here instead is the gradient, at the size of a thumb, with its
 * colours sitting on it where they are. Drag one and it moves. Tap one and
 * the colour picker every other colour in the panel uses opens on it. The
 * direction is a dial you point rather than a track you aim at, and it
 * clicks onto the four square angles so "straight down" is not a thing you
 * have to land on exactly.
 *
 * What it saves is still the CSS string, so nothing downstream changes and a
 * gradient typed by hand before this existed opens here intact. The parser
 * reads the shape this control writes and the shape the presets and older
 * hand-typed values had. A string it cannot read is kept as it is and shown
 * as such, never replaced with a guess.
 */
import { useCallback, useEffect, useRef, useState } from "react"
/* Imported by name. This file does not import React itself, and the editor
   has been taken down once by a `React.` spelling that TypeScript accepted
   (see tests/react-binding.test.ts). */
import type { PointerEvent as ReactPointerEvent } from "react"
import { Minus, Plus, RotateCw } from "lucide-react"
import { ColorChip } from "./color-chip"
import { useFrameCommit } from "./use-frame-commit"
import { liveGesture } from "@/lib/website-builder/live-settings"
import { tt } from "@/lib/i18n/text"

export interface GradientStop {
  color: string
  /** 0 to 100. */
  at: number
}

export interface Gradient {
  angle: number
  stops: GradientStop[]
}

const MAX_STOPS = 4
const MIN_STOPS = 2

const DEFAULT: Gradient = {
  angle: 135,
  stops: [
    { color: "#0f172a", at: 0 },
    { color: "#4c1d95", at: 100 },
  ],
}

export const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { get label() { return tt("Dusk") }, value: "linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)" },
  { get label() { return tt("Sunrise") }, value: "linear-gradient(135deg, #fde68a 0%, #f472b6 100%)" },
  { get label() { return tt("Ocean") }, value: "linear-gradient(160deg, #0ea5e9 0%, #1e3a8a 100%)" },
  { get label() { return tt("Mist") }, value: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)" },
  { get label() { return tt("Ember") }, value: "linear-gradient(120deg, #7c2d12 0%, #f97316 100%)" },
  { get label() { return tt("Forest") }, value: "linear-gradient(150deg, #052e16 0%, #16a34a 100%)" },
  { get label() { return tt("Slate") }, value: "linear-gradient(180deg, #0f172a 0%, #334155 100%)" },
  { get label() { return tt("Rose") }, value: "linear-gradient(135deg, #fecdd3 0%, #be123c 100%)" },
]

/** `linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)` → a Gradient, or null. */
export function parseGradient(value: string): Gradient | null {
  const m = value.trim().match(/^linear-gradient\((.*)\)$/i)
  if (!m) return null
  /* Split on commas that are not inside parentheses, so `rgb(1, 2, 3)`
     survives as one stop. */
  const parts: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of m[1]) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = "" } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  if (parts.length < 2) return null

  let angle = 180
  let rest = parts
  const first = parts[0]
  const deg = first.match(/^(-?\d+(?:\.\d+)?)deg$/)
  if (deg) {
    angle = ((Number(deg[1]) % 360) + 360) % 360
    rest = parts.slice(1)
  } else if (/^to\s+/.test(first)) {
    const dir = first.replace(/^to\s+/, "").trim()
    const map: Record<string, number> = {
      top: 0, "top right": 45, "right top": 45, right: 90, "bottom right": 135, "right bottom": 135,
      bottom: 180, "bottom left": 225, "left bottom": 225, left: 270, "top left": 315, "left top": 315,
    }
    if (!(dir in map)) return null
    angle = map[dir]
    rest = parts.slice(1)
  }

  const stops: GradientStop[] = []
  for (let i = 0; i < rest.length; i++) {
    const sm = rest[i].match(/^(.+?)(?:\s+(-?\d+(?:\.\d+)?)%)?$/)
    if (!sm) return null
    const color = sm[1].trim()
    if (!color) return null
    const at = sm[2] !== undefined
      ? Math.max(0, Math.min(100, Number(sm[2])))
      : rest.length === 1 ? 0 : Math.round((i / (rest.length - 1)) * 100)
    stops.push({ color, at })
  }
  if (stops.length < MIN_STOPS) return null
  return { angle, stops: stops.slice(0, MAX_STOPS) }
}

export function serializeGradient(g: Gradient): string {
  const stops = [...g.stops].sort((a, b) => a.at - b.at)
  return `linear-gradient(${Math.round(g.angle)}deg, ${stops.map((s) => `${s.color} ${Math.round(s.at)}%`).join(", ")})`
}

/**
 * ===========================================================================
 *  THE DIRECTION IS A NUMBER YOU TAP, NOT A DIAL YOU AIM AT
 * ===========================================================================
 * It was a dial: touch anywhere in a circle and the gradient points there.
 * Precise, and nobody wanted it. A gradient's direction has eight answers
 * that matter and 352 that do not, so this is one button that steps through
 * the eight and says which one it is on. One tap, no aiming, no second
 * gesture competing with the sheet, and it reads at a glance.
 */
const TURN_BY = 45

/**
 * Said in words, in the order the angles run: 0deg is up, and CSS counts
 * clockwise. "Down" rather than "180 degrees", because nobody pictures a
 * number and everybody pictures a direction.
 */
const DIRECTION_NAME = ["Up", "Up right", "Right", "Down right", "Down", "Down left", "Left", "Up left"]

/** How near the track a press has to be, as a share of it, to take a stop. */
const GRAB_WITHIN = 12

/**
 * The handle's size, used by BOTH the drawing and the arithmetic.
 *
 * A stop at 0% drawn at `left: 0` with the usual centring is half outside
 * the track, and the track has to clip to keep its rounded corners — so the
 * first and last colours were two half-moons stuck to the edges. The travel
 * is inset by half a handle at each end instead, which is the same thing
 * every real slider does. Computed once here because the press that grabs a
 * handle has to land on the same scale the handle is drawn on; two readings
 * of one number is where this sort of thing goes wrong.
 */
const HANDLE = 22
const HALF = HANDLE / 2

export function GradientEditor({
  value,
  onChange,
  existing = [],
}: {
  value: string
  onChange: (css: string) => void
  /** Colours already in the scheme, offered by the chip. */
  existing?: string[]
}) {
  const [unreadable] = useState(() => !!value && !parseGradient(value))

  /**
   * THE GRADIENT BEING EDITED IS HELD HERE, NOT READ BACK FROM THE PROP.
   *
   * `onChange` rewrites a theme setting and repaints the canvas, so it is
   * coalesced to one call a frame (use-frame-commit.ts). That means the prop
   * is always a frame or so behind the finger, and a control that drew
   * itself from it would stutter. It draws from this; the prop is what it
   * loads from, and what it listens to when somebody else changes it.
   */
  const [g, setG] = useState<Gradient>(() => parseGradient(value) ?? DEFAULT)
  const [selected, setSelected] = useState(0)
  const sent = useRef<string | null>(null)
  const { emit, flush } = useFrameCommit(onChange)
  /* A stop dragged along the bar is drawn by the canvas alone and committed once on release (lib/website-builder/live-settings.ts). */
  const [gesture] = useState(liveGesture)
  useEffect(() => () => gesture.end(), [gesture])

  useEffect(() => {
    /* Our own value coming back is not a change. */
    if (sent.current !== null && value === sent.current) return
    sent.current = null
    const parsed = parseGradient(value)
    if (parsed) setG(parsed)
  }, [value])

  const commit = useCallback((next: Gradient) => {
    setG(next)
    const css = serializeGradient(next)
    sent.current = css
    emit(css)
  }, [emit])

  const stops = g.stops
  const index = Math.min(selected, stops.length - 1)
  const stop = stops[index]

  // ── The gradient itself, and the colours sitting on it ──────────────────
  const trackRef = useRef<HTMLDivElement>(null)
  const grabbed = useRef<number | null>(null)

  const atFrom = (clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const usable = r.width - HANDLE
    if (usable <= 0) return 0
    return Math.max(0, Math.min(100, ((clientX - r.left - HALF) / usable) * 100))
  }

  const moveStop = (i: number, at: number) =>
    commit({ ...g, stops: g.stops.map((s, idx) => (idx === i ? { ...s, at } : s)) })

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const at = atFrom(e.clientX)
    let near = 0
    let best = Infinity
    stops.forEach((s, i) => {
      const d = Math.abs(s.at - at)
      if (d < best) { best = d; near = i }
    })
    /**
     * A press away from every colour does nothing. The alternative — the
     * nearest one jumps to your finger — is a gradient you can change by
     * touching the picture of it, which is not what touching a picture
     * means.
     */
    if (best > GRAB_WITHIN) return
    setSelected(near)
    grabbed.current = near
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.begin()
  }

  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (grabbed.current === null) return
    moveStop(grabbed.current, Math.round(atFrom(e.clientX)))
  }

  const endTrack = () => {
    if (grabbed.current === null) return
    grabbed.current = null
    flush()
    gesture.end()
  }

  const turn = () => {
    commit({ ...g, angle: (Math.round(g.angle / TURN_BY) * TURN_BY + TURN_BY) % 360 })
    flush()
  }

  /**
   * THE BAR SHOWS THE COLOURS, NOT THE ANGLE.
   *
   * It used to be drawn at the gradient's real angle, which sounds more
   * honest and is less useful: at 135deg the colour a handle sits on is not
   * the colour under it, so dragging a handle to the middle does not put
   * that colour in the middle of what you can see. The bar is the sequence,
   * left to right, which is the thing the handles are for. What the gradient
   * actually looks like is on the canvas behind the sheet, live, which is a
   * better preview than any swatch.
   */
  const bar = serializeGradient({ ...g, angle: 90 })

  return (
    <div className="space-y-3">
      {/* The colours, in order, at the size of a thumb, with a handle on
          each. Dragging one is dragging the thing you are looking at. */}
      <div
        ref={trackRef}
        data-sheet-no-drag
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={endTrack}
        onPointerCancel={endTrack}
        className="relative h-[72px] w-full touch-none select-none overflow-hidden rounded-xl border border-black/10"
        style={{ background: bar }}
      >
        {stops.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 rounded-full border-[3px] border-white"
            style={{
              height: HANDLE,
              width: HANDLE,
              left: `calc(${HALF}px + (100% - ${HANDLE}px) * ${s.at / 100})`,
              transform: "translate(-50%, -50%)",
              background: s.color,
              boxShadow: i === index
                ? "0 0 0 2px rgba(17,24,39,0.9), 0 1px 4px rgba(0,0,0,0.3)"
                : "0 1px 4px rgba(0,0,0,0.3)",
            }}
          />
        ))}
      </div>

      {unreadable && (
        <p className="text-[12px] leading-snug text-muted-foreground">
          {tt("This gradient was written by hand in a form this control cannot read. It is kept as it is; changing anything below replaces it.")}
        </p>
      )}

      {/* The colour under the handle you last touched, and how many there
          are. One row, because that is all there is to say about a stop. */}
      <div className="flex items-center gap-2">
        <ColorChip
          value={stop.color}
          onChange={(c) => commit({ ...g, stops: g.stops.map((s, idx) => (idx === index ? { ...s, color: c || "#000000" } : s)) })}
          existing={existing}
        />
        <span className="text-[13px] tabular-nums text-muted-foreground">{Math.round(stop.at)}%</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (stops.length <= MIN_STOPS) return
            setSelected(Math.max(0, index - 1))
            commit({ ...g, stops: g.stops.filter((_, idx) => idx !== index) })
          }}
          disabled={stops.length <= MIN_STOPS}
          aria-label={tt("Remove this colour")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (stops.length >= MAX_STOPS) return
            const added = withAddedStop(g)
            setSelected(added.stops.length - 1)
            commit(added)
          }}
          disabled={stops.length >= MAX_STOPS}
          aria-label={tt("Add a colour")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Which way it runs. One button, eight answers, and it says which. */}
      <button
        type="button"
        onClick={turn}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-border px-3 text-[13px] transition-colors hover:bg-muted"
      >
        <span className="text-muted-foreground">{tt("Direction")}</span>
        <span className="flex items-center gap-2 font-medium text-foreground">
          {DIRECTION_NAME[Math.round(g.angle / TURN_BY) % 8]}
          <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>
    </div>
  )
}

/**
 * A new stop goes in the widest gap, in the colour of the stop before it, so
 * adding one changes nothing until it is moved.
 */
function withAddedStop(g: Gradient): Gradient {
  const sorted = [...g.stops].sort((a, b) => a.at - b.at)
  let bestGap = -1
  let at = 50
  let color = sorted[0].color
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].at - sorted[i].at
    if (gap > bestGap) {
      bestGap = gap
      at = Math.round((sorted[i].at + sorted[i + 1].at) / 2)
      color = sorted[i].color
    }
  }
  return { ...g, stops: [...g.stops, { color, at }] }
}
