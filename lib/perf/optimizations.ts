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
  {
    id: "site-collection-members-held",
    title: "A collection page on a creator's website asks the database nothing per visit instead of 3 times",
    area: "storefront",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips per collection page visit on a website", value: 3, unit: "queries" },
    after: { metric: "database round trips per collection page visit on a website", value: 0, unit: "queries" },
    note: "The collection, the shop's products and the collection's members are held with the shop for its minute, under its tag (lib/website-builder/collection-members.ts), like the cards and sections on the same page already were. Server time to the answer at 20ms a round trip: 72ms to 14ms.",
  },
  {
    id: "onepage-reads-together",
    title: "A OnePage asks the database 6 times before it is sent instead of 10",
    area: "creator pages",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips a visitor waits on per OnePage visit", value: 10, unit: "queries" },
    after: { metric: "database round trips a visitor waits on per OnePage visit", value: 6, unit: "queries" },
    note: "The view count's two reads run after the page is sent (next/server after), the owner's creator, profile, product count and domain are read together when the page names them, and the page's live products are read once per request for the metadata and the body. Products are still read live on every visit, so a deleted product leaves at once. At 20ms a round trip: 186ms to 71ms.",
  },
  {
    id: "explore-catalogue-shared",
    title: "Explore's grid is one shared copy instead of 4 database reads for every visitor",
    area: "explore",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips per Explore visit for the catalogue", value: 4, unit: "queries" },
    after: { metric: "database round trips per Explore visit for the catalogue", value: 0, unit: "queries" },
    note: "Browsing reads the newest hundred products as a signed out visitor would, held for a minute under one tag (lib/explore/catalogue-cache.ts). A product save in the editor clears it, a delete, archive, moderation, ban or closed account expires it at once, an empty or failed read is never held, and a search stays live. For you and the visitor stay per visit. Server time to the answer at 20ms a round trip: 70ms to 2ms.",
  },
  {
    id: "profile-by-exact-name",
    title: "A creator page and a member profile find their person by the username index",
    area: "database",
    shippedAt: "2026-10-10",
    before: { metric: "database time of the profile lookup per creator page visit, 100,000 profiles", value: 4.8, unit: "ms" },
    after: { metric: "database time of the profile lookup per creator page visit, 100,000 profiles", value: 0.11, unit: "ms" },
    note: "storelib.com/<name> and /member/<name> asked `username ILIKE <name>`, which no plain index answers: a trigram index scan at best (4.8ms) and a whole table scan when the name starts with a common word (49ms), measured on Postgres 16 by scripts/measure-speed18-indexes.mjs. The exact name is asked first now and the username index answers it in 0.11ms; a name typed in another case than it is stored is asked again the old way. No schema change: SQL part 127 was not needed.",
  },
  {
    id: "creator-page-reads-together",
    title: "A creator page is answered two waves of reads sooner",
    area: "creator pages",
    shippedAt: "2026-10-10",
    before: { metric: "server time to the answer per creator page visit at 20ms a round trip", value: 113, unit: "ms" },
    after: { metric: "server time to the answer per creator page visit at 20ms a round trip", value: 71, unit: "ms" },
    note: "How many the creator follows, whether the viewer follows them, where they are from and which products are off the page waited for the whole first batch and then for each other. They need only the profile, the creator and the viewer, so they start with the batch now. Same 12 reads per visit, the same answers, nothing cached: the page is still per viewer.",
  },
  {
    id: "shared-configs-for-strangers",
    title: "The marketplace product page asks the database nothing per signed out visit instead of 3 times",
    area: "creator pages",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips per signed out repeat visit to a marketplace product page", value: 3, unit: "queries" },
    after: { metric: "database round trips per signed out repeat visit to a marketplace product page", value: 0, unit: "queries" },
    note: "When the shared copy of a store or product page config held nothing (most creators publish no product page config), every visit asked again on its own session in case the session could see more. A visitor with no session asks with the same anon role, so that read is skipped for them (lib/supabase/session-cookie.ts) and kept for anyone signed in; a failed shared read is no longer held for a minute. The creator page's shop config is read from the same shared copy for signed out visitors and fresh for anyone signed in, so a creator sees their publish at once. Creator page: 12 to 10 reads per signed out visit. Marketplace product page at 20ms a round trip: 29ms to 4ms.",
  },
  {
    id: "explore-category-catalogue-shared",
    title: "An Explore category page asks the database nothing per visit instead of 5 times",
    area: "explore",
    shippedAt: "2026-10-10",
    before: { metric: "database round trips per Explore category page visit", value: 5, unit: "queries" },
    after: { metric: "database round trips per Explore category page visit", value: 0, unit: "queries" },
    note: "/explore/<category> built the same newest hundred products with their creators per visit, in four waves. It is held for a minute under Explore's tag like the main grid (its own copy), read as a signed out visitor, cleared by a product save and expired by a takedown. Server time to the answer at 20ms a round trip: 100ms to 2ms.",
  },
  {
    id: "community-landing-reads-together",
    title: "A public community page is answered a wave of reads sooner",
    area: "communities",
    shippedAt: "2026-10-10",
    before: { metric: "server time to the answer per public community page visit at 20ms a round trip", value: 134, unit: "ms" },
    after: { metric: "server time to the answer per public community page visit at 20ms a round trip", value: 111, unit: "ms" },
    note: "The sales page's gallery and live numbers need only the community, and waited for its tiers, its creator and their products first. They are asked beside the tiers now (lib/communities/server/public.ts). Same 12 reads, the same answers; the page stays per visitor.",
  },
]
