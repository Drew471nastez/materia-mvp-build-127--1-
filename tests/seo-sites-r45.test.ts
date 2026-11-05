/**
 * ===========================================================================
 *  ROUND 45: EVERY PAGE A CREATOR PUBLISHES, AS A SEARCH ENGINE READS IT
 * ===========================================================================
 * Found live (andrewrullz.storelib.com, tired-mom-co.storelib.com,
 * storelib.com/community/...) and fixed in this round:
 *
 *   - page 2 of a shop or a collection named page 1 as its canonical, and
 *     ?page=99 drew the last page again, 200, under any number;
 *   - an imported theme's /products answered a 303 to /collections/all and
 *     its sitemap listed /products, the redirect, not the shop;
 *   - an imported theme's product that was gone redirected to the shop (a
 *     soft 404) instead of answering 404;
 *   - /collections and /reviews were indexable, linked, and in no sitemap;
 *   - a website behind a password was still in storelib.com's websites file;
 *   - a community's public posts had indexable pages nothing listed or linked;
 *   - "More from" cards on a product page linked /p/<slug>, not the
 *     product's canonical address;
 *   - collections and public posts were never announced to IndexNow.
 *
 * And the rule that holds the future to it: every route of a website and
 * every public route of a creator's pages on storelib.com is classified
 * below, as listed in a sitemap or kept out of search on purpose. A new
 * route that is neither fails this suite until somebody decides.
 */
import "./_usd"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { stripComments } from "./_source"
import { canonicalPageOf, pageQuery, pastLastPage } from "@/lib/website-builder/tab-title"
import { listedPageKeys, shopUrl, imagesOnPage } from "@/lib/website-builder/site-seo"
import { SITE_DISALLOW } from "@/lib/seo/indexing"
import { siteLink } from "@/lib/storelib-theme/compat/links"
import { pagedCanonical, canonicalPath } from "@/lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "@/lib/storelib-theme/compat/site"
import { themeOfInstall } from "@/lib/storelib-theme/compat/page"
import { compatMenus } from "@/lib/storelib-theme/compat/menus"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { openSpaceIds, publicPostEntries, listablePost, type SitemapPostRow, type SitemapSpaceRow } from "@/lib/seo/community-posts-sitemap"
import { websitesSitemap } from "@/lib/seo/sitemaps"
import { GENERATED_PAGE_KEYS } from "@/lib/website-builder/site-seo-data"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    const d = typeof detail === "string" ? detail : JSON.stringify(detail)
    console.log(`  FAIL  ${name}${d ? `\n        ${d.slice(0, 900)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
type Any = any
type Row = Record<string, Any>

/** Every page.tsx and route.ts under a directory, as paths relative to it. */
function routesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n === "page.tsx" || n === "route.ts" || n === "route.tsx") out.push(relative(dir, p))
    }
  }
  walk(join(process.cwd(), dir))
  return out.sort()
}

