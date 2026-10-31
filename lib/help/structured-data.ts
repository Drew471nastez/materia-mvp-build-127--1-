/**
 * ===========================================================================
 *  THE HELP CENTER'S STRUCTURED DATA
 * ===========================================================================
 * What search engines read about each Help Center page, built from the same
 * article data the page draws, so the two can never say different things:
 *
 *   article    an Article (TechArticle) with its headline, description,
 *              dates, screenshots and publisher, and a BreadcrumbList
 *   topic      a CollectionPage listing its articles, and its breadcrumbs
 *   home       the Help Center as a WebPage
 *
 * No FAQPage and no HowTo (round 45). Google shows FAQ rich results only
 * for well known government and health sites and has retired HowTo rich
 * results altogether, so the markup earned nothing and described the page
 * twice. The questions and steps are still in the page as plain HTML,
 * which is what a search engine or an AI agent reads anyway.
 *
 * Printed through lib/seo/json-ld jsonLdScript, like every other JSON-LD.
 */
import { publicHelpUrl } from "./paths"
import { articleText, helpArticlePath, helpImages, type HelpArticle, type HelpCategory } from "./articles"

export const HELP_ORIGIN = "https://storelib.com"
const PUBLISHER = {
  "@type": "Organization",
  name: "Storelib",
  url: HELP_ORIGIN,
  logo: { "@type": "ImageObject", url: `${HELP_ORIGIN}/icon.png` },
}

/* A Help Center page is at help.storelib.com (its path without /help); a file, and anything else, on storelib.com. */
const abs = (path: string) =>
  /^\/help(?:[/?#]|$)/.test(path) && !/\.[a-z0-9]{2,5}(?:[?#]|$)/i.test(path) ? publicHelpUrl(path.slice("/help".length) || "/") : `${HELP_ORIGIN}${path}`

export function helpBreadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  }
}

export function helpArticleJsonLd(a: HelpArticle, category: HelpCategory) {
  const path = helpArticlePath(a)
  const images = helpImages(a).map(abs)
  const graph: Record<string, unknown>[] = [
    {
      "@type": "TechArticle",
      "@id": `${abs(path)}#article`,
      headline: a.title.slice(0, 110),
      description: a.summary,
      url: abs(path),
      mainEntityOfPage: abs(path),
      inLanguage: "en",
      articleSection: a.section ? `${category.title}: ${a.section}` : category.title,
      keywords: a.keywords?.join(", "),
      wordCount: articleText(a).split(/\s+/).filter(Boolean).length,
      ...(a.updated ? { dateModified: a.updated, datePublished: a.updated } : {}),
      ...(images.length ? { image: images.slice(0, 3) } : {}),
      author: { "@type": "Organization", name: "Storelib", url: HELP_ORIGIN },
      publisher: PUBLISHER,
      isPartOf: { "@type": "WebSite", name: "Storelib Help Center", url: abs("/help") },
    },
    helpBreadcrumbs([
      { name: "Help Center", path: "/help" },
      { name: category.title, path: `/help/${category.slug}` },
      { name: a.title, path },
    ]),
  ]
  return { "@context": "https://schema.org", "@graph": graph }
}

export function helpCategoryJsonLd(category: HelpCategory, articles: HelpArticle[]) {
  const path = `/help/${category.slug}`
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${abs(path)}#page`,
        name: `${category.title}: Storelib Help Center`,
        description: category.description,
        url: abs(path),
        isPartOf: { "@type": "WebSite", name: "Storelib Help Center", url: abs("/help") },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: articles.length,
          itemListElement: articles.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(helpArticlePath(a)), name: a.title })),
        },
      },
      helpBreadcrumbs([
        { name: "Help Center", path: "/help" },
        { name: category.title, path },
      ]),
    ],
  }
}

export function helpHomeJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Storelib Help Center",
    description,
    url: abs("/help"),
    publisher: PUBLISHER,
    /* No SearchAction (round 45): Google retired the sitelinks search box, and /help/search is a results page that says noindex. */
  }
}
