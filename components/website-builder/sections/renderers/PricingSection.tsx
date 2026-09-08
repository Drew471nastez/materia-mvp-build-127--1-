"use client"

/**
 * ===========================================================================
 *  PRICING
 * ===========================================================================
 * IT NEVER SHOWED THE FEATURES. Each plan declares a `features` textarea — one
 * feature per line, and the default ships five of them — and the renderer did
 * not read it. A pricing table listed a name, a price and a button, and the
 * entire reason somebody compares plans was missing from the page.
 *
 * Eleven of twenty-one controls did nothing: the monthly/annual toggle and the
 * annual price behind it, the three styles (cards, table and minimal all
 * rendered the same cards), the highlight colour, the per-plan badge and its
 * colour, the featured plan's border colour, the section colours and the
 * padding.
 */

import { useState } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  bool,
  buttonRadiusStyle,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"

export function PricingSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const highlight = str(s.highlight_color) || c.primary_btn_bg
  const style = str(s.style, "cards")
  const blocks = section.blocks ?? []

  /**
   * The toggle only appears when a plan actually has an annual price. Showing
   * a Monthly/Annual switch that changes nothing is worse than not showing one.
   */
  const hasAnnual = blocks.some((b) => !!str(b.settings.annual_price))
  const showToggle = bool(s.toggle_billing, true) && hasAnnual
  const [annual, setAnnual] = useState(false)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1230px] mx-auto" style={sectionPadding(s, 64)}>
        <div className="text-center mb-8">
          {!!s.heading && (
            <h2
              className="text-3xl font-bold mb-2"
              style={{ color: headingColor, fontFamily: theme.font_heading }}
            >
              {str(s.heading)}
            </h2>
          )}
          {!!s.subheading && (
            <p className="text-base" style={{ color: paraColor }}>
              {str(s.subheading)}
            </p>
          )}
          {showToggle && (
            <div
              className="mt-6 inline-flex items-center gap-1 rounded-full border p-1 text-[13px]"
              style={{ borderColor: c.inset_border }}
            >
              {[
                { label: "Monthly", value: false },
                { label: "Annual", value: true },
              ].map((option) => (
                <button
                  key={option.label}
                  className="rounded-full px-4 py-1.5 font-medium transition-colors"
                  style={
                    annual === option.value
                      ? { background: highlight, color: c.primary_btn_text }
                      : { color: paraColor }
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    setAnnual(option.value)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "mx-auto max-w-4xl",
            style === "table"
              ? "grid grid-cols-1 divide-y overflow-hidden rounded-2xl border @[640px]:grid-cols-3 @[640px]:divide-x @[640px]:divide-y-0"
              : "grid grid-cols-1 gap-6 @[640px]:grid-cols-3",
          )}
          style={style === "table" ? { borderColor: c.plan_border } : undefined}
        >
          {blocks.map((block) => {
            const b = block.settings
            const featured = bool(b.is_featured)
            const price = annual && str(b.annual_price) ? str(b.annual_price) : str(b.price)
            // One per line, which is how the control describes itself.
            const features = str(b.features)
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
            const border = featured ? str(b.highlight_border_color) || highlight : c.plan_border
            const label = featured ? c.primary_btn_text : c.plan_heading
            const muted = featured ? c.primary_btn_text : c.plan_paragraph

            return (
              <div
                key={block.id}
                className={cn(
                  "flex flex-col gap-4 p-6",
                  style === "table" ? "" : "rounded-2xl border",
                  style === "minimal" && "border-0 p-4",
                  featured && style !== "table" && "shadow-lg",
                )}
                style={{
                  borderColor: border,
                  background: featured ? highlight : style === "minimal" ? "transparent" : c.plan_bg,
                  // The featured plan in a table cannot have a border of its
                  // own, so it gets a rule at the top instead.
                  borderTop: style === "table" && featured ? `3px solid ${border}` : undefined,
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-[15px]" style={{ color: label }}>
                      {str(b.name)}
                    </div>
                    {!!b.badge_text && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: str(b.badge_color) || highlight,
                          color: c.primary_btn_text,
                        }}
                      >
                        {str(b.badge_text)}
                      </span>
                    )}
                  </div>
                  {!!b.description && (
                    <div className="mt-1 text-[12px]" style={{ color: muted }}>
                      {str(b.description)}
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-3xl font-bold" style={{ color: label }}>
                    {price}
                  </span>
                  <span className="ml-1 text-[12px]" style={{ color: muted }}>
                    {str(b.period)}
                  </span>
                </div>
                {features.length > 0 && (
                  <ul className="flex flex-col gap-2 text-[13px]" style={{ color: muted }}>
                    {features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          style={{ color: featured ? c.primary_btn_text : highlight }}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!!b.cta_text && (
                  <a
                    href={str(b.cta_url, "#")}
                    className="mt-auto py-2 text-center text-[13px] font-semibold"
                    style={{
                      background: featured ? c.primary_btn_text : highlight,
                      color: featured ? highlight : c.primary_btn_text,
                      ...buttonRadiusStyle(theme),
                    }}
                  >
                    {str(b.cta_text)}
                  </a>
                )}
              </div>
            )
          })}
          {blocks.length === 0 && (
            <div className="col-span-3 text-center text-sm opacity-40" style={{ color: paraColor }}>
              Add pricing plan blocks in the sidebar
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default PricingSection
