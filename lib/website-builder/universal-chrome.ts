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
import { repairChrome, splitGroups, type KindOfType } from "@/lib/storelib-theme/section-groups"

/**
 * WHAT CHROME IS: THE HEADER GROUP AND THE FOOTER GROUP. Not only the
 * header and the footer: an announcement bar placed above the header is on
 * every page too, as it is in Shopify's header group. `header` and `footer`
 * are the sections themselves, for the callers that only need those; the
 * groups are what a page is dressed in.
 */
export interface Chrome {
  header?: SectionInstance
  footer?: SectionInstance
  headerGroup?: SectionInstance[]
  footerGroup?: SectionInstance[]
}

/**
 * THE ONE PAGE THAT WEARS NONE: the password page, which stands on its own
 * the way Shopify's does, because every link a header or footer holds leads
 * behind the password too. Its own sections only, here and in the builder.
 */
export const CHROMELESS_PAGES: ReadonlySet<string> = new Set(["password"])

/** The page's sections with any header or footer taken off. */
export function withoutChrome(pageSections: SectionInstance[] | null | undefined): SectionInstance[] {
  return splitGroups(pageSections ?? []).template
}

/** The header and footer a whole site should be wearing. */
export function chromeOf(homeSections: SectionInstance[] | null | undefined): Chrome {
  const g = splitGroups(homeSections ?? [])
  return {
    header: g.header.find((s) => s.type === "header" && !s.hidden) ?? g.header.find((s) => s.type === "header") ?? g.header.find((s) => !s.hidden),
    footer: g.footer.find((s) => s.type === "footer" && !s.hidden) ?? g.footer.find((s) => s.type === "footer") ?? g.footer.find((s) => !s.hidden),
    ...(g.header.length ? { headerGroup: g.header } : {}),
    ...(g.footer.length ? { footerGroup: g.footer } : {}),
  }
}

/**
 * One page, wearing the site's chrome.
 *
 * ORDER IS PART OF THE ANSWER. The header group goes first and the footer
 * group last whatever position the stored row had them in, because a header
 * that was saved into the middle of a page is a row nobody meant to write
 * and rendering it there is rendering the mistake.
 *
 * A page keeps its OWN chrome when the site has none to give: a site with no
 * home page, or a home page still being written, should not have its other
 * pages stripped of the header they do have.
 */
export function withUniversalChrome(
  pageSections: SectionInstance[] | null | undefined,
  chrome: Chrome,
): SectionInstance[] {
  const own = splitGroups(pageSections ?? [])
  const header = chrome.headerGroup ?? (chrome.header ? [chrome.header] : own.header)
  const footer = chrome.footerGroup ?? (chrome.footer ? [chrome.footer] : own.footer)
  return [...header, ...own.template, ...footer]
}

/**
 * Every page of a site, wearing the same chrome.
 *
 * The home page is included and gets the same treatment, which is not a
 * no-op: it is what puts a header back at the top of its own page when a
 * drag left it in the middle.
 *
 * With `kindOfType` (what each of the site's section types is, read from its
 * files), every page is first held to one header and one footer
 * (lib/storelib-theme/section-groups.ts, repairChrome): a header written as a
 * section file and left on the page is drawn as the header, and the second
 * of two is hidden. At render only; the stored rows are not touched.
 */
export function applyUniversalChrome(
  pages: Record<string, SectionInstance[]>,
  homeKey = "home",
  kindOfType?: KindOfType,
): Record<string, SectionInstance[]> {
  const held: Record<string, SectionInstance[]> = kindOfType
    ? Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, repairChrome(v, kindOfType).sections]))
    : pages
  const chrome = chromeOf(held[homeKey])
  if (!chrome.headerGroup && !chrome.footerGroup) return held
  const out: Record<string, SectionInstance[]> = {}
  for (const [key, sections] of Object.entries(held)) {
    out[key] = CHROMELESS_PAGES.has(key) ? withoutChrome(sections) : withUniversalChrome(sections, chrome)
  }
  return out
}
