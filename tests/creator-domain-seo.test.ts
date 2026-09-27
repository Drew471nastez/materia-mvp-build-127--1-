/**
 * ===========================================================================
 *  A CREATOR PAGE ON ITS OWN DOMAIN, AS SEARCH ENGINES SEE IT
 * ===========================================================================
 * Once a creator page's primary domain is live, its page, products and
 * OnePage are canonical there. Held here:
 *
 *   1. storelib.com's sitemap leaves them out, and a database without the
 *      purpose columns (run-now part 22) leaves nothing out
 *   2. the domain answers its own /robots.txt and /sitemap.xml, listing
 *      those pages at the domain's addresses, and only the live primary
 *      domain names or serves a sitemap
 *   3. the sitemap's addresses are the ones the pages' canonical and og:url
 *      name, there are no hreflang alternates to disagree, and IndexNow is
 *      told the domain's addresses too
 *
 * The readers run here against a small fake database. What proxy.ts sends
 * where is asked of the real proxy by scripts/check-domain-routing.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CUSTOM_DOMAIN_DISALLOW, PLATFORM_DISALLOW, SITE_DISALLOW } from "@/lib/seo/indexing"
import { cleanRequestHost, creatorDomainEntries, creatorDomainRobots, creatorDomainRobotsTxt, creatorDomainSitemap } from "@/lib/seo/creator-domain"
import { SitemapReadFailed, liveCreatorPageDomains } from "@/lib/seo/sitemaps"
import { getLinksShareUrl, getLinksUrlWithCustomDomain, getProductShareUrl, getStoreShareUrl } from "@/lib/url-helpers"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))

/** robots.txt as Google reads it (the same reader tests/sitemaps.test.ts uses). */
function allowedBy(disallow: string[], path: string): boolean {
  const matches = (rule: string) => {
    const re = new RegExp("^" + rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$").replace(/\$$/, "$"))
    return re.test(path)
  }
  return !disallow.some((r) => matches(r.endsWith("$") ? r : r.replace(/\$/g, "\\$")))
}

type Row = Record<string, any>
type Err = { code: string; message: string }
/**
 * Enough of the Supabase client for these readers: select, eq, in, or,
 * order, range, maybeSingle. `legacy` answers a request for the purpose
 * columns the way Postgres does before part 22; `broken` fails a table.
 */
function fakeDb(tables: Record<string, Row[]>, opts: { legacy?: boolean; missingTable?: boolean; broken?: string } = {}) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let error: Err | null = null
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const answer = () => (error ? { data: null, error } : { data: rows(), error: null })
      const chain: any = {
        select(cols: string) {
          if (table === "custom_domains" && opts.missingTable) error = { code: "42P01", message: 'relation "public.custom_domains" does not exist' }
          else if (table === "custom_domains" && opts.legacy && /purpose|is_primary/.test(cols)) error = { code: "42703", message: "column custom_domains.purpose does not exist" }
          else if (table === opts.broken) error = { code: "57014", message: "canceling statement due to statement timeout" }
          return chain
        },
        eq(k: string, v: unknown) {
          /* A filter on a column the table does not have fails the same way a select of it does. */
          if (table === "custom_domains" && opts.legacy && (k === "purpose" || k === "is_primary")) error = { code: "42703", message: `column custom_domains.${k} does not exist` }
          filters.push((r) => r[k] === v)
          return chain
        },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return chain },
        or(expr: string) {
          const parts = expr.split(",").map((p) => p.split("."))
          filters.push((r) => parts.some(([k, op, ...v]) => op === "eq" && String(r[k]) === v.join(".")))
          return chain
        },
        not() { return chain },
        order() { return chain },
        range() { return chain },
        limit() { return chain },
        async maybeSingle() { const a = answer(); return a.error ? a : { data: a.data?.[0] ?? null, error: null } },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject) },
      }
      return chain
    },
  } as never
}

