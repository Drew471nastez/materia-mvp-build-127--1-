"use client"

// Sticky bar — a compact promo strip. The "sticky" positioning is the
// responsibility of the outer page layout when this is used as a true
// site-wide bar; inside the editor we render it inline so it's visible
// and selectable.

import { useState } from "react"
import { X } from "lucide-react"
import { str, SectionWrapper, type SectionProps } from "../_shared"

export function StickyBarSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const [dismissed, setDismissed] = useState(false)
  if (dismissed && !isEditing) return null

  const bg = str(s.bg_color, "#111111")
  const color = str(s.text_color, "#ffffff")
  const padY = typeof s.padding_y === "number" ? s.padding_y : 12
  const showClose = s.show_close !== false

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="flex items-center justify-center gap-3 px-6 text-sm"
        style={{ color, paddingTop: padY, paddingBottom: padY }}
      >
        <span className="text-center">{str(s.text, "Free shipping on orders over $75")}</span>
        {!!s.link_text && (
          <a href={str(s.link_url, "#")} className="underline underline-offset-2 font-semibold">
            {str(s.link_text)}
          </a>
        )}
        {showClose && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </SectionWrapper>
  )
}

export default StickyBarSection
