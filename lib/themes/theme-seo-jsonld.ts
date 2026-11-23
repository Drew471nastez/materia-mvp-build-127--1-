/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S STRUCTURED DATA (round 58)
 * ===========================================================================
 * One @graph per page, printed with jsonLdScript (lib/seo/json-ld.ts).
 *
 *   A TEMPLATE      WebPage, whose main entity is the template as a
 *                   CreativeWork (a website template is a work people use,
 *                   not a product that ships and not an app that installs),
 *                   with its Offer at its real price, isAccessibleForFree,
 *                   its pictures and Storelib as its publisher. Then the
 *                   BreadcrumbList and the FAQPage of the questions the page
 *                   prints, word for word.
 *   A CATEGORY      CollectionPage with an ItemList of the templates on it,
 *                   its BreadcrumbList and its FAQPage.
 *   /themes         CollectionPage and an ItemList of every template.
 *
 * NOTHING THAT IS NOT TRUE. No AggregateRating or Review: there are no
 * ratings to back one. No SoftwareApplication: Google wants a rating or a
 * review for that rich result, and a template is not an application.
 */
import { absoluteUrl } from "@/lib/seo/page-metadata"
import { schemaPrice, storelibBreadcrumbJsonLd } from "@/lib/seo/structured-data"
import { MARKETPLACE_PATH, listingPath, type ThemeListing } from "./marketplace-shared"
import { MARKETPLACE_SEO, featureLabel, themeAlt, themeCategoryPath, themeImages, type ThemePageCopy, type ThemeSeoCategory } from "./theme-seo"

const ORG = { "@type": "Organization", "@id": "https://storelib.com/#organization", name: "Storelib", url: "https://storelib.com" }

function faqPage(url: string, faqs: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
}

function offer(listing: ThemeListing, url: string) {
  /* A Pro theme is not sold on its own: it comes with a plan, so its Offer would name a price it does not have. */
  if (listing.tier === "pro") return null
  return {
    "@type": "Offer",
    price: schemaPrice(listing.tier === "free" ? 0 : listing.priceCents),
    priceCurrency: "USD",
    availability: listing.tier === "paid" ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
    url,
  }
}

export function themeJsonLd(listing: ThemeListing, copy: ThemePageCopy) {
  const url = absoluteUrl(listingPath(listing.slug))
  const img = themeImages(listing)
  const images = [img.og, img.hero, img.phone].filter((x): x is NonNullable<typeof x> => !!x).map((x, i) => ({
    "@type": "ImageObject",
    url: absoluteUrl(x.src),
    width: x.width,
    height: x.height,
    caption: themeAlt(listing, i === 2 ? "phone" : i === 0 ? "og" : "hero", copy.h1),
  }))
  const o = offer(listing, url)
  const trail = [{ name: "Themes", path: MARKETPLACE_PATH }, ...(copy.primaryCategory ? [{ name: copy.primaryCategory.name, path: themeCategoryPath(copy.primaryCategory.slug) }] : []), { name: listing.name, path: listingPath(listing.slug) }]
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: copy.title,
        description: copy.description,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", "@id": "https://storelib.com/#website", name: "Storelib", url: "https://storelib.com" },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: { "@id": `${url}#template` },
        ...(images[0] ? { primaryImageOfPage: images[0] } : {}),
      },
      {
        "@type": "CreativeWork",
        "@id": `${url}#template`,
        name: `${listing.name} website template`,
        headline: copy.h1,
        description: copy.intro,
        url,
        genre: "Website template",
        ...(copy.primaryCategory ? { about: copy.primaryCategory.name } : {}),
        keywords: copy.features.map(featureLabel).join(", ") || undefined,
        audience: copy.bestFor.length ? { "@type": "Audience", audienceType: copy.bestFor.join("; ") } : undefined,
        isAccessibleForFree: listing.tier === "free",
        ...(images.length ? { image: images } : {}),
        author: /^storelib$/i.test(listing.author.trim()) ? ORG : { "@type": "Person", name: listing.author },
        publisher: ORG,
        ...(o ? { offers: o } : {}),
        datePublished: listing.createdAt.slice(0, 10),
      },
      { ...storelibBreadcrumbJsonLd(trail), "@id": `${url}#breadcrumb` },
      faqPage(url, copy.faqs),
    ],
  }
}

export function categoryJsonLd(cat: ThemeSeoCategory, listings: ThemeListing[]) {
  const url = absoluteUrl(themeCategoryPath(cat.slug))
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: cat.title,
        description: cat.description,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", "@id": "https://storelib.com/#website", name: "Storelib", url: "https://storelib.com" },
        mainEntity: { "@id": `${url}#list` },
      },
      itemList(`${url}#list`, cat.h1, listings),
      { ...storelibBreadcrumbJsonLd([{ name: "Themes", path: MARKETPLACE_PATH }, { name: cat.name, path: themeCategoryPath(cat.slug) }]), "@id": `${url}#breadcrumb` },
      faqPage(url, cat.faqs),
    ],
  }
}

export function marketplaceJsonLd(listings: ThemeListing[]) {
  const url = absoluteUrl(MARKETPLACE_PATH)
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: MARKETPLACE_SEO.title,
        description: MARKETPLACE_SEO.description,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", "@id": "https://storelib.com/#website", name: "Storelib", url: "https://storelib.com" },
        mainEntity: { "@id": `${url}#list` },
      },
      itemList(`${url}#list`, MARKETPLACE_SEO.h1, listings),
      { ...storelibBreadcrumbJsonLd([{ name: "Themes", path: MARKETPLACE_PATH }]), "@id": `${url}#breadcrumb` },
    ],
  }
}

function itemList(id: string, name: string, listings: ThemeListing[]) {
  return {
    "@type": "ItemList",
    "@id": id,
    name,
    numberOfItems: listings.length,
    itemListElement: listings.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(listingPath(l.slug)), name: l.name })),
  }
}
