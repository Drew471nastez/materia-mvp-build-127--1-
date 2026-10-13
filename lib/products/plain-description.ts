/**
 * Pure, with no imports: the shop's cards (lib/website-builder/shop-products.ts)
 * and a card's translated description (lib/markets/translate.ts) both read
 * it, in the editor and on the live site alike.
 */

/** Tags after which words must not run together. */
const BLOCK_END = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr)>|<br\s*\/?>/gi

/**
 * A product description as plain text that keeps its paragraphs. It is stored
 * as rich text from the product editor, and a section prints it escaped
 * rather than trusting it as markup: the product page's own renderer does
 * the same, for the same reason (a stored description is user input).
 */
export function plainDescription(html: string | null | undefined, max = 5_000): string {
  if (!html) return ""
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_END, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
