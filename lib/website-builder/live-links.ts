/**
 * ===========================================================================
 *  A LINK IN THE CHROME GOES SOMEWHERE
 * ===========================================================================
 * "I click the footer on home and it doesn't get me there."
 *
 * Because it could not. A published Storelib site answers exactly these
 * addresses:
 *
 *     /                 home
 *     /products         the shop, and /products/<slug> a product
 *     /<page key>       any page the site stores
 *
 * and the stock chrome we shipped pointed at seven addresses that are none of
 * those. The footer had /new, /sale, /blog, /faq, /shipping and /returns, and
 * the header's "Shop" went to /shop while the shop lives at /products. So on
 * every site ever created from the default theme, seven links led nowhere: a
 * 404 for a visitor, and inside the builder the "this page does not exist,
 * create it?" prompt.
 *
 * The defaults are fixed, which helps a site made from today on. This is for
 * the sites that already stored them, and it runs on load beside the policy
 * links, which repair the same way for the same reason.
 *
 * TWO RULES, AND BOTH OF THEM REFUSE TO TOUCH A CREATOR'S OWN WORK.
 *
 *   A RENAME is applied: /shop and /products are the same destination under
 *   two names, so the link is repointed and keeps its label.
 *
 *   A DEAD STOCK LINK is removed, and only when it is still exactly what we
 *   shipped — the address AND the label both unchanged — and the site has no
 *   page at that key. A creator who wrote a Blog page keeps their Blog link;
 *   a creator who renamed "Returns" to "Send it back" has made that link
 *   theirs and it is left alone for them to fix. What goes is the link
 *   nobody chose, which we put there, which goes nowhere.
 *
 * A column heading left with no links under it goes too. Deleting the three
 * links and leaving the word "Support" floating over nothing is a worse
 * footer than the one we started with.
 */

import type { SectionInstance } from "./types"

/** Where the shop actually is. */
export const SHOP_PATH = "/products"

/** Addresses that were only ever another name for a real one. */
const RENAMED = new Map<string, string>([["/shop", SHOP_PATH]])

/** What the default theme shipped with no page behind it, and its label. */
const STOCK_DEAD = new Map<string, string>([
  ["/new", "new arrivals"],
  ["/sale", "sale"],
  ["/blog", "blog"],
  ["/faq", "faq"],
  ["/shipping", "shipping"],
  ["/returns", "returns"],
])

const norm = (value: unknown): string => {
  const s = String(value ?? "").trim().toLowerCase()
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s
}

/** The page key an internal path asks for, or "" if it asks for something else. */
const keyOf = (path: string): string => (path.startsWith("/") ? path.slice(1) : "")

type Block = NonNullable<SectionInstance["blocks"]>[number]
const settingsOf = (b: Block) => (b.settings ?? {}) as Record<string, unknown>

/**
 * One header or footer with every link pointing at a real address.
 *
 * `pageKeys` is what the site stores, so a creator's own /blog is a live link
 * and nothing here has an opinion about it. Idempotent: running it on an
 * already-repaired section returns the section unchanged, which matters
 * because it runs on every load.
 */
export function withLiveLinks(section: SectionInstance, pageKeys: Set<string>): SectionInstance {
  const blocks = section.blocks
  if (!blocks?.length) return section

  const kept: Block[] = []
  let changed = false

  for (const block of blocks) {
    const s = settingsOf(block)
    if (!("url" in s)) { kept.push(block); continue }
    const url = norm(s.url)
    const key = keyOf(url)

    const renamed = RENAMED.get(url)
    if (renamed && !pageKeys.has(key)) {
      kept.push({ ...block, settings: { ...s, url: renamed } })
      changed = true
      continue
    }

    const stockLabel = STOCK_DEAD.get(url)
    if (stockLabel && !pageKeys.has(key) && norm(s.label) === stockLabel) {
      changed = true
      continue
    }

    kept.push(block)
  }

  if (!changed) return section

  /* A heading with nothing under it is not a column. */
  const withoutEmptyColumns = kept.filter((block, i) => {
    if (block.type !== "footer_column") return true
    const next = kept[i + 1]
    return !!next && next.type !== "footer_column"
  })

  return { ...section, blocks: withoutEmptyColumns }
}

/** Every section of a page, with its chrome links repaired. */
export function pageWithLiveLinks(sections: SectionInstance[], pageKeys: Set<string>): SectionInstance[] {
  return sections.map((s) => (s.type === "header" || s.type === "footer" ? withLiveLinks(s, pageKeys) : s))
}
