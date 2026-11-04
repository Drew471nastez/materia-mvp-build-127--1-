"use client"

/**
 * ===========================================================================
 *  A SELECT SETTING: BUTTONS FOR A FEW CHOICES, A DROPDOWN FOR MANY
 * ===========================================================================
 * Every select setting the sidebar draws comes through here: a Storelib
 * theme's schema, an imported theme's settings_schema.json and section
 * schemas, Website settings, and our own panels. One to three options are a
 * segmented control, every choice in view and one press away; four or more
 * are the dropdown. A short list whose words do not fit their segments falls
 * back to the dropdown too (lib/website-builder/choice-shape.ts says why).
 *
 * THE PILL. One white pill behind the words, moved with a transform from the
 * choice it left to the one pressed, so the change reads as one motion and
 * costs the browser a composite and nothing else. Reduced motion: it jumps.
 *
 * THE FIT. Estimated before the first paint, so the server and the first
 * frame agree, then measured: the real labels in the real font
 * (canvas measureText) against the real track, again whenever the track
 * changes width (the phone sheet, a resized sidebar). The measurement is of
 * the text, not of the drawn segments, so switching to the dropdown cannot
 * change the answer and the control never flickers between the two.
 *
 * A radio group to a keyboard and a screen reader: Tab reaches the chosen
 * option, the arrow keys move the choice (round the ends), Home and End go
 * to the first and last.
 */
import * as React from "react"
import { flushSync } from "react-dom"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { useEchoedValue } from "@/components/website-builder/echo-field"
import { choiceShape, labelsFit, stepChoice, type ChoiceOption, type ChoiceShape } from "@/lib/website-builder/choice-shape"
import { SELECT } from "./styles"

export const PILL_MS = 220
const PILL_EASE = "cubic-bezier(0.2, 0, 0, 1)"

let canvas: HTMLCanvasElement | null = null
function measure(labels: string[], font: string): number[] | null {
  try {
    canvas ??= document.createElement("canvas")
    const g = canvas.getContext("2d")
    if (!g) return null
    g.font = font
    return labels.map((l) => g.measureText(l).width)
  } catch {
    return null
  }
}

/* The font a control's labels are drawn in, read once per kind of control and screen size: every select in the sidebar shares one. */
const fonts = new Map<string, string>()
function fontOf(el: HTMLElement): string {
  const key = `${el.className}|${typeof window !== "undefined" && window.innerWidth < 640 ? "sm" : ""}`
  let font = fonts.get(key)
  if (!font) {
    const cs = getComputedStyle(el)
    font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    fonts.set(key, font)
  }
  return font
}

/** Buttons or a dropdown for these options, measured against the element once it is on screen. */
function useShape(options: readonly ChoiceOption[], ref: React.RefObject<HTMLElement | null>): ChoiceShape {
  const estimate = choiceShape(options)
  const [shape, setShape] = React.useState<ChoiceShape>(estimate)
  const now = React.useRef(shape)
  now.current = shape
  const labels = options.map((o) => o.label).join("\u0000")
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (options.length < 1 || options.length > 3) {
      setShape("dropdown")
      return
    }
    /*
      MEASURED BY THE OBSERVER, NOT READ IN THE EFFECT (round 44). Each
      control read its width here, in a layout effect, and a control whose
      shape changed rendered again before the next one read: a section with
      a dozen selects opening was a dozen layouts of the whole editor, 425ms
      of a four section walk at a quarter speed (scripts/check-editor-perf.mjs
      PART=smooth, PROFILE=select, "decide"). The observer hands every
      control its width after the one layout, before the first paint; a shape
      that changes is drawn then, still before that paint, so nothing flickers.
    */
    const decide = (entries: readonly ResizeObserverEntry[]) => {
      const width = entries.length ? entries[entries.length - 1].contentRect.width : el.clientWidth
      if (!width) return
      const widths = measure(options.map((o) => o.label), fontOf(el))
      const next: ChoiceShape = widths ? (labelsFit(widths, width) ? "segments" : "dropdown") : choiceShape(options, width)
      if (next !== now.current) flushSync(() => setShape(next))
    }
    if (typeof ResizeObserver === "undefined") {
      decide([])
      return
    }
    const ro = new ResizeObserver(decide)
    ro.observe(el)
    return () => ro.disconnect()
  }, [labels, options.length])
  return shape
}

export function ChoiceControl({
  value,
  onChange,
  options: given,
  label,
  echo = true,
  className,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  options: readonly ChoiceOption[]
  /** What the setting is called, for a screen reader; the panel prints it. */
  label?: string
  /** The choice moves in its own frame and the editor follows in a transition (echo-field.ts). Off where the owner keeps its own state. */
  echo?: boolean
  className?: string
} & { [data: `data-${string}`]: string | undefined }) {
  /* A theme's schema is data: an option written without a label is named by its value, and a number is a string here as it is when saved. */
  const options = given.map((o) => ({ value: String(o.value ?? ""), label: String(o.label ?? o.value ?? "") }))
  const [echoed, setEchoed] = useEchoedValue(value, onChange)
  const shown = echo ? echoed : value
  const choose = echo ? setEchoed : onChange
  const box = React.useRef<HTMLDivElement>(null)
  const shape = useShape(options, box)

  return (
    <div ref={box} data-choice-control={shape} className={cn("text-[12.5px] font-medium max-sm:text-sm", className)} {...rest}>
      {shape === "segments" ? (
        <Segments value={shown} options={options} label={label} onChoose={choose} />
      ) : (
        <div className="relative">
          <select aria-label={label} className={cn(SELECT, "font-normal")} value={shown} onChange={(e) => choose(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {/* A saved value the schema no longer lists stays visible rather than turning into the first option. */}
            {shown && !options.some((o) => o.value === shown) && <option value={shown}>{shown}</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function Segments({
  value,
  options,
  label,
  onChoose,
}: {
  value: string
  options: readonly ChoiceOption[]
  label?: string
  onChoose: (v: string) => void
}) {
  const at = options.findIndex((o) => o.value === value)
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const n = options.length

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = stepChoice(n, at, e.key)
    if (next === null) return
    e.preventDefault()
    onChoose(options[next].value)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-segments=""
      className="relative grid rounded-lg bg-[#f1f2f4] p-[3px]"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {/* The pill: one element, moved by a transform. Hidden while the saved value is none of these. */}
      <span
        aria-hidden
        data-segment-pill=""
        className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] rounded-md bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)] motion-reduce:!transition-none"
        style={{
          width: `calc((100% - 6px) / ${n})`,
          transform: `translate3d(${Math.max(0, at) * 100}%, 0, 0)`,
          opacity: at < 0 ? 0 : 1,
          transition: `transform ${PILL_MS}ms ${PILL_EASE}`,
        }}
      />
      {options.map((o, i) => {
        const on = i === at
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
            data-segment={o.value}
            onClick={() => {
              if (!on) onChoose(o.value)
            }}
            title={o.label}
            className={cn(
              "relative z-[1] h-7 min-w-0 truncate rounded-md px-2 text-center transition-colors duration-150 max-sm:h-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15",
              on ? "text-[#111827]" : "text-[#6b7280] hover:text-[#111827]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
