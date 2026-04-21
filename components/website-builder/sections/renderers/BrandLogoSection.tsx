"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Brand logos ──────────────────────────────────────────────
export function BrandLogoSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const cols = Math.max(2, Math.min(8, Number(s.items_per_row ?? 6)))
  const gap = Number(s.column_gap ?? 24)
  const imgWidth = Number(s.img_width ?? 140)
  const opacity = Number(s.logo_opacity ?? 100) / 100
  const grayscale = bool(s.grayscale)
  const framed = bool(s.framed)
  const headerAlign = str(s.header_alignment, "center")
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }
  const colsClass: Record<number, string> = {
    2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 md:grid-cols-4", 5: "grid-cols-2 md:grid-cols-5",
    6: "grid-cols-3 md:grid-cols-6", 7: "grid-cols-3 md:grid-cols-7", 8: "grid-cols-4 md:grid-cols-8",
  }

  const demoBlocks = blocks.length > 0 ? blocks : Array.from({ length: 6 }).map((_, i) => ({
    id: `d${i}`, type: "brand_items", settings: { alt: `Brand ${i + 1}` } as Record<string, unknown>,
  }))

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 40), paddingBottom: Number(s.padding_bottom ?? 40) }}
      >
        {(!!s.heading || !!s.description) && (
          <div className={cn("mb-8", headerAlignClass[headerAlign])}>
            {!!s.heading && <h2 className="text-2xl font-bold mb-1" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.description && <p className="text-sm" style={{ color: c.paragraph }}>{str(s.description)}</p>}
          </div>
        )}
        <div className={cn("grid items-center justify-items-center", colsClass[cols] ?? "grid-cols-3 md:grid-cols-6")} style={{ gap: `${gap}px` }}>
          {demoBlocks.map(block => {
            const image = str(block.settings.image)
            const link = str(block.settings.link)
            const alt = str(block.settings.alt, "Brand")
            const inner = image ? (
              <img
                src={image}
                alt={alt}
                className={cn("object-contain", grayscale && "grayscale")}
                style={{ width: imgWidth, opacity }}
              />
            ) : (
              <div
                className={cn("flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 text-white/60 text-xs rounded", grayscale && "grayscale")}
                style={{ width: imgWidth, height: imgWidth * 0.45, opacity }}
              >
                {alt}
              </div>
            )
          return (
            <div
              key={block.id}
              className={cn("flex items-center justify-center", framed && "border rounded-md p-4")}
              style={{ borderColor: framed ? c.border : undefined }}
            >
              {link ? <a href={link} target={bool(s.open_link_newtab, true) ? "_blank" : undefined} rel="noreferrer">{inner}</a> : inner}
            </div>
          )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default BrandLogoSection
