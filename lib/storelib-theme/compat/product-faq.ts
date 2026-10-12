/**
 * ===========================================================================
 *  A PRODUCT'S QUESTIONS IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The product editor's FAQ card (lib/products/product-faqs.ts) has no slot
 * in a Shopify theme: on Shopify a merchant would keep questions in a
 * metafield and point a block at it. So they reach an imported theme three
 * ways, from the product's own data, and the first that applies wins:
 *
 *   THE METAFIELD          `product.metafields.storelib.faqs` (./objects.ts):
 *                          `.value` the list, for a theme or a custom block
 *                          written for it. A theme whose code reads it draws
 *                          them itself, and nothing below is added.
 *   THE THEME'S OWN ROWS   a collapsible row (Dawn's `collapsible_tab`,
 *                          "Collapsible row", an accordion row) in the
 *                          product section: an empty one headed FAQ,
 *                          Questions or Q&A is filled with them; otherwise
 *                          one more row like the theme's last is added,
 *                          headed FAQ, so they are drawn in the theme's own
 *                          accordion. A row with words of its own keeps them.
 *   UNDER THE DESCRIPTION  otherwise, on the product page only, the questions
 *                          are added once under the product's description in
 *                          the main product section, as plain <details>
 *                          rows that take the theme's font, colour and rule
 *                          lines (currentColor), so they read as the theme's.
 *
 * No FAQ structured data is added: Google shows FAQ rich results only for a
 * few authoritative government and health sites since 2023, and its
 * guidelines are against FAQ markup for questions a seller writes to sell a
 * product. The questions are on the page as text, which is what search reads.
 *
 * Every question and answer is plain text, escaped here. Pure: the same in
 * the builder's canvas and on the website.
 */
type O = Record<string, unknown>

