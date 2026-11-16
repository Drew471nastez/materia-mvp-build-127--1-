/**
 * /features (Storelib in one page): its title, description and structured
 * data. The metadata is set in app/(marketing)/features/layout.tsx from here.
 * A WebPage with the day its facts were last read against the code
 * (lib/marketing/facts FACTS_UPDATED), about Storelib the organization.
 */
import { absoluteUrl, STORELIB_ORIGIN } from "@/lib/seo/page-metadata"
import { FACTS_UPDATED, PLANS } from "./facts"

export const FEATURES_PATH = "/features"
export const FEATURES_TITLE = "Storelib in one page: what it sells, costs and does not do"
export const FEATURES_DESCRIPTION = `What Storelib is: digital products, courses, communities and a website builder. Free with ${PLANS.free.feeLabel} a sale, or Grow at ${PLANS.pro.price} a month. Its limits, plainly.`

export function featuresJsonLd() {
  const url = absoluteUrl(FEATURES_PATH)
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: FEATURES_TITLE,
        description: FEATURES_DESCRIPTION,
        inLanguage: "en",
        dateModified: FACTS_UPDATED,
        about: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
        publisher: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Storelib", item: STORELIB_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Features", item: url },
        ],
      },
    ],
  }
}