const mara = {
  profiles: [{ id: "u1", username: "mariapopescu", avatar_url: "https://cdn.x.com/a.png" }, { id: "u2", username: "tomasz" }],
  creators: [{ id: "c1", user_id: "u1", cover_url: "https://cdn.x.com/cover.png", banned_at: null }, { id: "c2", user_id: "u2" }],
  custom_domains: [
    { id: "d1", creator_id: "c1", domain: "maralind.com", status: "active", purpose: "website", is_primary: true, created_at: "2026-01-01" },
    { id: "d2", creator_id: "c1", domain: "links.maralind.com", status: "active", purpose: "creator_page", is_primary: true, created_at: "2026-02-01" },
    { id: "d3", creator_id: "c1", domain: "maralind.page", status: "active", purpose: "creator_page", is_primary: false, created_at: "2026-03-01" },
    { id: "d4", creator_id: "c2", domain: "tomasz.art", status: "pending", purpose: "creator_page", is_primary: true, created_at: "2026-03-01" },
  ],
  products: [
    { creator_id: "c1", slug: "prints", status: "published", updated_at: "2026-09-01T00:00:00Z", thumbnail_url: "https://cdn.x.com/p.png", gallery_urls: ["https://cdn.x.com/g.png"] },
    { creator_id: "c1", slug: "zines", status: "published", updated_at: "2026-09-10T00:00:00Z", thumbnail_url: null, gallery_urls: null },
    { creator_id: "c1", slug: "draft-thing", status: "draft", updated_at: "2026-09-20T00:00:00Z" },
    { creator_id: "c2", slug: "sketch", status: "published", updated_at: "2026-09-05T00:00:00Z" },
  ],
  onepages: [{ creator_id: "c1", seller_id: null, status: "published", updated_at: "2026-08-01T00:00:00Z" }],
}