export interface Faq {
  question: string
  answer: string
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
const para = (s: string) => esc(s).replace(/\r?\n/g, "<br>")

/** The product's questions from the page's `product`, or none. */
export function faqsOf(product: unknown): Faq[] {
  const mf = (product as O | null | undefined)?.metafields as O | undefined
  const value = ((mf?.storelib as O | undefined)?.faqs as O | undefined)?.value
  return Array.isArray(value) ? (value as Faq[]).filter((f) => f && typeof f.question === "string" && typeof f.answer === "string") : []
}

/** The questions as rich text for a theme's tab: each question in bold, its answer under it. */
export function faqTabHtml(faqs: readonly Faq[]): string {
  /* A paragraph per line rather than <br>: a theme's rich text keeps paragraphs everywhere. */
  return faqs.map((f) => `<p><strong>${esc(f.question)}</strong></p>${f.answer.split(/\r?\n+/).filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join("")}`).join("")
}

const STYLE = `<style>
.slpfaq{margin:1.5em 0 0;font:inherit;color:inherit}
.slpfaq__h{margin:0 0 .4em;font-size:1.05em;font-weight:600;line-height:1.3}
.slpfaq details{border-top:1px solid color-mix(in srgb,currentColor 16%,transparent)}
.slpfaq details:last-of-type{border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
.slpfaq summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;cursor:pointer;list-style:none;font-weight:500}
.slpfaq summary::-webkit-details-marker{display:none}
.slpfaq summary::marker{content:""}
.slpfaq summary:after{content:"";flex:none;width:7px;height:7px;margin-right:4px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .2s ease}
.slpfaq details[open] summary:after{transform:translateY(2px) rotate(-135deg)}
.slpfaq__a{margin:0;padding:0 0 16px;white-space:normal;opacity:.85}
@media (prefers-reduced-motion:reduce){.slpfaq summary:after{transition:none}}
</style>`

/** The questions as a block of their own, under the description. */
export function faqBlockHtml(faqs: readonly Faq[], heading = "Questions"): string {
  if (!faqs.length) return ""
  const rows = faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p class="slpfaq__a">${para(f.answer)}</p></details>`).join("")
  return `${STYLE}<div class="slpfaq" data-storelib-product-faq>${heading ? `<p class="slpfaq__h">${esc(heading)}</p>` : ""}${rows}</div>`
}

/** A theme's collapsible row block: Dawn's collapsible_tab, "collapsible-content", an accordion row. */
const TAB_BLOCK = /collaps|accordion|(^|[-_])tab($|[-_])/i
const FAQ_HEADING = /^\s*(faqs?|f\.a\.q\.?s?|q\s*&\s*a|questions?(\s*(&|and)\s*answers?)?|frequently asked questions|common questions)\s*$/i
/** The setting a tab's body is in, by the names themes use. */
const BODY_KEYS = ["content", "text", "body", "description", "row_content", "answer"]
const HEADING_KEYS = ["heading", "title", "label", "question", "tab_title", "row_heading"]

interface Block {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: Block[]
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.replace(/<[^>]*>|&nbsp;|\s/g, "") === "")

/**
 * The section's blocks with the questions in one of the theme's own
 * collapsible rows, or null when the section has none to use:
 *
 *   an empty row headed FAQ (or Questions, Q&A)   filled with them
 *   otherwise, rows of the theme's own            one more row of the same
 *                                                 kind after the last, headed
 *                                                 FAQ, so it is drawn exactly
 *                                                 as the theme draws its rows
 *
 * A row with words of its own, or one showing a page, keeps them. Walks
 * nested blocks (Horizon keeps rows inside an accordion block, inside the
 * details group). Drawn only, never saved: the creator's template is as
 * they left it.
 */
export function withFaqTab<T extends Block>(blocks: readonly T[] | undefined, faqs: readonly Faq[]): T[] | null {
  if (!blocks?.length || !faqs.length) return null
  const isTab = (b: Block) => TAB_BLOCK.test(b.type) && HEADING_KEYS.some((k) => typeof (b.settings ?? {})[k] === "string")
  const headingKey = (b: Block) => HEADING_KEYS.find((k) => typeof (b.settings ?? {})[k] === "string")!
  const bodyKey = (b: Block) => BODY_KEYS.find((k) => k in (b.settings ?? {})) ?? "content"
  /* An empty row headed FAQ, anywhere. */
  let filled = false
  const fill = (list: readonly Block[]): Block[] =>
    list.map((b) => {
      const s = b.settings ?? {}
      if (!filled && isTab(b) && FAQ_HEADING.test(String(s[headingKey(b)])) && isEmpty(s[bodyKey(b)]) && !s.page) {
        filled = true
        return { ...b, settings: { ...s, [bodyKey(b)]: faqTabHtml(faqs) } }
      }
      return b.blocks?.length ? { ...b, blocks: fill(b.blocks) } : b
    })
  const once = fill(blocks)
  if (filled) return once as T[]
  /* Else one more of the theme's rows, after its last; named apart from a store-wide FAQ row the theme already has. */
  let hasFaqRow = false
  const look = (list: readonly Block[]) => list.forEach((b) => {
    if (isTab(b) && FAQ_HEADING.test(String((b.settings ?? {})[headingKey(b)]))) hasFaqRow = true
    if (b.blocks?.length) look(b.blocks)
  })
  look(blocks)
  let added = false
  const add = (list: readonly Block[]): Block[] => {
    const nested = list.map((b) => (b.blocks?.length && !added ? { ...b, blocks: add(b.blocks) } : b))
    if (added) return nested
    let last = -1
    nested.forEach((b, i) => {
      if (isTab(b)) last = i
    })
    if (last < 0) return nested
    const like = nested[last]
    const s = like.settings ?? {}
    const row: Block = {
      id: "storelib-product-faq",
      type: like.type,
      settings: { ...s, [headingKey(like)]: hasFaqRow ? "Product questions" : "FAQ", [bodyKey(like)]: faqTabHtml(faqs), ...("page" in s ? { page: "" } : {}), ...("icon" in s ? { icon: "question_mark" } : {}), ...("open" in s ? { open: false } : {}) },
    }
    added = true
    return [...nested.slice(0, last + 1), row, ...nested.slice(last + 1)]
  }
  const out = add(blocks)
  return added ? (out as T[]) : null
}

/** Whether a theme's own code reads the questions, so it draws them itself. */
export function themeReadsFaqs(sources: Iterable<string>): boolean {
  for (const s of sources) if (/metafields\.storelib\.faqs|metafields\[['"]storelib['"]\]/.test(s)) return true
  return false
}

/**
 * The main product section's markup with the questions under the
 * description, or null when this section is not where they go: a section
 * with no product form (Shopify's /cart/add), a page that has drawn them
 * already, or a description the markup does not contain (then after the
 * product form, in the same column).
 */
export function withFaqUnderDescription(html: string, description: string, faqs: readonly Faq[]): string | null {
  if (!faqs.length || /data-storelib-product-faq/.test(html)) return null
  if (!/action=["'][^"']*\/cart\/add/i.test(html)) return null
  const block = faqBlockHtml(faqs)
  const desc = description.trim()
  if (desc.length > 8) {
    const at = html.indexOf(desc)
    if (at >= 0) return html.slice(0, at + desc.length) + block + html.slice(at + desc.length)
  }
  const form = html.search(/<\/form>/i)
  if (form >= 0) {
    const end = form + "</form>".length
    /* Out of the form's own wrapper (Dawn's <product-form>), so it is not inside the buy buttons' box. */
    const wrapper = html.slice(end).match(/^\s*<\/product-form>/i)
    const cut = wrapper ? end + wrapper[0].length : end
    return html.slice(0, cut) + block + html.slice(cut)
  }
  return null
}
