/**
 * ===========================================================================
 *  A PRODUCT'S OWN QUESTIONS, READY FOR EVERY PAGE THAT SHOWS THEM
 * ===========================================================================
 * The FAQ card in the product editor saves `products.faqs`, a list of
 * `{ question, answer }`. They show on the product page under the
 * description, wherever that page is drawn:
 *
 *   storelib.com            app/(marketing)/p/[slug]/page.tsx, after Details
 *   a built website         the product section's Product questions block
 *                           (themes/default/sections/product.json), added to
 *                           a product section saved before the block existed
 *                           (lib/website-builder/product-page.ts); an FAQ
 *                           section set to "This product's questions"; and
 *                           the "Product FAQ" dynamic source
 *   an imported theme       `product.metafields.storelib.faqs`, a theme's
 *                           collapsible tab headed FAQ or Questions, else
 *                           a fallback under the description
 *                           (lib/storelib-theme/compat/product-faq.ts)
 *
 * Pure and safe in the browser, so the builder's canvas reads the same.
 * Plain text always: an answer is never markup, so it is escaped wherever
 * it is printed.
 */

export interface ProductFaq {
  question: string
  answer: string
}

/** The product's questions as plain text, the answered ones only, at most 30. */
export function productFaqs(raw: unknown): ProductFaq[] {
  if (!Array.isArray(raw)) return []
  const plain = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "")
  return raw
    .map((f) => ({ question: plain((f as { question?: unknown })?.question, 300), answer: plain((f as { answer?: unknown })?.answer, 3000) }))
    .filter((f) => f.question && f.answer)
    .slice(0, 30)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * The questions as rich text, for the "Product FAQ" dynamic source in a rich
 * text setting: each question in bold, its answer under it, line breaks
 * kept. Only <p>, <strong> and <br>, every word escaped.
 */
export function productFaqsHtml(faqs: readonly ProductFaq[]): string {
  return faqs
    .map((f) => `<p><strong>${escapeHtml(f.question)}</strong></p><p>${escapeHtml(f.answer).replace(/\r?\n/g, "<br>")}</p>`)
    .join("")
}