async function main() {
  console.log("\n1. storelib.com's sitemap leaves a creator page on its own live domain to that domain")
  {
    const set = await liveCreatorPageDomains(fakeDb(mara), ["c1", "c2"])
    check("the live primary creator page domain counts; a pending one, a website one and a secondary one do not",
      set.has("c1") && !set.has("c2") && set.size === 1, JSON.stringify([...set]))
    const legacy = await liveCreatorPageDomains(fakeDb(mara, { legacy: true }), ["c1", "c2"])
    check("before part 22 nobody's is, so the sitemap is exactly what it was", legacy.size === 0)
    const noTable = await liveCreatorPageDomains(fakeDb(mara, { missingTable: true }), ["c1"])
    check("and without the table at all, the same", noTable.size === 0)
    let thrown: unknown = null
    const quiet = console.error
    console.error = () => {}
    try { await liveCreatorPageDomains(fakeDb(mara, { broken: "custom_domains" }), ["c1"]) } catch (e) { thrown = e } finally { console.error = quiet }
    check("a read that fails is a 503, never a file that quietly lists the pages twice", thrown instanceof SitemapReadFailed)
    const maps = code("lib/seo/sitemaps.ts")
    check("the same rule as the canonical: active, creator_page, primary",
      /\.eq\("status", "active"\)\s*\.eq\("purpose", "creator_page"\)\s*\.eq\("is_primary", true\)/.test(maps) && /r\.status === "active"/.test(code("lib/custom-domains/store.ts")))
    check("its products leave storelib.com's product files", /liveCreatorPageDomains\(admin, \[\.\.\.new Set\(rows\.map\(\(r\) => r\.creator_id\)/.test(maps) && /if \(row\.creator_id && ownDomain\.has\(row\.creator_id\)\) continue/.test(maps))
    check("its page and OnePage leave the creator files", /liveCreatorPageDomains\(admin, ids\)/.test(maps) && /!banned\.has\(c\.id\) && !ownDomain\.has\(c\.id\)/.test(maps))
  }

  console.log("\n2. The domain's own sitemap")
  {
    const entries = await creatorDomainSitemap("mariapopescu", "links.maralind.com", fakeDb(mara))
    const urls = (entries ?? []).map((e) => e.url)
    check("the creator page, its OnePage and each published product, at the domain's addresses",
      JSON.stringify(urls) === JSON.stringify(["https://links.maralind.com/", "https://links.maralind.com/links", "https://links.maralind.com/prints", "https://links.maralind.com/zines"]), JSON.stringify(urls))
    check("never a storelib.com address, never a draft", !urls.some((u) => u.includes("storelib.com") || u.includes("draft")))
    const page = entries?.[0]
    check("the page carries its newest product's date and its avatar and cover",
      page?.lastModified === "2026-09-10T00:00:00.000Z" && JSON.stringify(page?.images) === JSON.stringify(["https://cdn.x.com/a.png", "https://cdn.x.com/cover.png"]))
    check("a product carries its own date and pictures",
      entries?.[2]?.lastModified === "2026-09-01T00:00:00.000Z" && JSON.stringify(entries?.[2]?.images) === JSON.stringify(["https://cdn.x.com/p.png", "https://cdn.x.com/g.png"]))
    check("the host is read as the proxy passes it", (await creatorDomainSitemap("mariapopescu", "Links.Maralind.com:443", fakeDb(mara)))?.length === 4 && cleanRequestHost("a b") === null && cleanRequestHost(null) === null)
    check("a secondary domain has none: its pages redirect to the primary", (await creatorDomainSitemap("mariapopescu", "www.maralind.page", fakeDb(mara))) === null)
    check("a website domain showing the creator page has none: those pages are canonical elsewhere", (await creatorDomainSitemap("mariapopescu", "www.maralind.com", fakeDb(mara))) === null)
    check("a domain still waiting for its DNS has none", (await creatorDomainSitemap("tomasz", "tomasz.art", fakeDb(mara))) === null)
    check("before part 22 no domain has one", (await creatorDomainSitemap("mariapopescu", "links.maralind.com", fakeDb(mara, { legacy: true }))) === null)
    check("nor without the table", (await creatorDomainSitemap("mariapopescu", "links.maralind.com", fakeDb(mara, { missingTable: true }))) === null)
    check("nor a handle nobody has, nor no host at all",
      (await creatorDomainSitemap("nobody", "links.maralind.com", fakeDb(mara))) === null && (await creatorDomainSitemap("mariapopescu", null, fakeDb(mara))) === null)
    const banned = { ...mara, creators: [{ ...mara.creators[0], banned_at: "2026-09-01T00:00:00Z" }, mara.creators[1]] }
    check("a banned creator's domain lists nothing", (await creatorDomainSitemap("mariapopescu", "links.maralind.com", fakeDb(banned)))?.length === 0)
    let thrown: unknown = null
    const quiet = console.error
    console.error = () => {}
    try { await creatorDomainSitemap("mariapopescu", "links.maralind.com", fakeDb(mara, { broken: "products" })) } catch (e) { thrown = e } finally { console.error = quiet }
    check("a read that fails is thrown, for a 503, never a shorter file", thrown instanceof SitemapReadFailed)

    const bare = creatorDomainEntries({ host: "links.maralind.com", handle: "mariapopescu", banned: false, products: [], onePage: { updatedAt: null } })
    check("nothing published: no page and no OnePage, the rule storelib.com's sitemap and the page's robots tag read", bare.length === 0)
    const farm = creatorDomainEntries({ host: "x.com", handle: "powerokebos999", banned: false, products: [{ slug: "a", status: "published", updated_at: null }], onePage: null })
    check("a link farm's handle is not listed on a domain either", farm.length === 0)
  }

  console.log("\n2. The domain's own robots.txt")
  {
    const live = await creatorDomainRobots("mariapopescu", "links.maralind.com", fakeDb(mara))
    check("open, and naming the domain's own sitemap", /^User-agent: \*\nAllow: \/\n/.test(live) && /\nSitemap: https:\/\/links\.maralind\.com\/sitemap\.xml\n/.test(live), live)
    check("never storelib.com's sitemap or storelib.com's own rules", !/storelib\.com/.test(live) && !live.includes("Disallow: /w/"))
    for (const [host, why] of [["www.maralind.page", "a secondary domain"], ["www.maralind.com", "a website domain showing the creator page"]] as const) {
      const txt = await creatorDomainRobots("mariapopescu", host, fakeDb(mara))
      check(`${why}: the same rules, and no sitemap`, !/Sitemap:/.test(txt) && txt.includes("Disallow: /app$"))
    }
    check("before part 22: no sitemap named", !/Sitemap:/.test(await creatorDomainRobots("mariapopescu", "links.maralind.com", fakeDb(mara, { legacy: true }))))
    check("a failed lookup still answers, without the line", !/Sitemap:/.test(await creatorDomainRobots("mariapopescu", "links.maralind.com", fakeDb(mara, { broken: "profiles" }))))
    check("the file is the one pure function", creatorDomainRobotsTxt("a.com", true).endsWith("Sitemap: https://a.com/sitemap.xml\n") && !creatorDomainRobotsTxt("a.com", false).includes("Sitemap"))

    const closed = ["/app", "/app/products", "/api/track-view", "/api", "/checkout", "/checkout/x", "/login", "/login?next=/app", "/signup", "/dashboard", "/library", "/explore", "/purchase/x", "/receipt/1", "/cover-render/a", "/native-start", "/onboarding", "/feed"]
    check("the platform's paths are closed on a domain", closed.every((p) => !allowedBy(CUSTOM_DOMAIN_DISALLOW, p)), closed.filter((p) => allowedBy(CUSTOM_DOMAIN_DISALLOW, p)).join(" "))
    const open = ["/", "/prints", "/links", "/p/prints", "/applesauce", "/feedback", "/apparel", "/explorer-pack", "/library-of-sound", "/_next/static/chunks/a.js", "/logo.png"]
    check("the creator's pages, and the files a page needs to render, are open", open.every((p) => allowedBy(CUSTOM_DOMAIN_DISALLOW, p)), open.filter((p) => !allowedBy(CUSTOM_DOMAIN_DISALLOW, p)).join(" "))

    /* Held to the proxy: every path it serves as Storelib's on any host is closed here. */
    const proxy = read("proxy.ts")
    const list = (name: string) => (proxy.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`))?.[1] ?? proxy.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))?.[1] ?? "")
    const served = [...stripComments(list("RESERVED_PATHS")).matchAll(/"(\/[^"]+)"/g), ...list("PLATFORM_APEX_PATHS").matchAll(/"(\/[^"]+)"/g)].map((m) => m[1])
    const pages = served.filter((p) => !/\.[a-z]+$/.test(p) && p !== "/_next")
    check("every page the proxy keeps as Storelib's on a connected domain is closed in its robots.txt",
      pages.length >= 15 && pages.every((p) => !allowedBy(CUSTOM_DOMAIN_DISALLOW, p) && !allowedBy(CUSTOM_DOMAIN_DISALLOW, `${p}/x`)),
      pages.filter((p) => allowedBy(CUSTOM_DOMAIN_DISALLOW, p)).join(" ") || `${pages.length} paths read`)
    check("and storelib.com's and a website's own rules are untouched by it", PLATFORM_DISALLOW.includes("/w$") && SITE_DISALLOW[0] === "/api/")
  }

  console.log("\n2. Who answers a domain's /robots.txt and /sitemap.xml")
  {
    const proxy = code("proxy.ts")
    check("a website domain with a published website: the website's own; every other connected domain: the creator page's own",
      /if \(website\) seoUrl\.pathname = `\/w\/\$\{username\}\$\{pathname\}`\s*else seoUrl\.pathname = `\/u\/\$\{username\}\$\{pathname\}`/.test(proxy)
        && /const website = domainPurpose === "website" && !\(await hasLiveAiSite\(username\)\) && \(await hasPublishedWebsite\(username\)\)/.test(proxy))
    const sitemapRoute = code("app/(marketing)/u/[username]/sitemap.xml/route.ts")
    const robotsRoute = code("app/(marketing)/u/[username]/robots.txt/route.ts")
    check("the sitemap route: the domain's list, a 404 without one, a 503 for a failed read",
      /creatorDomainSitemap\(username, host\)/.test(sitemapRoute) && /status: 404/.test(sitemapRoute) && /if \(e instanceof SitemapReadFailed\) return sitemapUnavailable\(\)/.test(sitemapRoute) && /urlsetXml\(entries\)/.test(sitemapRoute))
    check("both routes answer for the Host header the proxy read, which a rewrite keeps",
      /creatorDomainRobots\(username, request\.headers\.get\("host"\)\)/.test(robotsRoute) && /const host = request\.headers\.get\("host"\)/.test(sitemapRoute))
    check("and are never held at the edge, where one creator's two domains share the rewritten path",
      [sitemapRoute, robotsRoute].every((r) => /const CACHE = "public, max-age=300"/.test(r) && !/s-maxage/.test(r)))
    check("storelib.com/u/<name>/... is a redirect, so the routes are reached only through a domain",
      /bareHost === MAIN_DOMAIN && \(pathname === "\/u" \|\| pathname\.startsWith\("\/u\/"\)\)/.test(proxy))
  }

  console.log("\n3. One address per page: sitemap, canonical and og:url agree")
  {
    const host = "links.maralind.com"
    const [page, links, prints] = creatorDomainEntries({ host, handle: "mariapopescu", banned: false, products: [{ slug: "prints", status: "published", updated_at: null }], onePage: { updatedAt: null } }).map((e) => e.url)
    const u = code("app/(marketing)/u/[username]/page.tsx")
    check("storelib.com/<handle> names the domain as its canonical and og:url when one is live",
      /const pageUrl = pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{handle\}`/.test(u) && /canonical: pageUrl,/.test(u) && /url: pageUrl,/.test(u) && /primaryHostFor\(creator\?\.id, "creator_page"\)/.test(u))
    check("  which is the address the domain's sitemap lists", page === `https://${host}/` && page === getStoreShareUrl("mariapopescu", host))
    check("  and storelib.com/<handle>/<slug> and /p/<slug> name the domain's /<slug>",
      prints === getProductShareUrl("mariapopescu", "prints", host) && /const productUrl = getProductShareUrl\(sellerHandle \|\| "", product\.slug, pageHost\)/.test(code("app/(marketing)/p/[slug]/page.tsx")) && /canonical: productUrl,/.test(code("app/(marketing)/p/[slug]/page.tsx")) && /url: productUrl,/.test(code("app/(marketing)/p/[slug]/page.tsx")))
    check("  and the OnePage names the domain's /links", links === getLinksUrlWithCustomDomain("mariapopescu", host) && links === getLinksShareUrl("mariapopescu", host) && /url: seo\.url,/.test(code("lib/onepage/seo.ts")) && /return getLinksShareUrl\(slug, pageHost\)/.test(code("lib/onepage/published-page.ts")))
    check("the structured data names the same address as the canonical",
      /const pageAddress = pageHost \? `https:\/\/\$\{pageHost\}\/` : /.test(u) && /url: pageAddress,/.test(u) && /const canonicalUrl = getProductShareUrl\(creatorUsername, product\.slug, pageHost\)/.test(code("app/(marketing)/p/[slug]/page.tsx")))
    const pages = ["app/(marketing)/u/[username]/page.tsx", "app/(marketing)/p/[slug]/page.tsx", "app/(marketing)/l/[slug]/page.tsx", "app/(marketing)/[sellername]/page.tsx", "app/(marketing)/[sellername]/[productSlug]/page.tsx", "app/(marketing)/[sellername]/links/page.tsx"]
    check("no hreflang alternates on these pages that could name a second address", pages.every((p) => !/languages\s*:|hreflang|hrefLang/.test(code(p))))
    const announce = code("lib/seo/announce.ts")
    check("IndexNow is told the domain's addresses beside storelib.com's",
      (announce.match(/urls\.push\(\.\.\.onPageDomain\(handle, pageHost, (p\.)?slug\)\)/g) ?? []).length === 2 && /\.\.\.onPageDomain\(handle, await activeDomainOf\(creatorId\)\)/.test(announce)
        && /getProductShareUrl\(handle, slug, pageHost\), getStoreShareUrl\(handle, pageHost\)/.test(announce) && /getStoreShareUrl\(handle, pageHost\), getLinksShareUrl\(handle, pageHost\)/.test(announce))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
