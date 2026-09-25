"use client"

/**
 * ===========================================================================
 *  WHAT THE DOMAIN SHOWS: WEBSITE, CREATOR PAGE OR ONEPAGE
 * ===========================================================================
 * Three options, each named with the storelib.com address it stands in for,
 * so the choice is "which of my addresses should this domain be" rather
 * than a word to interpret. Used when connecting a domain and later from the
 * domain's row, on both Domains screens (light on /app, dark in the
 * builder).
 *
 * A website that is not live can still be chosen: the domain shows the
 * creator page until it is, which it says. A OnePage that is not published
 * cannot, because the domain would have nothing to show.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { DOMAIN_TARGETS, TARGET_LABEL, type DomainTarget } from "@/lib/custom-domain/targets"
import type { DomainTone } from "./dns-setup"

export interface TargetSources {
  /** The website's storelib.com host, e.g. astrid.storelib.com. */
  websiteHost: string
  websiteLive: boolean
  /** storelib.com/<username> */
  creatorPagePath: string
  onepageLive: boolean
}

export function targetAddress(target: DomainTarget, s: TargetSources): string {
  if (target === "website") return s.websiteHost
  if (target === "creator_page") return s.creatorPagePath
  return `${s.creatorPagePath}/links`
}

/** Why a choice cannot be made or will not show yet, in one short line. */
export function targetCaveat(target: DomainTarget, s: TargetSources): { blocked: boolean; text: string } | null {
  if (target === "website" && !s.websiteLive) return { blocked: false, text: "Not published yet. Shows your creator page until it is." }
  if (target === "onepage" && !s.onepageLive) return { blocked: true, text: "Publish your OnePage first." }
  return null
}

const TONES = {
  light: {
    option: "border-[#e5e7eb] bg-white hover:border-[#c4c8cf]",
    on: "border-[#8b5cf6] ring-1 ring-[#8b5cf6] bg-[#faf8ff]",
    label: "text-[#1a1a2e]",
    sub: "text-[#6b7280]",
    caveat: "text-[#b45309]",
    mark: "border-[#d1d5db] bg-white",
    markOn: "border-[#8b5cf6] bg-[#8b5cf6] text-white",
  },
  dark: {
    option: "border-white/12 bg-white/[0.02] hover:border-white/25",
    on: "border-white/70 ring-1 ring-white/70 bg-white/[0.06]",
    label: "text-white",
    sub: "text-white/50",
    caveat: "text-amber-200",
    mark: "border-white/30",
    markOn: "border-white bg-white text-[#0f0f0f]",
  },
} as const

export function TargetChoice({
  value,
  onChange,
  sources,
  tone,
  disabled = false,
  label = "What it shows",
}: {
  value: DomainTarget
  onChange: (target: DomainTarget) => void
  sources: TargetSources
  tone: DomainTone
  disabled?: boolean
  label?: string
}) {
  const t = TONES[tone]
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const move = (from: number, step: number) => {
    for (let i = 1; i <= DOMAIN_TARGETS.length; i++) {
      const next = (from + step * i + DOMAIN_TARGETS.length) % DOMAIN_TARGETS.length
      const target = DOMAIN_TARGETS[next]
      if (!targetCaveat(target, sources)?.blocked) {
        refs.current[next]?.focus()
        onChange(target)
        return
      }
    }
  }
  return (
    <div role="radiogroup" aria-label={label} data-target-choice="" className="grid gap-2 sm:grid-cols-3">
      {DOMAIN_TARGETS.map((target, i) => {
        const on = value === target
        const caveat = targetCaveat(target, sources)
        const blocked = disabled || !!caveat?.blocked
        return (
          <button
            key={target}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={blocked || undefined}
            tabIndex={on ? 0 : -1}
            data-target={target}
            onClick={() => {
              if (!blocked) onChange(target)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              "flex min-h-11 min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors [-webkit-tap-highlight-color:transparent]",
              on ? t.on : t.option,
              blocked && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              aria-hidden
              className={cn("mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", on ? t.markOn : t.mark)}
            >
              {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[14px] font-medium", t.label)}>{TARGET_LABEL[target]}</span>
              <span className={cn("block truncate text-[12.5px]", t.sub)}>{targetAddress(target, sources)}</span>
              {caveat && <span className={cn("mt-0.5 block text-[12.5px] leading-snug", t.caveat)}>{caveat.text}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
