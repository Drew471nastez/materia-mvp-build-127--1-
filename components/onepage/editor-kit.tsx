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
 *   PanelHeader   a sub panel's way back: a grey circle with a chevron and
 *                 the panel's name, large. The circle is 44px on a phone.
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
 *   RangeRow      a slider with its value, dark filled track, round thumb.
 *
 * Colours are Storelib's own (#1a1a2e ink, #6b7280 muted, #e3e4e8 hairline),
 * not Linktree's. No transforms: app/globals.css removes transforms inside a
 * `.group` on touch screens, and none of these need one.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ColorField } from "@/components/onepage/color-picker"

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

export function PanelHeader({ title, onBack, backLabel = "Back", action }: { title: string; onBack?: () => void; backLabel?: string; action?: React.ReactNode }) {
  return (
    <div data-panel-header="" className="mb-6 flex min-h-11 items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          data-panel-back=""
          className={cn(
            "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[#f1f2f4] text-[#1a1a2e] transition-colors duration-150 hover:bg-[#e8e9ec] active:bg-[#dfe0e4] sm:h-10 sm:w-10 [-webkit-tap-highlight-color:transparent]",
            focusRing,
          )}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
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
        "relative flex min-h-11 cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-2 text-center transition-[border-color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]",
        focusRing,
        selected ? choiceOn : choiceOff,
        disabled && "cursor-not-allowed opacity-45 hover:border-[#e3e4e8]",
        className,
      )}
    >
      {children}
      <span className={cn("block truncate px-1 text-[13px] font-medium", children ? "pb-1 pt-2" : "py-1.5", selected ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{label}</span>
      {badge ? <span className="absolute right-2 top-2">{badge}</span> : null}
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
              "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border bg-white px-2 py-2 text-[13px] font-medium transition-[border-color,box-shadow,color] duration-150 [-webkit-tap-highlight-color:transparent]",
              focusRing,
              on ? cn(choiceOn, "text-[#1a1a2e]") : cn(choiceOff, "text-[#4b5563]"),
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.hint ? <span className="mt-0.5 truncate text-[11.5px] font-normal text-[#6b7280]">{o.hint}</span> : null}
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

export function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  ends,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  /** Words under each end of the track: "Square", "Round". */
  ends?: [string, string]
}) {
  const pct = ((Math.min(max, Math.max(min, value)) - min) / Math.max(1, max - min)) * 100
  return (
    <div data-range-row="">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-[#1a1a2e]">{label}</p>
        <span className="text-[13.5px] tabular-nums text-[#6b7280]">{format(value)}</span>
      </div>
      {/* The native range does the work (keys, touch, a screen reader); it is drawn over, invisible. */}
      <div className="relative flex h-11 items-center" data-sheet-no-drag="">
        <div aria-hidden className="relative h-1 w-full rounded-full bg-[#e8e9ec]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#1a1a2e]" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -mt-[11px] h-[22px] w-[22px] rounded-full border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_3px_8px_-2px_rgba(0,0,0,0.25)]"
            style={{ left: `calc(${pct}% - ${(pct / 100) * 22}px)` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {ends ? (
        <div className="flex justify-between text-[12.5px] text-[#6b7280]">
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
