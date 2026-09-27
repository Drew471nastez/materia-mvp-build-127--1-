"use client"

/**
 * ===========================================================================
 *  THE PIECES EVERY ONEPAGE EDITOR PANEL IS BUILT FROM
 * ===========================================================================
 * The Design tab had grown a dozen ways of saying the same few things. A
 * choice was a 2px black border here, a violet ring there, a grey fill with
 * a black border somewhere else; a colour was a square, a text box and a row
 * of circles with a blue ring; a switch was a CSS checkbox with a sliding
 * gradient. The owner asked for the editor to read like Linktree's and like
 * Polaris: calm, white, generous, one way of doing each thing. So these are
 * the only ways, and every panel uses them:
 *
 *   PanelHeader   a sub panel's way back: the app's square with a little
 *                 depth and an arrow, and the panel's name, large. 44px to
 *                 press on a phone.
 *   SectionTitle  a heading inside a panel, with an optional line under it.
 *   NavRow        a row that opens something: a line icon, a name, a grey
 *                 line saying what is there now, and a chevron.
 *   ChoiceCard    one of a few looks to pick from (Fill, Gradient, Classic,
 *                 Hero). Picked is a thin dark border, 1.5px, not a heavy
 *                 black frame and not a violet ring.
 *   Segmented     the same choice for short words (Low, Medium, High), as a
 *                 row of equal buttons.
 *   SettingRow    a label on the left and its control on the right, which is
 *                 how Linktree lays out Profile and Wallpaper. It stacks under
 *                 360px so nothing is squeezed.
 *   Switch        the app's one switch (components/ui/switch-style), with a
 *                 44px place to press.
 *   ColorRow      a SettingRow whose control is the colour field
 *                 (./color-picker).
 *   RangeRow      the builder's slider (dark filled track, its number in a
 *                 box beside it), live under the finger, with stops a
 *                 finger feels.
 *
 * Colours are Storelib's own (#1a1a2e ink, #6b7280 muted, #e3e4e8 hairline),
 * not Linktree's. No transforms: app/globals.css removes transforms inside a
 * `.group` on touch screens. The picked marks below scale with the separate
 * `scale` property, which that rule leaves alone (inside a `.group` on a
 * touch screen they simply appear, without the fade).
 */
import * as React from "react"
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ColorField } from "@/components/onepage/color-picker"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"
import { hapticTap } from "@/lib/native-bridge"
import { ChoiceMark } from "@/components/onepage/choice-marks"

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

/*
  THE WAY BACK IS THE APP'S SQUARE, AND A PRESS IS FELT. It was a flat grey
  circle whose press was a shade of grey a step darker: "it needs a little
  more depth, and when I click it, it needs to feel like I clicked it". It
  is the square the app puts beside a primary now (components/ui/depth-button
  iconDepth: white, a hairline, a 2px shade in its foot and a soft shadow
  under it), with the builder's drill-in back arrow (website-builder
  panel-back). Pressed it dips 6% and goes a step darker with the shade
  inside it, over 120ms, on `scale` and `opacity` only: an overlay fades
  in, the tile's own colours never change. 40px, in a 44px place to press.
  The press is drawn by spans inside the button, as panel-back's is, so the
  phone sheets' rule that clears a button's hover background leaves it be.
*/
const backTile = cn(
  "relative grid h-10 w-10 place-items-center overflow-hidden rounded-[10px] border border-[#d9dbe0] bg-white text-[#1a1a2e]",
  "shadow-[inset_0_-2px_0_rgba(0,0,0,0.07),0_1px_2px_rgba(15,23,42,0.08)]",
  "transition-[scale] duration-[120ms] ease-out group-active/back:scale-[0.94] motion-reduce:transition-none motion-reduce:group-active/back:scale-100",
  "md:h-9 md:w-9 md:rounded-[9px]",
)
const backShade = cn(
  "pointer-events-none absolute inset-0 bg-[#f1f2f4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] opacity-0",
  "transition-opacity duration-[120ms] ease-out group-hover/back:opacity-60 group-active/back:opacity-100",
)

export function PanelHeader({ title, onBack, backLabel = "Back", action }: { title: string; onBack?: () => void; backLabel?: string; action?: React.ReactNode }) {
  return (
    <div data-panel-header="" className="mb-6 flex min-h-11 items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          data-panel-back=""
          className="group/back -ml-0.5 grid h-11 w-11 shrink-0 cursor-pointer select-none place-items-center rounded-[12px] outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]"
        >
          <span aria-hidden data-back-tile="" className={backTile}>
            <span data-back-shade="" className={backShade} />
            <ArrowLeft className="relative h-5 w-5 md:h-[18px] md:w-[18px]" strokeWidth={2} />
          </span>
        </button>
      ) : null}
      <h2 className="min-w-0 flex-1 truncate text-[24px] font-bold tracking-[-0.015em] text-[#1a1a2e] sm:text-[26px]">{title}</h2>
      {action}
    </div>
  )
}

