"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, buttonRadiusStyle, SectionWrapper, type SectionProps } from "../_shared"

// ── Promotion banner — image + text with CTA ─────────────────
export function PromotionBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const img = str(s.background_image)
  const overlay = Number(s.image_overlay_opacity ?? 0) / 100
  const minHeight = Number(s.min_height ?? 420)
  const position = str(s.content_position, "middle-left")

  const posClass: Record<string, string> = {
    "top-left": "items-start justify-start text-left",
    "top-center": "items-start justify-center text-center",
    "top-right": "items-start justify-end text-right",
    "middle-left": "items-center justify-start text-left",
    "middle-center": "items-center justify-center text-center",
    "middle-right": "items-center justify-end text-right",
    "bottom-left": "items-end justify-start text-left",
    "bottom-center": "items-end justify-center text-center",
    "bottom-right": "items-end justify-end text-right",
  }

  function renderBtn(label: string, link: string, type: string) {
    if (!label) return null
    const base = "inline-flex items-center justify-center px-7 py-3 text-sm font-semibold"
    if (type === "link") {
      return <a href={link || "#"} className={cn(base, "underline")} style={{ color: c.image_overlay_text }}>{label}</a>
    }
    if (type === "outline") {
      return <a href={link || "#"} className={base} style={{ border: `1px solid ${c.image_overlay_text}`, color: c.image_overlay_text, ...buttonRadiusStyle(theme) }}>{label}</a>
    }
    return <a href={link || "#"} className={base} style={{ background: c.primary_btn_bg, color: c.primary_btn_text, ...buttonRadiusStyle(theme) }}>{label}</a>
  }

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div style={{ paddingTop: Number(s.padding_top ?? 0), paddingBottom: Number(s.padding_bottom ?? 0) }}>
        <div className="relative w-full overflow-hidden" style={{ minHeight }}>
          {img ? (
            /**
              * A `<picture>` rather than a swap in JS: the browser picks before
              * it fetches, so a phone never downloads the desktop banner. The
              * Mobile image control was in the panel and read by nothing, so
              * every phone got the wide crop — usually a banner whose subject
              * is off the edge.
              */
            <picture>
              {!!s.image_mobile && (
                <source media="(max-width: 640px)" srcSet={str(s.image_mobile)} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </picture>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900" />
          )}
          {overlay > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />}
          <div className={cn("relative z-10 flex w-full h-full px-(--theme-padding-x) py-16 max-w-(--theme-page-width) mx-auto", posClass[position])} style={{ minHeight }}>
            <div className="flex flex-col gap-4 max-w-xl">
              {!!s.subheading && (
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.image_overlay_text }}>{str(s.subheading)}</span>
              )}
              {!!s.heading && (
                <h2 className="text-4xl @[768px]:text-5xl font-bold leading-tight" style={{ color: c.image_overlay_text, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>
              )}
              {!!s.description && (
                <p className="text-base opacity-90" style={{ color: c.image_overlay_text }}>{str(s.description)}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-2">
                {renderBtn(str(s.first_button_label), str(s.first_button_link), str(s.first_button_type, "primary"))}
                {renderBtn(str(s.second_button_label), str(s.second_button_link), str(s.second_button_type, "outline"))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default PromotionBannerSection
