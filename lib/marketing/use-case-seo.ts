/**
 * The title, description, canonical, share card and structured data of the
 * /sell pages (lib/marketing/use-cases). Pure, so tests/content-r45.test.ts
 * runs it. No FAQPage: Google shows FAQ results for a few authority sites
 * only, and the questions are on the page as plain HTML for readers.
 */
import type { Metadata } from "next"
import { absoluteUrl, pageMetadata, STORELIB_ORIGIN } from "@/lib/seo/page-metadata"
import { useCasePath, type UseCase } from "./use-cases"

/** /sell/<slug> sits under /features in the breadcrumbs: /sell itself is the sign up door, not a page to land on. */
export const USE_CASE_PARENT = { name: "Features", path: "/features" } as const

export function useCaseMetadata(u: UseCase): Metadata {
  return pageMetadata({ path: useCasePath(u.slug), title: u.seo.title, description: u.seo.description, absolute: true })
}

export function useCaseJsonLd(u: UseCase) {
  const url = absoluteUrl(useCasePath(u.slug))
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: u.seo.title,
        description: u.seo.description,
        inLanguage: "en",
        dateModified: u.updated,
        isPartOf: { "@type": "WebSite", name: "Storelib", url: STORELIB_ORIGIN },
        publisher: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Storelib", item: STORELIB_ORIGIN },
          { "@type": "ListItem", position: 2, name: USE_CASE_PARENT.name, item: absoluteUrl(USE_CASE_PARENT.path) },
          { "@type": "ListItem", position: 3, name: u.seo.h1, item: url },
        ],
      },
    ],
  }
}