export function SectionTitle({ title, description, className, right }: { title: string; description?: string; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h3>
        {description ? <p className="mt-0.5 text-[14px] text-[#6b7280]">{description}</p> : null}
      </div>
      {right}
    </div>
  )
}

/** Space between the sections of a panel, with a hairline between them. */
export function PanelSection({ children, className, divided = true }: { children: React.ReactNode; className?: string; divided?: boolean }) {
  return <section className={cn("py-6 first:pt-0 last:pb-0", divided && "border-t border-[#eef0f2] first:border-t-0", className)}>{children}</section>
}

export function NavRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  trailing,
  dataKey,
}: {
  icon?: LucideIcon
  title: string
  subtitle?: React.ReactNode
  onClick: () => void
  /** Drawn before the chevron: a swatch, a count. */
  trailing?: React.ReactNode
  dataKey?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-row={dataKey}
      className={cn(
        "-mx-3 flex min-h-[64px] w-[calc(100%+24px)] cursor-pointer items-center gap-4 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]",
        focusRing,
      )}
    >
      {Icon ? <Icon aria-hidden className="h-[22px] w-[22px] shrink-0 text-[#1a1a2e]" strokeWidth={1.6} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-[1.3] text-[#1a1a2e]">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[13.5px] leading-[1.35] text-[#6b7280]">{subtitle}</span> : null}
      </span>
      {trailing}
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.75} />
    </button>
  )
}

/** The border a picked card wears: dark and thin (1px border plus a 0.5px ring, so 1.5px, with no layout shift). */
export const choiceOn = "border-[#1a1a2e] shadow-[0_0_0_0.5px_#1a1a2e]"
export const choiceOff = "border-[#e3e4e8] hover:border-[#c9cbd1]"

/* The picked marks (a card's dark border, a swatch's ring, a check, a chip's fill), faded and scaled in and out. */
export { ChoiceMark, SwatchMark, CheckMark, ChipFill } from "@/components/onepage/choice-marks"

export function ChoiceCard({
  selected,
  onClick,
  label,
  children,
  disabled,
  className,
  badge,
  title,
}: {
  selected: boolean
  onClick: () => void
  label: string
  /** The picture above the name. */
  children?: React.ReactNode
  disabled?: boolean
  className?: string
  /** A small mark in the corner (Pro, New). */
  badge?: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={title}
      data-choice={label}
      className={cn(
        "relative flex min-h-11 cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-2 text-center transition-[border-color] duration-150 [-webkit-tap-highlight-color:transparent]",
        focusRing,
        choiceOff,
        disabled && "cursor-not-allowed opacity-45 hover:border-[#e3e4e8]",
        className,
      )}
    >
      {children}
      <span className={cn("block truncate px-1 text-[13px] font-medium transition-colors duration-[180ms]", children ? "pb-1 pt-2" : "py-1.5", selected ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{label}</span>
      {badge ? <span className="absolute right-2 top-2">{badge}</span> : null}
      <ChoiceMark on={selected} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T
  options: readonly { id: T; label: string; hint?: string }[]
  onChange: (id: T) => void
  className?: string
  /** For a screen reader. */
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            data-segment={o.id}
            className={cn(
              "relative flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border bg-white px-2 py-2 text-[13px] font-medium transition-[border-color] duration-150 [-webkit-tap-highlight-color:transparent]",
              focusRing,
              choiceOff,
            )}
          >
            <span className={cn("max-w-full truncate transition-colors duration-[180ms]", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{o.label}</span>
            {o.hint ? <span className="mt-0.5 max-w-full truncate text-[11.5px] font-normal text-[#6b7280]">{o.hint}</span> : null}
            <ChoiceMark on={on} />
          </button>
        )
      })}
    </div>
  )
}

