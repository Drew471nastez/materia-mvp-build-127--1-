"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function StatsSection({ section, theme, isEditing, isSelected, onClick, deviceMode }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const textColor = c.paragraph
  const blocks = section.blocks ?? []
  // `deviceMode === "mobile"` is set by the editor preview to force the
  // mobile layout regardless of browser viewport. On the live site
  // `deviceMode` is undefined and Tailwind `md:` classes handle it.
  const forceMobile = deviceMode === "mobile"
  const gridCols = forceMobile
    ? "grid-cols-2"
    : "grid-cols-2 md:grid-cols-4"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("max-w-[1230px] mx-auto", forceMobile ? "px-5 py-10" : "px-6 md:px-8 py-10 md:py-14")}>
        {!!s.heading && (
          <div className="text-center mb-6 md:mb-8">
            <h2
              className={cn(
                "font-bold",
                forceMobile ? "text-2xl" : "text-2xl md:text-3xl",
              )}
              style={{ color: c.heading, fontFamily: theme.font_heading }}
            >
              {str(s.heading)}
            </h2>
            {!!s.subheading && (
              <p className="text-sm md:text-base mt-2" style={{ color: textColor }}>
                {str(s.subheading)}
              </p>
            )}
          </div>
        )}
        <div
          className={cn(
            "grid gap-x-4 gap-y-8 text-center",
            gridCols,
          )}
        >
          {blocks.map(block => (
            <div key={block.id} className="min-w-0">
              <div
                className={cn(
                  "font-bold mb-1 leading-tight tabular-nums",
                  forceMobile ? "text-3xl" : "text-3xl md:text-4xl",
                )}
                style={{ color: c.heading }}
              >
                {str(block.settings.value)}
              </div>
              <div className="text-[12px] md:text-[13px] leading-snug" style={{ color: textColor }}>
                {str(block.settings.label)}
              </div>
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="col-span-full text-sm opacity-40 text-center" style={{ color: textColor }}>
              Add stat blocks in the sidebar
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default StatsSection
