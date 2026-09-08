"use client"

import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function TestimonialsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cardBg = c.bg === "#ffffff" ? "#f8fafc" : c.bg
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add testimonial blocks in the sidebar</p>
        ) : (
          <div className="grid grid-cols-1 @[640px]:grid-cols-2 @[768px]:grid-cols-3 gap-6">
            {blocks.map(block => (
              <div key={block.id} className="rounded-xl p-6 border" style={{ background: cardBg, borderColor: c.inset_border }}>
                <p className="text-[14px] leading-relaxed mb-4" style={{ color: paraColor }}>
                  &ldquo;{str(block.settings.quote)}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  {block.settings.avatar_url ? (
                    <img src={str(block.settings.avatar_url)} className="h-8 w-8 rounded-full object-cover" alt="" loading="lazy" decoding="async" />
                  ) : (
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.primary_btn_bg, color: c.primary_btn_text }}>
                      {str(block.settings.author).charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: headingColor }}>{str(block.settings.author)}</div>
                    <div className="text-[11px]" style={{ color: paraColor }}>{str(block.settings.role)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default TestimonialsSection