export function SettingRow({
  label,
  description,
  children,
  className,
  stackOnPhone = false,
}: {
  label: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** A wide control (a slider, a text box) goes under its label on a phone. */
  stackOnPhone?: boolean
}) {
  return (
    <div className={cn("flex min-h-11 gap-x-4 gap-y-2", stackOnPhone ? "flex-col sm:flex-row sm:items-center" : "flex-wrap items-center", className)}>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-[#1a1a2e]">{label}</p>
        {description ? <p className="mt-0.5 text-[13.5px] leading-[1.4] text-[#6b7280]">{description}</p> : null}
      </div>
      <div className={cn("flex shrink-0 items-center gap-2", stackOnPhone && "w-full sm:w-auto")}>{children}</div>
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-switch=""
      /* The track is 38 by 22; the place to press is 44 by 44. */
      className={cn("-my-[11px] -mr-[3px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]", focusRing)}
    >
      <span aria-hidden className={switchTrack(checked)}>
        <span className={switchKnob(checked)} />
      </span>
    </button>
  )
}

export function SwitchRow({ label, description, checked, onChange, disabled, extra }: { label: string; description?: React.ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; extra?: React.ReactNode }) {
  return (
    <SettingRow label={label} description={description}>
      {extra}
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </SettingRow>
  )
}

export function ColorRow({
  label,
  description,
  value,
  onChange,
  suggestions,
  emptyLabel,
  fallback,
  onClear,
}: {
  label: string
  description?: React.ReactNode
  value: string | null | undefined
  onChange: (hex: string) => void
  suggestions?: string[]
  /** The field says this when there is no colour of its own (it follows the theme). */
  emptyLabel?: string
  fallback?: string
  /** Offered as "Reset" beside the field when there is a value to clear. */
  onClear?: () => void
}) {
  return (
    <SettingRow label={label} description={description}>
      {onClear && value ? (
        <button type="button" onClick={onClear} className={cn("h-11 cursor-pointer rounded-full px-2 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]", focusRing)}>
          Reset
        </button>
      ) : null}
      <ColorField value={value} onChange={onChange} label={label} suggestions={suggestions} emptyLabel={emptyLabel} fallback={fallback} />
    </SettingRow>
  )
}

/**
 * THE STOPS A FINGER FEELS. The builder's sliders were asked to stop tapping
 * once per step, because a drag crosses dozens of steps and the taps ran into
 * each other. The OnePage's sliders were asked to answer the finger. So they
 * tap at stops, not steps: every step when there are sixteen or fewer (a
 * border of 0 to 4px, corners in 2px), every tenth of the track when there
 * are more, a firmer one at either end, never closer than 40ms apart, and
 * only for a finger (lib/native-bridge hapticTap, the Taptic Engine in the
 * app, `vibrate` where a browser has it). A mouse and the keyboard get none.
 */
function useSliderStops(min: number, max: number, step: number) {
  const touch = React.useRef(false)
  const last = React.useRef<number | null>(null)
  const tappedAt = React.useRef(0)
  const span = Math.max(step, max - min)
  const steps = Math.round(span / step)
  const stopOf = React.useCallback(
    (v: number) => (steps <= 16 ? Math.round((v - min) / step) : Math.floor(((v - min) / span) * 10 + 1e-6)),
    [min, step, span, steps],
  )
  const arm = React.useCallback((e: React.PointerEvent, value: number) => {
    touch.current = e.pointerType !== "mouse"
    last.current = stopOf(value)
    const off = () => {
      touch.current = false
      window.removeEventListener("pointerup", off)
      window.removeEventListener("pointercancel", off)
    }
    window.addEventListener("pointerup", off)
    window.addEventListener("pointercancel", off)
  }, [stopOf])
  const at = React.useCallback((v: number) => {
    if (!touch.current) return
    const stop = stopOf(v)
    if (stop === last.current) return
    last.current = stop
    const now = performance.now()
    if (now - tappedAt.current < 40) return
    tappedAt.current = now
    hapticTap(v <= min || v >= max ? "light" : "soft")
  }, [stopOf, min, max])
  return { arm, at }
}

/**
 * A SLIDER, THE BUILDER'S OWN (components/website-builder/editor/
 * slider-number-control): the thumb drawn from the control's own state so it
 * stays under the finger, the page told at most once a frame, the release
 * flushed, the number beside it typed or nudged with the arrows, and the
 * sheet kept off its finger. It used to be a native range that wrote the
 * theme on every input event and redrew the preview each time. With the
 * stops above for a finger.
 */
export function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
  ends,
  compact = false,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** Written after the number in its box: "px", "%". */
  unit?: string
  /** Words under each end of the track: "Square", "Round". */
  ends?: [string, string]
  /** The smaller label a block's own settings use. */
  compact?: boolean
}) {
  const stops = useSliderStops(min, max, step)
  const current = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
  return (
    <div data-range-row="" onPointerDownCapture={(e) => stops.arm(e, current)}>
      <p className={cn("font-medium text-[#1a1a2e]", compact ? "mb-1 text-[13px]" : "mb-1.5 text-[15px]")}>{label}</p>
      <div className="flex min-h-11 items-center">
        <SliderNumberControl className="w-full" value={current} onChange={onChange} onLiveChange={stops.at} min={min} max={max} step={step} unit={unit} />
      </div>
      {ends ? (
        <div className="flex justify-between pr-[68px] text-[12.5px] text-[#6b7280]">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
    </div>
  )
}

/** A small mark for a paid feature, as Linktree's bolt: a dark circle with a lightning bolt. */
export function ProMark({ title = "Pro" }: { title?: string }) {
  return (
    <span title={title} aria-label={title} className="grid h-5 w-5 place-items-center rounded-full bg-[#1a1a2e]/80 text-white">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </span>
  )
}

/** The text box every panel uses: large, rounded, a hairline, dark when in use. */
export const fieldInput =
  "h-12 w-full rounded-xl border border-[#e3e4e8] bg-white px-4 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[15px]"
