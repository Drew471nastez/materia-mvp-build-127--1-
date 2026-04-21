"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { sectionColors, str, buttonRadiusStyle, SectionWrapper, type SectionProps } from "../_shared"

// ── Slideshow ────────────────────────────────────────────────
export function SlideshowSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg === "#ffffff" ? "#000000" : c.bg
  const blocks = section.blocks ?? []
  const [activeSlide, setActiveSlide] = useState(0)

  const slides = blocks.length > 0 ? blocks : [
    { id: "1", type: "slide", settings: { image_url: "", heading: "Slide 1", subheading: "Your first slide", button_text: "Shop Now" } },
    { id: "2", type: "slide", settings: { image_url: "", heading: "Slide 2", subheading: "Your second slide", button_text: "Learn More" } },
  ]

  const slide = slides[activeSlide] ?? slides[0]
  const slideSettings = slide?.settings ?? {}

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative w-full" style={{ height: `${s.height ?? 500}px` }}>
        {str(slideSettings.image_url as unknown) ? (
          <img src={str(slideSettings.image_url as unknown)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
          <div className="max-w-[1230px] mx-auto w-full px-8 text-center flex flex-col items-center">
            {!!slideSettings.heading && <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: theme.font_heading }}>{str(slideSettings.heading as unknown)}</h2>}
            {!!slideSettings.subheading && <p className="text-lg opacity-80 max-w-xl mb-6">{str(slideSettings.subheading as unknown)}</p>}
            {!!slideSettings.button_text && (
              <button
                className="px-8 py-3 text-sm font-semibold"
                style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
              >
                {str(slideSettings.button_text as unknown)}
              </button>
            )}
          </div>
        </div>
        {/* Dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button key={i} className={cn("w-2.5 h-2.5 rounded-full transition-all", i === activeSlide ? "bg-white" : "bg-white/40")} onClick={e => { e.stopPropagation(); setActiveSlide(i) }} />
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default SlideshowSection
