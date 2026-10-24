"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"
import { siteImageProps } from "@/lib/website-builder/site-image"

export function ImageSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  // The scheme, or an explicit colour when the creator has set one. The
  // picker was in the panel and read by nothing.
  const bg = str(s.bg_color) || c.bg
  const imgUrl = str(s.image_url, "")
  const caption = str(s.caption, "")
  const aspectRatio = str(s.aspect_ratio, "auto")

  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "auto": "" }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-(--theme-padding-x) max-w-(--theme-page-width) mx-auto" style={{ paddingTop: `${s.padding_top ?? 40}px`, paddingBottom: `${s.padding_bottom ?? 40}px` }}>
        {imgUrl ? (
          <img src={imgUrl} {...siteImageProps(imgUrl)} alt={caption} className={cn("w-full h-auto rounded-lg object-cover", aspectMap[aspectRatio])} loading="lazy" decoding="async" />
        ) : (
          <div className={cn("w-full rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center", aspectMap[aspectRatio] || "aspect-video")}>
            <span className="text-white/60 text-sm">Add an image</span>
          </div>
        )}
        {caption && (
          <p className="mt-3 text-center text-sm" style={{ color: c.paragraph }}>
            {caption}
          </p>
        )}
      </div>
    </SectionWrapper>
  )
}

export default ImageSection
