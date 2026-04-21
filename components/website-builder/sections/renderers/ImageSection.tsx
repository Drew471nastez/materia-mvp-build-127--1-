"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function ImageSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const imgUrl = str(s.image_url, "")
  const caption = str(s.caption, "")
  const aspectRatio = str(s.aspect_ratio, "auto")

  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "auto": "" }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1230px] mx-auto" style={{ paddingTop: `${s.padding_top ?? 40}px`, paddingBottom: `${s.padding_bottom ?? 40}px` }}>
        {imgUrl ? (
          <img src={imgUrl} alt={caption} className={cn("w-full h-auto rounded-lg object-cover", aspectMap[aspectRatio])} loading="lazy" decoding="async" />
        ) : (
          <div className={cn("w-full rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center", aspectMap[aspectRatio] || "aspect-video")}>
            <span className="text-white/60 text-sm">Add an image</span>
          </div>
        )}
        {caption && <p className="text-center text-sm text-neutral-500 mt-3">{caption}</p>}
      </div>
    </SectionWrapper>
  )
}

export default ImageSection
