"use client"

/**
 * ===========================================================================
 *  A GRADIENT YOU CAN SEE WHILE YOU MAKE IT
 * ===========================================================================
 * The gradient control was four presets and a text field holding
 * `linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)`. That is a control for
 * somebody who already knows the syntax, and it shows nothing while they
 * type: a wrong comma is a gradient that silently becomes no gradient.
 *
 * This is the control the reference builders have: a preview that is the
 * gradient itself, a direction you turn, and stops you add, move and colour
 * with the same picker every other colour in the panel uses. What it saves
 * is still the CSS string, so nothing downstream changes and a gradient
 * typed by hand before this existed opens here intact.
 *
 * The parser reads the shape this control writes and the shape the presets
 * and older hand-typed values had. A string it cannot read is kept as it is
 * and shown as such, never replaced with a guess.
 */
import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColorChip } from "./color-chip"

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
  { label: "Dusk", value: "linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)" },
  { label: "Sunrise", value: "linear-gradient(135deg, #fde68a 0%, #f472b6 100%)" },
  { label: "Ocean", value: "linear-gradient(160deg, #0ea5e9 0%, #1e3a8a 100%)" },
  { label: "Mist", value: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)" },
  { label: "Ember", value: "linear-gradient(120deg, #7c2d12 0%, #f97316 100%)" },
  { label: "Forest", value: "linear-gradient(150deg, #052e16 0%, #16a34a 100%)" },
  { label: "Slate", value: "linear-gradient(180deg, #0f172a 0%, #334155 100%)" },
  { label: "Rose", value: "linear-gradient(135deg, #fecdd3 0%, #be123c 100%)" },
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
  const parsed = useMemo(() => parseGradient(value), [value])
  const [unreadable] = useState(() => !!value && !parseGradient(value))
  const g = parsed ?? DEFAULT

  const commit = (next: Gradient) => onChange(serializeGradient(next))
  const setStop = (i: number, patch: Partial<GradientStop>) =>
    commit({ ...g, stops: g.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })

  const addStop = () => {
    if (g.stops.length >= MAX_STOPS) return
    /* Between the two widest-apart neighbours, in the colour of the one
       before it, so a new stop changes nothing until it is moved. */
    const sorted = [...g.stops].sort((a, b) => a.at - b.at)
    let bestGap = -1
    let at = 50
    let color = sorted[0].color
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].at - sorted[i].at
      if (gap > bestGap) { bestGap = gap; at = Math.round((sorted[i].at + sorted[i + 1].at) / 2); color = sorted[i].color }
    }
    commit({ ...g, stops: [...g.stops, { color, at }] })
  }

  const removeStop = (i: number) => {
    if (g.stops.length <= MIN_STOPS) return
    commit({ ...g, stops: g.stops.filter((_, idx) => idx !== i) })
  }

  const css = serializeGradient(g)

  return (
    <div className="space-y-3">
      {/* The gradient itself, as the preview. The stops are drawn along its
          bottom edge where they are, so moving one is moving the thing you
          are looking at. */}
      <div className="relative h-16 w-full overflow-hidden rounded-lg border border-border" style={{ background: css }}>
        {g.stops.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute bottom-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ left: `${s.at}%`, background: s.color }}
          />
        ))}
      </div>

      {unreadable && (
        <p className="text-[12px] text-muted-foreground leading-snug">
          This gradient was written by hand in a form this control cannot read. It is kept as it is; changing anything below replaces it.
        </p>
      )}

      {/* Direction. A dial the eye can read, with the number beside it. */}
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted-foreground w-16 shrink-0">Direction</span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(g.angle)}
          onChange={(e) => commit({ ...g, angle: Number(e.target.value) })}
          className="flex-1 accent-[#1a1a2e]"
          aria-label="Gradient direction"
        />
        <span className="relative h-6 w-6 shrink-0 rounded-full border border-border" aria-hidden>
          <span
            className="absolute left-1/2 top-1/2 h-[9px] w-[2px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-[#1a1a2e]"
            style={{ transform: `translate(-50%, -100%) rotate(${g.angle}deg)`, transformOrigin: "50% 100%" }}
          />
        </span>
        <span className="w-10 text-right text-[12px] tabular-nums text-muted-foreground">{Math.round(g.angle)}°</span>
      </div>

      {/* The stops: a colour and where it sits. */}
      <div className="space-y-2">
        {g.stops.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <ColorChip value={s.color} onChange={(c) => setStop(i, { color: c || "#000000" })} existing={existing} />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(s.at)}
              onChange={(e) => setStop(i, { at: Number(e.target.value) })}
              className="flex-1 accent-[#1a1a2e]"
              aria-label={`Stop ${i + 1} position`}
            />
            <span className="w-9 text-right text-[12px] tabular-nums text-muted-foreground">{Math.round(s.at)}%</span>
            <button
              type="button"
              onClick={() => removeStop(i)}
              disabled={g.stops.length <= MIN_STOPS}
              aria-label={`Remove stop ${i + 1}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {g.stops.length < MAX_STOPS && (
          <button
            type="button"
            onClick={addStop}
            className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a colour
          </button>
        )}
      </div>

      {/* Starting points. Choosing one is a starting point, not a lock: the
          controls above then edit it. */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start from</p>
        <div className="grid grid-cols-4 gap-1.5">
          {GRADIENT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              title={p.label}
              onClick={() => onChange(p.value)}
              className={cn(
                "h-8 rounded-md border-2 transition-colors",
                value === p.value ? "border-[#1a1a2e]" : "border-transparent hover:border-neutral-300",
              )}
              style={{ background: p.value }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
