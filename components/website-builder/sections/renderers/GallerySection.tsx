"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function GallerySection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
        {blocks.length === 0 ? (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {Array.from({ length: parseInt(cols, 10) }).map((_, i) => (
              <div key={i} className="aspect-square bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl flex items-center justify-center text-xs text-white/50">Photo</div>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="aspect-square rounded-xl overflow-hidden">
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.caption)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-xs text-white/50">Image</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default GallerySection
