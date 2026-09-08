"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Collection list — grid of collection cards ───────────────
export function CollectionListSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const cols = Math.max(2, Math.min(6, Number(s.items_per_row ?? 4)))
  const gap = Number(s.column_gap ?? 16)
  const ratio = str(s.image_ratio, "square")
  const showCount = bool(s.show_product_count, true)
  const headerAlign = str(s.header_alignment, "left")

  const ratioClass: Record<string, string> = { adapt: "aspect-[4/5]", square: "aspect-square", portrait: "aspect-[3/4]", landscape: "aspect-[4/3]" }
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }
  const colsClass: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 @[768px]:grid-cols-3", 4: "grid-cols-2 @[768px]:grid-cols-4", 5: "grid-cols-2 @[768px]:grid-cols-5", 6: "grid-cols-2 @[768px]:grid-cols-6" }

  const demoBlocks = blocks.length > 0 ? blocks : [
    { id: "d1", type: "collection", settings: { collection_title: "New arrivals", product_count: 24 } },
    { id: "d2", type: "collection", settings: { collection_title: "Best sellers", product_count: 18 } },
    { id: "d3", type: "collection", settings: { collection_title: "Accessories", product_count: 12 } },
    { id: "d4", type: "collection", settings: { collection_title: "Sale", product_count: 32 } },
  ]

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 60), paddingBottom: Number(s.padding_bottom ?? 60) }}
      >
        {(!!s.heading || !!s.description) && (
          <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", headerAlignClass[headerAlign])}>
            <div>
              {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
              {!!s.description && <p className="text-base" style={{ color: c.paragraph }}>{str(s.description)}</p>}
            </div>
            {bool(s.show_view_all_button) && (
              <a className="text-sm font-semibold underline" style={{ color: c.heading }} href="#">View all</a>
            )}
          </div>
        )}
        <div className={cn("grid", colsClass[cols])} style={{ gap: `${gap}px` }}>
          {demoBlocks.map(block => {
            const url = str(block.settings.url, "#")
            const img = str(block.settings.collection_image)
            return (
              <a key={block.id} href={url} className="group block" onClick={(e) => e.preventDefault()}>
                <div className={cn("overflow-hidden rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 relative", ratioClass[ratio] ?? "aspect-square")}>
                  {img ? (
                    <img src={img} alt={str(block.settings.collection_title)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 text-xs">Collection</div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="font-semibold text-[15px]" style={{ color: c.heading }}>{str(block.settings.collection_title, "Collection")}</div>
                  {showCount && (
                    <div className="text-xs mt-0.5" style={{ color: c.paragraph }}>
                      {Number(block.settings.product_count ?? 0)} products
                    </div>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default CollectionListSection
