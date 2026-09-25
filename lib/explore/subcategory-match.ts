/**
 * ===========================================================================
 *  WHICH PRODUCTS BELONG TO A SUBCATEGORY
 * ===========================================================================
 * The subcategory filter on Explore and on a category page matched
 * `product.subcategory` and `product.tags`, which neither page selects, and
 * then looked for the subcategory's id inside the title and description. An
 * id is a slug ("ui-ux", "after-effects", "product-photos"), so a product
 * called "UI/UX Starter Kit" or filed as "Lightroom Presets" was never found,
 * and most subcategories showed an empty list.
 *
 * It reads what the pages do load now: the product's category, which the
 * product editor writes as a leaf name ("UI Kits", "Notion Templates",
 * "Lightroom Presets"), its title and its description. It looks for the
 * subcategory's words there, as whole words, with a plural and its singular
 * treated as the same word:
 *
 *   the id as words        after-effects    -> "after effects"
 *   the label              Lightroom Presets -> "lightroom preset"
 *   each half of a label   Scripts & Plugins -> "script", "plugin"
 *   a label without its    Logo Templates   -> "logo"
 *   generic last word
 *
 * A half or a trimmed label that is only generic words ("Tools", "Effects")
 * is left out: on its own it would match half the catalogue.
 *
 * Pure and dependency free, so tests/explore-browse.test.ts runs it.
 */

export type SubcategoryProduct = {
  category?: string | null
  categoryName?: string | null
  title?: string | null
  description?: string | null
}

/** Words that describe a format rather than a subject: never a term on their own. */
const GENERIC = new Set([
  "template", "theme", "kit", "tool", "content", "asset", "component", "design",
  "app", "element", "effect", "how", "to", "and", "the", "of", "for", "pro",
])

/** One word, singular. "presets" and "preset" are the same word; "business" keeps its s. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

/** Lowercase words, stemmed, joined by single spaces. */
export function words(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(stem)
    .join(" ")
}

const allGeneric = (phrase: string) => phrase.split(" ").every((w) => GENERIC.has(w))

/** Drops generic words from the end: "logo template" -> "logo". */
function trimGeneric(phrase: string): string {
  const parts = phrase.split(" ")
  while (parts.length > 1 && GENERIC.has(parts[parts.length - 1])) parts.pop()
  return parts.join(" ")
}

/** The phrases a product's text is searched for. */
export function subcategoryTerms(id: string, label: string): string[] {
  const terms = new Set<string>()
  const add = (phrase: string, always = false) => {
    if (!phrase || phrase.length < 2) return
    if (!always && allGeneric(phrase)) return
    terms.add(phrase)
  }
  add(words(id), true)
  add(words(label), true)
  for (const half of label.split(/[&/,]/)) {
    const w = words(half)
    add(w)
    add(trimGeneric(w))
  }
  add(trimGeneric(words(label)))
  return [...terms]
}

/** Whether a product belongs to the subcategory, judged only from fields the pages load. */
export function matchesSubcategory(product: SubcategoryProduct, terms: readonly string[]): boolean {
  if (!terms.length) return true
  const hay = ` ${words(`${product.category ?? product.categoryName ?? ""} ${product.title ?? ""} ${product.description ?? ""}`)} `
  return terms.some((t) => hay.includes(` ${t} `))
}
