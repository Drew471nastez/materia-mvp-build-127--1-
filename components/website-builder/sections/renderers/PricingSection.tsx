"use client"

import { sectionColors, str, bool, SectionWrapper, buttonRadiusStyle, type SectionProps } from "../_shared"

export function PricingSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        <div className="text-center mb-10">
          {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
        </div>
        <div className="grid grid-cols-1 @[640px]:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {blocks.map(block => {
            const featured = bool(block.settings.is_featured)
            return (
              <div
                key={block.id}
                className="rounded-2xl border p-6 flex flex-col gap-4"
                style={{
                  borderColor: featured ? c.primary_btn_bg : c.plan_border,
                  background: featured ? c.primary_btn_bg : c.plan_bg,
                }}
              >
                <div>
                  <div className="font-bold text-[15px]" style={{ color: featured ? c.primary_btn_text : c.plan_heading }}>{str(block.settings.name)}</div>
                  {!!block.settings.description && <div className="text-[12px] mt-0.5" style={{ color: featured ? c.primary_btn_text : c.plan_paragraph }}>{str(block.settings.description)}</div>}
                </div>
                <div>
                  <span className="text-3xl font-bold" style={{ color: featured ? c.primary_btn_text : c.plan_heading }}>{str(block.settings.price)}</span>
                  <span className="text-[12px] ml-1" style={{ color: featured ? c.primary_btn_text : c.plan_paragraph }}>{str(block.settings.period)}</span>
                </div>
                {!!block.settings.cta_text && (
                  <a
                    href={str(block.settings.cta_url, "#")}
                    className="text-center py-2 text-[13px] font-semibold"
                    style={{
                      background: featured ? c.primary_btn_text : c.primary_btn_bg,
                      color: featured ? c.primary_btn_bg : c.primary_btn_text,
                      ...buttonRadiusStyle(theme),
                    }}
                  >
                    {str(block.settings.cta_text)}
                  </a>
                )}
              </div>
            )
          })}
          {blocks.length === 0 && (
            <div className="col-span-3 text-center text-sm opacity-40" style={{ color: paraColor }}>Add pricing plan blocks in the sidebar</div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default PricingSection
