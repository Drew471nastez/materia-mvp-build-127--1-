"use client"

import { buttonRadiusStyle, sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function CtaSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 text-center max-w-[1230px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-3" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.subheading && (
          <p className="text-lg mb-7 max-w-xl mx-auto" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.button_text && (
          <a
            href={str(s.button_url, "#")}
            className="inline-block px-8 py-3 text-[15px] font-semibold"
            style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
          >
            {str(s.button_text)}
          </a>
        )}
      </div>
    </SectionWrapper>
  )
}

export default CtaSection
