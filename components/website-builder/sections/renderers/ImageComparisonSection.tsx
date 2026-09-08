"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { sectionColors, str, bool, buttonRadiusStyle, SectionWrapper, type SectionProps } from "../_shared"

// ── Image comparison (before/after slider) ───────────────────
export function ImageComparisonSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const initial = Number(s.initial_position ?? 50)
  const [split, setSplit] = useState(initial)
  const isDragging = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const beforeUrl = str(s.before_image)
  const afterUrl = str(s.after_image)
  const showLabels = bool(s.show_after_before_text, true)
  const position = str(s.position, "left")
  const width = str(s.width, "75%")
  const ratio = str(s.image_ratio, "landscape")
  const headerAlign = str(s.header_alignment, "center")

  const ratioClass: Record<string, string> = {
    adapt: "aspect-[16/10]", square: "aspect-square", portrait: "aspect-[3/4]", landscape: "aspect-[16/9]",
  }

  useEffect(() => { setSplit(initial) }, [initial])

  function onMove(clientX: number) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.max(0, Math.min(100, x)))
  }

  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }

  const headingBlock = blocks.find(b => b.type === "heading")
  const descBlock = blocks.find(b => b.type === "description")
  const buttonBlock = blocks.find(b => b.type === "button")

  const content = (
    <div className="flex flex-col justify-center gap-4" style={{ maxWidth: 420 }}>
      {!!headingBlock && (
        <h3 className="font-bold" style={{ color: c.heading, fontSize: Number(headingBlock.settings.font_size ?? 36), fontFamily: theme.font_heading, textTransform: bool(headingBlock.settings.uppercase) ? "uppercase" : "none" }}>
          {str(headingBlock.settings.heading, "Talk about your brand")}
        </h3>
      )}
      {!!descBlock && (
        <p style={{ color: c.paragraph, fontSize: Number(descBlock.settings.font_size ?? 14) }}>
          {str(descBlock.settings.description, "")}
        </p>
      )}
      {!!buttonBlock && !!buttonBlock.settings.first_button_label && (
        <a
          href={str(buttonBlock.settings.first_button_link, "#")}
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold self-start"
          style={{
            background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`,
            ...buttonRadiusStyle(theme),
          }}
        >
          {str(buttonBlock.settings.first_button_label)}
        </a>
      )}
    </div>
  )

  const slider = (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden rounded-lg select-none bg-neutral-900", ratioClass[ratio] ?? ratioClass.landscape)}
      onMouseMove={(e) => { if (isDragging.current) onMove(e.clientX) }}
      onMouseUp={() => { isDragging.current = false }}
      onMouseLeave={() => { isDragging.current = false }}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      style={{ width }}
    >
      {/* Before (full) */}
      {beforeUrl ? (
        <img src={beforeUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-white/60 text-sm">Before image</div>
      )}
      {/* After (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        {afterUrl ? (
          <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-white/80 text-sm">After image</div>
        )}
      </div>
      {/* Labels */}
      {showLabels && (
        <>
          <span className="absolute top-3 left-3 text-xs font-semibold px-2 py-1 rounded bg-black/60 text-white">Before</span>
          <span className="absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded bg-black/60 text-white">After</span>
        </>
      )}
      {/* Divider handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-ew-resize"
        style={{ left: `${split}%`, transform: "translateX(-50%)" }}
        onMouseDown={(e) => { e.stopPropagation(); isDragging.current = true }}
        onTouchStart={() => { isDragging.current = true }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center">
          <div className="flex gap-0.5">
            <ChevronLeft className="w-4 h-4 text-neutral-800" />
            <ChevronRight className="w-4 h-4 text-neutral-800" />
          </div>
        </div>
      </div>
      {/* Range input for accessibility */}
      <input
        type="range" min={0} max={100} value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )

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
        <div className="flex flex-col @[768px]:flex-row items-center gap-8">
          {position === "left" ? (<>{content}{slider}</>) : (<>{slider}{content}</>)}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ImageComparisonSection
