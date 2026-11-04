/**
 * The title, description, canonical, share cards and structured data of the
 * comparison pages. Pure, so tests/alternatives.test.ts runs it.
 *
 * NO FAQPage (round 45). Google shows FAQ results for a few authority sites
 * only and asks other sites not to expect them; the questions stay on the
 * page as plain HTML, for readers. The page is a WebPage with the day its
 * words last changed, and its breadcrumbs.
 */
import type { Metadata } from "next"
import { absoluteUrl, pageMetadata, STORELIB_ORIGIN } from "@/lib/seo/page-metadata"
import type { Competitor, Faq, StorelibFlag } from "./types"
import { ALTERNATIVES, HUB_PATH, alternativePath } from "./index"

export type Flags = Record<StorelibFlag, boolean>

export const HUB_TITLE = "Storelib alternatives and comparisons"
/* Every platform by name while that fits a search result; past that, the count and the first four. */
const names = ALTERNATIVES.map((c) => c.name)
const named = `Storelib compared with ${names.slice(0, -1).join(", ")} and ${names.at(-1)}: fees per sale, monthly plans and features, with sources and the date each fact was checked.`
export const HUB_DESCRIPTION =
  named.length <= 170 ? named : `Storelib next to ${names.length} platforms, among them ${names.slice(0, 3).join(", ")} and ${names[3]}: fees per sale, plans and features, each fact sourced and dated.`

export function hubMetadata(): Metadata {
  return pageMetadata({ path: HUB_PATH, title: HUB_TITLE, description: HUB_DESCRIPTION, absolute: true })
}

export function alternativeMetadata(c: Competitor): Metadata {
  return pageMetadata({ path: alternativePath(c.slug), title: c.seo.title, description: c.seo.description, absolute: true, type: "article" })
}

/** The questions as the page shows them: an answer that waits behind a switch reads its "off" answer while it is off. */
export function resolveFaqs(faqs: Faq[], flags: Flags): { q: string; a: string }[] {
  return faqs.map((f) => ({ q: f.q, a: f.flag && !flags[f.flag] ? f.aOff ?? f.a : f.a }))
}

const crumbs = (items: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
})

export function hubJsonLd() {
  const url = absoluteUrl(HUB_PATH)
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: HUB_TITLE,
        description: HUB_DESCRIPTION,
        inLanguage: "en",
        dateModified: ALTERNATIVES.map((c) => c.updated).sort().at(-1),
        publisher: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: ALTERNATIVES.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.seo.h1, url: absoluteUrl(alternativePath(c.slug)) })),
        },
      },
      crumbs([
        { name: "Storelib", path: "/" },
        { name: "Alternatives", path: HUB_PATH },
      ]),
    ],
  }
}

export function alternativeJsonLd(c: Competitor) {
  const url = absoluteUrl(alternativePath(c.slug))
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: c.seo.title,
      description: c.seo.description,
      inLanguage: "en",
      dateModified: c.updated,
      publisher: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
    },
    crumbs([
      { name: "Storelib", path: "/" },
      { name: "Alternatives", path: HUB_PATH },
      { name: c.name, path: alternativePath(c.slug) },
    ]),
  ]
  return { "@context": "https://schema.org", "@graph": graph }
}
