"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, DynamicIcon, type SectionProps } from "../_shared"

export function FeatureGridSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!(s.heading || s.subheading) && (
          <div className="text-center mb-10">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add feature blocks in the sidebar</p>
        ) : (
          <div className={cn("grid gap-8", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: c.primary_btn_bg, color: c.primary_btn_text }}>
                  <DynamicIcon name={str(block.settings.icon, "zap")} className="h-5 w-5" />
                </div>
                <div className="font-semibold text-[15px]" style={{ color: headingColor }}>{str(block.settings.title)}</div>
                <div className="text-[13px] leading-relaxed" style={{ color: paraColor }}>{str(block.settings.description)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default FeatureGridSection
