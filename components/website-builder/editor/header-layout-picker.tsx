"use client"

/**
 * ===========================================================================
 *  THE HEADER'S LAYOUT, CHOSEN FROM A DRAWING OF IT
 * ===========================================================================
 * "The header layout desktop picker ('Choose header layout') and how they
 * look, they look too AI. The selection should be better."
 *
 * It was a row that opened a second panel of big cards: grey bars for a
 * logo, a blue ring and the word SELECTED in capitals on the chosen one, and
 * one label per card that tried to spell the whole layout out with dots
 * ("Logo left · Nav inline · Icons right"). Two steps to make one choice,
 * and the loudest thing on the panel was the state, not the layouts.
 *
 * Now every layout is on the header's own panel, drawn as a wireframe in
 * thin grey lines: where the logo sits, where the menu sits, where the
 * icons sit. One tap chooses. The chosen one is drawn in the dark ink the
 * builder uses for anything selected, with its border to match, and that is
 * the whole of the selected state.
 *
 * The ids are the ones HeaderSection reads (components/website-builder/
 * sections/renderers/HeaderSection.tsx).
 */
import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface HeaderLayoutOption {
  id: string
  label: string
}

export const DESKTOP_HEADER_LAYOUTS: HeaderLayoutOption[] = [
  { id: "logo_left_nav_right", label: "Menu on the right" },
  { id: "logo_left_nav_inline", label: "Menu beside logo" },
  { id: "logo_left_nav_center", label: "Menu in the middle" },
  { id: "nav_left_logo_center", label: "Logo in the middle" },
  { id: "logo_center_nav_below", label: "Menu under logo" },
]

export const MOBILE_HEADER_LAYOUTS: HeaderLayoutOption[] = [
  { id: "logo_center_hamburger_left", label: "Logo in the middle" },
  { id: "hamburger_left_logo_left", label: "Logo on the left" },
]

export const DEFAULT_DESKTOP_HEADER_LAYOUT = "logo_left_nav_right"
export const DEFAULT_MOBILE_HEADER_LAYOUT = "logo_center_hamburger_left"

/* ── The drawings ──────────────────────────────────────────────────────── */

/**
 * One viewBox for every drawing, 120 by 40, so they line up in the grid.
 * Three marks, in the colour the tile gives them (`currentColor`):
 *   the logo    a short solid bar
 *   the menu    three short lines
 *   the icons   two small rings
 */
function Logo({ x, y = 17, w = 18 }: { x: number; y?: number; w?: number }) {
  return <rect x={x} y={y} width={w} height={6} rx={2} fill="currentColor" />
}
function Menu({ x, y = 20, n = 3, gap = 4, w = 9 }: { x: number; y?: number; n?: number; gap?: number; w?: number }) {
  return (
    <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.7}>
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={x + i * (w + gap)} y1={y} x2={x + i * (w + gap) + w} y2={y} />
      ))}
    </g>
  )
}
function Icons({ x, y = 20 }: { x: number; y?: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} opacity={0.7}>
      <circle cx={x} cy={y} r={3} />
      <circle cx={x + 10} cy={y} r={3} />
    </g>
  )
}
function Burger({ x, y = 20 }: { x: number; y?: number }) {
  return (
    <g stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.7}>
      <line x1={x} y1={y - 4} x2={x + 10} y2={y - 4} />
      <line x1={x} y1={y} x2={x + 10} y2={y} />
      <line x1={x} y1={y + 4} x2={x + 10} y2={y + 4} />
    </g>
  )
}

export function HeaderWireframe({ id }: { id: string }) {
  let marks: ReactNode
  switch (id) {
    case "logo_left_nav_inline":
      marks = <><Logo x={10} /><Menu x={36} /><Icons x={97} /></>
      break
    case "logo_left_nav_center":
      marks = <><Logo x={10} /><Menu x={43} /><Icons x={97} /></>
      break
    case "nav_left_logo_center":
      marks = <><Menu x={10} n={2} /><Logo x={51} /><Icons x={97} /></>
      break
    case "logo_center_nav_below":
      marks = <><Logo x={48} y={9} w={24} /><Menu x={43} y={28} /></>
      break
    /* Phone headers. */
    case "logo_center_hamburger_left":
      marks = <><Burger x={10} /><Logo x={51} /><Icons x={97} /></>
      break
    case "hamburger_left_logo_left":
      marks = <><Burger x={10} /><Logo x={28} /><Icons x={97} /></>
      break
    default:
      /* logo_left_nav_right */
      marks = <><Logo x={10} /><Menu x={57} n={3} gap={3} w={8} /><Icons x={97} /></>
  }
  return (
    <svg viewBox="0 0 120 40" className="block h-auto w-full" aria-hidden>
      {marks}
    </svg>
  )
}

/* ── The picker ────────────────────────────────────────────────────────── */

export function HeaderLayoutPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: HeaderLayoutOption[]
  onChange: (id: string) => void
  label: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.max(0, options.findIndex((o) => o.id === value))
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-header-layouts=""
      className="grid grid-cols-2 gap-2"
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (!step) return
        e.preventDefault()
        const next = (at + step + options.length) % options.length
        onChange(options[next].id)
        refs.current[next]?.focus()
      }}
    >
      {options.map((o, i) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === at ? 0 : -1}
            onClick={() => onChange(o.id)}
            data-layout={o.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border bg-white p-1.5 text-left outline-none transition-[border-color,box-shadow,color] duration-150",
              "focus-visible:ring-2 focus-visible:ring-black/10",
              on
                ? "border-[#1a1a2e] text-[#1a1a2e] shadow-[inset_0_0_0_0.5px_#1a1a2e]"
                : "border-[#e5e7eb] text-[#9ca3af] hover:border-[#d1d5db] hover:text-[#6b7280]",
            )}
          >
            <span className={cn("block rounded-[5px] border px-1", on ? "border-[#1a1a2e]/15 bg-[#f8f9fa]" : "border-[#f0f1f3] bg-[#fafafa]")}>
              <HeaderWireframe id={o.id} />
            </span>
            <span className={cn("truncate px-0.5 text-[12px] leading-tight", on ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]")}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
