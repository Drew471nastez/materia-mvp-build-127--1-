"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function RichTextSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const bodyColor = c.paragraph
  const align = str(s.alignment, "left")
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-2xl", wide: "max-w-4xl", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "medium")] ?? "max-w-2xl"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("px-8 py-16 mx-auto", mw === "max-w-none" ? "max-w-[1230px]" : mw)} style={{ textAlign: align as any }}>
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-4" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.body && (
          <p className="text-lg leading-relaxed" style={{ color: bodyColor }}>
            {str(s.body)}
          </p>
        )}
      </div>
    </SectionWrapper>
  )
}

export default RichTextSection
