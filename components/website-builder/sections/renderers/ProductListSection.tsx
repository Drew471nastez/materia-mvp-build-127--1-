"use client"

/**
 * ===========================================================================
 *  THE PRODUCT LIST
 * ===========================================================================
 * Sixteen of twenty controls did nothing: the card style, the card aspect
 * ratio, how many products to show, the content width, the compare-at price,
 * the review count, quick add, the wishlist, sort, filter, pagination, the
 * colours, the heading size and the padding. `show_button` was read and does
 * not exist — the schema calls it `show_quick_add` — so the buy button never
 * appeared, and `show_price` was read WITHOUT its default, so an older section
 * saved before that control existed hid its prices.
 *
 * SEPARATELY, AND WORSE: the products are placeholders and this component also
 * renders the PUBLISHED storefront, so a live page shows three products that
 * do not exist. That is a data problem rather than a settings one and it is
 * tracked on its own; every control below is now real either way.
 */

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  bool,
  buttonRadiusStyle,
  maxWidth,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps, schemeButton } from "../_shared"

const COLUMNS: Record<string, string> = {
  "2": "grid-cols-1 @[520px]:grid-cols-2",
  "3": "grid-cols-2 @[820px]:grid-cols-3",
  "4": "grid-cols-2 @[820px]:grid-cols-4",
  "5": "grid-cols-2 @[820px]:grid-cols-5",
}

const ASPECT: Record<string, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
}

export function ProductListSection({ section, theme, isEditing, isSelected, onClick, insideEditor }: SectionProps) {
  /* It never receives the store, so a visitor sees nothing rather than products that do not exist. */
  if (!insideEditor) return null
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const cardBg = c.bg === "#ffffff" ? "#f8fafc" : c.bg
  const cols = str(s.columns, "3")
  const cardStyle = str(s.card_style, "minimal")
  const aspect = ASPECT[str(s.card_aspect_ratio, "square")] ?? ASPECT.square

  /**
   * How many to show. Clamped rather than trusted: a slider the model can set
   * to 500 would render five hundred cards into the editor canvas.
   */
  const count = Math.max(1, Math.min(24, num(s.products_count, 8)))

  /* Empty cards in the editor: the layout and its controls, never invented products. Product Grid shows the real ones. */
  const NAMES = [""]
  const PRICES = [""]
  const WAS = [""]
  const placeholders = Array.from({ length: count }, (_, i) => ({
    id: i,
    name: NAMES[i % NAMES.length],
    price: PRICES[i % PRICES.length],
    was: WAS[i % WAS.length],
    reviews: 0,
  }))

  const card: CSSProperties =
    cardStyle === "bordered"
      ? { border: `1px solid ${c.inset_border}`, background: cardBg }
      : cardStyle === "shadowed"
        ? { background: cardBg, boxShadow: "0 1px 3px rgba(15,23,42,0.10)" }
        : cardStyle === "elevated"
          ? { background: cardBg, boxShadow: "0 12px 32px -12px rgba(15,23,42,0.28)" }
          : { background: "transparent" }

  const showSort = bool(s.show_sort)
  const showFilter = bool(s.show_filter)
  const pagination = str(s.pagination_style, "loadmore")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 mx-auto"
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 64) }}
      >
        {!!s.heading && (
          <div className="text-center mb-8">
            <h2
              className="font-bold mb-2 text-2xl @[768px]:text-[length:var(--pl-heading)]"
              style={
                {
                  color: headingColor,
                  fontFamily: theme.font_heading,
                  "--pl-heading": `${num(s.font_size_heading, 36)}px`,
                } as CSSProperties
              }
            >
              {str(s.heading)}
            </h2>
            {!!s.subheading && (
              <p className="text-base" style={{ color: paraColor }}>
                {str(s.subheading)}
              </p>
            )}
          </div>
        )}

        {(showSort || showFilter) && (
          <div
            className="mb-6 flex items-center justify-between gap-4 border-b pb-3 text-[13px]"
            style={{ borderColor: c.inset_border, color: paraColor }}
          >
            {showFilter ? (
              <div className="flex gap-2">
                {["All", "New", "Bestsellers"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border px-3 py-1"
                    style={{ borderColor: c.inset_border }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}
            {showSort && (
              <span className="flex items-center gap-1">
                Sort: <strong className="font-semibold">Featured</strong>
              </span>
            )}
          </div>
        )}

        <div className={cn("grid gap-6", COLUMNS[cols] ?? COLUMNS["3"])}>
          {placeholders.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl" style={card}>
              <div className={cn("relative flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900", aspect)}>
                <span className="text-xs text-white/50">Product image</span>
                {bool(s.show_wishlist) && (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[13px]"
                  >
                    ♡
                  </span>
                )}
              </div>
              <div className={cn(cardStyle === "minimal" ? "pt-3" : "p-4")}>
                <div className="mb-1 text-[14px] font-semibold" style={{ color: headingColor }}>
                  {p.name}
                </div>
                {bool(s.show_price, true) && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold" style={{ color: c.link }}>
                      {p.price}
                    </span>
                    {bool(s.show_original_price, true) && (
                      <span className="text-[12px] line-through" style={{ color: paraColor, opacity: 0.6 }}>
                        {p.was}
                      </span>
                    )}
                  </div>
                )}
                {bool(s.show_reviews_count) && (
                  <div className="mt-1 text-[11px]" style={{ color: paraColor, opacity: 0.75 }}>
                    ★★★★★
                  </div>
                )}
                {bool(s.show_quick_add, true) && (
                  <button
                    className="mt-3 w-full py-1.5 text-[13px] font-semibold"
                    data-sl-button="primary"
                    style={{
                      ...schemeButton(c, "primary").style,
                      ...buttonRadiusStyle(theme),
                    }}
                  >
                    Buy now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {pagination === "loadmore" && (
          <div className="mt-8 flex justify-center">
            <button
              className="px-6 py-2 text-[13px] font-semibold"
              style={{
                background: "transparent",
                color: headingColor,
                border: `1px solid ${c.inset_border}`,
                ...buttonRadiusStyle(theme),
              }}
            >
              Load more
            </button>
          </div>
        )}
        {pagination === "pagination" && (
          <div className="mt-8 flex justify-center gap-2 text-[13px]" style={{ color: paraColor }}>
            {[1, 2, 3].map((page) => (
              <span
                key={page}
                className="flex h-8 w-8 items-center justify-center rounded-lg border"
                style={{
                  borderColor: c.inset_border,
                  background: page === 1 ? c.primary_btn_bg : "transparent",
                  color: page === 1 ? c.primary_btn_text : paraColor,
                }}
              >
                {page}
              </span>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default ProductListSection
