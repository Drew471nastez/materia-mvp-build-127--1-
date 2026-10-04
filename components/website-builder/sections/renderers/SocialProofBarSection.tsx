"use client"

// Social-proof bar — a horizontal strip of trust signals: rating,
// customer count, guarantee badge, security badge, and optional
// publication logos.

import { Star, Shield, CheckCircle, Users } from "lucide-react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

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

export function SocialProofBarSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const starColor = str(s.star_color, "#f59e0b")
  const iconColor = str(s.icon_color) || c.accent
  const dividerColor = str(s.divider_color) || c.border
  const showDividers = bool(s.show_dividers, true)
  const align = str(s.alignment, "center")
  const justify = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center"
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-(--theme-page-width)", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "wide")] ?? "max-w-(--theme-page-width)"
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 24
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 24
  const rating = typeof s.rating_value === "number" ? s.rating_value : 4.9

  const items: React.ReactNode[] = []
  if (bool(s.show_rating, true)) {
    items.push(
      <div key="rating" className="flex items-center gap-2">
        <Stars value={rating} color={starColor} />
        <span className="font-semibold">{rating.toFixed(1)}</span>
        {!!s.review_count && (
          <span className="text-sm opacity-70">({str(s.review_count)})</span>
        )}
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
    /*
      Trust logos are blocks, one per logo, as many as fit (eight), each with
      its name and an optional link. A bar saved when they were four numbered
      image settings still shows those until it has blocks of its own.
    */
    const own = (section.blocks ?? []).filter((b) => b.type === "trust_logo" && !b.hidden)
    const logos = own.length > 0
      ? own.map((b) => ({ id: b.id, src: str(b.settings?.image), alt: str(b.settings?.alt), url: str(b.settings?.url) }))
      : [s.trust_logo_1, s.trust_logo_2, s.trust_logo_3, s.trust_logo_4].map((v, i) => ({ id: `legacy-${i}`, src: str(v), alt: "", url: "" }))
    const shown = logos.filter((l) => l.src || (isEditing && own.length > 0))
    if (shown.length > 0) {
      items.push(
        <div key="logos" className="flex items-center gap-4">
          {shown.map((l) => {
            const img = l.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.src} alt={l.alt} className="h-6 object-contain opacity-80" loading="lazy" decoding="async" />
            ) : (
              <span className="inline-flex h-6 items-center rounded border border-dashed px-2 text-[11px] opacity-60">{l.alt || "Logo"}</span>
            )
            return l.url && !isEditing ? (
              <a key={l.id} href={l.url} data-block-id={l.id} className="inline-flex" target="_blank" rel="noopener noreferrer">{img}</a>
            ) : (
              <span key={l.id} data-block-id={l.id} className="inline-flex">{img}</span>
            )
          })}
        </div>
      )
    }
  }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={`${mw} mx-auto px-6`} style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        <div className={`flex flex-wrap items-center gap-4 @[640px]:gap-6 ${justify}`}>
          {items.map((el, i) => (
            <div key={i} className="flex items-center">
              {el}
              {showDividers && i < items.length - 1 && (
                <div className="ml-4 @[640px]:ml-6 h-5 w-px" style={{ background: dividerColor }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default SocialProofBarSection
