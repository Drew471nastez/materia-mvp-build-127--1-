"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, buttonRadiusStyle, SectionWrapper, type SectionProps } from "../_shared"

export function SplitContentSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const imagePos = str(s.image_position, "left")
  const imgUrl = str(s.image_url, "")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("flex flex-col md:flex-row items-center gap-8 px-8 max-w-[1230px] mx-auto", imagePos === "right" && "md:flex-row-reverse")} style={{ paddingTop: `${s.padding_top ?? 60}px`, paddingBottom: `${s.padding_bottom ?? 60}px` }}>
        <div className="flex-1 min-w-0">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-auto rounded-lg object-cover" style={{ maxHeight: "500px" }} loading="lazy" decoding="async" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
              <span className="text-white/60 text-sm">Image</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {!!s.heading && <h2 className="text-3xl font-bold mb-4" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.text && <p className="text-base leading-relaxed mb-6" style={{ color: paraColor }}>{str(s.text)}</p>}
          {!!s.button_text && (
            <a
              href={str(s.button_link, "#")}
              className="inline-block px-6 py-3 text-sm font-semibold"
              style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
            >
              {str(s.button_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default SplitContentSection
