"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, SectionWrapper, type SectionProps } from "../_shared"

// ── Banner packery (masonry banners) ─────────────────────────
export function BannerPackerySection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const gap = Number(s.column_gap ?? 16)
  const headerAlign = str(s.header_alignment, "left")
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }

  const demoBlocks = blocks.length > 0 ? blocks : [
    { id: "p1", type: "image_with_text_overlay", settings: { heading: "New arrivals", subheading: "Spring", first_button_label: "Shop", content_position: "bottom-left", image_overlay_opacity: 20 } },
    { id: "p2", type: "image_with_text_overlay", settings: { heading: "Accessories", subheading: "Essentials", first_button_label: "Shop", content_position: "bottom-left", image_overlay_opacity: 20 } },
    { id: "p3", type: "image_with_text_overlay", settings: { heading: "Best sellers", subheading: "Top rated", first_button_label: "Shop", content_position: "bottom-left", image_overlay_opacity: 20 } },
    { id: "p4", type: "image_with_text_overlay", settings: { heading: "Sale", subheading: "50% off", first_button_label: "Shop", content_position: "bottom-left", image_overlay_opacity: 20 } },
  ]

  // Packery layout based on number of items
  const count = demoBlocks.length
  const layouts: Record<number, string[]> = {
    1: ["col-span-12 row-span-2"],
    2: ["col-span-6 row-span-2", "col-span-6 row-span-2"],
    3: ["col-span-6 row-span-2", "col-span-6 row-span-1", "col-span-6 row-span-1"],
    4: ["col-span-6 row-span-2", "col-span-6 row-span-1", "col-span-3 row-span-1", "col-span-3 row-span-1"],
    5: ["col-span-6 row-span-2", "col-span-3 row-span-1", "col-span-3 row-span-1", "col-span-3 row-span-1", "col-span-3 row-span-1"],
  }
  const spans = layouts[count] ?? layouts[4]

  const posClass: Record<string, string> = {
    "top-left": "items-start justify-start text-left",
    "top-center": "items-start justify-center text-center",
    "top-right": "items-start justify-end text-right",
    "middle-left": "items-center justify-start text-left",
    "middle-center": "items-center justify-center text-center",
    "middle-right": "items-center justify-end text-right",
    "bottom-left": "items-end justify-start text-left",
    "bottom-center": "items-end justify-center text-center",
    "bottom-right": "items-end justify-end text-right",
  }

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 60), paddingBottom: Number(s.padding_bottom ?? 60) }}
      >
        {(!!s.heading || !!s.description) && (
          <div className={cn("mb-8", headerAlignClass[headerAlign])}>
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.description && <p className="text-base" style={{ color: c.paragraph }}>{str(s.description)}</p>}
          </div>
        )}
        <div className="grid grid-cols-12 grid-rows-2 auto-rows-[200px]" style={{ gap: `${gap}px` }}>
          {demoBlocks.map((block, i) => {
            const img = str(block.settings.image)
            const overlay = Number(block.settings.image_overlay_opacity ?? 0) / 100
            const pos = str(block.settings.content_position, "bottom-left")
            return (
              <div key={block.id} className={cn("relative overflow-hidden rounded-lg bg-neutral-900", spans[i] ?? "col-span-6 row-span-1")}>
                {img ? (
                  <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
                )}
                {overlay > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />}
                <div className={cn("absolute inset-0 p-6 flex flex-col", posClass[pos])}>
                  <div className="flex flex-col gap-2 max-w-[75%]">
                    {!!block.settings.subheading && <span className="text-xs uppercase tracking-widest font-semibold text-white/90">{str(block.settings.subheading)}</span>}
                    {!!block.settings.heading && <h3 className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: theme.font_heading }}>{str(block.settings.heading)}</h3>}
                    {!!block.settings.description && <p className="text-sm text-white/80">{str(block.settings.description)}</p>}
                    {!!block.settings.first_button_label && (
                      <a className="inline-block mt-2 text-sm font-semibold text-white underline underline-offset-4 self-start">
                        {str(block.settings.first_button_label)}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default BannerPackerySection
