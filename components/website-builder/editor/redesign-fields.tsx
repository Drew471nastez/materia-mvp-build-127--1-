"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * REDESIGN WITH AI, ASKED (round M): what the person wants and how far it may
 * go, inside the builder's own confirm card (SectionActionConfirm). Two
 * choices, not a settings form: only what they describe, or a new look for
 * the whole site. Either way their words and products stay, and a backup is
 * taken first (POST themes/[id]/redesign).
 */
export type RedesignScopeChoice = "changes" | "full"

const SCOPES: readonly (readonly [RedesignScopeChoice, string, string])[] = [
  ["changes", "Just these changes", "Your pages, words and products stay as they are."],
  ["full", "A new look for the whole site", "Your words and products stay. The design changes."],
]

export function RedesignFields({
  text,
  scope,
  onText,
  onScope,
  onSubmit,
}: {
  text: string
  scope: RedesignScopeChoice
  onText: (text: string) => void
  onScope: (scope: RedesignScopeChoice) => void
  onSubmit: () => void
}) {
  return (
    <>
      <p>The AI works on this whole website as a draft. A backup is saved first, so you can undo it in one step.</p>
      <textarea
        data-redesign-text=""
        /* Focused once the menu that opened it has handed focus back and the card's own Cancel has taken it. */
        ref={(el) => {
          if (el && !el.dataset.focused) {
            el.dataset.focused = "1"
            window.setTimeout(() => el.focus(), 150)
          }
        }}
        aria-label="What should change"
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="Warmer colours, bigger product photos, and a short FAQ before the footer"
        rows={4}
        maxLength={2000}
        className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[14.5px] text-white placeholder:text-white/40 outline-none focus:border-white/35"
      />
      <div role="radiogroup" aria-label="How far it goes" className="mt-3 grid gap-1.5" data-redesign-scope={scope}>
        {SCOPES.map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={scope === value}
            onClick={() => onScope(value)}
            className={cn("flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors", scope === value ? "border-white/40 bg-white/[0.08]" : "border-white/10 hover:bg-white/[0.04]")}
          >
            <span aria-hidden className={cn("mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", scope === value ? "border-white" : "border-white/40")}>
              {scope === value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-white">{label}</span>
              <span className="block text-[12.5px] leading-snug text-white/55">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
