"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

export function StatsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const textColor = c.paragraph
  const blocks = section.blocks ?? []
  /**
   * This used to take `deviceMode` and force the mobile layout by hand, because
   * a `md:` media query asks about the browser window and the editor's phone
   * preview is a 380px card inside a 1440px window. The container queries below
   * ask about the card, so the hand-forcing is gone: one mechanism, and it is
   * the same one the other forty-nine sections use.
   */
  const gridCols = "grid-cols-2 @[768px]:grid-cols-4"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-5 @[768px]:px-8 py-10 @[768px]:py-14">
        {!!s.heading && (
          <div className="text-center mb-6 @[768px]:mb-8">
            <h2
              className="font-bold text-2xl @[768px]:text-3xl"
              style={{ color: c.heading, fontFamily: theme.font_heading }}
            >
              {str(s.heading)}
            </h2>
            {!!s.subheading && (
              <p className="text-sm @[768px]:text-base mt-2" style={{ color: textColor }}>
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
                className="font-bold mb-1 leading-tight tabular-nums text-3xl @[768px]:text-4xl"
                style={{ color: c.heading }}
              >
                {str(block.settings.value)}
              </div>
              <div className="text-[12px] @[768px]:text-[13px] leading-snug" style={{ color: textColor }}>
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
