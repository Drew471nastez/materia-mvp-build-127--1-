/**
 * ===========================================================================
 *  EXPLORE WITH REAL COMMUNITIES
 * ===========================================================================
 * The round 4 asks for Explore, held from their inputs where they are pure,
 * against an in memory database where the server code runs, and by regex
 * where the thing is a line of a page:
 *
 *   THE MODE       communities mode only while the switch is on; the admin's
 *                  headline flag adds a control, never the mode; an old
 *                  link or cookie gets the products while off.
 *   THE QUERY      the pill, the word, the order and the price, as one
 *                  string the server and the browser agree on.
 *   FINDING        category and price filter on the server; views, stars
 *                  and the sneak peek on the card, from real rows only;
 *                  a database without part 87 still lists.
 *   THE CARD       (round 6) the tagline or the description's start under
 *                  the name, two lines at most; one foot row: the price
 *                  first, a slim hairline, members, views, and the stars
 *                  only with reviews (no count); no "Launched" anywhere.
 *   VIEWS          one key per visitor, never the raw id or address; a bot
 *                  is not a view; the database's once a day answer; the
 *                  page records after the response, one call each.
 *   PART 87        run-now rules, the 99 column, the README row, the copy.
 *   LINKS          nothing points at /explore/communities any more; it
 *                  redirects, keeping q and the order, and 404s while off.
 *   PRODUCTS       titles clamp to two lines; cards fill their row.
 *   CATEGORIES     an icon alone in the hero's search field (round 6), and
 *                  the same icon and menu in the header's field once the
 *                  hero's has gone, which looks like the hero's field; the
 *                  creator's category select uses Explore's list.
 *   FOOTER         Explore on a computer ends with the creator page footer.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_PRICE_FILTERS,
  COMMUNITY_SORT_OPTIONS,
  EXPLORE_COMMUNITIES_HREF,
  communitiesQuery,
  communityCategoryId,
  communityServerSort,
  discoverModeFor,
  legacyCommunitiesTarget,
  ratingLabel,
  showsHeadlineSwitch,
  statCount,
  srtForLegacySort,
} from "@/lib/explore/communities-mode"
import { ACCESS_FOR_PRICE, afterFilter, exploreCategory, exploreCommunities, exploreOrFilter, explorePrice, exploreSubcategory } from "@/lib/communities/server/explore"
import { cardExcerpt, cardRating, EXCERPT_MAX } from "@/lib/communities/server/public"
import { purgeOldViewDays, recordCommunityView, visitorKey } from "@/lib/communities/server/views"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const DAY = 86_400_000
const NOW = Date.parse("2026-10-04T12:00:00Z")
const C1 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const C3 = "33333333-3333-4333-8333-333333333333"

function world(withViews = true) {
  const base = { status: "published", visibility: "public", discovery_enabled: true, platform_hidden: false, deleted_at: null, suspended_at: null, archived_at: null, tagline: null, logo_url: null, cover_url: null, member_count: 10, trending_score: 1, creator_id: "cr1" }
  const communities = [
    { ...base, id: C1, slug: "clay", name: "Clay Studio", tagline: "Glazes, kilns and honest crits.", description: "<p>Never read: the tagline says it.</p>", category: "design", access: "paid", created_at: new Date(NOW - 400 * DAY).toISOString(), member_count: 1700, ...(withViews ? { view_count: 31_700 } : {}) },
    { ...base, id: C2, slug: "code", name: "Code Club", description: "<h2>Ship&nbsp;weekly</h2><p>A small room of <strong>indie</strong> devs.</p>", category: "development", access: "free", created_at: new Date(NOW - 3 * DAY).toISOString(), ...(withViews ? { view_count: 0 } : {}) },
    { ...base, id: C3, slug: "hidden", name: "Hidden", category: "design", access: "paid", discovery_enabled: false, created_at: new Date(NOW - 10 * DAY).toISOString() },
  ]
  return fakeDb({
    communities,
    community_tiers: [
      { id: "t1", community_id: C1, name: "Members", position: 0, kind: "paid", billing: "one_time", product_id: "p1", benefits: [], is_default: false, archived_at: null },
      { id: "t2", community_id: C2, name: "Free", position: 0, kind: "free", billing: null, product_id: null, benefits: [], is_default: true, archived_at: null },
    ],
    products: [{ id: "p1", title: "Clay", slug: "clay", type: "community", status: "published", price_cents: 9000, creator_id: "cr1", reviews_count: 37, reviews_average: 4.86 }],
    membership_plans: [],
    creators: [{ id: "cr1", user_id: "u1", slug: "mara", display_name: "Mara", avatar_url: null, stripe_account_id: null, stripe_onboarding_status: null, charges_enabled: null, onboarding_completed: true }],
    profiles: [{ id: "u1", username: "mara", display_name: "Mara L", avatar_url: "https://x.test/a.png" }],
  })
}

async function main() {
  console.log("\nThe mode")
  {
    check("switch off: ?type=communities gets the products", discoverModeFor({ communitiesOn: false, type: "communities" }) === "products")
    check("switch off: a remembered communities choice gets the products", discoverModeFor({ communitiesOn: false, cookie: "communities" }) === "products")
    check("switch on: ?type=communities is communities", discoverModeFor({ communitiesOn: true, type: "communities" }) === "communities")
    check("switch on: the address beats the cookie", discoverModeFor({ communitiesOn: true, type: "products", cookie: "communities" }) === "products")
    check("switch on: the cookie when the address says nothing, else products", discoverModeFor({ communitiesOn: true, cookie: "communities" }) === "communities" && discoverModeFor({ communitiesOn: true }) === "products")
    check("the admin's headline flag adds the gray control only while communities are on", showsHeadlineSwitch({ communitiesOn: true, headlineFlag: true }) && !showsHeadlineSwitch({ communitiesOn: false, headlineFlag: true }) && !showsHeadlineSwitch({ communitiesOn: true, headlineFlag: false }))
    const page = code("app/(marketing)/explore/page.tsx")
    check("the page decides the mode by that rule", /discoverModeFor\(\{ communitiesOn, type: params\?\.type \?\? null, cookie: cookieMode \}\)/.test(page))
    check("and draws the first page of real communities in communities mode, with the subcategory from the address", /initialDiscoverMode === "communities"\s*\? exploreCommunities\(\{ q: searchQuery, category, sub, sort: communityServerSort\(params\?\.srt\) \}\)/.test(page) && /query: communitiesQuery\(\{ q: searchQuery, category, sub, srt: params\?\.srt \?\? null \}\)/.test(page) && /broadened: p\.broadened === true/.test(page) && /const sub = category !== "all" && params\?\.sub && VALID_SUBCATEGORY_IDS\.includes\(params\.sub\) \? params\.sub : null/.test(page) && /initialCommunities=\{await firstCommunitiesPromise\}/.test(page))
    const client = code("components/explore/explore-page-client.tsx")
    check("the chip's switcher and the headline control only while communities are on", /onModeChange=\{communitiesEnabled \? handleModeChange : undefined\}/.test(client) && /discoverHeadlineSegmentEnabled=\{communitiesEnabled && discoverHeadlineSegmentEnabled\}/.test(client))
    check("the client never starts in communities mode while off", /if \(!communitiesEnabled\) return "products"/.test(client))
    check("the address always carries ?type=products or ?type=communities while communities are on", /if \(communitiesEnabled\) params\.set\("type", forMode === "communities" \? "communities" : "products"\)/.test(client))
    check("switching catalogue writes the cookie and updates the address at once", /writeDiscoverModeCookie\(next\)/.test(client) && /replaceAddress\(href\)/.test(client) && /handleModeChange[\s\S]{0,400}replaceAddress\(href\)/.test(client))
    check("communities mode no longer reads membership products", !/isCommunity/.test(client) && !/type === "membership"/.test(client))
    check("communities mode draws ExploreCommunitiesResults with the pill, subcategory, word, order and price", /<ExploreCommunitiesResults[\s\S]{0,200}initial=\{initialCommunities\}[\s\S]{0,200}category=\{gridCategory\}\s*sub=\{gridSub\}\s*subLabel=\{selectedSubcategoryLabel\}\s*srt=\{deferredSort\}[\s\S]{0,40}price=\{deferredPrice\}/.test(client))
    /* Round 8: the products' row and the products' More in communities mode, whole tree and subcategories. */
    check("the products' pills in communities mode, All where For you would be", /const rowPills = \[communities \? \{ id: "all", label: "All" \} : \{ id: pillRow\.first\.id, label: pillRow\.first\.label \}, \.\.\.pillRow\.pills\]/.test(client) && !/COMMUNITY_PILLS/.test(client))
    check("one picker for both modes, the whole tree with its subcategories, and one pick", !/COMMUNITY_PICKER_GROUPS/.test(client) && /groups=\{PICKER_GROUPS\}/.test(client) && /groups: PICKER_GROUPS,/.test(client) && (client.match(/selectedItem[=:] ?\{?selectedSubcategoryId/g) ?? []).length === 2 && (client.match(/onPick[=:] ?\{?pickCategory/g) ?? []).length === 2 && /items: c\.subcategories,/.test(client))
    check("the Filters keep the communities' orders and prices", /sortOptions=\{communities \? COMMUNITY_SORT_OPTIONS : SORT_OPTIONS\}/.test(client) && /priceOptions=\{communities \? COMMUNITY_PRICE_FILTERS : PRICE_FILTERS\}/.test(client))
    /* Round 9, changed on purpose: "no Communities pill in the category pill row (communities are reached only through the hero's Discover switcher)". */
    check("no Communities pill in the row, in either mode: the hero's switcher is the way in", !/data-communities-pill/.test(client) && !/handleModeChange\(communities \? "products" : "communities"\)/.test(client) && /onModeChange=\{communitiesEnabled \? handleModeChange : undefined\}/.test(client))
    check("and no categories board under the list (Explore categories you can build with)", !/FeaturedCategoriesSection/.test(page) && !existsSync(join(process.cwd(), "components/explore/featured-categories-section.tsx")))
    check("a ?sub= address is the subcategory from the first render", /useState<string \| null>\(\(\) => subcategoryFromAddress\(searchParams\.get\("sub"\)\)\?\.id \?\? null\)/.test(client))
    const results = code("components/explore/explore-communities-results.tsx")
    check("the results ask with the subcategory, say when it was broadened, and go on without it", /communitiesQuery\(\{ q, category, sub, srt, price \}\)/.test(results) && /const pageQuery = broadened \? communitiesQuery\(\{ q, category, srt, price \}\) : query/.test(results) && /No communities about \{subLabel\} yet, so here is everything in \{categoryLabel\}\./.test(results))
    const route = code("app/api/explore/communities/route.ts")
    check("the route passes the subcategory and answers broadened", /sub: url\.searchParams\.get\("sub"\)/.test(route) && /broadened: true/.test(route))
    check("a search in communities mode is the communities' search, not the products' results", /\{\(!urlSearchQuery \|\| communities\) && \(/.test(client) && /\{urlSearchQuery && !communities && \(/.test(client))
  }

  console.log("\nThe query")
  {
    check("orders: Trending, Most members, Newest, in the products' sort ids", COMMUNITY_SORT_OPTIONS.map((o) => `${o.id}:${o.label}`).join() === "recommended:Trending,popular:Most members,newest:Newest")
    check("prices: Any, Free, Paid", COMMUNITY_PRICE_FILTERS.map((o) => o.id).join() === "all,free,paid")
    check("server order from the page's sort", communityServerSort("recommended") === "trending" && communityServerSort("popular") === "popular" && communityServerSort("newest") === "new" && communityServerSort("price-low") === "trending" && communityServerSort(null) === "trending")
    check("the default choices are the empty query", communitiesQuery({ q: "", category: "all", srt: "recommended", price: "all" }) === "")
    check("For you is no category", communitiesQuery({ category: "for-you" }) === "")
    check("one fixed order for the same choice", communitiesQuery({ price: "free", srt: "newest", category: "Design", q: " pots " }) === "q=pots&c=design&sort=new&price=free")
    check("an unknown price is no price", communitiesQuery({ price: "under-10" }) === "")
    check("the old page's words: sort=new is Newest, popular stays, trending is the default", srtForLegacySort("new") === "newest" && srtForLegacySort("popular") === "popular" && srtForLegacySort("trending") === null)
    check("the old address lands on the same list", legacyCommunitiesTarget({ q: "clay pots", sort: "new" }) === "/explore?type=communities&q=clay+pots&srt=newest" && legacyCommunitiesTarget({}) === EXPLORE_COMMUNITIES_HREF)
  }

  console.log("\nFinding")
  {
    check("a category is one of the pills' ids, never all or a made up word", exploreCategory("Design") === "design" && exploreCategory("all") === null && exploreCategory("knitting") === null && exploreCategory(5) === null)
    check("a price is free or paid", explorePrice("free") === "free" && explorePrice("paid") === "paid" && explorePrice("cheap") === null)
    check("free is a free way in; paid is a payment or a product; invite only is neither", ACCESS_FOR_PRICE.free.join() === "free" && ACCESS_FOR_PRICE.paid.join() === "paid,product,custom")

    const db = world()
    const all = await exploreCommunities({}, db)
    check("only what may be found (discovery off is left out)", all.available && all.items.map((c) => c.slug).sort().join() === "clay,code")
    const clay = all.items.find((c) => c.slug === "clay")
    check("the card carries the real views", clay?.viewCount === 31_700 && all.items.find((c) => c.slug === "code")?.viewCount === 0)
    check("the stars are the tier product's own average, with its count", clay?.rating?.average === 4.9 && clay?.rating?.count === 37)
    check("no reviews, no stars", all.items.find((c) => c.slug === "code")?.rating === null)
    check("the launch date is still carried (not drawn)", clay?.launchedAt === new Date(NOW - 400 * DAY).toISOString())
    const code_ = all.items.find((c) => c.slug === "code")
    check("a tagline is the sneak peek; its description is not even read", clay?.tagline === "Glazes, kilns and honest crits." && clay?.excerpt === null)
    check("no tagline: the description's start as plain text", code_?.excerpt === "Ship weekly A small room of indie devs.", code_?.excerpt)
    const reads = db.log.filter((l) => l.table === "communities" && l.filters.some(([k, c]) => k === "in" && c === "id"))
    check("descriptions in one read, for the untagged cards alone", reads.length === 1 && JSON.stringify(reads[0].filters.find(([k, c]) => k === "in" && c === "id")?.[2]) === JSON.stringify([C2]), reads.map((r) => r.filters))

    const design = await exploreCommunities({ category: "design" }, world())
    check("a pill is an equality on communities.category", design.items.map((c) => c.slug).join() === "clay")
    const db2 = world()
    const free = await exploreCommunities({ price: "free" }, db2)
    check("Free lists the free ways in", free.items.map((c) => c.slug).join() === "code")
    check("and asks the database for it (access in free), beside the visibility rules", db2.log.some((l) => l.table === "communities" && l.filters.some(([k, c, v]) => k === "in" && c === "access" && JSON.stringify(v) === '["free"]') && l.filters.some(([k, c, v]) => k === "eq" && c === "discovery_enabled" && v === true)))
    const paid = await exploreCommunities({ price: "paid", category: "development" }, world())
    check("filters combine", paid.items.length === 0)

    /*
      ROUND 8: A SUBCATEGORY FROM MORE. A community stores a category, never a
      subcategory, so the server reads one as its parent narrowed by its
      words, and shows the whole category (broadened) when nothing has them.
      The fake database has no `or`, so this one evaluates the flat list of
      ilike patterns the narrowing sends, the way PostgREST would.
    */
    const ui = exploreSubcategory("ui-ux")
    check("a subcategory is its parent category and its words, as ilike patterns", ui?.category === "design" && ui.label === "UI/UX Templates" && ui.patterns.includes("*ui*ux*") && ui.patterns.includes("*ui*ux*template*"), ui)
    check("  never a two letter word on its own (it is inside half the dictionary)", !!ui && !ui.patterns.includes("*ui*") && !ui.patterns.includes("*ux*"))
    check("  and nothing for a category id, an unknown word or a non string", exploreSubcategory("design") === null && exploreSubcategory("knitting") === null && exploreSubcategory(3) === null && exploreSubcategory("") === null)
    check("  every pattern is words and stars only, safe in a filter", (["presets", "after-effects", "scripts", "documents", "guides", "ui-ux"] as const).every((id) => (exploreSubcategory(id)?.patterns ?? ["x"]).every((pt) => /^\*[a-z0-9*]+\*$/.test(pt))))
    const cur = { v: 3, id: C1 }
    check("one or: the search alone is what it always was", exploreOrFilter({ q: "pots", sort: "trending" }) === "name.ilike.*pots*,tagline.ilike.*pots*")
    check("  the cursor alone too", exploreOrFilter({ sort: "trending", cursor: cur }) === afterFilter("trending", cur))
    check("  and every group required together", exploreOrFilter({ q: "pots", patterns: ["*mockup*"], sort: "trending", cursor: cur }) === `and(or(name.ilike.*pots*,tagline.ilike.*pots*),or(name.ilike.*mockup*,tagline.ilike.*mockup*,description.ilike.*mockup*),or(${afterFilter("trending", cur)}))`)
    check("  and nothing when nothing is asked", exploreOrFilter({ sort: "new" }) === null)
    const withOr = (db: ReturnType<typeof world>) => {
      const ors: string[] = []
      const realFrom = db.from
      ;(db as { from: unknown }).from = (table: string) => {
        const b = realFrom(table) as Record<string, unknown> & { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => unknown }
        if (table !== "communities") return b
        let pats: { col: string; re: RegExp }[] | null = null
        b.or = (f: string) => {
          ors.push(f)
          pats = f.split(",").map((part) => {
            const [col, , pat] = part.split(".")
            return { col, re: new RegExp(`^${pat.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "is") }
          })
          return b
        }
        const realThen = b.then.bind(b)
        b.then = (res, rej) => realThen((v: unknown) => {
          const out = v as { data: Record<string, unknown>[] | null }
          if (pats && Array.isArray(out.data)) out.data = out.data.filter((r) => pats!.some(({ col, re }) => typeof r[col] === "string" && re.test(r[col] as string)))
          return res(out)
        }, rej)
        return b
      }
      return ors
    }
    const narrowDb = world()
    ;(narrowDb.tables.communities[0] as Record<string, unknown>).tagline = "Glazes, kilns and print mockups."
    const narrowOrs = withOr(narrowDb)
    const narrowed = await exploreCommunities({ category: "development", sub: "mockups" }, narrowDb)
    check("Design > Mockups: the design communities that mention mockups, whatever category the address said", narrowed.items.map((c) => c.slug).join() === "clay" && !narrowed.broadened && narrowOrs.length === 1 && /tagline\.ilike\.\*mockup\*/.test(narrowOrs[0]), { items: narrowed.items.map((c) => c.slug), ors: narrowOrs })
    check("  read inside the parent category", narrowDb.log.some((l) => l.table === "communities" && l.filters.some(([k, c, v]) => k === "eq" && c === "category" && v === "design")))
    const wideDb = world()
    const wideOrs = withOr(wideDb)
    const wide = await exploreCommunities({ category: "design", sub: "ui-ux" }, wideDb)
    check("Design > UI/UX Templates with nothing about it: the whole of Design, flagged broadened", wide.items.map((c) => c.slug).join() === "clay" && wide.broadened === true && wideOrs.length === 1, { items: wide.items.map((c) => c.slug), broadened: wide.broadened, ors: wideOrs })
    const laterDb = world()
    withOr(laterDb)
    const later = await exploreCommunities({ category: "design", sub: "ui-ux", cursor: Buffer.from(JSON.stringify(cur)).toString("base64url") }, laterDb)
    check("  a next page is never broadened on its own (the page asks for the category itself)", !later.broadened)
    const freebies = await exploreCommunities({ category: "freebies" }, world())
    check("Freebies is a price: the free communities, in any category", freebies.items.map((c) => c.slug).join() === "code")
    const freePaid = await exploreCommunities({ category: "freebies", price: "paid" }, world())
    check("  and Freebies with Paid is nothing", freePaid.items.length === 0)
    check("the query carries the subcategory beside its category, and only there", communitiesQuery({ category: "design", sub: "ui-ux", srt: "newest" }) === "c=design&sub=ui-ux&sort=new" && communitiesQuery({ category: "all", sub: "ui-ux" }) === "")

    /* Before part 87: the column is not there, and the list still works. */
    const old = world(false)
    const realFrom = old.from
    let asked: string[] = []
    ;(old as { from: unknown }).from = (table: string) => {
      const b = realFrom(table)
      if (table !== "communities") return b
      const realSelect = b.select.bind(b)
      b.select = (cols: string, ...rest: unknown[]) => {
        asked.push(cols)
        const out = realSelect(cols, ...rest)
        if (/view_count/.test(cols)) {
          ;(out as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "42703", message: "column communities.view_count does not exist" } }).then(resolve)
        }
        return out
      }
      return b
    }
    const before = await exploreCommunities({}, old)
    const lists = asked.filter((c) => c !== "id, description")
    check("before part 87: asked again without the views, and still listed", before.available && before.items.length === 2 && lists.length === 2 && !/view_count/.test(lists[1]))
    check("  with no eye on the card (null, not zero)", before.items.every((c) => c.viewCount === null))
    asked = []

    const products = new Map([
      ["a", { id: "a", title: null, slug: null, type: null, status: null, price_cents: null, creator_id: null, reviews_count: 3, reviews_average: 5 }],
      ["b", { id: "b", title: null, slug: null, type: null, status: null, price_cents: null, creator_id: null, reviews_count: 1, reviews_average: 1 }],
      ["c", { id: "c", title: null, slug: null, type: null, status: null, price_cents: null, creator_id: null, reviews_count: 0, reviews_average: 0 }],
    ])
    check("stars across tiers are weighted by their counts", JSON.stringify(cardRating(["a", "b", "c", null, "a"], products)) === JSON.stringify({ average: 4, count: 4 }))
    check("and none without a review", cardRating(["c"], products) === null && cardRating([], products) === null)
  }

  console.log("\nThe card")
  {
    const mode = code("lib/explore/communities-mode.ts")
    const card = code("components/explore/community-card.tsx")
    check("no Launched anywhere: the label is gone and the card draws no date", !/launchedLabel|Launched/.test(mode) && !/launched|Launched/i.test(card))
    check("stars read 4.9, with no count beside them", ratingLabel({ average: 4.86, count: 37 }) === "4.9" && ratingLabel({ average: 5, count: 1 }) === "5.0")
    check("counts read like the reference: 1.7k, 31.7k, never rounded up", [840, 1700, 1749, 31_700, 99_999, 128_000, 1_250_000, -3].map(statCount).join() === "840,1.7k,1.7k,31.7k,99.9k,128k,1.2M,0")
    check("no reviews, no stars", ratingLabel(null) === null && ratingLabel({ average: 0, count: 0 }) === null && ratingLabel({ average: 4, count: 0 }) === null)
    const facts = card.slice(card.indexOf("function Facts("), card.indexOf("function Creator("))
    const at = (marker: string) => facts.indexOf(marker)
    check("the foot row: the price first, then the hairline, then members, views, stars", at("data-community-price") > 0 && at("data-community-price") < at("data-community-divider") && at("data-community-divider") < at('data-stat="members"') && at('data-stat="members"') < at('data-stat="views"') && at('data-stat="views"') < at('data-stat="rating"'))
    check("the hairline is slim and quiet: 1px wide, 14px tall, the border colour, hidden from readers", /<span aria-hidden className="h-3\.5 w-px shrink-0 bg-border" data-community-divider="" \/>/.test(facts))
    check("stars only with a rating (no count), views only when known, the price and hairline only with a price", /\{rating \? \(/.test(facts) && /\{views !== null \? \(/.test(facts) && /\{card\.priceLine \? \(/.test(facts) && !/\(\{?card\.rating\.count/.test(card))
    check("the sneak peek: the tagline, else the description's start, two lines at most", /return card\.tagline\?\.trim\(\) \|\| card\.excerpt\?\.trim\(\) \|\| null/.test(card) && /"line-clamp-2 break-words text-\[13\.5px\] leading-5 text-muted-foreground"/.test(card) && (card.match(/<Blurb card=\{card\}/g) ?? []).length === 2)
    /* Round 8, the owner's reference proportions without "Launched". */
    check("the mark a rounded square, 56 on a computer and 48 on a phone, in the grid and in a row; 72 on an empty cover", /const MARK_PX = 56/.test(card) && /const MARK_CLASS = `h-12 w-12 rounded-\[12px\] \$\{MARK_DEPTH\}`/.test(card) && /const MARK_CLASS_WIDE = "sm:h-14 sm:w-14 sm:rounded-\[14px\]"/.test(card) && /<Mark card=\{card\} size=\{MARK_PX\} eager=\{priority\} className=\{markClass\} \/>/.test(card) && /<Mark card=\{card\} size=\{MARK_PX\} cover eager=\{priority\}/.test(card) && /<Mark card=\{card\} size=\{72\}/.test(card) && !/size=\{(40|44|52|57|64|70)\}/.test(card))
    check("the mark is asked for through the optimizer at its drawn size (twice that on file), with its width and height", /src=\{optimizedImageUrl\(src, size\)\}/.test(card) && /width=\{size\}\s*height=\{size\}/.test(card) && /loading=\{eager \? "eager" : "lazy"\}/.test(card))
    check("a bigger name: 18/24 on a phone, 20/26 from 640px, two lines at most, and the creator's face under it", /line-clamp-2[^"]*", titleClass\)/.test(card) && /COMMUNITY_TITLE = "[^"]*text-\[18px\] font-medium leading-6/.test(card) && /COMMUNITY_TITLE_WIDE = "sm:text-\[20px\] sm:leading-\[26px\]"/.test(card) && /<AppAvatar src=\{card\.creator\.avatarUrl\} name=\{card\.creator\.name\} alt="" size=\{20\} lazy=\{!eager\}/.test(card) && /by \{card\.creator\.name\}/.test(card))
    /* Round 10: the wells are small squares with a 7px corner, not circles. */
    check("the price a step larger than the facts (16px, round 11), and each fact's icon in a small square well (7px corner)", /text-\[16px\] font-semibold[^"]*" data-community-price=""/.test(card) && /STAT_WELL_CLASS = "inline-flex h-\[22px\] w-\[22px\] shrink-0 items-center justify-center rounded-\[7px\]"/.test(card) && !/data-stat-well[\s\S]{0,200}rounded-full/.test(card) && (facts.match(/<Well storefront=\{storefront\}>/g) ?? []).length === 2)
    check("the product card's frame: 16:9 picture, the border, the foot row at the bottom so a row lines up", /aspect-video/.test(card) && /rounded-lg border border-border\/60 bg-card/.test(card) && /<div className="mt-auto pt-4">\s*<Facts card=\{card\} storefront=\{storefront\} \/>/.test(card) && /group\/community flex h-full w-full min-w-0 flex-col/.test(card))
    check("an excerpt is plain text cut at a word near the limit", cardExcerpt("<p>One <em>two</em></p><p>three</p>") === "One two three" && cardExcerpt(null) === null && cardExcerpt("<p> </p>") === null && (() => { const long = cardExcerpt(`<p>${"word ".repeat(80)}</p>`) ?? ""; return long.length <= EXCERPT_MAX + 1 && long.endsWith("word\u2026") })())
    check("the card draws no hooks and imports no server code", !/use(State|Effect|Ref|Memo)\(/.test(card) && !/server-only|lib\/communities\/server|next\/headers/.test(card))
  }

  console.log("\nViews")
  {
    const SECRET = "test-secret"
    const a = visitorKey({ userId: "user-1" }, C1, NOW, SECRET)
    check("a signed in visitor's key: 64 hex, the same each time", !!a && /^[0-9a-f]{64}$/.test(a) && a === visitorKey({ userId: "user-1", userAgent: "curl/8" }, C1, NOW + DAY, SECRET))
    check("never the raw id", !!a && !a.includes("user-1"))
    check("another person is another key", visitorKey({ userId: "user-2" }, C1, NOW, SECRET) !== a)
    const b = visitorKey({ userId: null, browserId: "v_abc123def", userAgent: "Mozilla/5.0 (Macintosh)" }, C1, NOW, SECRET)
    check("signed out with a browser id: keyed by it", !!b && b === visitorKey({ userId: null, browserId: "v_abc123def", userAgent: "Mozilla/5.0 (Macintosh)", ip: "1.2.3.4" }, C1, NOW, SECRET))
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    const anon = visitorKey({ userId: null, ip: "203.0.113.9", userAgent: ua }, C1, NOW, SECRET)
    check("signed out without one: a daily hash of the address, which never appears in the key", !!anon && !anon.includes("203.0.113.9") && anon === visitorKey({ userId: null, ip: "203.0.113.9", userAgent: ua }, C1, NOW + 1000, SECRET))
    check("a bot is not a view", visitorKey({ userId: null, ip: "203.0.113.9", userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }, C1, NOW, SECRET) === null)
    check("nothing to key by, no view", visitorKey({ userId: null, userAgent: ua }, C1, NOW, SECRET) === null)
    check("a malformed browser id is not trusted", visitorKey({ userId: null, browserId: "x;drop", userAgent: ua }, C1, NOW, SECRET) === null)

    const calls: unknown[] = []
    const rpcDb = (answer: { data: unknown; error: unknown }) => ({ rpc: async (name: string, args: unknown) => (calls.push([name, args]), answer) })
    check("a new view is counted by the database's own rule", (await recordCommunityView(rpcDb({ data: true, error: null }), C1, a)) === "counted" && JSON.stringify(calls[0]) === JSON.stringify(["community_record_view", { p_community: C1, p_visitor: a }]))
    check("the same day again is a repeat", (await recordCommunityView(rpcDb({ data: false, error: null }), C1, a)) === "repeat")
    check("before part 87 it is unavailable, never an error page", (await recordCommunityView(rpcDb({ data: null, error: { code: "PGRST202", message: "not found" } }), C1, a)) === "unavailable")
    const asked = calls.length
    check("no key, nothing asked", (await recordCommunityView(rpcDb({ data: true, error: null }), C1, null)) === "skipped" && calls.length === asked)

    const deleted: unknown[] = []
    const purgeDb = { from: (t: string) => ({ delete: () => ({ lt: async (c: string, v: string) => (deleted.push([t, c, v]), { error: null }) }) }) }
    await purgeOldViewDays(purgeDb, NOW)
    check("the cron keeps three days of day rows", JSON.stringify(deleted) === JSON.stringify([["community_view_days", "day", "2026-10-01"]]))
    check("the daily rollup runs the purge once, on its first run", /if \(!after\) await purgeOldViewDays\(db\)/.test(code("lib/communities/server/jobs/rollup.ts")))

    const record = code("lib/communities/server/record-view.ts")
    check("the page reads the request, then writes after the response", /await Promise\.all\(\[headers\(\), cookies\(\)\]\)/.test(record) && /after\(async \(\) => \{\s*await recordCommunityView\(admin\(\)/.test(record))
    check("owners and unpublished communities are not counted", /if \(input\.status !== "published" \|\| input\.isOwner\) return/.test(record))
    const feed = code("app/(marketing)/community/[slug]/page.tsx")
    const about = code("app/(marketing)/community/[slug]/about/page.tsx")
    check("the member feed and the sales page record a view, one call", (feed.match(/scheduleCommunityView\(/g) ?? []).length === 1 && /scheduleCommunityView\([\s\S]{0,200}\)[\s\S]*if \(load\.viewer\.active\)\s*return \(?\s*(<PullToRefreshEvent scope="community-feed">\s*)?<CommunityFeedPage/.test(feed))
    check("the about page records a view, one call", (about.match(/scheduleCommunityView\(/g) ?? []).length === 1)
    check("the server modules say server-only", ["views", "record-view"].every((n) => /^import "server-only"/m.test(read(`lib/communities/server/${n}.ts`))))
  }

  console.log("\nPart 87")
  {
    const part = read("supabase/sql/run-now/87_community_views.sql")
    const lines = part.trimEnd().split("\n")
    check("line 1 is the summary", /^\/\* Community views, run after part 81\..*\*\/$/.test(lines[0]))
    check("one statement per line, every line ends its statement", lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("notify pgrst is last", lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("view_count, never negative, readable like the member count", /ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0;/.test(part) && /CHECK \(view_count >= 0\)/.test(part) && /GRANT SELECT \(view_count\) ON public\.communities TO anon, authenticated;/.test(part))
    check("the day table: its key is (community, visitor, day), server only", /CREATE TABLE IF NOT EXISTS public\.community_view_days \(community_id uuid NOT NULL REFERENCES public\.communities\(id\) ON DELETE CASCADE, visitor_key text NOT NULL, day date NOT NULL/.test(part) && /PRIMARY KEY \(community_id, visitor_key, day\)/.test(part) && /ENABLE ROW LEVEL SECURITY;/.test(part) && /REVOKE ALL ON public\.community_view_days FROM PUBLIC, anon, authenticated;/.test(part))
    check("the function counts only a new day row", /ON CONFLICT \(community_id, visitor_key, day\) DO NOTHING; GET DIAGNOSTICS v_new = ROW_COUNT; IF v_new = 0 THEN RETURN false; END IF; UPDATE public\.communities SET view_count = view_count \+ 1/.test(part))
    check("service role only", /REVOKE ALL ON FUNCTION public\.community_record_view\(uuid, text\) FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT EXECUTE ON FUNCTION public\.community_record_view\(uuid, text\) TO service_role;/.test(part) && /SECURITY DEFINER SET search_path = public/.test(part))
    check("safe to run again (IF NOT EXISTS, OR REPLACE, DROP ... IF EXISTS)", !/CREATE TABLE public|CREATE INDEX public|CREATE FUNCTION/.test(part) && /CREATE INDEX IF NOT EXISTS community_view_days_day_idx/.test(part))
    check("the migration copy is the part", existsSync("supabase/migrations/20261107_community_views.sql") && read("supabase/migrations/20261107_community_views.sql") === part)
    check("the README lists it", /\| `87_community_views\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("the check after has its column", /as p87_community_views[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")) && /not has_function_privilege\('anon', 'public\.community_record_view\(uuid,text\)', 'EXECUTE'\) as p87_community_views/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("and the run-four files carry it", /-- part 87_community_views\.sql/.test(read("supabase/sql/run-four/3_of_4_latest.sql")))
  }

  console.log("\nLinks")
  {
    const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : [])
    const all = ["app", "components", "lib"].flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f))
    const old = all.filter((f) => /["'`(]\/explore\/communities\b/.test(code(f).replace(/\/api\/explore\/communities/g, "")))
    check("nothing links to /explore/communities any more", old.length === 0, old)
    check("the navigator's Discover communities", /label: "Discover communities", href: "\/explore\?type=communities"/.test(read("lib/nav/places-shared.ts")))
    check("the library's empty state", /ctaHref="\/explore\?type=communities"/.test(read("components/community/public/library-list.tsx")))
    check("/community on its own", /redirect\("\/explore\?type=communities"\)/.test(read("app/(marketing)/community/page.tsx")))
    const legacy = code("app/(marketing)/explore/communities/route.ts")
    check("/explore/communities: a 404 while off, else a permanent redirect keeping q and the order", /if \(!\(await communitiesEnabled\(\)\)\) return new NextResponse\("Not found", \{ status: 404 \}\)[\s\S]*legacyCommunitiesTarget\(\{ q: params\.get\("q"\), sort: params\.get\("sort"\) \}\)[\s\S]*, 308\)/.test(legacy))
    check("the old page's component is gone", !existsSync("components/community/public/explore-communities.tsx"))
  }

  console.log("\nProducts")
  {
    const card = code("components/explore/product-card.tsx")
    check("a product title is two lines at most, with an ellipsis", /<h3 className="flex-1 min-w-0 line-clamp-2 [^"]*"/.test(card))
    check("the card fills its row, the price at its foot", /className="group flex h-full flex-col/.test(card) && /mt-auto pt-4/.test(card))
  }

  console.log("\nCategories")
  {
    const hero = code("components/explore/explore-hero.tsx")
    const button = code("components/explore/search-categories-button.tsx")
    check("the hero's search field has the categories icon at its right end", /data-search-tail/.test(hero) && /<SearchCategoriesButton categories=\{categories\} size="hero" \/>/.test(hero))
    /* Round 10: Explore's own chips icon, not the four square grid. */
    check("an icon alone: Explore's chips icon (not a grid), no word and no chevron, named Categories, with a tooltip", /<CategoriesIcon aria-hidden/.test(button) && !/LayoutGrid|Grid2X2|Grid3X3|Sparkle/.test(button) && !/Chevron/.test(button) && !/>\s*Categories\s*</.test(button + hero) && /CATEGORIES_LABEL = "Categories"/.test(button) && /triggerLabel=\{CATEGORIES_LABEL\}/.test(button) && /tooltip=\{CATEGORIES_LABEL\}/.test(button))
    check("the same menu as before: the picker, from its right edge", /<ExploreCategoryPicker[\s\S]{0,400}align="end"[\s\S]{0,80}marker=\{size === "hero" \? "search-categories" : "header-search-categories"\}/.test(button))
    check("sized for a thumb on a phone (40px), 44 on a computer, 36 in the header's field", /size === "hero" \? "h-10 w-10 sm:h-11 sm:w-11" : "h-9 w-9"/.test(button))
    const picker = code("components/explore/explore-category-picker.tsx")
    check("the tooltip is a computer's, and stays away while the menu is open or just closed", /<Tooltip\s+open=\{tipOpen && !open\}/.test(picker) && /performance\.now\(\) - closedAt\.current > 400/.test(picker) && /<TooltipContent side="bottom" data-categories-tooltip="">/.test(picker))
    check("the field leaves room for it", /categories \? \(draft \? "pr-\[\d+px\] sm:pr-\[\d+px\]" : "pr-\[\d+px\] sm:pr-\[\d+px\]"\) : "pr-12"/.test(hero))
    const client = code("components/explore/explore-page-client.tsx")
    check("the page hands it the same list and the same pick as More", /categories=\{\{\s*groups: PICKER_GROUPS,/.test(client) && /handleCategoryChange\(groupId, sub\?\.id, sub\?\.label, true\)/.test(client))
    check("Explore's categories for a creator: no Freebies, Development reads Tech", !COMMUNITY_CATEGORIES.some((c) => c.id === "freebies" || c.id === "all") && COMMUNITY_CATEGORIES.find((c) => c.id === "development")?.label === "Tech" && COMMUNITY_CATEGORIES.length >= 12)
    check("a saved category is a pill's id; old free text is read the products' way", communityCategoryId("design") === "design" && communityCategoryId(" AI ") === "ai" && communityCategoryId("Knitting circles") === "other" && communityCategoryId("") === null && communityCategoryId("all") === null && communityCategoryId(4) === null)
    const settings = code("components/community/creator/settings-section.tsx")
    check("Settings, Page has the category select with that list", /<select id="g-category" value=\{s\.category\}[\s\S]{0,200}COMMUNITY_CATEGORIES\.map/.test(settings) && /category: communityCategoryId\(data\.category\) \?\? ""/.test(settings))
    check("and the free text field is gone from Access", !/id="d-cat"/.test(settings))
    check("the server stores only a pill's id", /if \(b\.category !== undefined\) patch\.category = communityCategoryId\(b\.category\)/.test(code("lib/communities/server/creator.ts")))
  }

  console.log("\nThe header's search field")
  {
    const look = code("lib/explore/search-field-look.ts")
    const hero = code("components/explore/explore-hero.tsx")
    const header = code("components/platform/platform-header-client.tsx")
    /* Round 10: the same look, the bar's depth scaled to end inside the bar (tests/explore-speed.test.ts measures it). */
    check("one look for both fields: the 10px corner, the hairline, the depth, the focus", /SEARCH_FIELD_SURFACE =\s*"appearance-none rounded-\[10px\] bg-white border border-neutral-200\/80 shadow-\[0_1px_3px_rgba\(15,23,42,0\.045\),0_9px_27px_-16px_rgba\(15,23,42,0\.315\)\] " \+\s*HEADER_DEPTH_REST/.test(look) && /SEARCH_FIELD_FOCUS =\s*"outline-none transition-\[box-shadow,border-color\] focus:border-neutral-300 focus:shadow-/.test(look))
    check("the hero draws from it", /SEARCH_FIELD_SURFACE,/.test(hero) && /SEARCH_FIELD_FOCUS,/.test(hero))
    const fieldAt = header.indexOf('data-header-search-field=""')
    const field = header.slice(fieldAt, header.indexOf('data-header-search-modal=""', fieldAt))
    check("the header's field draws from it too, and is not a pill", /SEARCH_FIELD_SURFACE,\s*SEARCH_FIELD_FOCUS,/.test(field) && !/rounded-full/.test(field.slice(0, field.indexOf("data-header-search-tail"))) && /"h-11 w-full pl-11/.test(field))
    check("the bar's own colours no longer reach it", !/chrome\.deskSearch/.test(header) && !/deskSearch/.test(code("lib/platform/header-chrome.ts")))
    check("the same categories icon at its right end, where the page has the menu", /const deskCategories = useSearchCategories\(\)/.test(header) && /\{deskCategories \? \(/.test(field) && /<SearchCategoriesButton key=\{shown \? "shown" : "hidden"\} categories=\{deskCategories\} size="header" \/>/.test(field))
    check("pressing it closes the search results first", /onPointerDownCapture=\{\(\) => \{\s*if \(searchModalOpen\) closeSearchModal\(\)/.test(field))
    check("the hero publishes its menu for as long as it is on the page", /usePublishSearchCategories\(categories\)/.test(hero))
    const store = code("lib/explore/search-categories.ts")
    check("and takes it back when it leaves, unless something newer took its place", /if \(current === value\) publish\(null\)/.test(store) && /useSyncExternalStore\(subscribe, \(\) => current, \(\) => null\)/.test(store))
  }

  console.log("\nFooter")
  {
    const footer = code("components/marketing/conditional-footer.tsx")
    check("Explore's browse pages on the web: the creator page footer from 1024px", /setExploreDesktop\(!isNativeApp\(\) && isExploreBrowsePage\(pathname\)\)/.test(footer) && /<div className="hidden lg:block" data-explore-desktop-footer="">\s*(\{\}\s*)?<SellerFooter headerWidth \/>/.test(footer))
    check("below 1024px, what was there before", /\{footer \? <div className="lg:hidden">\{footer\}<\/div> : null\}/.test(footer))
  }

  console.log("\nPull to refresh")
  {
    check(
      "pull at the top refreshes Explore like the community feed",
      /RouterPullToRefresh scope=\{EXPLORE_REFRESH_SCOPE\}/.test(read("components/explore/explore-pull-refresh.tsx")) &&
        /ExplorePullSync/.test(read("components/explore/explore-pull-refresh.tsx")) &&
        /<ExplorePullRefresh>/.test(read("app/(marketing)/explore/page.tsx")),
    )
    const grid = code("components/explore/explore-communities-results.tsx")
    check(
      "communities mode listens for the explore scope and reads again on a pull",
      /EXPLORE_REFRESH_SCOPE/.test(grid) && /forgetCommunities\(qNow\)/.test(grid) && /detail\.done = loadCommunities\(qNow\)/.test(grid),
    )
  }

  console.log("\nCopy and the browser boundary")
  {
    const mine = [
      "lib/explore/communities-mode.ts",
      "lib/communities/server/views.ts",
      "lib/communities/server/record-view.ts",
      "components/explore/community-card.tsx",
      "components/explore/explore-communities-results.tsx",
      "components/explore/search-categories-button.tsx",
      "lib/explore/search-categories.ts",
      "lib/explore/search-field-look.ts",
      "app/(marketing)/explore/communities/route.ts",
      "supabase/sql/run-now/87_community_views.sql",
    ]
    const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
    const clientSide = ["components/explore/community-card.tsx", "components/explore/explore-communities-results.tsx", "components/explore/explore-page-client.tsx", "components/explore/explore-hero.tsx", "components/explore/search-categories-button.tsx", "components/explore/explore-category-picker.tsx", "lib/explore/search-categories.ts", "lib/explore/search-field-look.ts", "lib/explore/communities-mode.ts"]
    check("what the browser draws imports no server code", clientSide.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
