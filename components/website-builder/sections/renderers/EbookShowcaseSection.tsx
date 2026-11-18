"use client"

// Ebook showcase — niche book/ebook product section with cover mockup,
// ratings, table of contents, and primary/secondary CTAs.

import { Star } from "lucide-react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

export function EbookShowcaseSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const accent = str(s.accent_color) || c.accent
  const layout = str(s.layout, "left")
  const mockup = str(s.mockup_style, "perspective")
  const showShadow = bool(s.show_mockup_shadow, true)
  const rating = typeof s.rating_value === "number" ? s.rating_value : 4.8
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  /*
    A TILTED COVER IS WIDER THAN ITS BOX. Rotated 6 degrees, a 2:3 cover's
    outline is about 15% wider than the cover, so a cover as wide as a phone
    column stuck out past the page (2px at 360, measured in round 56). Tilted,
    it takes 84% of the column; the outline then fits with room to spare.
  */
  const tilted = mockup === "perspective" || mockup === "stack"
  const cover = (
    <div
      data-ebook-cover={tilted ? "tilted" : "flat"}
      className={`relative ${tilted ? "w-[84%]" : "w-full"} max-w-sm mx-auto transition-transform ${
        mockup === "perspective" ? "rotate-[-6deg]" :
        mockup === "3d" ? "[transform:perspective(800px)_rotateY(-15deg)]" :
        mockup === "stack" ? "rotate-[2deg]" : ""
      }`}
      style={showShadow ? { filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.25))" } : undefined}
    >
      {str(s.book_cover_image) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(s.book_cover_image)} alt={str(s.heading)} className="w-full rounded-sm" />
      ) : (
        <div className="w-full aspect-[2/3] rounded-sm flex items-center justify-center p-6 text-center" style={{ background: "#2a2a2a", color: "#fff" }}>
          <div>
            <div className="text-xs uppercase tracking-widest opacity-70">{str(s.format_tags, "PDF · EPUB")}</div>
            <h3 className="text-2xl font-bold mt-3">{str(s.heading, "Book Title")}</h3>
            <p className="text-sm opacity-80 mt-2">{str(s.subheading)}</p>
            <p className="text-xs opacity-70 mt-6">by {str(s.author_name, "Author")}</p>
          </div>
        </div>
      )}
    </div>
  )

  const content = (
    <div className="space-y-4">
      {!!s.badge_text && (
        <span className="inline-block text-xs font-bold uppercase tracking-widest px-2 py-1 rounded" style={{ background: accent, color: "#fff" }}>
          {str(s.badge_text)}
        </span>
      )}
      <h2 className="text-4xl font-bold leading-tight">{str(s.heading, "Book Title")}</h2>
      {!!s.subheading && <p className="text-lg opacity-80">{str(s.subheading)}</p>}
      {!!s.author_name && (
        <p className="text-sm opacity-70">
          by <strong>{str(s.author_name)}</strong>
          {!!s.author_title && <span> · {str(s.author_title)}</span>}
        </p>
      )}
      {bool(s.show_stars, true) && (
        <div className="flex items-center gap-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-4 h-4" style={{ color: accent, fill: i < Math.round(rating) ? accent : "none" }} />
            ))}
          </div>
          <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
          {!!s.review_count && <span className="text-sm opacity-70">({String(s.review_count)} reviews)</span>}
        </div>
      )}
      <div className="flex items-baseline gap-3">
        {!!s.price_text && <span className="text-3xl font-bold">{str(s.price_text)}</span>}
        {!!s.original_price && <span className="text-lg opacity-60 line-through">{str(s.original_price)}</span>}
      </div>
      {!!s.description && <p className="opacity-85">{str(s.description)}</p>}
      <div className="flex flex-wrap gap-3 pt-2">
        {!!s.buy_button_text && (
          <a
            href={str(s.buy_button_url, "#")}
            className="px-6 py-3 rounded font-semibold"
            style={{ background: str(s.buy_button_color) || c.primary_btn_bg, color: str(s.buy_button_text_color) || c.primary_btn_text }}
          >
            {str(s.buy_button_text)}
          </a>
        )}
        {!!s.sample_button_text && (
          <a
            href={str(s.sample_button_url, "#")}
            className="px-6 py-3 rounded font-semibold"
            style={
              str(s.sample_button_style, "outline") === "ghost"
                ? { color }
                : { border: `1px solid ${color}`, color }
            }
          >
            {str(s.sample_button_text)}
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-6 text-sm opacity-70 pt-3">
        {!!s.page_count && <div><strong className="opacity-100">{String(s.page_count)}</strong> pages</div>}
        {!!s.chapter_count && <div><strong className="opacity-100">{String(s.chapter_count)}</strong> chapters</div>}
        {!!s.read_time && <div>{str(s.read_time)} read</div>}
        {!!s.release_date && <div>Released {str(s.release_date)}</div>}
      </div>
      {/*
        The Excerpt / First Chapter Preview ships with a full paragraph of
        default copy and no renderer read it — so the one thing that sells a
        book, a taste of the writing, was never on the page.
      */}
      {!!s.excerpt && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          <h4 className="mb-2 text-sm font-bold uppercase tracking-widest">Excerpt</h4>
          <div className="space-y-2 text-sm leading-relaxed opacity-85">
            {str(s.excerpt)
              .split("\n")
              .filter(Boolean)
              .map((line, i) => (
                <p key={i}>{line}</p>
              ))}
          </div>
        </div>
      )}
      {bool(s.show_table_of_contents, true) && !!s.toc_items && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          <h4 className="text-sm font-bold uppercase tracking-widest mb-2">Table of contents</h4>
          <ul className="text-sm space-y-1 opacity-80">
            {str(s.toc_items).split("\n").filter(Boolean).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "center" ? (
          <div className="max-w-2xl mx-auto text-center space-y-8">
            {cover}
            {content}
          </div>
        ) : (
          <div className="grid @[768px]:grid-cols-2 gap-10 items-center">
            {layout === "right" ? <>{content}{cover}</> : <>{cover}{content}</>}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default EbookShowcaseSection
