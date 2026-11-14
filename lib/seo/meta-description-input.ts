/**
 * ===========================================================================
 *  WHAT THE META DESCRIPTION MODEL IS SENT (round AW)
 * ===========================================================================
 * app/api/ai/seo asks the model for a product's meta description: 155
 * characters about what the buyer gets. It was sent the whole description,
 * whatever its length, and a request body can be megabytes of text, so one
 * call could cost as much as several hundred thousand tokens of input while
 * the answer is one sentence. The route's limit counts calls, not their size.
 *
 * The start of the description says what the product is, and that is what a
 * meta description is written from: the model is sent the first
 * META_INPUT_TEXT_MAX characters (about 1,500 tokens) and a title of at most
 * META_INPUT_TITLE_MAX, the same sizes the category suggestion reads
 * (lib/products/category-suggest.ts SUGGEST_LIMITS). The fallback the route
 * writes without the model still reads the whole text, which costs nothing.
 * Pure, so it has a test.
 */

export const META_INPUT_TEXT_MAX = 6_000
export const META_INPUT_TITLE_MAX = 300

export function metaDescriptionInput(title: unknown, text: unknown): { title: string; text: string } {
  const clip = (value: unknown, max: number) => (typeof value === "string" ? value : "").slice(0, max).trim()
  return { title: clip(title, META_INPUT_TITLE_MAX), text: clip(text, META_INPUT_TEXT_MAX) }
}
