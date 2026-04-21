"use client"

import { Star, Flower, Sparkles } from "lucide-react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Scrolling text (marquee) ─────────────────────────────────
export function ScrollingTextSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const direction = str(s.direction, "left")
  const speed = Number(s.speed ?? 20)
  const gap = Number(s.space_between_text ?? 60)
  const fontSize = Number(s.font_size ?? 14)
  const iconName = str(s.icon_between_item, "unset")
  const uppercase = bool(s.uppercase)
  const weight = str(s.font_weight, "body_weight")
  const useHeadingFont = bool(s.use_heading_font)
  const weightMap: Record<string, string> = { body_weight: "400", subheading_weight: "500", heading_weight: "700" }
  const fontWeight = weightMap[weight] ?? "400"

  const items = blocks.length > 0 ? blocks : [
    { id: "d1", type: "scrolling_text", settings: { content: "Free delivery from $120" } },
    { id: "d2", type: "scrolling_text", settings: { content: "Sign up for 10% off" } },
    { id: "d3", type: "scrolling_text", settings: { content: "Hand crafted in small batches" } },
  ]

  function Separator() {
    if (iconName === "unset") return null
    if (iconName === "dot") return <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: c.heading, marginInline: gap / 2 }} />
    if (iconName === "star") return <Star className="inline-block" style={{ color: c.heading, width: fontSize, height: fontSize, marginInline: gap / 2 }} />
    if (iconName === "flower") return <Flower className="inline-block" style={{ color: c.heading, width: fontSize, height: fontSize, marginInline: gap / 2 }} />
    if (iconName === "petal") return <Sparkles className="inline-block" style={{ color: c.heading, width: fontSize, height: fontSize, marginInline: gap / 2 }} />
    return <span className="inline-block" style={{ marginInline: gap / 2 }}>•</span>
  }

  const duplicated = [...items, ...items, ...items]
  const animationName = direction === "right" ? "scrollRight" : "scrollLeft"

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <style>{`
        @keyframes scrollLeft { from { transform: translateX(0); } to { transform: translateX(-33.3333%); } }
        @keyframes scrollRight { from { transform: translateX(-33.3333%); } to { transform: translateX(0); } }
      `}</style>
      <div
        className="w-full overflow-hidden"
        style={{ paddingTop: Number(s.padding_top ?? 20), paddingBottom: Number(s.padding_bottom ?? 20) }}
      >
        <div
          className="flex items-center whitespace-nowrap"
          style={{
            animation: `${animationName} ${speed * 3}s linear infinite`,
            gap: `${gap}px`,
            fontSize: `${fontSize}px`,
            color: c.heading,
            fontWeight,
            textTransform: uppercase ? "uppercase" : "none",
            letterSpacing: uppercase ? "0.08em" : undefined,
            fontFamily: useHeadingFont ? theme.font_heading : theme.font_body,
          }}
        >
          {duplicated.map((b, i) => (
            <span key={`${b.id}-${i}`} className="inline-flex items-center" style={{ gap: `${gap}px` }}>
              {str(b.settings.image as unknown) ? (
                <img src={str(b.settings.image as unknown)} alt="" className="inline-block object-contain" style={{ height: fontSize * 1.5 }} />
              ) : null}
              <span>{str(b.settings.content as unknown, "Announcement")}</span>
              <Separator />
            </span>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ScrollingTextSection
