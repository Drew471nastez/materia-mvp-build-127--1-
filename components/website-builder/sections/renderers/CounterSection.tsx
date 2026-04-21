"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

// ── Counter (animated stats) ─────────────────────────────────
function CounterItem({ start, end, unit, duration, color, fontSize }: { start: number; end: number; unit: string; duration: number; color: string; fontSize: number }) {
  const [val, setVal] = useState(start)
  useEffect(() => {
    let raf = 0
    const startT = performance.now()
    const run = (t: number) => {
      const p = Math.min(1, (t - startT) / (duration * 1000))
      setVal(Math.round(start + (end - start) * p))
      if (p < 1) raf = requestAnimationFrame(run)
    }
    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
  }, [start, end, duration])
  return <div style={{ color, fontSize, fontWeight: 700, lineHeight: 1.05 }}>{val}{unit}</div>
}

export function CounterSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const cols = Math.max(1, Math.min(4, Number(s.items_per_row ?? 3)))
  const gap = Number(s.column_gap ?? 30)
  const speed = Number(s.speed ?? 5)
  const align = str(s.content_alignment, "center")
  const headerAlign = str(s.header_alignment, "center")
  const numFont = Number(s.number_font_size ?? 48)
  const headingFont = Number(s.heading_font_size ?? 18)

  const alignClass: Record<string, string> = { left: "text-left items-start", center: "text-center items-center", right: "text-right items-end" }
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }
  const colsClass: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" }

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 80), paddingBottom: Number(s.padding_bottom ?? 80) }}
      >
        {(!!s.heading || !!s.description) && (
          <div className={cn("mb-10", headerAlignClass[headerAlign])}>
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.description && <p className="text-base" style={{ color: c.paragraph }}>{str(s.description)}</p>}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: c.paragraph }}>Add counter blocks in the sidebar</p>
        ) : (
          <div className={cn("grid", colsClass[cols])} style={{ gap: `${gap}px` }}>
            {blocks.map(block => (
              <div key={block.id} className={cn("flex flex-col", alignClass[align])}>
                <CounterItem
                  start={Number(block.settings.starting_number ?? 0)}
                  end={Number(block.settings.ending_number ?? 50)}
                  unit={str(block.settings.unit, "")}
                  duration={speed}
                  color={c.heading}
                  fontSize={numFont}
                />
                <div className="mt-3 font-semibold" style={{ color: c.heading, fontSize: headingFont }}>{str(block.settings.heading)}</div>
                {!!block.settings.description && (
                  <div className="mt-2 text-sm max-w-sm" style={{ color: c.paragraph }}>{str(block.settings.description)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default CounterSection
