/**
 * ===========================================================================
 *  ONE HEADER AND ONE FOOTER, WHATEVER IS IN THE DATABASE
 * ===========================================================================
 * "Why is the footer different on different pages?"
 *
 * Because every page row carries its own copy of the header and the footer,
 * and a copy is a thing that can fall behind. The editor syncs them across
 * pages on every save, which is the right thing to do and is not a
 * guarantee: a page written before that sync existed, a page created while a
 * save was failing, an imported theme, a restored backup, a row touched by a
 * migration — each one is a page whose stored chrome is a little older than
 * the rest of the site.
 *
 * And the two sides did not even agree. The EDITOR already merged the home
 * page's chrome over whatever a page had stored, so the builder looked
 * right; the PUBLISHED site rendered each page's own row, so the live site
 * did not. That is the worst shape for a bug: it is invisible in the place
 * you would check it.
 *
 * So this is the rule, in one function, applied on BOTH sides at RENDER.
 * Storage can hold whatever it holds and drift as much as it likes; nothing
 * a visitor or a creator sees can disagree, because the header and the
 * footer are read from one page and used on all of them.
 *
 * HOME IS THE SOURCE. Not "the first page that has one" — that would make
 * the answer depend on row order, which is not a thing anybody chose. Home
 * is the page every site has and the one whose chrome a creator has actually
 * looked at.
 *
 * PURE, and it takes the two lists rather than a database, so the whole rule
 * is driven in tests/policy-pages.test.ts without one.
 */

import type { SectionInstance } from "./types"

const isHeader = (s: SectionInstance) => s.type === "header"
const isFooter = (s: SectionInstance) => s.type === "footer"

export interface Chrome {
  header?: SectionInstance
  footer?: SectionInstance
}

/**
 * THE ONE PAGE THAT WEARS NONE: the password page, which stands on its own
 * the way Shopify's does, because every link a header or footer holds leads
 * behind the password too. Its own sections only, here and in the builder.
 */
export const CHROMELESS_PAGES: ReadonlySet<string> = new Set(["password"])

/** The page's sections with any header or footer taken off. */
export function withoutChrome(pageSections: SectionInstance[] | null | undefined): SectionInstance[] {
  return (pageSections ?? []).filter((s) => !isHeader(s) && !isFooter(s))
}

/** The header and footer a whole site should be wearing. */
export function chromeOf(homeSections: SectionInstance[] | null | undefined): Chrome {
  const home = homeSections ?? []
  return { header: home.find(isHeader), footer: home.find(isFooter) }
}

/**
 * One page, wearing the site's chrome.
 *
 * ORDER IS PART OF THE ANSWER. The header goes first and the footer last
 * whatever position the stored row had them in, because a header that was
 * saved into the middle of a page is a row nobody meant to write and
 * rendering it there is rendering the mistake.
 *
 * A page keeps its OWN chrome when the site has none to give: a site with no
 * home page, or a home page still being written, should not have its other
 * pages stripped of the header they do have.
 */
export function withUniversalChrome(
  pageSections: SectionInstance[] | null | undefined,
  chrome: Chrome,
): SectionInstance[] {
  const page = pageSections ?? []
  const body = page.filter((s) => !isHeader(s) && !isFooter(s))
  const header = chrome.header ?? page.find(isHeader)
  const footer = chrome.footer ?? page.find(isFooter)
  return [...(header ? [header] : []), ...body, ...(footer ? [footer] : [])]
}

/**
 * Every page of a site, wearing the same chrome.
 *
 * The home page is included and gets the same treatment, which is not a
 * no-op: it is what puts a header back at the top of its own page when a
 * drag left it in the middle.
 */
export function applyUniversalChrome(
  pages: Record<string, SectionInstance[]>,
  homeKey = "home",
): Record<string, SectionInstance[]> {
  const chrome = chromeOf(pages[homeKey])
  if (!chrome.header && !chrome.footer) return pages
  const out: Record<string, SectionInstance[]> = {}
  for (const [key, sections] of Object.entries(pages)) {
    out[key] = CHROMELESS_PAGES.has(key) ? withoutChrome(sections) : withUniversalChrome(sections, chrome)
  }
  return out
}
