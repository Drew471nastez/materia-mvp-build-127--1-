/**
 * ===========================================================================
 *  THE PRODUCT A STORELIB PAGE IS ABOUT, FOR EVERY SECTION ON IT (round 13)
 * ===========================================================================
 * The owner: product FAQs should show "in the blocks of the product pages,
 * product info section, featured product, and all places", and "the size
 * guide block doesn't work, it doesn't pull product size charts".
 *
 * A Storelib theme's product page hands its product to the product section
 * only (`_product_data`, components/website-builder/theme/render-product.tsx
 * live and the editor's canvas alike). The page's other sections, an FAQ
 * section or the Size guide section under it, never knew which product the
 * page was about, so they drew their own sample rows. ThemePage reads the
 * product off the product section once (pageProductOf) and hands it to every
 * section on the page through the storefront (theme/storefront-context.tsx),
 * so the canvas and the live page agree, and a product changed in Products
 * is what they show next (the canvas reads the product again on focus).
 *
 * WHICH QUESTIONS AN FAQ SECTION SHOWS, its "Questions from" setting
 * (`faq_source`, on every FAQ section: faq, faq_accordion, faq_columns,
 * faq_cta):
 *
 *   auto      On a product page, the product's own questions when it has
 *   (default) some and the product section is not already showing them in
 *             its Product questions block; otherwise this section's own.
 *   product   The product's questions only. Hidden from buyers on a product
 *             without any (empty in the builder, which says where it is).
 *   section   This section's own questions, always.
 *
 * A product's question is plain text: its answer is escaped and its lines
 * kept before it becomes a block's rich text answer, so a seller's "<b>" is
 * shown as typed, never run as markup.
 *
 * Pure, and safe in the browser.
 */
import { productFaqs, type ProductFaq } from "./product-faqs"
import { readSizeChart, type SizeChart } from "@/lib/size-charts/model"
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"

export interface PageProduct {
  id: string
  title: string
  type: string
  faqs: ProductFaq[]
  sizeChart: SizeChart | null
  /** The product section on the page already shows the questions (its Product questions block). */
  faqsInProductSection: boolean
}

/** The FAQ sections a product's questions can fill, and the block their questions are. */
export const FAQ_SECTION_TYPES: Record<string, string> = { faq: "faq_item", faq_accordion: "qa", faq_columns: "qa", faq_cta: "qa" }

export type FaqSource = "auto" | "product" | "section"

/**
 * The "Questions from" control every FAQ section's panel has. The .storelib
 * FAQ sections get it from the platform (lib/website-builder/storelib-
 * schemas.ts platformShape), as the page, not their template, reads it: the
 * files stay as they are, and so do the AI's reference sections built from
 * them. The FAQ section in faq.json declares it itself.
 */
export const FAQ_SOURCE_FIELD = {
  id: "faq_source",
  label: "Questions from",
  type: "select",
  default: "auto",
  info: "On a product page: that product's own questions, from its FAQ in Products.",
  options: [
    { label: "The product, else these", value: "auto" },
    { label: "The product only", value: "product" },
    { label: "These questions only", value: "section" },
  ],
} as const

export function faqSourceOf(settings: Record<string, unknown> | undefined): FaqSource {
  const v = settings?.faq_source
  return v === "product" || v === "section" ? v : "auto"
}

/**
 * The product the page is about, read off its product section's
 * `_product_data`; null on a page with none, or with only the builder's
 * sample. `withBlocks` is the product section as it draws (the blocks a
 * section saved before them gets: lib/website-builder/product-page.ts).
 */
export function pageProductOf(sections: readonly SectionInstance[], withBlocks: (s: SectionInstance) => SectionInstance = (s) => s): PageProduct | null {
  const section = sections.find((s) => s.type === "product" && !s.hidden && s.settings && typeof (s.settings as Record<string, unknown>)._product_data === "object")
  const data = (section?.settings as Record<string, unknown> | undefined)?._product_data as Record<string, unknown> | null | undefined
  if (!section || !data || typeof data.id !== "string" || !data.id) return null
  const drawn = withBlocks(section)
  return {
    id: data.id,
    title: typeof data.title === "string" ? data.title : "",
    type: typeof data.type === "string" ? data.type : "",
    faqs: productFaqs(data.faqs),
    sizeChart: readSizeChart(data.size_chart),
    faqsInProductSection: (drawn.blocks ?? []).some((b) => b.type === "product_faq" && !b.hidden && !(b as { disabled?: boolean }).disabled),
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/** A product's answer as a block's rich text: escaped, a paragraph per blank line, a <br> per line. */
export function faqAnswerHtml(answer: string): string {
  return answer
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("")
}

/** Whether this FAQ section shows the page product's questions in place of its own. */
export function showsProductFaqs(section: Pick<SectionInstance, "type" | "settings">, product: PageProduct | null | undefined): boolean {
  if (!(section.type in FAQ_SECTION_TYPES) || !product) return false
  const source = faqSourceOf(section.settings)
  if (source === "section") return false
  if (source === "product") return true
  return product.faqs.length > 0 && !product.faqsInProductSection
}

/**
 * The FAQ section as it draws on this page: with the product's questions as
 * its blocks when its "Questions from" says so (see the top of this file),
 * in the product editor's order; else as it was. Never saved: the creator's
 * own questions stay in the section, and come back on a product without any
 * or when "Questions from" is set to this section.
 */
export function withProductFaqs<S extends SectionInstance>(section: S, product: PageProduct | null | undefined, opts: { inEditor?: boolean } = {}): S {
  if (!product || !showsProductFaqs(section, product)) return section
  /* "The product only" on a product with none: no empty heading on the page; the builder still shows where it is. */
  if (!product.faqs.length) return opts.inEditor ? { ...section, blocks: [] } : { ...section, hidden: true }
  const type = section.blocks?.find((b) => b.type)?.type ?? FAQ_SECTION_TYPES[section.type]
  const blocks: BlockInstance[] = product.faqs.map((f, i) => ({
    id: `product-faq-${i}`,
    type,
    settings: { question: f.question, answer: faqAnswerHtml(f.answer) },
  }))
  return { ...section, blocks }
}
