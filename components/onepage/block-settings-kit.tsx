"use client"

/**
 * ===========================================================================
 *  A BLOCK'S SETTINGS: THE PIECES THAT CHOOSE
 * ===========================================================================
 * Round 40, the owner: "Block settings when editing: more Storelib UI, less
 * complex, cleaner; layout and selecting things nicer."
 *
 * A link to YouTube, Spotify or Apple Music offered its modes ("Play video
 * on page", "Open YouTube video") as cards with a 2px border, each with its
 * own on/off switch. Two switches for one choice read as two settings, and
 * turning one off did nothing. They are one choice now: a list of rows, the
 * chosen one marked, as "When someone taps it" on a product block already
 * is (./tabs/product-block-editor), with the same marks (./choice-marks).
 *
 *   SettingsGroup   a small heading and what is under it, so a service's
 *                   settings read as one part of the panel, not a new page.
 *   ModeChoice      one of a few, as rows: an icon in a tile (dark when
 *                   chosen), a name, one line.
 *   QuietAction     a full width, quiet button for "Refresh thumbnail".
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { ChoiceMark } from "@/components/onepage/choice-marks"

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

export function SettingsGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-settings-group={title} className={cn("space-y-2.5 border-t border-[#eef0f2] pt-4", className)}>
      <h4 className="text-[13px] font-semibold text-[#1a1a2e]">{title}</h4>
      {children}
    </section>
  )
}

export type ModeOption<T extends string> = { id: T; label: string; hint?: string; icon?: React.ReactNode }

export function ModeChoice<T extends string>({
  value,
  options,
  onPick,
  label,
  accent,
}: {
  value: T
  options: readonly ModeOption<T>[]
  onPick: (id: T) => void
  /** For a screen reader: what the rows choose. */
  label: string
  /** The service's own colour for the chosen tile (YouTube's red); the page's ink without one. */
  accent?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-mode-choice="">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-mode={o.id}
            onClick={() => {
              if (on) return
              hapticTap("soft")
              onPick(o.id)
            }}
            className={cn(
              "relative flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-[#e3e4e8] bg-white px-3 py-2 text-left transition-[border-color] duration-150 [-webkit-tap-highlight-color:transparent] hover:border-[#c9cbd1]",
              focusRing,
            )}
          >
            <ChoiceMark on={on} />
            {o.icon ? (
              <span
                aria-hidden
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-[background-color,color] duration-150", on ? "text-white" : "bg-[#f4f4f6] text-[#4b5563]")}
                style={on ? { backgroundColor: accent ?? "#1a1a2e" } : undefined}
              >
                {o.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-[#1a1a2e]">{o.label}</span>
              {o.hint ? <span className="block truncate text-[12px] text-[#6b7280]">{o.hint}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function QuietAction({ onClick, icon, children, busy = false }: { onClick: () => void | Promise<void>; icon?: React.ReactNode; children: React.ReactNode; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      data-quiet-action=""
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f4f4f6] text-[13.5px] font-medium text-[#1a1a2e] transition-[background-color,opacity] duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-[#ececef] active:bg-[#e6e6ea] disabled:opacity-60",
        focusRing,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
