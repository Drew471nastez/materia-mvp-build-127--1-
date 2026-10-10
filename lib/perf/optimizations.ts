/**
 * THE OPTIMIZATION HISTORY, WITH THE NUMBERS THAT PROVE EACH ONE
 *
 * The Performance and Health page in /admin reads this list to show what was
 * made faster, when it shipped, and the measurement taken before and after.
 * Append one entry per shipped optimization. An entry without `before` and
 * `after` is shown as shipped with no measurement, never with a guessed one.
 *
 * `id` is a stable slug, `area` names the part of the platform (for example
 * "storefront", "explore", "dashboard", "database"), `shippedAt` is an ISO date
 * (YYYY-MM-DD). `metric` names what was measured ("server render p75", "query
 * count per request", "bytes shipped"), `unit` is the unit of `value` ("ms",
 * "queries", "KB").
 */

export type Optimization = {
  id: string
  title: string
  area: string
  shippedAt: string
  before?: { metric: string; value: number; unit: string }
  after?: { metric: string; value: number; unit: string }
  note?: string
}

/*
  H18B's entries are measured with scripts/measure-speed18.mjs: the real
  route code over a realistic fixture, every database round trip counted,
  each taking 20ms (a Vercel function to Supabase in the same region), run
  before and after the change in one process each. Round trips are what the
  change removes and do not depend on the network; the milliseconds assume
  that 20ms and say so in the note.
*/
export const OPTIMIZATIONS: Optimization[] = [
  {
    id: "proxy-site-questions-together",
    title: "A website's page is routed in three waves of reads instead of twelve in a row",
    area: "storefront",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips before a connected domain's page is routed, first visit in a minute", value: 12, unit: "queries" },
    after: { metric: "database round trips before a connected domain's page is routed, first visit in a minute", value: 5, unit: "queries" },
    note:
      "proxy.ts asked whether the theme is imported, whether it is an AI site, whether a website is published and whether it wants a password one after another, and two of those walked the same name to creator to install chain. Now the chain is read once (lib/website-builder/route-facts.ts), the domain's creator rides along with the domain, and the questions start together. At 20ms a round trip: 266ms to 83ms on a connected domain, 136ms to 70ms on a storelib.com subdomain (6 to 5 round trips). Paid on every visit that comes more than 20 to 60 seconds after the last one on that server, which for most creators' sites is every visit, and before the page the edge already holds.",
  },
  {
    id: "site-product-page-theme-held",
    title: "A product page on a creator's website asks the database 4 times per visit instead of 9",
    area: "storefront",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips per product page visit on a website", value: 9, unit: "queries" },
    after: { metric: "database round trips per product page visit on a website", value: 4, unit: "queries" },
    note:
      "The published install, its settings, the product and home pages' sections and the section files only change on Publish, and were read again for every visitor. They are held with the site under its publish tag now (lib/website-builder/product-page-theme.ts, ownerOf), and the product's pricing comes from its own row. The product, its options, stock and files are still read fresh per visit. Server time to the answer at 20ms a round trip: 126ms to 53ms (5 waves to 2).",
  },
]
