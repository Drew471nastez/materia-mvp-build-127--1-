"use client"

// Announcement banner — horizontal promotional strip with optional CTA,
// icon, and a decorative close button. The close button is inert at the
// renderer level; actual dismiss persistence is done by the host page if
// it ever wires this up (the editor should always see it visible).

import { useEffect, useState } from "react"
import { Megaphone, Bell, Star, Info, AlertTriangle, X, type LucideIcon } from "lucide-react"
import { bool, num, sectionColors, str, useCountdown, SectionWrapper, type SectionProps } from "../_shared"

const ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  bell: Bell,
  star: Star,
  info: Info,
  warning: AlertTriangle,
}

/**
 * The six looks the Style Preset control has always offered. It set nothing;
 * every banner was the same near-black bar with an amber icon whichever of
 * "Info", "Success", "Warning", "Error", "Brand" or "Gradient" was chosen.
 */
const PRESETS: Record<string, { bg: string; text: string; accent: string; border: string }> = {
  info: { bg: "#eff6ff", text: "#1e3a8a", accent: "#2563eb", border: "#bfdbfe" },
  success: { bg: "#ecfdf5", text: "#065f46", accent: "#059669", border: "#a7f3d0" },
  warning: { bg: "#fffbeb", text: "#78350f", accent: "#d97706", border: "#fde68a" },
  error: { bg: "#fef2f2", text: "#7f1d1d", accent: "#dc2626", border: "#fecaca" },
  brand: { bg: "#1a1a1a", text: "#ffffff", accent: "#f59e0b", border: "#333333" },
  gradient: {
    bg: "linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)",
    text: "#ffffff",
    accent: "#ffffff",
    border: "transparent",
  },
}

export function AnnouncementBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const [dismissed, setDismissed] = useState(false)

  /**
   * THE STYLE PRESET, which offered six looks and produced one.
   *
   * A preset is a starting point, not an override — an explicit colour still
   * wins, so somebody who picked "Warning" and then changed the background
   * keeps their background.
   */
  /**
   * "Scheme" is the seventh look and the default: the banner takes its
   * colours from the section's colour scheme like every other section, and
   * the six status looks stay for a banner that is saying something a
   * status colour says better than the theme can.
   */
  const chosen = str(s.style_preset, "scheme")
  const preset = chosen === "scheme"
    ? { bg: c.bg, text: c.text, accent: c.accent, border: c.border }
    : PRESETS[chosen] ?? PRESETS.brand
  const bg = str(s.bg_color) || preset.bg
  const text = str(s.text_color) || preset.text
  const accent = str(s.accent_color) || preset.accent
  const border = str(s.border_color) || preset.border
  const Icon = ICONS[str(s.icon, "megaphone")] ?? Megaphone
  const showClose = s.show_close_button !== false
  const radius = typeof s.border_radius === "number" ? s.border_radius : 8
  const padY = typeof s.padding_top === "number" ? s.padding_top : 16
  const padBottom = num(s.padding_bottom, padY)

  /**
   * "Dismissible (remembers close)" — and it remembered nothing, because the
   * dismissal lived in React state and every reload brought the banner back.
   * A visitor who closed the same bar on every page view is a visitor being
   * ignored. Keyed by section id so two banners are dismissed separately.
   */
  const storageKey = `storelib:announcement:${section.id}`
  const dismissible = bool(s.dismissible, true)
  useEffect(() => {
    if (!dismissible || isEditing) return
    try {
      if (window.localStorage.getItem(storageKey) === "1") setDismissed(true)
    } catch {
      // Private mode, or storage blocked. The banner simply shows.
    }
  }, [dismissible, isEditing, storageKey])

  const dismiss = () => {
    setDismissed(true)
    if (!dismissible) return
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // Nothing to do — the close still works for this page view.
    }
  }

  const countdown = useCountdown(str(s.countdown_end))

  // After every hook. An early return above `useEffect`/`useCountdown` would
  // change the hook count between renders, which React refuses.
  if (dismissed && !isEditing) return null

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        /**
         * WRAPS ON A NARROW BAR. It was one non-wrapping row with a
         * `shrink-0` call to action and a `shrink-0` close button, so a
         * long announcement pushed 47px of the page sideways on a phone
         * — measured, at 390px.
         */
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-6 max-w-[1400px] mx-auto text-sm @[520px]:flex-nowrap @[520px]:justify-start"
        style={{
          color: text,
          background: bg,
          border: `1px solid ${border}`,
          paddingTop: padY,
          paddingBottom: padBottom,
          borderRadius: radius,
        }}
      >
        <Icon className="w-5 h-5 shrink-0" style={{ color: accent }} />
        <div className="flex-1 min-w-0">
          {!!s.heading && <span className="font-semibold mr-2">{str(s.heading)}</span>}
          {!!s.body && <span className="opacity-90">{str(s.body)}</span>}
        </div>
        {!!countdown && (
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: accent }}>
            {countdown.parts
              .map((part) => `${String(part.value).padStart(2, "0")}${part.label[0]}`)
              .join(" ")}
          </span>
        )}
        {!!s.cta_text && (
          <a
            href={str(s.cta_url, "#")}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold"
            style={
              str(s.cta_style, "filled") === "outline"
                ? { border: `1px solid ${accent}`, color: accent }
                : { background: accent, color: bg }
            }
          >
            {str(s.cta_text)}
          </a>
        )}
        {showClose && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={e => { e.stopPropagation(); dismiss() }}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </SectionWrapper>
  )
}

export default AnnouncementBannerSection
