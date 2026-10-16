"use client"

/**
 * What members get, a line each, and the questions people ask before
 * joining, a question and its answer each: the editors Settings' Page panel
 * had (settings-section.tsx), here since the page is edited on its own
 * screen (round 33). The same fields, the same limits.
 */
import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { RemoveButton, buttonSecondary, field } from "../parts"

export function ListEditor({ items, onChange, max, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; addLabel: string }) {
  const rows = items.length ? items : [""]
  return (
    <div className="space-y-2" data-list-editor="">
      {rows.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={b} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))} placeholder={i === 0 ? placeholder : ""} aria-label={tt("Line {value}", { value: i + 1 })} className={cn(field, "h-11 sm:h-10")} />
          <RemoveButton label={tt("Remove line {value}", { value: i + 1 })} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      {rows.length < max ? (
        <button type="button" onClick={() => onChange([...rows, ""])} className={cn(buttonSecondary, "mt-1")}>
          <Plus aria-hidden className="h-4 w-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}

export function PairEditor({ items, onChange, max, aPlaceholder, bPlaceholder, addLabel }: { items: { a: string; b: string }[]; onChange: (v: { a: string; b: string }[]) => void; max: number; aPlaceholder: string; bPlaceholder: string; addLabel: string }) {
  return (
    <div className="space-y-3" data-pair-editor="">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <input value={it.a} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, a: e.target.value.slice(0, 200) } : x)))} placeholder={aPlaceholder} aria-label={tt("Question {value}", { value: i + 1 })} className={cn(field, "h-11 font-medium sm:h-10")} />
            <textarea value={it.b} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, b: e.target.value.slice(0, 2000) } : x)))} placeholder={bPlaceholder} rows={2} aria-label={tt("Detail {value}", { value: i + 1 })} className={cn(field, "resize-y py-2 leading-relaxed")} />
          </div>
          <RemoveButton label={tt("Remove {value}", { value: i + 1 })} onClick={() => onChange(items.filter((_, j) => j !== i))} className="mt-0.5 sm:mt-1" />
        </div>
      ))}
      {items.length < max ? (
        <button type="button" onClick={() => onChange([...items, { a: "", b: "" }])} className={buttonSecondary}>
          <Plus aria-hidden className="h-4 w-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}
