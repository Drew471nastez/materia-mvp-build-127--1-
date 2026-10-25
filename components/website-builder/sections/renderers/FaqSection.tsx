"use client"

/**
 * ===========================================================================
 *  FAQ
 * ===========================================================================
 * Ten of its fourteen controls did nothing: the subheading, the three styles
 * (accordion, boxed and minimal all rendered the same bordered accordion), the
 * question count, "expand the first one", the icon style, the per-item
 * "open by default", the category, the colours and the padding.
 *
 * And the answer — a `richtext` field, which is what the editor writes into it
 * — was rendered as TEXT, so an answer with any formatting at all showed its
 * markup to visitors.
 */

import { useMemo, useState } from "react"
import { useStorefront } from "../../theme/storefront-context"
import { withProductFaqs } from "@/lib/products/page-product"
import { ChevronDown, ChevronUp, Plus, Minus, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  bool,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"
import { stableHtml } from "../stable-html"

export function FaqSection({ section: own, theme, isEditing, isSelected, onClick }: SectionProps) {
  /* On a product page, the product's own questions when "Questions from" says so (round 13: lib/products/page-product.ts). */
  const { pageProduct, inEditor } = useStorefront()
  const section = useMemo(() => withProductFaqs(own, pageProduct, { inEditor: inEditor || isEditing }), [own, pageProduct, inEditor, isEditing])
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const paraColor = str(s.text_color) || c.paragraph
  const borderColor = c.inset_border
  const style = str(s.style, "accordion")
  const iconStyle = str(s.icon_style, "chevron")
  const blocks = section.blocks ?? []

  /**
   * OPEN STATE IS A SET, not a single id. `open_by_default` is per item and
   * `expanded_first` is a section setting, so more than one can be open at
   * once — which the old single-id state could not express.
   */
  const [open, setOpen] = useState<Set<string> | null>(null)
  const initial = () => {
    const set = new Set<string>()
    blocks.forEach((b, i) => {
      if (bool(b.settings.open_by_default) || (i === 0 && bool(s.expanded_first, true))) set.add(b.id)
    })
    return set
  }
  const opened = open ?? initial()
  const toggle = (id: string) => {
    const next = new Set(opened)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }

  const Icon = ({ isOpen }: { isOpen: boolean }) => {
    if (iconStyle === "none") return null
    if (iconStyle === "plus-minus") {
      return isOpen ? <Minus className="h-4 w-4 shrink-0 opacity-50" /> : <Plus className="h-4 w-4 shrink-0 opacity-50" />
    }
    if (iconStyle === "arrow") {
      return (
        <ArrowRight
          className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", isOpen && "rotate-90")}
        />
      )
    }
    return isOpen ? (
      <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
    ) : (
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    )
  }

  /**
   * Items keep their order and their category heading appears once, above the
   * first item that carries it. Sorting by category would reorder a list
   * somebody arranged by hand.
   */
  const seen = new Set<string>()

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-2xl mx-auto px-8" style={sectionPadding(s, 64)}>
        {!!s.heading && (
          <h2
            className="text-3xl font-bold text-center mb-3"
            style={{ color: headingColor, fontFamily: theme.font_heading }}
          >
            {str(s.heading)}
            {bool(s.show_count) && blocks.length > 0 && (
              <span className="ml-2 align-middle text-base font-normal opacity-60">({blocks.length})</span>
            )}
          </h2>
        )}
        {!!s.subheading && (
          <p className="mb-10 text-center text-base" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!s.subheading && !!s.heading && <div className="mb-8" />}

        <div className={cn(style === "minimal" ? "divide-y" : "space-y-2")} style={{ borderColor }}>
          {blocks.map((block) => {
            const isOpen = opened.has(block.id)
            const category = str(block.settings.category)
            const showCategory = !!category && !seen.has(category)
            if (showCategory) seen.add(category)

            return (
              <div key={block.id}>
                {showCategory && (
                  <h3
                    className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.16em] first:mt-0"
                    style={{ color: paraColor, opacity: 0.75 }}
                  >
                    {category}
                  </h3>
                )}
                <div
                  className={cn(
                    "overflow-hidden",
                    style === "boxed" && "rounded-lg border",
                    style === "accordion" && "rounded-lg border",
                    style === "minimal" && "border-0",
                  )}
                  style={{
                    borderColor,
                    background: style === "boxed" ? c.bg : undefined,
                  }}
                >
                  <button
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    style={{ color: headingColor, paddingLeft: style === "minimal" ? 0 : undefined, paddingRight: style === "minimal" ? 0 : undefined }}
                    aria-expanded={isOpen}
                    onClick={() => toggle(block.id)}
                  >
                    <span className="font-medium text-[14px]">{str(block.settings.question)}</span>
                    <Icon isOpen={isOpen} />
                  </button>
                  {isOpen && (
                    <div
                      className="px-5 pb-4 text-[14px] leading-relaxed [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                      style={{
                        color: paraColor,
                        paddingLeft: style === "minimal" ? 0 : undefined,
                        paddingRight: style === "minimal" ? 0 : undefined,
                      }}
                      dangerouslySetInnerHTML={stableHtml(str(block.settings.answer))}
                    />
                  )}
                </div>
              </div>
            )
          })}
          {blocks.length === 0 && (
            <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>
              Add FAQ items in the sidebar
            </p>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default FaqSection
