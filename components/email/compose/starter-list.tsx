"use client"

/**
 * Where an email can start (lib/email-campaigns/starters.ts): each row a
 * small drawing of the layout, its name and what it is for.
 *
 * Two places draw it. Under an empty email, as "Or start from a layout": a
 * tap fills the email, its subject and its preview text with that layout,
 * in the composer's own blocks, and the list goes, because it is only there
 * while there is nothing written. And in the Layout picker the composer
 * opens from the line above the email (./layout-bar.tsx), where the layout
 * the email is on has a tick and Blank is the first row: going back to an
 * email with no layout is one of the choices, not a separate button to find.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { STARTERS, type SketchRow, type StarterId } from "@/lib/email-campaigns/starters"
import { cn } from "@/lib/utils"
import { card } from "./ui"

/** The layout drawn small, on a white tile: grey bars for words, a filled bar for a button, a box for a product. */
export function Sketch({ rows, className }: { rows: SketchRow[]; className?: string }) {
  let y = 6
  const parts: React.ReactNode[] = []
  rows.forEach((row, i) => {
    const center = row.startsWith("center")
    if (row === "title" || row === "center-title") {
      parts.push(<rect key={i} x={center ? 9 : 6} y={y} width={center ? 22 : 20} height={3.5} rx={1.5} fill="#27272a" />)
      y += 7
    } else if (row === "text" || row === "center-text") {
      parts.push(<rect key={`${i}a`} x={center ? 7 : 6} y={y} width={center ? 26 : 28} height={2} rx={1} fill="#c7c9cf" />)
      parts.push(<rect key={`${i}b`} x={center ? 10 : 6} y={y + 4} width={center ? 20 : 22} height={2} rx={1} fill="#c7c9cf" />)
      y += 9
    } else if (row === "short") {
      parts.push(<rect key={i} x={6} y={y} width={14} height={2} rx={1} fill="#c7c9cf" />)
      y += 6
    } else if (row === "button") {
      const w = 14
      parts.push(<rect key={i} x={centred(rows) ? 20 - w / 2 : 6} y={y} width={w} height={5} rx={1.5} fill="#1a1a2e" />)
      y += 9
    } else if (row === "product") {
      parts.push(<rect key={`${i}a`} x={6} y={y} width={28} height={10} rx={2} fill="none" stroke="#c7c9cf" strokeWidth={1} />)
      parts.push(<rect key={`${i}b`} x={8} y={y + 2} width={6} height={6} rx={1} fill="#e5e7eb" />)
      parts.push(<rect key={`${i}c`} x={16} y={y + 3} width={12} height={1.5} rx={0.75} fill="#27272a" />)
      parts.push(<rect key={`${i}d`} x={16} y={y + 6} width={7} height={2} rx={1} fill="#1a1a2e" />)
      y += 13
    } else if (row === "rule") {
      parts.push(<rect key={i} x={6} y={y} width={28} height={0.75} fill="#e5e7eb" />)
      y += 4
    }
  })
  return (
    <span aria-hidden className={cn("inline-flex h-12 w-10 shrink-0 overflow-hidden rounded-[9px] bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.09),inset_0_-1.5px_0_rgba(17,24,39,0.05),0_1px_2px_rgba(17,24,39,0.06)]", className)}>
      <svg viewBox="0 0 40 48" width="40" height="48">
        {parts}
      </svg>
    </span>
  )
}

const centred = (rows: SketchRow[]) => rows.some((r) => r.startsWith("center"))

/** What a row picks: a layout, or "blank" for an email with none. */
export type LayoutChoice = StarterId | "blank"

const rowClass =
  "flex min-h-[64px] w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left transition-colors duration-75 hover:bg-[#fafbfb] active:bg-[#f4f5f7] focus-visible:bg-[#f4f5f7] focus-visible:outline-none sm:px-5 [-webkit-tap-highlight-color:transparent]"

function Row({ id, name, line, sketch, current, onPick }: { id: LayoutChoice; name: string; line: string; sketch: SketchRow[]; current: boolean; onPick: (id: LayoutChoice) => void }) {
  return (
    <li>
      <button type="button" data-starter={id} aria-current={current ? "true" : undefined} onClick={() => onPick(id)} className={rowClass}>
        <Sketch rows={sketch} className={id === "blank" ? "border border-dashed border-[#c7c9cf] bg-transparent shadow-none" : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-[#1a1a2e] sm:text-[14px]">{name}</span>
          <span className="block truncate text-[13px] text-[#6b7280]">{line}</span>
        </span>
        {current ? <Check aria-label="In use" className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.4} /> : null}
      </button>
    </li>
  )
}

/**
 * The rows. `withBlank` puts Blank first (the picker); `current` ticks the
 * choice the email is on; `bare` draws only the list, for a surface that
 * has its own frame and title.
 */
export function StarterList({
  onPick,
  className,
  current = null,
  withBlank = false,
  bare = false,
}: {
  onPick: (id: LayoutChoice) => void
  className?: string
  current?: LayoutChoice | null
  withBlank?: boolean
  bare?: boolean
}) {
  const list = (
    <ul className="divide-y divide-[#f1f2f4]" aria-label={bare ? "Layouts" : undefined}>
      {withBlank ? <Row id="blank" name="Blank" line="No layout. Write it from the first line." sketch={[]} current={current === "blank"} onPick={onPick} /> : null}
      {STARTERS.map((s) => (
        <Row key={s.id} id={s.id} name={s.name} line={s.line} sketch={s.sketch} current={current === s.id} onPick={onPick} />
      ))}
    </ul>
  )
  if (bare) return <div className={className}>{list}</div>
  return (
    <section aria-labelledby="starters-title" data-starters="" className={cn(card, "overflow-hidden", className)}>
      <h2 id="starters-title" className="px-4 pb-1 pt-3.5 text-[13px] font-medium text-[#6b7280] sm:px-5">
        Or start from a layout
      </h2>
      {list}
    </section>
  )
}
