"use client"

/**
 * Where an empty new email can start (lib/email-campaigns/starters.ts): one
 * list under the empty email, each row a small drawing of the layout, its
 * name and what it is for. A tap fills the email, its subject and its
 * preview text with that layout, in the composer's own blocks, and the list
 * goes: it is only there while there is nothing written. Writing straight
 * into the empty email is starting from nothing, so that needs no row.
 */
import * as React from "react"
import { STARTERS, type SketchRow, type StarterId } from "@/lib/email-campaigns/starters"
import { cn } from "@/lib/utils"
import { card } from "./ui"

/** The layout drawn small, on a white tile: grey bars for words, a filled bar for a button, a box for a product. */
function Sketch({ rows }: { rows: SketchRow[] }) {
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
    <span aria-hidden className="inline-flex h-12 w-10 shrink-0 overflow-hidden rounded-[9px] bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.09),inset_0_-1.5px_0_rgba(17,24,39,0.05),0_1px_2px_rgba(17,24,39,0.06)]">
      <svg viewBox="0 0 40 48" width="40" height="48">
        {parts}
      </svg>
    </span>
  )
}

const centred = (rows: SketchRow[]) => rows.some((r) => r.startsWith("center"))

export function StarterList({ onPick, className }: { onPick: (id: StarterId) => void; className?: string }) {
  return (
    <section aria-labelledby="starters-title" data-starters="" className={cn(card, "overflow-hidden", className)}>
      <h2 id="starters-title" className="px-4 pb-1 pt-3.5 text-[13px] font-medium text-[#6b7280] sm:px-5">
        Or start from a layout
      </h2>
      <ul className="divide-y divide-[#f1f2f4]">
        {STARTERS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-starter={s.id}
              onClick={() => onPick(s.id)}
              className="flex min-h-[64px] w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left transition-colors duration-75 hover:bg-[#fafbfb] active:bg-[#f4f5f7] sm:px-5 [-webkit-tap-highlight-color:transparent]"
            >
              <Sketch rows={s.sketch} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[#1a1a2e] sm:text-[14px]">{s.name}</span>
                <span className="block truncate text-[13px] text-[#6b7280]">{s.line}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
