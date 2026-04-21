"use client"

import { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { sectionColors, str, bool, buttonRadiusStyle, SectionWrapper, type SectionProps } from "../_shared"

export function HeroSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const textColor = c.heading
  const paraColor = c.paragraph
  const layout = str(s.layout, "center")
  const fullHeight = bool(s.full_height)
  const ctaStyle = str(s.cta_style, "primary")

  const alignClass = layout === "center" ? "items-center text-center" : layout === "right" ? "items-end text-right" : "items-start text-left"

  const ctaStyles: CSSProperties = ctaStyle === "primary"
    ? { background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }
    : ctaStyle === "outline"
    ? { border: `2px solid ${c.secondary_btn_border}`, color: c.secondary_btn_text, background: c.secondary_btn_bg, ...buttonRadiusStyle(theme) }
    : ctaStyle === "ghost"
    ? { color: textColor, background: "transparent", ...buttonRadiusStyle(theme) }
    : { background: c.secondary_btn_bg, color: c.secondary_btn_text, ...buttonRadiusStyle(theme) }

  return (
    <SectionWrapper
      bgColor={s.image_url ? undefined : bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className={cn(fullHeight ? "min-h-[80vh]" : "py-20")}
    >
      {!!s.image_url && (
        <div className="absolute inset-0">
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          <div
            className="absolute inset-0"
            style={{ background: bg, opacity: (Number(s.overlay_opacity ?? 40)) / 100 }}
          />
        </div>
      )}
      <div
        className={cn("relative z-10 flex flex-col gap-5 px-8 justify-center max-w-[1230px] mx-auto w-full", alignClass, fullHeight ? "min-h-[80vh]" : "")}
      >
        {!!s.heading && (
          <h1
            className="text-4xl sm:text-5xl font-bold leading-tight max-w-3xl"
            style={{ color: textColor, fontFamily: theme.font_heading ?? "Inter" }}
          >
            {str(s.heading)}
          </h1>
        )}
        {!!s.subheading && (
          <p className="text-lg max-w-xl" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.cta_text && (
          <div>
            <a
              href={str(s.cta_url, "#")}
              className="inline-block px-6 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
              style={ctaStyles}
            >
              {str(s.cta_text)}
            </a>
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default HeroSection
