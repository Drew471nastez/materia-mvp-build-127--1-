"use client"

import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, buttonRadiusStyle, type SectionProps } from "../_shared"

export function ProductListSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cardBg = c.bg === "#ffffff" ? "#f8fafc" : c.bg
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }

  // Placeholder products
  const placeholders = Array.from({ length: parseInt(cols, 10) }, (_, i) => ({
    id: i,
    name: ["Digital Template Pack", "Course Bundle", "Icon Set Pro"][i % 3],
    price: ["$29", "$99", "$49"][i % 3],
    img: null,
  }))

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>
            {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        <div className={cn("grid gap-6", colClass[cols] ?? "grid-cols-3")}>
          {placeholders.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden border" style={{ borderColor: c.inset_border, background: cardBg }}>
              <div className="aspect-[4/3] bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
                <span className="text-white/50 text-xs">Product image</span>
              </div>
              <div className="p-4">
                <div className="font-semibold text-[14px] mb-1" style={{ color: headingColor }}>{p.name}</div>
                {bool(s.show_price) && <div className="text-[13px] font-bold" style={{ color: c.link }}>{p.price}</div>}
                {bool(s.show_button) && (
                  <button
                    className="mt-3 w-full py-1.5 text-[13px] font-semibold"
                    style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
                  >
                    Buy now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ProductListSection
