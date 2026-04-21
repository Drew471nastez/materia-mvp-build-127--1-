"use client"

import { cn } from "@/lib/utils"
import { bool, sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function LogoBarSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const paraColor = c.paragraph
  const blocks = section.blocks ?? []
  const grayscale = bool(s.grayscale, true)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-10 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <p className="text-center text-sm font-medium mb-6 uppercase tracking-widest" style={{ color: paraColor }}>
            {str(s.heading)}
          </p>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add logo blocks in the sidebar</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-8">
            {blocks.map(block => (
              <div key={block.id} className={cn("h-8", grayscale && "grayscale opacity-60")}>
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.alt)} className="h-full w-auto object-contain" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-8 w-20 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded flex items-center justify-center text-[10px] text-white/60">Logo</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default LogoBarSection
