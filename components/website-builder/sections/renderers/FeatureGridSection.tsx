"use client"

/**
 * ===========================================================================
 *  THE FEATURE GRID
 * ===========================================================================
 * Thirteen of nineteen controls did nothing: the eyebrow, the content width,
 * the alignment, every colour including the icon and card colours, the heading
 * size, the padding, and — on each block — the image, the link text and the
 * link. Only the icon, title and description were rendered.
 *
 * `grid-cols-${cols}` was also being built by string interpolation, which
 * Tailwind never sees and therefore never compiles: the two- and four-column
 * options fell back to whatever the browser does with an unknown class, which
 * is nothing.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  maxWidth,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  DynamicIcon,
  type SectionProps,
} from "../_shared"

const COLUMNS: Record<string, string> = {
  "2": "grid-cols-1 @[560px]:grid-cols-2",
  "3": "grid-cols-1 @[560px]:grid-cols-2 @[860px]:grid-cols-3",
  "4": "grid-cols-2 @[860px]:grid-cols-4",
}

export function FeatureGridSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const iconBg = str(s.icon_color) || c.primary_btn_bg
  const cardBg = str(s.card_bg_color)
  const cols = str(s.columns, "3")
  const alignment = str(s.alignment, "left")
  const blocks = section.blocks ?? []

  const alignClass =
    alignment === "center" ? "items-center text-center" : alignment === "right" ? "items-end text-right" : "items-start text-left"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 mx-auto"
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 60) }}
      >
        {!!(s.heading || s.subheading || s.eyebrow) && (
          <div className="text-center mb-10">
            {!!s.eyebrow && (
              <span
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: iconBg }}
              >
                {str(s.eyebrow)}
              </span>
            )}
            {!!s.heading && (
              <h2
                className="font-bold mb-2 text-2xl @[768px]:text-[length:var(--fg-heading)]"
                style={
                  {
                    color: headingColor,
                    fontFamily: theme.font_heading,
                    "--fg-heading": `${num(s.font_size_heading, 36)}px`,
                  } as CSSProperties
                }
              >
                {str(s.heading)}
              </h2>
            )}
            {!!s.subheading && (
              <p className="text-base" style={{ color: paraColor }}>
                {str(s.subheading)}
              </p>
            )}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>
            Add feature blocks in the sidebar
          </p>
        ) : (
          <div className={cn("grid gap-8", COLUMNS[cols] ?? COLUMNS["3"])}>
            {blocks.map((block) => {
              const b = block.settings
              const image = str(b.image)
              return (
                <div
                  key={block.id}
                  className={cn("flex flex-col gap-3", alignClass, cardBg && "rounded-2xl p-6")}
                  style={cardBg ? { background: cardBg } : undefined}
                >
                  {/* An image, when there is one, is what the feature is —
                      the icon is the fallback, not a second badge above it. */}
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className="h-32 w-full rounded-xl object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: iconBg, color: c.primary_btn_text }}
                    >
                      <DynamicIcon name={str(b.icon, "zap")} className="h-5 w-5" />
                    </div>
                  )}
                  <div className="font-semibold text-[15px]" style={{ color: headingColor }}>
                    {str(b.title)}
                  </div>
                  <div className="text-[13px] leading-relaxed" style={{ color: paraColor }}>
                    {str(b.description)}
                  </div>
                  {!!b.link_text && (
                    <a
                      href={str(b.link_url, "#")}
                      className="text-[13px] font-semibold hover:underline"
                      style={{ color: iconBg }}
                    >
                      {str(b.link_text)} →
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default FeatureGridSection
