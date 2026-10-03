"use client"

/**
 * ===========================================================================
 *  WHICH MODEL ANSWERS, WITH ITS OWN MARK
 * ===========================================================================
 * "When I'm switching the AI, there should be the actual original icons of
 * them, smooth and clean."
 *
 * The marks are the companies' own single colour marks, the same paths the
 * Connections panel draws (components/website-builder/connection-marks.tsx):
 * OpenAI's knot in black (and Claude's starburst in its terracotta, for the
 * day Claude is offered again). They sit on the trigger and beside each
 * choice.
 *
 * A popover above the button on a computer, and on a phone the shared bottom
 * sheet (components/ui/bottom-sheet.tsx), which moves and closes like every
 * other sheet in the app. The models, each with a line on what it is best
 * for, and the Strength they think at are lib/website-builder/ask-engines.ts.
 *
 * STRENGTH sits under the models as three segments, drawn like the chat's
 * own Change page / Code section switch (./ask-parts), with one line under
 * it for the one that is on. Choosing one leaves the menu open.
 *
 * YOUR OWN AI. A model the creator's own account answers (their OpenAI key,
 * or OpenRouter: components/website-builder/use-own-ai.ts) says
 * so beside its name, "Your key", and the trigger carries a small green dot;
 * those edits do not use the plan's AI edits. Under the models, one line
 * goes to Connections to set it up, or says it is on.
 *
 * THE ONE MENU ASK STORELIB HAS, so it also holds Ask Storelib's one
 * preference: Sounds, on or off, under the models, drawn as every switch in
 * the app is (components/ui/switch-style.ts). Remembered per browser by the
 * chat (lib/website-builder/ask-sounds.ts).
 */

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { cn } from "@/lib/utils"

export interface EngineOption {
  id: string
  label: string
  short: string
  detail: string
  provider: "anthropic" | "openai"
}

export interface StrengthOption {
  id: string
  label: string
  detail: string
}

/** Claude's own colour, from its brand: the terracotta of the starburst. */
export const CLAUDE_TERRACOTTA = "#D97757"

export function EngineMark({ provider, className }: { provider: EngineOption["provider"]; className?: string }) {
  return provider === "openai" ? (
    <OpenAIMark className={cn("text-black", className)} />
  ) : (
    <ClaudeMark className={cn("text-[#D97757]", className)} />
  )
}

