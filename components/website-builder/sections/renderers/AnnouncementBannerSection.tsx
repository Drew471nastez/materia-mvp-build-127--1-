"use client"

// Announcement banner — horizontal promotional strip with optional CTA,
// icon, and a decorative close button. The close button is inert at the
// renderer level; actual dismiss persistence is done by the host page if
// it ever wires this up (the editor should always see it visible).

import { useState } from "react"
import { Megaphone, Bell, Star, Info, AlertTriangle, X, type LucideIcon } from "lucide-react"
import { str, SectionWrapper, type SectionProps } from "../_shared"

const ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  bell: Bell,
  star: Star,
  info: Info,
  warning: AlertTriangle,
}

export function AnnouncementBannerSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const [dismissed, setDismissed] = useState(false)
  if (dismissed && !isEditing) return null

  const bg = str(s.bg_color, "#1a1a1a")
  const text = str(s.text_color, "#ffffff")
  const accent = str(s.accent_color, "#f59e0b")
  const Icon = ICONS[str(s.icon, "megaphone")] ?? Megaphone
  const showClose = s.show_close_button !== false
  const radius = typeof s.border_radius === "number" ? s.border_radius : 8
  const padY = typeof s.padding_top === "number" ? s.padding_top : 16

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="flex items-center gap-3 px-6 max-w-[1400px] mx-auto text-sm"
        style={{ color: text, paddingTop: padY, paddingBottom: padY, borderRadius: radius }}
      >
        <Icon className="w-5 h-5 shrink-0" style={{ color: accent }} />
        <div className="flex-1 min-w-0">
          {!!s.heading && <span className="font-semibold mr-2">{str(s.heading)}</span>}
          {!!s.body && <span className="opacity-90">{str(s.body)}</span>}
        </div>
        {!!s.cta_text && (
          <a
            href={str(s.cta_url, "#")}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded"
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
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
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
