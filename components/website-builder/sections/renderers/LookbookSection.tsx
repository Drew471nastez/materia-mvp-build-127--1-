"use client"

// Lookbook — full-width fashion hero with overlayed collection info and
// an optional mood / overlay treatment.

import { cn } from "@/lib/utils"
import { str, SectionWrapper, hexToRgba, type SectionProps } from "../_shared"

/**
 * The six moods, as typography. A lookbook's mood is carried by how the
 * collection name is set — a thin airy line, a heavy compressed block, a
 * serif with wide letter-spacing — which is exactly what this control was
 * naming and exactly what it never changed.
 */
const MOOD: Record<string, string> = {
  minimal: "text-5xl @[768px]:text-7xl font-light",
  bold: "text-5xl @[768px]:text-8xl font-black uppercase tracking-tight",
  editorial: "text-5xl @[768px]:text-7xl font-serif italic",
  street: "text-5xl @[768px]:text-8xl font-extrabold uppercase tracking-[-0.03em]",
  luxury: "text-4xl @[768px]:text-6xl font-light uppercase tracking-[0.22em]",
  bohemian: "text-5xl @[768px]:text-7xl font-serif tracking-wide",
}

export function LookbookSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f5f0eb")
  const textColor = str(s.text_color, "#ffffff")
  const headingColor = str(s.heading_color, "#ffffff")
  const accent = str(s.accent_color, "#d4a96a")
  const overlayStyle = str(s.overlay_style, "dark")
  const overlayColor = overlayStyle === "dark" ? "#000000"
    : overlayStyle === "light" ? "#ffffff"
    : overlayStyle === "color" ? str(s.overlay_color, "#000000")
    : "transparent"
  const overlayOp = typeof s.overlay_opacity === "number" ? s.overlay_opacity : 35
  const position = str(s.text_position, "bottom-left")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 0
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 0
  const heroImage = str(s.hero_image)
  const imgPos = str(s.hero_image_position, "center")
  const imgObjectPos = imgPos === "top" ? "center top" : imgPos === "bottom" ? "center bottom" : "center center"
  const ctaStyle = str(s.cta_style, "outline")
  const mood = str(s.mood_style, "minimal")
  const ctaColor = str(s.cta_color, "#ffffff")
  const ctaTextColor = str(s.cta_text_color, "#111111")

  const posMap: Record<string, string> = {
    "top-left": "items-start justify-start text-left",
    "top-center": "items-start justify-center text-center",
    "bottom-left": "items-end justify-start text-left",
    "bottom-center": "items-end justify-center text-center",
    "center": "items-center justify-center text-center",
  }
  const posCls = posMap[position] ?? "items-end justify-start text-left"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative w-full overflow-hidden" style={{ minHeight: "80vh", paddingTop: padTop, paddingBottom: padBottom }}>
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage} alt={str(s.collection_name)} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: imgObjectPos }} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-600" />
        )}
        {overlayStyle !== "none" && (
          <div className="absolute inset-0" style={{ background: hexToRgba(overlayColor, overlayOp / 100) }} />
        )}
        <div className={`relative flex flex-col h-full min-h-[80vh] p-10 @[768px]:p-16 ${posCls}`} style={{ color: textColor }}>
          <div className="max-w-xl">
            {!!s.season_text && (
              <p className="text-xs uppercase tracking-[0.25em] mb-4 opacity-90" style={{ color: accent }}>
                {str(s.season_text)}
              </p>
            )}
            {!!s.collection_name && (
              <h2 className={cn("mb-3 leading-tight", MOOD[mood] ?? MOOD.minimal)} style={{ color: headingColor }}>
                {str(s.collection_name)}
              </h2>
            )}
            {!!s.subtitle && <p className="text-lg mb-4 opacity-95">{str(s.subtitle)}</p>}
            {!!s.description && <p className="text-sm opacity-90 mb-6">{str(s.description)}</p>}
            {/* `mood_style` offered six editorial treatments and set nothing;
                every lookbook was the same. It shapes the typography, which is
                what "mood" means in an editorial layout. */}
            {!!s.cta_text && (
              <a
                href={str(s.cta_url, "#")}
                className="inline-block px-7 py-3 text-sm font-semibold tracking-wide uppercase"
                style={
                  ctaStyle === "filled"
                    ? { background: ctaColor, color: ctaTextColor }
                    : ctaStyle === "ghost"
                      ? { color: textColor }
                      : { border: `1px solid ${ctaColor}`, color: ctaColor }
                }
              >
                {str(s.cta_text)}
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default LookbookSection
