"use client"

import { useRef } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Products carousel (horizontal scroll) ────────────────────
export function ProductsCarouselSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const itemsToShow = Math.max(2, Math.min(20, Number(s.items_to_show ?? 8)))
  const perRow = Math.max(2, Math.min(6, Number(s.items_per_row ?? 4)))
  const gap = Number(s.column_gap ?? 16)
  const showArrows = bool(s.show_arrows, true)
  const showBanner = bool(s.show_banner)
  const bannerImg = str(s.banner_image)
  const bannerPos = str(s.position, "left")
  const headerAlign = str(s.header_alignment, "left")
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }
  const scrollerRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: "left" | "right") => {
    const el = scrollerRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" })
  }

  const placeholders = Array.from({ length: itemsToShow }).map((_, i) => ({
    id: `p${i}`,
    title: `Product ${i + 1}`,
    price: `$${(29.99 + i * 10).toFixed(2)}`,
  }))

  const itemBasis = `calc((100% - ${(perRow - 1) * gap}px) / ${perRow})`

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 60), paddingBottom: Number(s.padding_bottom ?? 60) }}
      >
        <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", headerAlignClass[headerAlign])}>
          <div>
            {!!s.heading && <h2 className="text-3xl font-bold mb-1" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.description && <p className="text-base" style={{ color: c.paragraph }}>{str(s.description)}</p>}
          </div>
          <div className="flex items-center gap-3">
            {bool(s.show_view_all_button) && (
              <a className="text-sm font-semibold underline" style={{ color: c.heading }} href={str(s.view_all_url, "#")}>View all</a>
            )}
            {showArrows && (
              <div className="flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); scroll("left") }} className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ borderColor: c.border, color: c.heading }}>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); scroll("right") }} className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ borderColor: c.border, color: c.heading }}>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4" style={{ flexDirection: bannerPos === "right" ? "row-reverse" : "row" }}>
          {showBanner && (
            <div className="shrink-0 w-[280px] rounded-lg overflow-hidden bg-neutral-900 relative" style={{ minHeight: 400 }}>
              {bannerImg ? (
                <img src={bannerImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
              )}
            </div>
          )}
          <div
            ref={scrollerRef}
            className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth flex-1 pb-2"
            style={{ gap: `${gap}px`, scrollbarWidth: "none" }}
          >
            {placeholders.map(p => (
              <div key={p.id} className="shrink-0 snap-start" style={{ flexBasis: itemBasis, minWidth: 160 }}>
                <div className="aspect-[4/5] rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-white/50 text-xs mb-3">Image</div>
                <div className="font-semibold text-sm" style={{ color: c.heading }}>{p.title}</div>
                <div className="text-sm" style={{ color: c.paragraph }}>{p.price}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ProductsCarouselSection
