"use client"

/**
 * ===========================================================================
 *  TESTIMONIALS
 * ===========================================================================
 * Every avatar was a coloured initial. The block schema calls the image
 * `avatar`; the renderer read `avatar_url`, which the schema has never had, so
 * an uploaded photo could not appear.
 *
 * Fifteen of the twenty controls did nothing: the subheading, the star
 * rating, the date, the accent colour, the card colour, the layout (card,
 * carousel and masonry all rendered the same three-column grid), the company,
 * the verified tick, the source, and the padding.
 */

import { cn } from "@/lib/utils"
import {
  bool,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"

/** Where a quote came from, said in words rather than a fetched logo. */
const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  trustpilot: "Trustpilot",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X",
  yelp: "Yelp",
  site: "Verified purchase",
}

export function TestimonialsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const cardBg = str(s.card_bg_color) || (c.bg === "#ffffff" ? "#f8fafc" : c.bg)
  const accent = str(s.accent_color) || c.primary_btn_bg
  const layout = str(s.layout, "carousel")
  const showRating = bool(s.show_rating, true)
  const showDate = bool(s.show_date, false)
  const blocks = section.blocks ?? []

  /**
   * Three real layouts. "carousel" scrolls horizontally and snaps, "masonry"
   * lets the cards keep their own heights, "card" is the even grid. All three
   * rendered as the same grid before, so two of the three options in the panel
   * were decoration.
   */
  const container =
    layout === "carousel"
      ? "flex gap-6 overflow-x-auto snap-x snap-mandatory pb-2"
      : layout === "masonry"
        ? "columns-1 @[640px]:columns-2 @[768px]:columns-3 gap-6"
        : "grid grid-cols-1 @[640px]:grid-cols-2 @[768px]:grid-cols-3 gap-6"

  const cardClass = cn(
    "rounded-xl p-6 border",
    layout === "carousel" && "w-[82%] shrink-0 snap-start @[640px]:w-[46%] @[768px]:w-[31%]",
    layout === "masonry" && "mb-6 break-inside-avoid",
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1230px] mx-auto" style={sectionPadding(s, 64)}>
        {!!s.heading && (
          <h2
            className="text-3xl font-bold text-center mb-3"
            style={{ color: headingColor, fontFamily: theme.font_heading }}
          >
            {str(s.heading)}
          </h2>
        )}
        {!!s.subheading && (
          <p className="mx-auto mb-10 max-w-xl text-center text-base" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!s.subheading && !!s.heading && <div className="mb-10" />}

        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>
            Add testimonial blocks in the sidebar
          </p>
        ) : (
          <div className={container}>
            {blocks.map((block) => {
              const b = block.settings
              const rating = Math.max(0, Math.min(5, num(b.rating, 5)))
              const avatar = str(b.avatar)
              const source = str(b.source)
              return (
                <div key={block.id} className={cardClass} style={{ background: cardBg, borderColor: c.inset_border }}>
                  {showRating && (
                    <div className="mb-3 flex gap-0.5" aria-label={`${rating} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className="text-[15px] leading-none"
                          style={{ color: i < rating ? accent : c.inset_border }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[14px] leading-relaxed mb-4" style={{ color: paraColor }}>
                    &ldquo;{str(b.quote)}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    {avatar ? (
                      <img
                        src={avatar}
                        className="h-9 w-9 rounded-full object-cover"
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: c.primary_btn_bg, color: c.primary_btn_text }}
                      >
                        {str(b.author).charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: headingColor }}>
                        <span className="truncate">{str(b.author)}</span>
                        {bool(b.verified) && (
                          <span
                            title="Verified"
                            aria-label="Verified"
                            className="text-[11px] leading-none"
                            style={{ color: accent }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: paraColor, opacity: 0.85 }}>
                        {[str(b.role), str(b.company)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  {(showDate || !!source) && (
                    <div
                      className="mt-3 flex items-center justify-between text-[11px]"
                      style={{ color: paraColor, opacity: 0.7 }}
                    >
                      <span>{showDate ? str(b.date) : ""}</span>
                      {!!source && <span>{SOURCE_LABEL[source] ?? source}</span>}
                    </div>
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

export default TestimonialsSection
