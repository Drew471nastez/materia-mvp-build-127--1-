/**
 * ===========================================================================
 *  THE HELP CENTER'S STRUCTURED DATA
 * ===========================================================================
 * What search engines read about each Help Center page, built from the same
 * article data the page draws, so the two can never say different things:
 *
 *   article    an Article (TechArticle) with its headline, description,
 *              dates, screenshots and publisher; a BreadcrumbList; an
 *              FAQPage when its headings are real questions with their
 *              answers under them (faq: true); and a HowTo for its first
 *              numbered steps when it has at least three
 *   topic      a CollectionPage listing its articles, and its breadcrumbs
 *   home       the Help Center as a WebPage with a search action
 *
 * Printed through lib/seo/json-ld jsonLdScript, like every other JSON-LD.
 */
import { articleText, helpArticlePath, helpImages, plainText, type HelpArticle, type HelpCategory } from "./articles"

export const HELP_ORIGIN = "https://storelib.com"
const PUBLISHER = {
  "@type": "Organization",
  name: "Storelib",
  url: HELP_ORIGIN,
  logo: { "@type": "ImageObject", url: `${HELP_ORIGIN}/icon.png` },
}

const abs = (path: string) => `${HELP_ORIGIN}${path}`

export function helpBreadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  }
}

/** Questions and answers: each heading that ends in a question mark, with the paragraphs under it until the next heading. */
export function helpFaq(a: HelpArticle): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = []
  let current: { q: string; parts: string[] } | null = null
  const flush = () => {
    if (current && current.parts.length) out.push({ q: current.q, a: current.parts.join(" ") })
    current = null
  }
  for (const b of a.body) {
    if (b.type === "h" || b.type === "sub") {
      flush()
      if (/\?$/.test(b.text.trim())) current = { q: plainText(b.text), parts: [] }
    } else if (current && (b.type === "p" || b.type === "note")) current.parts.push(plainText(b.text))
    else if (current && (b.type === "steps" || b.type === "list")) current.parts.push(b.items.map(plainText).join(" "))
    else if (current && b.type === "facts") current.parts.push(b.items.map(([label, text]) => `${label}: ${plainText(text)}`).join(" "))
  }
  flush()
  return out
}

/**
 * The first run of numbered steps worth a HowTo: at least three, named by the
 * heading above them. An article that names its HowTo heading (`howTo`) uses
 * the first steps after that heading instead.
 */
export function helpHowTo(a: HelpArticle): { name: string; steps: string[] } | null {
  let heading: string | null = null
  let reached = !a.howTo
  for (const b of a.body) {
    if (b.type === "h" || (a.howTo && b.type === "sub")) {
      if (b.type === "h") heading = plainText(b.text)
      if (a.howTo && plainText(b.text) === a.howTo) {
        heading = plainText(b.text)
        reached = true
      }
    }
    if (reached && b.type === "steps" && b.items.length >= 3) return { name: heading && !/^\d/.test(heading) ? `${a.title}: ${heading}` : a.title, steps: b.items.map(plainText) }
  }
  return null
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
  if (a.faq) {
    const qa = helpFaq(a)
    if (qa.length >= 2) {
      graph.push({ "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) })
    }
  }
  const how = helpHowTo(a)
  if (how) {
    graph.push({
      "@type": "HowTo",
      name: how.name,
      description: a.summary,
      ...(images[0] ? { image: images[0] } : {}),
      step: how.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, name: text.split(/(?<=\.)\s/)[0].slice(0, 110), text })),
    })
  }
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
    potentialAction: { "@type": "SearchAction", target: `${abs("/help/search")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
  }
}
