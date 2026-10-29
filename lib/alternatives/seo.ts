/**
 * The title, description, canonical, share cards and structured data of the
 * comparison pages. Pure, so tests/alternatives.test.ts runs it.
 *
 * FAQPage is written from the questions the page shows, after the switches
 * have chosen each answer (resolveFaqs), never from a separate list: Google
 * asks that FAQ markup match what a reader can see, and so do we.
 */
import type { Metadata } from "next"
import { absoluteUrl, pageMetadata, STORELIB_ORIGIN } from "@/lib/seo/page-metadata"
import type { Competitor, Faq, StorelibFlag } from "./types"
import { ALTERNATIVES, HUB_PATH, alternativePath } from "./index"

export type Flags = Record<StorelibFlag, boolean>

export const HUB_TITLE = "Storelib alternatives and comparisons"
const names = ALTERNATIVES.map((c) => c.name)
export const HUB_DESCRIPTION = `Storelib compared with ${names.slice(0, -1).join(", ")} and ${names.at(-1)}: fees per sale, monthly plans and features, with sources and the date each fact was checked.`

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

export function alternativeJsonLd(c: Competitor, faqs: { q: string; a: string }[]) {
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
  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    })
  }
  return { "@context": "https://schema.org", "@graph": graph }
}
