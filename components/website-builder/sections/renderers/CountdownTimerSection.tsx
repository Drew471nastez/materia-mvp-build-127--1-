"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { sectionColors, str, bool, parseInZone, SectionWrapper, type SectionProps } from "../_shared"
import { contrastRatio, parseColor } from "@/lib/storelib-theme/contrast"

/**
 * The first of `candidates` that reads on `bg` (4.5:1), else whichever of
 * near-black and white reads better. A scheme whose heading colour is meant
 * for a light page was drawing a dark heading on this section's dark ground,
 * and white digits on a box the scheme had made white.
 */
function readableOn(bg: string, candidates: (string | undefined)[]): string {
  const ground = parseColor(bg)
  if (!ground) return candidates.find(Boolean) ?? "#ffffff"
  for (const c of candidates) {
    const rgb = c ? parseColor(c) : null
    if (rgb && contrastRatio(rgb, ground) >= 4.5) return c as string
  }
  const dark = parseColor("#111827")!
  const light = parseColor("#ffffff")!
  return contrastRatio(dark, ground) >= contrastRatio(light, ground) ? "#111827" : "#ffffff"
}

// ── Countdown timer ──────────────────────────────────────────
export function CountdownTimerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const schemeKey = str(s.color_scheme, "dark")
  /* With the section's own Advanced colors, which resolveScheme left out. */
  const c = sectionColors({ ...section, settings: { ...s, color_scheme: schemeKey } }, theme)
  const endStr = str(s.end_date)
  const style = str(s.style, "boxes")
  const alignment = str(s.alignment, "center")
  const showLabels = bool(s.show_labels, true)
  const bg = str(s.bg_color) || c.bg
  /* A colour the creator picked is theirs; one taken from the scheme has to read on this ground. */
  const text = str(s.text_color) || readableOn(bg, [c.image_overlay_text, c.heading, c.text])
  const accent = str(s.accent_color) || c.primary_btn_bg
  const digit = readableOn(accent, ["#ffffff", c.primary_btn_text])

  const showDays = bool(s.show_days, true)
  const showHours = bool(s.show_hours, true)
  const showMinutes = bool(s.show_minutes, true)
  const showSeconds = bool(s.show_seconds, true)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  /**
   * READ IN THE ZONE THE CREATOR PICKED.
   *
   * The section has offered a Time zone control from the day it shipped and
   * parsed the date in whatever zone the VISITOR was in. A sale set to end at
   * midnight Pacific ended at 8pm for somebody in London and at 4pm the next
   * afternoon in Sydney — every visitor saw a different deadline, and none of
   * them saw the one the creator set.
   *
   * Default: 2 days from now if no end date is set.
   */
  const parsed = endStr ? parseInZone(endStr, str(s.timezone, "UTC")) : NaN
  // A date somebody has half-typed is not a countdown that has expired.
  const endTime = Number.isFinite(parsed) ? parsed : now + 1000 * 60 * 60 * 48
  const diff = Math.max(0, endTime - now)
  const expired = diff === 0 && Number.isFinite(parsed)

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)

  const alignClass: Record<string, string> = { left: "text-left items-start", center: "text-center items-center", right: "text-right items-end" }

  const units: { show: boolean; value: number; label: string }[] = [
    { show: showDays, value: days, label: str(s.days_label, "Days") },
    { show: showHours, value: hours, label: str(s.hours_label, "Hours") },
    { show: showMinutes, value: minutes, label: str(s.minutes_label, "Minutes") },
    { show: showSeconds, value: seconds, label: str(s.seconds_label, "Seconds") },
  ].filter(u => u.show)

  function Unit({ value, label }: { value: number; label: string }) {
    const padded = String(value).padStart(2, "0")
    if (style === "minimal") {
      return (
        <div className="flex flex-col items-center">
          <div className="text-4xl font-bold tabular-nums" style={{ color: text, fontFamily: theme.font_heading }}>{padded}</div>
          {showLabels && <div className="text-xs mt-1 uppercase tracking-wide opacity-70" style={{ color: text }}>{label}</div>}
        </div>
      )
    }
    if (style === "digital") {
      return (
        <div className="flex flex-col items-center">
          <div
            className="px-4 py-2 rounded tabular-nums text-3xl font-bold"
            style={{ background: "#000", color: "#22c55e", fontFamily: "'Courier New', monospace", border: `1px solid ${accent}` }}
          >
            {padded}
          </div>
          {showLabels && <div className="text-xs mt-2 uppercase tracking-wide opacity-70" style={{ color: text }}>{label}</div>}
        </div>
      )
    }
    // boxes
    return (
      <div className="flex flex-col items-center">
        <div
          className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl font-bold tabular-nums shadow-sm"
          style={{ background: accent, color: digit, fontFamily: theme.font_heading }}
        >
          {padded}
        </div>
        {showLabels && <div className="text-xs mt-2 uppercase tracking-wide opacity-80" style={{ color: text }}>{label}</div>}
      </div>
    )
  }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-(--theme-padding-x) max-w-(--theme-page-width) mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 60), paddingBottom: Number(s.padding_bottom ?? 60) }}
      >
        <div className={cn("flex flex-col gap-6", alignClass[alignment])}>
          {!!s.heading && <h2 className="text-3xl font-bold" style={{ color: text, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.subheading && <p className="text-base max-w-2xl opacity-80" style={{ color: text }}>{str(s.subheading)}</p>}
          {expired ? (
            <p className="text-lg font-semibold" style={{ color: text }}>{str(s.expired_text, "This offer has ended.")}</p>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              {units.map(u => <Unit key={u.label} value={u.value} label={u.label} />)}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default CountdownTimerSection
