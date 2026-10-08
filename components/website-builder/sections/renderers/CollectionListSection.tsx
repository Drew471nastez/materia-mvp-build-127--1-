"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Collection list — grid of collection cards ───────────────
export function CollectionListSection({ section, theme, isEditing, isSelected, onClick, insideEditor }: SectionProps) {
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
  const displayMode = str(s.display_mode, "grid")
  const colsClass: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 @[768px]:grid-cols-3", 4: "grid-cols-2 @[768px]:grid-cols-4", 5: "grid-cols-2 @[768px]:grid-cols-5", 6: "grid-cols-2 @[768px]:grid-cols-6" }

  /* Collections the creator filled in, never invented ones ("New arrivals", 24 products). None yet: nothing on a live page, empty tiles in the editor. */
  if (blocks.length === 0 && !insideEditor) return null
  const demoBlocks = blocks.length > 0 ? blocks : [1, 2, 3, 4].map((n) => ({ id: `d${n}`, type: "collection", settings: { collection_title: "", product_count: 0 } as Record<string, unknown> }))

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-(--theme-padding-x) max-w-(--theme-page-width) mx-auto"
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
        {/*
          `display_mode` offered Grid and Carousel and always drew the grid.
          A carousel is the same cards in a snapping scroller, which is what
          the control has been promising.
        */}
        <div
          className={cn(
            displayMode === "carousel"
              ? "flex overflow-x-auto snap-x snap-mandatory pb-2 [&>*]:w-[70%] [&>*]:shrink-0 [&>*]:snap-start @[768px]:[&>*]:w-[32%]"
              : cn("grid", colsClass[cols]),
          )}
          style={{ gap: `${gap}px` }}
        >
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
