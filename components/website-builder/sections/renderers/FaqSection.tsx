"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function FaqSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const borderColor = c.inset_border
  const textColor = paraColor
  const blocks = section.blocks ?? []
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-2xl mx-auto px-8 py-16">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        <div className="space-y-2">
          {blocks.map(block => (
            <div key={block.id} className="border rounded-lg overflow-hidden" style={{ borderColor: borderColor }}>
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ color: headingColor }}
                onClick={() => setOpen(open === block.id ? null : block.id)}
              >
                <span className="font-medium text-[14px]">{str(block.settings.question)}</span>
                {open === block.id ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
              </button>
              {open === block.id && (
                <div className="px-5 pb-4 text-[14px]" style={{ color: textColor }}>
                  {str(block.settings.answer)}
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && (
            <p className="text-center text-sm opacity-40" style={{ color: textColor }}>Add FAQ items in the sidebar</p>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default FaqSection
