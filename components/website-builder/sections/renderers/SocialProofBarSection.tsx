"use client"

// Social-proof bar — a horizontal strip of trust signals: rating,
// customer count, guarantee badge, security badge, and optional
// publication logos.

import { Star, Shield, CheckCircle, Users } from "lucide-react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

function Stars({ value, color }: { value: number; color: string }) {
  const full = Math.floor(value)
  const partial = value - full
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = i < full ? 1 : (i === full ? partial : 0)
        return (
          <span key={i} className="relative inline-block w-4 h-4">
            <Star className="absolute inset-0 w-4 h-4" style={{ color, opacity: 0.25 }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="w-4 h-4" style={{ color, fill: color }} />
            </span>
          </span>
        )
      })}
    </div>
  )
}

export function SocialProofBarSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f8fafc")
  const color = str(s.text_color, "#0f172a")
  const starColor = str(s.star_color, "#f59e0b")
  const iconColor = str(s.icon_color, "#6366f1")
  const dividerColor = str(s.divider_color, "#e2e8f0")
  const showDividers = bool(s.show_dividers, true)
  const align = str(s.alignment, "center")
  const justify = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center"
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-[1230px]", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "wide")] ?? "max-w-[1230px]"
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 24
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 24
  const rating = typeof s.rating_value === "number" ? s.rating_value : 4.9

  const items: React.ReactNode[] = []
  if (bool(s.show_rating, true)) {
    items.push(
      <div key="rating" className="flex items-center gap-2">
        <Stars value={rating} color={starColor} />
        <span className="font-semibold">{rating.toFixed(1)}</span>
        {!!s.rating_label && <span className="opacity-70 text-sm">{str(s.rating_label)}</span>}
      </div>
    )
  }
  if (bool(s.show_customer_count, true) && !!s.customer_count) {
    items.push(
      <div key="customers" className="flex items-center gap-2">
        <Users className="w-4 h-4" style={{ color: iconColor }} />
        <span className="font-semibold">{str(s.customer_count)}</span>
        {!!s.customer_label && <span className="opacity-70 text-sm">{str(s.customer_label)}</span>}
      </div>
    )
  }
  if (bool(s.show_guarantee, true) && !!s.guarantee_text) {
    items.push(
      <div key="guarantee" className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4" style={{ color: iconColor }} />
        <span>{str(s.guarantee_text)}</span>
      </div>
    )
  }
  if (bool(s.show_security, true) && !!s.security_text) {
    items.push(
      <div key="security" className="flex items-center gap-2">
        <Shield className="w-4 h-4" style={{ color: iconColor }} />
        <span>{str(s.security_text)}</span>
      </div>
    )
  }
  if (bool(s.show_trust_logos, false)) {
    const logos = [s.trust_logo_1, s.trust_logo_2, s.trust_logo_3, s.trust_logo_4]
      .map(v => str(v))
      .filter(Boolean)
    if (logos.length > 0) {
      items.push(
        <div key="logos" className="flex items-center gap-4">
          {logos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="h-6 object-contain opacity-80" />
          ))}
        </div>
      )
    }
  }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={`${mw} mx-auto px-6`} style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        <div className={`flex flex-wrap items-center gap-4 sm:gap-6 ${justify}`}>
          {items.map((el, i) => (
            <div key={i} className="flex items-center">
              {el}
              {showDividers && i < items.length - 1 && (
                <div className="ml-4 sm:ml-6 h-5 w-px" style={{ background: dividerColor }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default SocialProofBarSection