/** A PostgREST stand in: enough of the builder for lib/seo/sitemaps.ts (eq, in, is, not, order, limit, count). */
function postgrest(tables: Record<string, Row[]>) {
  const test = (kind: string, col: string, val: Any, row: Row): boolean => {
    const v = row[col]
    if (kind === "eq") return v !== null && v !== undefined && String(v) === String(val)
    if (kind === "neq") return v === null || v === undefined || String(v) !== String(val)
    if (kind === "is") return val === null ? v === null || v === undefined : v === val
    if (kind === "not.is") return !(val === null ? v === null || v === undefined : v === val)
    if (kind === "in") return v !== null && v !== undefined && (Array.isArray(val) ? val.map(String) : String(val).replace(/^\(|\)$/g, "").split(",")).includes(String(v))
    if (kind === "gt") return v !== null && v !== undefined && String(v) > String(val)
    if (kind === "gte") return v !== null && v !== undefined && String(v) >= String(val)
    if (kind === "lt") return v !== null && v !== undefined && String(v) < String(val)
    throw new Error(`fake postgrest: ${kind}`)
  }
  function from(table: string) {
    const s = { select: "*", count: false, head: false, filters: [] as Array<[string, string, Any]>, order: null as null | { col: string; asc: boolean }, limit: null as number | null, offset: 0, single: false }
    const run = () => {
      let rows = (tables[table] ?? []).filter((r) => s.filters.every(([k, c, v]) => test(k, c, v, r)))
      if (s.count && s.head) return { data: null, error: null, count: rows.length }
      if (/store_theme_settings\(/.test(s.select)) rows = rows.map((r) => ({ ...r, store_theme_settings: (tables.store_theme_settings ?? []).filter((x) => x.install_id === r.id) }))
      if (s.order) {
        const { col, asc } = s.order
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      const data = rows.slice(s.offset, s.offset + Math.min(s.limit ?? Infinity, 1000)).map((r) => ({ ...r }))
      if (s.single) return { data: data[0] ?? null, error: null }
      return { data, error: null, count: s.count ? rows.length : null }
    }
    const b: Any = {
      select: (cols = "*", opts?: { count?: string; head?: boolean }) => ((s.select = cols), (s.count = !!opts?.count), (s.head = !!opts?.head), b),
      eq: (c: string, v: Any) => (s.filters.push(["eq", c, v]), b),
      neq: (c: string, v: Any) => (s.filters.push(["neq", c, v]), b),
      is: (c: string, v: Any) => (s.filters.push(["is", c, v]), b),
      in: (c: string, v: Any) => (s.filters.push(["in", c, v]), b),
      gt: (c: string, v: Any) => (s.filters.push(["gt", c, v]), b),
      gte: (c: string, v: Any) => (s.filters.push(["gte", c, v]), b),
      lt: (c: string, v: Any) => (s.filters.push(["lt", c, v]), b),
      not: (c: string, op: string, v: Any) => (s.filters.push([`not.${op}`, c, v]), b),
      order: (col: string, o?: { ascending?: boolean }) => ((s.order = { col, asc: o?.ascending !== false }), b),
      limit: (n: number) => ((s.limit = n), b),
      range: (a: number, z: number) => ((s.offset = a), (s.limit = z - a + 1), b),
      maybeSingle: () => ((s.single = true), b),
      then: (resolve: (v: Any) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    }
    return b
  }
  return { from }
}

async function postureTheme() {
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme
}

async function main() {
  console.log("\nPage 2 of a list is its own page")
  {
    check("?page=2 alone names page 2", canonicalPageOf({ page: "2" }) === 2 && canonicalPageOf(new URLSearchParams("page=7")) === 7)
    check("  an ad's or a newsletter's marks change nothing", canonicalPageOf(new URLSearchParams("page=3&utm_source=chatgpt.com&gclid=x&fbclid=y")) === 3)
    check("  a sort, a filter or a search names the clean list, page 1", [{ page: "2", sort: "price-asc" }, { page: "2", "filter.p.tag": "x" }, { page: "2", q: "mug" }, { page: "2", sort_by: "best-selling" }].every((a) => canonicalPageOf(a) === 1))
    check("  page 1, nonsense and two page numbers are page 1", [{ page: "1" }, { page: "abc" }, { page: "2e3" }, { page: ["2", "3"] }, {}].every((a) => canonicalPageOf(a as Any) === 1) && canonicalPageOf(null) === 1)
    check("the query a canonical carries", pageQuery(2) === "?page=2" && pageQuery(1) === "" && pageQuery(NaN) === "")
    check("a page past the last is past it; none asked, or a real one, is not", pastLastPage("4", 3) && pastLastPage(["9"], 1) && !pastLastPage("3", 3) && !pastLastPage(undefined, 1) && !pastLastPage("", 1) && !pastLastPage("x", 1) && pastLastPage("2", 0))
    const meta = code("app/(site)/w/[username]/render-site.tsx")
    check("a Storelib theme's canonical and each language carry the page", /const paged = pageQuery\(tab\?\.canonicalPage \?\? 1\)/.test(meta) && /\[l, `\$\{href\}\$\{paged\}`\]/.test(meta) && /pageUrl\(origin, pageKey\)\}\$\{paged\}`/.test(meta))
    for (const f of ["app/(site)/w/[username]/products/shop-page.tsx", "app/(site)/w/[username]/collections/[handle]/collection-page.tsx"]) {
      const src = code(f)
      check(`  ${f.split("/").slice(-2).join("/")}: names its page, and a page past the last is a 404`, /canonicalPage: canonicalPageOf\(asked\)/.test(src) && /if \(pastLastPage\(asked\.page, pagination\.pages\)\) notFound\(\)/.test(src))
    }
    check("an imported theme's collection, list and blog carry the page; a product never does", pagedCanonical({ template: "collection", query: { page: "2" } }) === "?page=2" && pagedCanonical({ template: "blog", query: { page: "3" } }) === "?page=3" && pagedCanonical({ template: "product", query: { page: "2" } }) === "" && pagedCanonical({ template: "collection", query: { page: "2", sort_by: "price-ascending" } }) === "")
  }

  console.log("\nAn imported theme's shop, live")
  {
    const t = await postureTheme()
    const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${n}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
    const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
    const products = ["Posture corrector", "Lumbar belt"].map((title, i) => {
      const slug = title.toLowerCase().replace(/\W+/g, "-")
      return { id: `00000000-0000-4000-8000-00000000000${i + 1}`, settings: { title, slug, url: `/products/${slug}`, price: "$39.00", image: "", images: [], available: true, variants: [], options: [] } }
    })
    const site: SiteData = { creatorId: "c", theme, pages, products: products as never, collections: [], menus: compatMenus({}, Object.keys(pages)), shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}" }, host: "shop.example" }
    const get = (path: string) => {
      const [p, q = ""] = path.split("?")
      return answer(site, { method: "GET", path: p, query: new URLSearchParams(q), body: null, cart: [] })
    }
    const shop = await get("/products?sort_by=price-ascending")
    check("/products is a 308 to /collections/all, its query kept", shop.status === 308 && shop.headers?.Location === "/collections/all?sort_by=price-ascending", { status: shop.status, h: shop.headers })
    check("a product the shop does not have is a 404, not a redirect to the shop", (await get("/products/sold-and-gone")).status === 404 && (await get("/collections/summer/products/sold-and-gone")).status === 404)
    check("  and one it has draws", (await get("/products/posture-corrector")).status === 200)
    const facts = { pages: ["home", "collection", "product"], products, collections: [] }
    check("  a link drawn on a page to a product it has not still goes to the shop", siteLink("/products/sold-and-gone", facts) === "/collections/all" && siteLink("/products/sold-and-gone", facts, { pageFallback: false }) === "/products/sold-and-gone")
    const canonicalOf = (html: unknown) => /<link rel="canonical" href="([^"]+)"/.exec(String(html))?.[1] ?? null
    /* A theme that prints canonical_url as Dawn does. */
    const zip = new JSZip()
    zip.file("layout/theme.liquid", `<html><head><link rel="canonical" href="{{ canonical_url }}"></head><body>{{ content_for_layout }}</body></html>`)
    zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Plain", theme_version: "1.0.0" }]))
    zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
    zip.file("locales/en.default.json", "{}")
    zip.file("sections/main.liquid", `<main>{{ collection.title }}</main>{% schema %}{ "name": "Main", "settings": [], "presets": [{ "name": "Main" }] }{% endschema %}`)
    zip.file("templates/index.json", JSON.stringify({ sections: { m: { type: "main" } }, order: ["m"] }))
    zip.file("templates/collection.json", JSON.stringify({ sections: { m: { type: "main" } }, order: ["m"] }))
    const plain = await convertShopifyTheme(zip)
    if (!plain.ok) throw new Error("the plain theme did not convert")
    const plainSite: SiteData = { ...site, theme: themeOfInstall(plain.theme.files, plain.theme.settings, { assetUrl: (n) => `/a/${n}` }), pages: Object.fromEntries(plain.theme.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"] }
    const getPlain = (path: string) => {
      const [p, q = ""] = path.split("?")
      return answer(plainSite, { method: "GET", path: p, query: new URLSearchParams(q), body: null, cart: [] })
    }
    check("  the plain theme draws the shop and names it canonical", canonicalOf((await getPlain("/collections/all")).body) === "https://shop.example/collections/all", String((await getPlain("/collections/all")).body).slice(0, 300))
    const p2 = await getPlain("/collections/all?page=2")
    check("page 2 of the shop names itself", canonicalOf(p2.body) === "https://shop.example/collections/all?page=2", canonicalOf(p2.body))
    const sorted = await getPlain("/collections/all?page=2&sort_by=price-ascending")
    check("  sorted, it names the clean list", canonicalOf(sorted.body) === "https://shop.example/collections/all", canonicalOf(sorted.body))
    check("  a product reached from a collection still names the product's own page", canonicalPath("/collections/all/products/posture-corrector") === "/products/posture-corrector")
  }

  console.log("\nThe sitemap lists the shop where it is")
  {
    check("a Storelib theme's shop is /products; an imported theme's /collections/all", shopUrl("https://a.storelib.com") === "https://a.storelib.com/products" && shopUrl("https://a.storelib.com", { imported: true }) === "https://a.storelib.com/collections/all")
    check("an imported theme's 'products' key is not listed as a page (it is the redirect)", !listedPageKeys(["home", "products", "about"], { imported: true }).includes("products") && listedPageKeys(["home", "products", "about"]).includes("products"))
    const data = code("lib/website-builder/site-seo-data.ts")
    check("  the sitemap and the addresses of a site taken down both use it", /const shop = shopUrl\(origin, \{ imported \}\)/.test(data) && /urls\.push\(shopUrl\(origin, \{ imported \}\)\)/.test(data))
    check("the collections list and the reviews page are listed while they have something on them", /GENERATED_PAGE_KEYS = \["collections", "reviews"\]/.test(data) && /site\.collections > 0 && !site\.keys\.collections/.test(data) && /reviews\.enabled && !reviews\.sample && reviews\.all\.summary\.count > 0/.test(data))
    check("  never a page its creator kept out of search", /if \(!hidden\.has\(extra\.key\)/.test(data))
    check("IndexNow sends the website's shop at the address its sitemap lists", /function shopOf\(site/.test(code("lib/seo/announce.ts")) && !/`\$\{site\.origin\}\/products`\)/.test(code("lib/seo/announce.ts")))
  }

  console.log("\nstorelib.com's websites file")
  {
    const creators = [
      { id: "c-open", user_id: "u-open" },
      { id: "c-locked", user_id: "u-locked" },
      { id: "c-off", user_id: "u-off" },
    ]
    const world = {
      store_theme_installs: creators.map((c, i) => ({ id: `i-${i}`, creator_id: c.id, status: "published", published_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" })),
      store_theme_settings: [] as Row[],
      creators,
      profiles: creators.map((c) => ({ id: c.user_id, username: c.id.slice(2), spam_state: null })),
      site_access: [
        { creator_id: "c-locked", password_enabled: true, password_hash: "h" },
        { creator_id: "c-off", password_enabled: true, password_hash: null },
      ],
    }
    const urls = (await websitesSitemap(0, 1, postgrest(world) as Any)).map((e) => e.url)
    check("a website behind a password is not listed; the others are", !urls.some((u) => u.includes("locked")) && urls.includes("https://open.storelib.com/") && urls.includes("https://off.storelib.com/"), urls)
    const noTable = await websitesSitemap(0, 1, postgrest({ ...world, site_access: undefined as Any }) as Any)
    check("  before part 92 (no table) every website is listed, as before", noTable.length === 3, noTable.length)
  }

  console.log("\nA community's public posts")
  {
    const spaces: SitemapSpaceRow[] = [
      { id: "s-open", community_id: "c1", view_access: null, archived_at: null },
      { id: "s-tier", community_id: "c1", view_access: { tierIds: ["t1"] } as Any, archived_at: null },
      { id: "s-old", community_id: "c1", view_access: null, archived_at: "2026-09-01T00:00:00Z" },
    ]
    const post = (id: string, extra: Partial<SitemapPostRow>): SitemapPostRow => ({ id, community_id: "c1", space_id: null, title: "Hello there", body_text: "", status: "published", deleted_at: null, created_at: "2026-10-01T00:00:00Z", edited_at: null, ...extra })
    const posts = [
      post("aaaaaaaa-0000-4000-8000-000000000001", {}),
      post("bbbbbbbb-0000-4000-8000-000000000002", { space_id: "s-open", edited_at: "2026-10-05T00:00:00Z" }),
      post("cccccccc-0000-4000-8000-000000000003", { space_id: "s-tier" }),
      post("dddddddd-0000-4000-8000-000000000004", { space_id: "s-old" }),
      post("eeeeeeee-0000-4000-8000-000000000005", { status: "removed" }),
      post("ffffffff-0000-4000-8000-000000000006", { deleted_at: "2026-10-02T00:00:00Z" }),
      post("abababab-0000-4000-8000-000000000007", { space_id: "s-gone" }),
      post("cdcdcdcd-0000-4000-8000-000000000008", { community_id: "c-not-listed" }),
    ]
    const entries = publicPostEntries([{ id: "c1", slug: "makers" }], spaces, posts)
    check("posts in no space or an open one are listed, at the page's own canonical", entries.map((e) => e.url).join(" ") === "https://storelib.com/community/makers/post/hello-there-aaaaaaaa https://storelib.com/community/makers/post/hello-there-bbbbbbbb", entries)
    check("  dated by their last edit, else when they were posted", entries[1].lastModified === "2026-10-05T00:00:00.000Z" && entries[0].lastModified === "2026-10-01T00:00:00.000Z")
    check("never a members only space's, an archived space's, a removed, deleted or orphaned post, or one of a community not listed", entries.length === 2)
    check("the space rule is the page's: an open rule and not archived", [...openSpaceIds(spaces)].join() === "s-open" && !listablePost(posts[2], openSpaceIds(spaces)))
    const sm = code("lib/seo/sitemaps.ts")
    check("the communities file lists them after its communities, and reads only posts in an open space or none", /const posts = await communityPostEntries\(/.test(sm) && /space_id\.is\.null,space_id\.in\.\(\$\{open\.join\(","\)\}\)/.test(sm) && /q\.is\("space_id", null\)/.test(sm) && /return \[\.\.\.communities, \.\.\.posts\]/.test(sm))
    const page = code("app/(storelib)/(marketing)/community/[slug]/(member)/post/[postId]/post-seo.ts")
    check("  at the address the post's page names as canonical", /postPath\(f\.community\.slug, f\.post\)/.test(page))
  }

  console.log("\nIndexNow: collections and public posts")
  {
    const create = code("app/api/collections/route.ts")
    const one = code("app/api/collections/[id]/route.ts")
    check("a new collection is announced once saved", /after\(async \(\) => \{/.test(create) && /collectionAddresses\(creatorId, row\?\.slug\)/.test(create))
    check("  a change is announced at the old slug and the new", /const before = indexNowKey\(\) \? await slugOf\(c\.db, c\.creatorId, id\) : null/.test(one) && /collectionAddresses\(creatorId, before, await slugOf\(db, creatorId, id\)\)/.test(one))
    check("  a delete at the slug read before it", one.indexOf("const gone = indexNowKey()") < one.indexOf("deleteCollection(c.db") && /collectionAddresses\(creatorId, gone\)/.test(one))
    check("the addresses are the website's own, only while it is listed", /const site = await siteSitemap\(handle\)/.test(code("lib/seo/announce.ts")) && /\$\{site\.origin\}\/collections\/\$\{s\}/.test(code("lib/seo/announce.ts")))
    const posts = code("app/api/community/[communityId]/posts/route.ts")
    const post = code("app/api/community/[communityId]/posts/[postId]/route.ts")
    check("a public post is announced when posted, edited (before and after) and deleted (before)", /announceAddresses\(await publicPostAddresses\(communityId, post\.id\)\)/.test(posts) && /const before = await publicPostAddresses\(communityId, postId\)/.test(post) && post.indexOf("const gone = await publicPostAddresses") < post.indexOf("deletePost({"))
    const ann = code("lib/seo/announce-posts.ts")
    check("  by the page's own rule, read fresh, so a members only post is never sent", /indexablePost\(facts\)/.test(ann) && !/post-facts"/.test(ann) && /if \(p\.space_id && !space\) return null/.test(ann))
  }

  console.log("\nA product page links its creator's products where they are indexed")
  {
    const page = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("\"More from\" cards link /<handle>/<slug>, as the creator page's do", /href: cardLink\(p\) \?\? \(p\.slug && creatorProfile\?\.username \? getProductInternalPath\(p\.slug, creatorProfile\.username\) : undefined\)/.test(page))
    check("  a crawlable <a href> (the renderer draws product.href when it is a path)", /if \(product\.href && product\.href\.startsWith\("\/"\)\) return product\.href/.test(code("components/store-builder/unified-section-renderer.tsx")))
    check("a rating in structured data needs a real review count and an average of 1 to 5", /reviewsCount > 0 && reviewsAverage >= 1 && reviewsAverage <= 5 && \{\s*aggregateRating/.test(page))
  }

  /*
    =========================================================================
     EVERY ROUTE IS DECIDED (the future's guarantee)
    =========================================================================
    A website's pages come from data, not from a list: every page key the
    builder stores is listed (listedPageKeys keeps out only the visitor's own
    pages and an imported theme's empty templates), every published product
    and collection is listed, and every picture of any section is found by
    walking its settings. What is not data is a ROUTE, and each one is held
    to a decision here. A route added under app/(site)/w/[username] or among
    a creator's pages on storelib.com fails this until it is put in a sitemap
    or kept out of search on purpose.
  */
  console.log("\nEvery route of a website is in a sitemap or kept out on purpose")
  {
    const SITE: Record<string, string> = {
      "page.tsx": "listed: the front page (listedPageKeys home)",
      "[page]/page.tsx": "listed: every page key the builder stores (listedPageKeys)",
      "products/page.tsx": "listed: the shop (shopUrl)",
      "products/~list/page.tsx": "same page: the shop with a filter, a sort or a page (canonical)",
      "products/[slug]/page.tsx": "listed: every published product (listedProducts)",
      "collections/page.tsx": "generated: collections",
      "collections/[handle]/page.tsx": "listed: every published collection (listedCollections)",
      "collections/[handle]/~list/page.tsx": "same page: a collection with a filter, a sort or a page (canonical)",
      "reviews/page.tsx": "generated: reviews",
      "account/page.tsx": "private: /account",
      "account/login/page.tsx": "private: /account",
      "account/logout/route.ts": "private: /account",
      "account/orders/[id]/page.tsx": "private: /account",
      "cart/page.tsx": "private: /cart",
      "search/page.tsx": "private: /search",
      "wishlist/page.tsx": "private: /wishlist",
      "preview/[token]/page.tsx": "private: /preview/",
      "preview/[token]/[page]/page.tsx": "private: /preview/",
      "preview/[token]/products/page.tsx": "private: /preview/",
      "preview/[token]/products/[slug]/page.tsx": "private: /preview/",
      "preview/[token]/collections/page.tsx": "private: /preview/",
      "preview/[token]/collections/[handle]/page.tsx": "private: /preview/",
      /* Changed on purpose (creator blogs): the blog's addresses on a Storelib theme (app/(site)/w/[username]/blogs/blog-route.tsx). */
      "blogs/page.tsx": "same page: /blogs answers 308 to the blog, /blogs/<handle>",
      "blogs/[blog]/page.tsx": "listed: the blog (lib/site-blog/public-read.ts listedBlogEntries)",
      "blogs/[blog]/page/[n]/page.tsx": "same page: page n of the blog, its own canonical",
      "blogs/[blog]/category/[category]/page.tsx": "listed: each category with a live post (listedBlogEntries)",
      "blogs/[blog]/category/[category]/page/[n]/page.tsx": "same page: page n of a category, its own canonical",
      "blogs/[blog]/tagged/[tag]/page.tsx": "noindex: a tag's list, followed and never a result",
      "blogs/[blog]/tagged/[tag]/page/[n]/page.tsx": "noindex: a tag's list, followed and never a result",
      "blogs/[blog]/[article]/page.tsx": "listed: every live post that is not noindex (listedBlogEntries)",
      "blogs/[blog]/~preview/[token]/page.tsx": "private: /blogs/*/~preview/",
      "password/page.tsx": "noindex: the password page",
      "discount/[code]/page.tsx": "noindex: a discount link sets a code and moves on",
      "not_found/route.ts": "noindex: the 404",
      "robots.txt/route.ts": "file",
      "sitemap.xml/route.ts": "file",
      "favicon.ico/route.ts": "file",
      "apple-touch-icon/route.ts": "file",
      "site.webmanifest/route.ts": "file",
    }
    const found = routesUnder("app/(site)/w/[username]")
    const undecided = found.filter((r) => !(r in SITE))
    check("each route of app/(site)/w/[username] is decided (a new one fails here until it is)", undecided.length === 0, undecided)
    check("  and none decided is gone without the list knowing", Object.keys(SITE).every((r) => found.includes(r)), Object.keys(SITE).filter((r) => !found.includes(r)))
    const generated = Object.values(SITE).filter((v) => v.startsWith("generated: ")).map((v) => v.slice("generated: ".length))
    check("  a generated page is one the sitemap generates", generated.length > 0 && generated.every((k) => (GENERATED_PAGE_KEYS as readonly string[]).includes(k)) && GENERATED_PAGE_KEYS.every((k) => generated.includes(k)))
    const privatePaths = [...new Set(Object.values(SITE).filter((v) => v.startsWith("private: ")).map((v) => v.slice("private: ".length)))]
    check("  a private one is closed in the site's robots.txt", privatePaths.every((p) => SITE_DISALLOW.some((d) => d === p || d === `${p}$` || d === `${p.replace(/\/$/, "")}/`)), privatePaths.filter((p) => !SITE_DISALLOW.some((d) => d === p || d === `${p}$` || d === `${p.replace(/\/$/, "")}/`)))
    const noindex = Object.entries(SITE).filter(([, v]) => v.startsWith("noindex: ")).map(([r]) => r)
    check("  a noindex one says so", noindex.every((r) => /index: false|"X-Robots-Tag": "noindex"/.test(read(`app/(site)/w/[username]/${r}`))), noindex)
    check("a page key nobody has made yet is listed, and only the visitor's own pages are not", listedPageKeys(["home", "lookbook-2027", "press"]).join() === "home,lookbook-2027,press" && listedPageKeys(["account", "cart", "login", "wishlist", "search", "password", "product", "404"]).length === 0)
    const pics = imagesOnPage([{ id: "x", type: "a-section-nobody-has-made-yet", settings: { deep: { list: ["https://cdn.example/a.webp"] } }, blocks: [{ id: "b", type: "y", settings: { photo: "https://cdn.example/b.jpg" } }] } as Any])
    check("  and a section type nobody has made yet has its pictures found", pics.map((p) => p.loc).join() === "https://cdn.example/a.webp,https://cdn.example/b.jpg")
    for (const r of ["[page]/page.tsx", "products/page.tsx", "products/[slug]/page.tsx", "collections/[handle]/page.tsx", "collections/page.tsx", "reviews/page.tsx", "page.tsx"]) {
      const src = read(`app/(site)/w/[username]/${r}`)
      check(`  ${r} has metadata of its own (title, description, canonical, share card)`, /generateMetadata|siteMetadata|shopMetadata|collectionMetadata|productMetadata/.test(src))
    }
  }

  console.log("\nEvery public route of a creator's pages on storelib.com is decided")
  {
    const MARKETING: Record<string, string> = {
      "[sellername]/page.tsx": "listed: creators file",
      "[sellername]/[productSlug]/page.tsx": "listed: products file",
      "[sellername]/links/page.tsx": "redirect: storelib.me/<handle>, the onepages file",
      "[sellername]/links/photo.jpg/route.ts": "file",
      "[sellername]/links/share.png/route.tsx": "file",
      "member/[username]/share.png/route.tsx": "file",
      "community/[slug]/share.png/route.tsx": "file",
      "community/[slug]/tab-icon.png/route.tsx": "file",
      "p/[slug]/page.tsx": "same page: canonical /<handle>/<slug>",
      "l/[slug]/page.tsx": "listed: onepages file",
      "u/[username]/page.tsx": "redirect: /<handle>",
      "u/[username]/robots.txt/route.ts": "file",
      /* Round 53: a creator page domain's own icons, from the creator's photo (lib/onepage/host-icon-server.ts). */
      "u/[username]/favicon.ico/route.ts": "file",
      "u/[username]/apple-touch-icon/route.ts": "file",
      "u/[username]/sitemap.xml/route.ts": "file",
      "member/[username]/page.tsx": "redirect: /<handle>",
      "c/[slug]/page.tsx": "redirect: /<handle>",
      "community/page.tsx": "platform: the communities directory",
      "community/[slug]/page.tsx": "listed: communities file",
      "community/[slug]/about/page.tsx": "same page: canonical /community/<slug>",
      "community/[slug]/join/page.tsx": "noindex",
      "community/[slug]/cover.jpg/route.ts": "file",
      "community/[slug]/(member)/post/[postId]/page.tsx": "listed: communities file, public posts only",
    }
    const roots = ["[sellername]", "p", "l", "u", "member", "c", "community"]
    const found = roots.flatMap((r) => routesUnder(`app/(storelib)/(marketing)/${r}`).map((f) => `${r}/${f}`))
    /* The member area says noindex once, in its layout, for everything but a public post (checked below). */
    const memberArea = (r: string) => r.startsWith("community/[slug]/(member)/") && r !== "community/[slug]/(member)/post/[postId]/page.tsx"
    const undecided = found.filter((r) => !(r in MARKETING) && !memberArea(r))
    check("each route is decided (a new one fails here until it is)", undecided.length === 0, undecided)
    check("  the member area is noindex except a public post", /return \{ robots: \{ index: false, follow: false \} \}/.test(read("app/(storelib)/(marketing)/community/[slug]/(member)/layout.tsx")))
    const sm = code("lib/seo/sitemaps.ts")
    const kinds = ["products", "creators", "websites", "communities"]
    check("  each file a listed route names is in storelib.com's sitemap index", kinds.every((k) => new RegExp(`chunkEntries\\([^)]*"${k}"`).test(sm)), kinds.filter((k) => !new RegExp(`chunkEntries\\([^)]*"${k}"`).test(sm)))
    check("  and the OnePages in storelib.me's", /export async function onePagesSitemapIndex\(/.test(sm))
    check("  the join page says noindex", /robots: \{ index: false, follow: false \}/.test(read("app/(storelib)/(marketing)/community/[slug]/join/page.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
