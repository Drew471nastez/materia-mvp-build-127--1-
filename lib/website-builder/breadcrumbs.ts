/**
 * WHERE A PAGE SITS ON ITS WEBSITE, for search engines: schema.org's
 * BreadcrumbList, which is what a result shows in place of the bare address
 * ("andrew.com › Products › Black tee"). The website's front page first, the
 * page itself last, every step a full address on the website's own origin.
 * One function for both kinds of website: a Storelib theme's product and
 * collection pages and an imported theme's pages (./compat-search.ts).
 */
export interface Crumb {
  name: string
  url: string
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  const steps = crumbs.filter((c) => c.name.trim() && /^https?:\/\//.test(c.url))
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name.trim().slice(0, 200), item: c.url })),
  }
}
