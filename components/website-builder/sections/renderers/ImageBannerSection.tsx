"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function ImageBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "3:1": "aspect-[3/1]", "4:3": "aspect-[4/3]", auto: "" }
  const aspect = aspectMap[str(s.aspect_ratio, "16:9")] ?? "aspect-video"
  const textColor = c.image_overlay_text

  return (
    <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("relative w-full overflow-hidden bg-neutral-900", aspect)}>
        {s.image_url ? (
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
            <span className="text-white/60 text-sm">Add an image</span>
          </div>
        )}
        {!!(s.heading || s.subheading) && (
          <>
            <div className="absolute inset-0" style={{ background: "#000", opacity: (Number(s.overlay_opacity ?? 30)) / 100 }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              {!!s.heading && <h2 className="text-3xl font-bold" style={{ color: textColor }}>{str(s.heading)}</h2>}
              {!!s.subheading && <p className="text-lg opacity-80" style={{ color: textColor }}>{str(s.subheading)}</p>}
            </div>
          </>
        )}
      </div>
    </SectionWrapper>
  )
}

export default ImageBannerSection