export function ModelPicker({
  engines,
  value,
  onChange,
  strengths,
  strength,
  onStrengthChange,
  open,
  onOpenChange,
  phone,
  sounds,
  onSoundsChange,
  own,
  onOwnAi,
}: {
  engines: readonly EngineOption[]
  value: string
  onChange: (id: string) => void
  /** How hard the model thinks; the row is drawn when a handler is given. */
  strengths?: readonly StrengthOption[]
  strength?: string
  onStrengthChange?: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: boolean
  /** Whether Ask Storelib's sounds are on; the switch is drawn when a handler is given. */
  sounds?: boolean
  onSoundsChange?: (on: boolean) => void
  /** Per engine id, the words for whose account answers it when it is the creator's own ("Your key"), else null. */
  own?: Record<string, string | null>
  /** Opens Connections at "Your own AI". */
  onOwnAi?: () => void
}) {
  const chosen = engines.find((e) => e.id === value) ?? engines[0]
  const chosenOwn = own?.[chosen.id] ?? null
  const anyOwn = !!own && Object.values(own).some(Boolean)
  const levels = onStrengthChange && strengths?.length ? strengths : null
  const level = levels ? (levels.find((s) => s.id === strength) ?? levels[Math.floor(levels.length / 2)]) : null
  const levelIndex = levels && level ? levels.indexOf(level) : 0

  const rows = (
    <ul role="listbox" aria-label="Model" data-ask-model-menu="" className={cn(phone ? "px-2 pb-2" : "p-1")}>
      {engines.map((option) => {
        const selected = option.id === chosen.id
        return (
          <li key={option.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              data-ask-model-option={option.id}
              onClick={() => onChange(option.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-black/[0.04] active:bg-black/[0.06]",
                phone ? "min-h-[60px] px-3 py-2.5" : "min-h-[48px] px-2.5 py-2",
                selected && "bg-black/[0.035]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.07]",
                  phone ? "h-9 w-9" : "h-7 w-7",
                )}
              >
                <EngineMark provider={option.provider} className={phone ? "h-[18px] w-[18px]" : "h-4 w-4"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-1.5 text-[#1a1a2e]", phone ? "text-[15px]" : "text-[13px]")}>
                  {option.label}
                  {own?.[option.id] && (
                    <span
                      data-ask-model-own=""
                      className={cn(
                        "rounded-full bg-emerald-50 px-1.5 font-medium text-emerald-700 ring-1 ring-emerald-600/15",
                        phone ? "text-[11.5px] leading-[18px]" : "text-[10.5px] leading-[16px]",
                      )}
                    >
                      {own[option.id]}
                    </span>
                  )}
                </span>
                <span className={cn("block leading-snug text-[#6b7280]", phone ? "text-[13px]" : "text-[11.5px]")}>{option.detail}</span>
              </span>
              <Check
                aria-hidden
                className={cn("h-4 w-4 shrink-0 text-[#1a1a2e]", selected ? "opacity-100" : "opacity-0")}
                strokeWidth={2.25}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )

  const strengthRow = levels && level && (
    <div data-ask-strength={level.id} className={cn("border-t border-[#e5e7eb]/70", phone ? "mx-2 px-3 pb-3 pt-2.5" : "mx-1 px-2.5 pb-2.5 pt-2")}>
      <span id="ask-strength-label" className={cn("block text-[#1a1a2e]", phone ? "text-[15px]" : "text-[13px]")}>
        Strength
      </span>
      {/* Its own line, full width: three labels beside the word do not fit the 268px popover. */}
      <div
        role="radiogroup"
        aria-labelledby="ask-strength-label"
        className="relative mt-1.5 grid rounded-full bg-black/[0.045] p-0.5"
        style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.1)] transition-transform duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ width: `calc((100% - 4px) / ${levels.length})`, transform: `translateX(${levelIndex * 100}%)` }}
        />
        {levels.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === level.id}
            data-ask-strength-option={option.id}
            onClick={() => onStrengthChange?.(option.id)}
            className={cn(
              "relative whitespace-nowrap rounded-full font-medium transition-colors duration-200",
              phone ? "h-9 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]",
              option.id === level.id ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className={cn("mt-1.5 leading-snug text-[#6b7280]", phone ? "text-[13px]" : "text-[11.5px]")}>
        {level.detail}
      </p>
    </div>
  )

  const ownRow = onOwnAi && (
    <div className={cn("border-t border-[#e5e7eb]/70", phone ? "mx-2 pt-1.5" : "mx-1 pt-1")}>
      <button
        type="button"
        data-ask-own-ai={anyOwn ? "on" : "off"}
        onClick={() => {
          onOpenChange(false)
          onOwnAi()
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-black/[0.04] active:bg-black/[0.06]",
          phone ? "min-h-[56px] px-3 py-2" : "min-h-[44px] px-2.5 py-1.5",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[#1a1a2e]", phone ? "text-[15px]" : "text-[13px]")}>
            {anyOwn ? "Your own AI is on" : "Use your own AI"}
          </span>
          <span className={cn("block leading-snug text-[#6b7280]", phone ? "text-[13px]" : "text-[11.5px]")}>
            {anyOwn ? "Those edits don't use your AI edits. Manage" : "Your OpenAI key or OpenRouter. Doesn't use your AI edits"}
          </span>
        </span>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 -rotate-90 text-[#9ca3af]" strokeWidth={2} />
      </button>
    </div>
  )

  const soundsRow = onSoundsChange && (
    <div className={cn("border-t border-[#e5e7eb]/70", phone ? "mx-2 mb-2 pt-1.5" : "mx-1 mb-1 pt-1")}>
      <button
        type="button"
        role="switch"
        aria-checked={!!sounds}
        data-ask-sounds={sounds ? "on" : "off"}
        onClick={() => onSoundsChange(!sounds)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-black/[0.04] active:bg-black/[0.06]",
          phone ? "min-h-[52px] px-3" : "min-h-[40px] px-2.5",
        )}
      >
        <span className={cn("min-w-0 flex-1 text-[#1a1a2e]", phone ? "text-[15px]" : "text-[13px]")}>Sounds</span>
        <span aria-hidden className={switchTrack(!!sounds)}>
          <span className={switchKnob(!!sounds)} />
        </span>
      </button>
    </div>
  )

  return (
    <>
      <button
        type="button"
        data-ask-model=""
        onClick={() => onOpenChange(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${chosen.label}${level ? `, ${level.label} strength` : ""}${chosenOwn ? `, on ${chosenOwn.toLowerCase()}` : ""}`}
        title="Which model answers"
        className={cn(
          "relative flex items-center gap-1.5 rounded-full text-[13px] text-[#1a1a2e]/80 transition-colors hover:bg-black/[0.05] hover:text-[#1a1a2e]",
          phone ? "h-11 pl-3 pr-2.5" : "h-9 pl-2.5 pr-2",
        )}
      >
        <span className="relative flex shrink-0">
          <EngineMark provider={chosen.provider} className="h-3.5 w-3.5" />
          {chosenOwn && (
            <span aria-hidden data-ask-model-own-dot="" className="absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full bg-emerald-500 ring-[1.5px] ring-white" />
          )}
        </span>
        <span className="max-w-[96px] truncate">{chosen.short}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200", open && !phone && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {!phone && open && (
        <div
          className={cn(
            "absolute bottom-full right-0 z-50 mb-2 w-[268px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(15,23,42,0.3)]",
            "animate-in fade-in slide-in-from-bottom-1 duration-150",
          )}
        >
          {rows}
          {strengthRow}
          {ownRow}
          {soundsRow}
        </div>
      )}
      {phone && (
        <BottomSheet isOpen={open} onClose={() => onOpenChange(false)} title="Model" hideFrom={null}>
          {rows}
          {strengthRow}
          {ownRow}
          {soundsRow}
        </BottomSheet>
      )}
    </>
  )
}
