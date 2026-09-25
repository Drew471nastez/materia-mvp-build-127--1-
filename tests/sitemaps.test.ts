/**
 * What Storelib tells search engines:
 *
 *   lib/seo/indexing.ts     the rules: what is listed, with which date, on which host
 *   lib/seo/sitemaps.ts     the readers behind storelib.com/sitemap.xml and each site's own
 *   lib/seo/indexnow.ts     the IndexNow notice when something is saved
 *   proxy.ts                which host answers /robots.txt and /sitemap.xml
 *
 * Every public, published page is in a sitemap with a real date; drafts,
 * previews, editors and spam are not, and carry noindex where a visitor
 * can reach them; every built site's host speaks for itself.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PLATFORM_DISALLOW,
  SITEMAP_CHUNK,
  SITE_DISALLOW,
  creatorIndexable,
  lastmodOf,
  newestOf,
  productIndexable,
  robotsTxt,
  siteOrigin,
  sitemapIndexXml,
  urlsetXml,
  websiteIndexable,
} from "@/lib/seo/indexing"
import { IDS_PER_QUERY, SitemapReadFailed, eachBatch, parseSitemapName, readRange } from "@/lib/seo/sitemaps"
import { byHost, indexNowKey, worthSending } from "@/lib/seo/indexnow"
import { isReservedWord } from "@/lib/reserved-words"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/**
 * robots.txt as Google reads it: the longest matching rule wins, a rule is a
 * prefix, `$` ends it, `*` is anything. Enough to ask "is this address
 * crawlable" of the rules below.
 */
function allowedBy(disallow: string[], path: string): boolean {
  const matches = (rule: string) => {
    const re = new RegExp("^" + rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$").replace(/\$$/, "$"))
    return re.test(path)
  }
  return !disallow.some((r) => matches(r.endsWith("$") ? r : r.replace(/\$/g, "\\$")))
}

section("Sitemap files are valid, deduplicated and dated only by real dates")
{
  const xml = urlsetXml([
    { url: "https://storelib.com/a?x=1&y=2", lastModified: "2026-09-01T10:00:00Z" },
    { url: "https://storelib.com/a?x=1&y=2", lastModified: "2026-09-02T10:00:00Z" },
    { url: "https://storelib.com/b" },
    { url: "https://storelib.com/c", lastModified: "not a date" },
  ])
  check("an address is escaped", xml.includes("<loc>https://storelib.com/a?x=1&amp;y=2</loc>") && !xml.includes("&y="))
  check("an address is listed once", (xml.match(/<url>/g) ?? []).length === 3)
  check("a real updated_at is its lastmod", xml.includes("<lastmod>2026-09-01T10:00:00.000Z</lastmod>"))
  check("no date, or a broken one, means no lastmod rather than today", !/<loc>https:\/\/storelib\.com\/b<\/loc><lastmod>/.test(xml) && !/c<\/loc><lastmod>/.test(xml))
  check("the newest of several dates", newestOf(null, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z") === "2026-03-01T00:00:00.000Z" && newestOf(null, undefined) === null)
  check("lastmod is ISO", lastmodOf("2026-09-24") === "2026-09-24T00:00:00.000Z")
  const index = sitemapIndexXml([{ url: "https://storelib.com/sitemap/pages.xml" }])
  check("the index is a sitemapindex", index.includes("<sitemapindex") && index.includes("<sitemap><loc>https://storelib.com/sitemap/pages.xml</loc></sitemap>"))
  check("a chunk stays well under the protocol's 50,000", SITEMAP_CHUNK <= 50_000)
  check("the chunk names parse, and nothing else does",
    JSON.stringify(parseSitemapName("products-3.xml")) === JSON.stringify({ kind: "products", chunk: 3 }) &&
      parseSitemapName("pages.xml")?.kind === "pages" &&
      parseSitemapName("websites-0.xml")?.kind === "websites" &&
      parseSitemapName("../etc.xml") === null && parseSitemapName("products-x.xml") === null)
}

section("A chunk's ids travel in short URLs, and a failed read is never a shorter file")
{
  const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
  let inFlight = 0
  let most = 0
  const sizes: number[] = []
  const firsts = await eachBatch(ids, async (batch) => {
    inFlight++
    most = Math.max(most, inFlight)
    sizes.push(batch.length)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight--
    return batch[0]
  })
  check("ids go at most 150 to a query, and every one of them goes", IDS_PER_QUERY <= 150 && sizes.every((n) => n <= IDS_PER_QUERY) && sizes.reduce((a, b) => a + b, 0) === ids.length)
  check("the answers come back in the order of the batches", JSON.stringify(firsts) === JSON.stringify([ids[0], ids[150], ids[300]]))
  check("a few queries at once, not one line of them and not all of them", most > 1 && most <= 4, `${most} at once`)
  const request = `https://x.supabase.co/rest/v1/creators?${new URLSearchParams({ select: "id,user_id", id: `in.(${ids.slice(0, IDS_PER_QUERY).join(",")})` })}`
  check("a batch's request line stays well under a gateway's 8 KB", request.length < 7000, `${request.length} characters`)

  const table = Array.from({ length: 2500 }, (_, i) => i)
  const asked: Array<[number, number]> = []
  const rows = await readRange<number>(async (a, b) => {
    asked.push([a, b])
    return { data: table.slice(a, b + 1), error: null }
  }, 0, 10_000, "table")
  check("every row is read, a thousand to a request, until a short page", rows.length === 2500 && asked.length === 3 && asked[0][1] === 999 && asked[2][0] === 2000)
  let calls = 0
  const flaky = await readRange<number>(async (a) => {
    calls++
    return calls === 1 ? { data: null, error: { message: "blip" } } : { data: table.slice(a, 10), error: null }
  }, 0, 1000, "flaky")
  check("a blip is tried once more", flaky.length === 10 && calls === 2)
  let thrown: unknown = null
  const quiet = console.error
  console.error = () => {}
  try {
    await readRange<number>(async () => ({ data: null, error: { message: "down" } }), 0, 1000, "down")
  } catch (e) {
    thrown = e
  } finally {
    console.error = quiet
  }
  check("and a read that fails twice is thrown, never handed back as a shorter list", thrown instanceof SitemapReadFailed)

  const maps = code("lib/seo/sitemaps.ts")
  check("the website sitemap asks for its creators in batches, not ten thousand ids in one URL",
    !/\.in\("id", creatorIds\)/.test(maps) && /\.from\("creators"\)\.select\("id, user_id"\)\.in\("id", batch\)/.test(maps))
  check("and every other list of ids goes the same way", !/\.slice\(i, i \+ (100|200|500)\)/.test(maps) && (maps.match(/eachBatch\(/g) ?? []).length >= 5)
  check("a site is listed at the name it was given, where it was given one",
    /websiteNames\(admin, creatorIds\)/.test(maps) && /const handle = chosen\.get\(i\.creator_id\) \?\? names\.get/.test(maps))
  const index = code("app/sitemap.xml/route.ts")
  const file = code("app/sitemap/[name]/route.ts")
  check("both sitemap routes answer 503 for a failed read, which nothing caches",
    [index, file].every((r) => /if \(e instanceof SitemapReadFailed\) return sitemapUnavailable\(\)/.test(r))
      && /status: 503/.test(maps) && /"Retry-After": "600"/.test(maps) && /"Cache-Control": "no-store"/.test(maps))
  const seoData = code("lib/website-builder/site-seo-data.ts")
  check("a site's own sitemap reads its products a thousand at a time, not the first thousand of 5,000",
    !/\.limit\(5000\)/.test(seoData) && /\.range\(from, from \+ PRODUCT_PAGE - 1\)/.test(seoData) && /PRODUCT_PAGE = 1000/.test(seoData))
}

section("storelib.com's robots.txt keeps crawlers out of the app, and out of nobody's page")
{
  check("the app, the editors and the private flows are not crawled",
    ["/app", "/app/orders", "/api/track-view", "/website-builder/editor/x", "/store/mara/themes/1/editor", "/library", "/checkout", "/cover-render/abc", "/w/mara", "/admin/blog"].every((p) => !allowedBy(PLATFORM_DISALLOW, p)))
  check("a creator whose handle starts like a private route is still crawled",
    ["/libraryofsound", "/checkouts-club", "/apparel", "/storefronts", "/wanda", "/accessories"].every((p) => allowedBy(PLATFORM_DISALLOW, p)))
  check("the public pages are crawled", ["/", "/pricing", "/explore", "/explore/design", "/blog/x", "/mara", "/mara/preset-pack", "/mara/links", "/developers"].every((p) => allowedBy(PLATFORM_DISALLOW, p)))
  const robots = code("app/robots.ts")
  check("robots.ts uses those rules and names the index", /disallow: PLATFORM_DISALLOW/.test(robots) && /sitemap: "https:\/\/storelib\.com\/sitemap\.xml"/.test(robots))
  const site = robotsTxt({ disallow: SITE_DISALLOW, sitemaps: ["https://www.mara.shop/sitemap.xml"] })
  check("a built site's robots.txt names its own sitemap", /Sitemap: https:\/\/www\.mara\.shop\/sitemap\.xml/.test(site) && /Allow: \//.test(site))
  check("  and keeps search results, the basket and previews out, but not a page called searchlight",
    !allowedBy(SITE_DISALLOW, "/search?q=x") && !allowedBy(SITE_DISALLOW, "/cart") && !allowedBy(SITE_DISALLOW, "/preview/tok") && allowedBy(SITE_DISALLOW, "/searchlight") && allowedBy(SITE_DISALLOW, "/about"))
}

section("What is listed")
{
  check("a published product is listed", productIndexable({ status: "published", slug: "pack" }, "mariapopescu"))
  check("a draft is not", !productIndexable({ status: "draft", slug: "pack" }, "mariapopescu"))
  check("an archived product is not", !productIndexable({ status: "published", archived: true, slug: "pack" }, "mariapopescu"))
  check("a link farm's decoy listing is not", !productIndexable({ status: "published", slug: "x" }, "powerokebos999"))
  check("a creator with nothing published is not", !creatorIndexable({ publishedProducts: 0, handle: "mariapopescu" }))
  check("a creator who sells is", creatorIndexable({ publishedProducts: 2, handle: "mariapopescu" }))
  check("a site whose owner switched indexing off is not", !websiteIndexable({ seo_robots: false }) && !websiteIndexable({ seo_robots: "noindex, nofollow" }))
  check("a site left on the default is", websiteIndexable({}) && websiteIndexable({ seo_robots: true }) && websiteIndexable(null))
}

section("A built site is canonical at one origin")
{
  check("its connected domain, at the www host the proxy sends it to", siteOrigin({ handle: "mara", customDomain: "marashop.com", mainDomain: "storelib.com" }) === "https://www.marashop.com")
  check("a www domain is left as it is", siteOrigin({ handle: "mara", customDomain: "www.marashop.com", mainDomain: "storelib.com" }) === "https://www.marashop.com")
  check("otherwise its subdomain", siteOrigin({ handle: "Mara", mainDomain: "storelib.com" }) === "https://mara.storelib.com")
  const seoData = code("lib/website-builder/site-seo-data.ts")
  check("the site's own sitemap and canonicals name the www host the proxy answers on, not the bare domain it redirects",
    /* The host comes from lib/custom-domains: www.<apex> for an apex, a connected subdomain as it is. */
    /primaryHostFor\(creatorId, "website"\)/.test(seoData) && /servingHost\(primary\.domain\)/.test(code("lib/custom-domains/store.ts")) && !/replace\(\/\^www\\\.\/, ""\) : `\$\{name/.test(seoData))
  check("a site under a handle the spam rules hold back is not listed", /deservesIndexing\(\{ publishedProducts: 1, handle: name \}\)/.test(seoData))
}

section("Every host answers its own robots.txt and sitemap")
{
  const proxy = code("proxy.ts")
  check("a website-builder subdomain's robots.txt and sitemap go to its own routes, an AI site keeps its own",
    /const isWebsite = \(!looksLikeFile \|\| seoFile\) && !\(await hasLiveAiSite\(subdomain\)\)/.test(proxy))
  check("a connected domain's too, instead of storelib.com's, answered once",
    /username &&\s*isCustomDomain &&\s*(?:domainPurpose === "website" &&\s*)?\(pathname === "\/robots\.txt" \|\| pathname === "\/sitemap\.xml"\)/.test(proxy) && /seoUrl\.pathname = `\/w\/\$\{username\}\$\{pathname\}`/.test(proxy)
      && (proxy.match(/isCustomDomain &&\s*(?:domainPurpose === "website" &&\s*)?\(pathname === "\/robots\.txt"/g) ?? []).length === 1)
  const siteRobots = code("app/(site)/w/[username]/robots.txt/route.ts")
  const siteMap = code("app/(site)/w/[username]/sitemap.xml/route.ts")
  check("an unknown site's robots.txt allows everything, never a refusal a failed lookup could cache for a day",
    /"User-agent: \*\\nAllow: \/\\n"/.test(siteRobots) && !/Disallow: \/\\n/.test(siteRobots))
  check("the site routes exist and read the site's one list", /siteSeo\(username\)/.test(siteRobots) && /robotsTxt\(seo\.origin, seo\.indexable\)/.test(siteRobots) && /sitemapXml\(seo\.entries\)/.test(siteMap))
  check("IndexNow announces the same addresses the site's sitemap lists", /const seo = await siteSeo\(handle\)/.test(code("lib/seo/sitemaps.ts")))
  const aiSite = code("app/(sites)/site/[slug]/[[...path]]/route.ts")
  check("an AI site without its own robots.txt or sitemap is given both", /requested === "robots\.txt" \|\| requested === "sitemap\.xml"/.test(aiSite) && /urlsetXml\(\[/.test(aiSite))
  check("storelib.com's sitemap is an index of chunks", /sitemapIndexXml\(await sitemapIndex\(\)\)/.test(code("app/sitemap.xml/route.ts")) && /parseSitemapName\(name\)/.test(code("app/sitemap/[name]/route.ts")))
  check("the sitemap routes are reserved from handles", isReservedWord("sitemap") && isReservedWord("sitemap.xml"))
  const maps = code("lib/seo/sitemaps.ts")
  check("products are read a chunk at a time, not the first 5,000", !/\.limit\(5000\)/.test(maps) && /chunk \* SITEMAP_CHUNK/.test(maps))
  check("every listed page carries its row's own date", /lastModified: lastmodOf\(row\.updated_at\)/.test(maps) && !/lastModified: new Date\(\)/.test(maps))
  check("a published site is listed at its subdomain only when it has no connected domain", /domains\.has\(i\.creator_id\)/.test(maps))
}

section("Pages a visitor can reach but no index should hold carry noindex")
{
  const site = code("app/(site)/w/[username]/render-site.tsx")
  check("a site page names its absolute canonical at the site's origin", /alternates: \{ canonical: url \}/.test(site) && /const url = pageUrl\(await siteOrigin\(creator\.creatorId, username\), pageKey\)/.test(site))
  check("a site with nothing published is noindex", /if \(found\.kind !== "site"\) \{\s*return \{ title: \{ absolute: [^\n]*robots: \{ index: false, follow: true \} \}/.test(site))
  /* The name a website was given in Website Settings › Domains is a name the
     page answers to, so it has to be one the metadata answers to as well. */
  check("a site page's metadata finds its creator the way the page does, website names included",
    /const creator = await creatorByName\(username\)/.test(site) && /const found = await publishedShopByName\(username\)/.test(site)
      && !/\.or\(`slug\.eq\./.test(site) && /creatorIdByHandle\(lower, admin\)/.test(code("lib/website-builder/published-site.ts")))
  check("a preview is noindex", /return \{ title: "Preview", robots: \{ index: false, follow: false \} \}/.test(site))
  for (const layout of ["app/app/layout.tsx", "app/website-builder/layout.tsx", "app/library/layout.tsx", "app/creator-page/layout.tsx", "app/dashboard/layout.tsx", "app/store/[creatorSlug]/themes/[installId]/editor/page.tsx"]) {
    check(`  ${layout} is noindex`, /export const metadata: Metadata = \{ robots: \{ index: false, follow: false \} \}/.test(code(layout)))
  }
  const product = code("app/(marketing)/p/[slug]/page.tsx")
  check("a product page's robots tag is the sitemap's rule", /index: productIndexable\(product, sellerHandle \?\? null\)/.test(product))
  const themeProduct = code("components/website-builder/theme/render-product.tsx")
  check("a site's product page is canonical on the site, the platform's copy at storelib.com/<handle>/<slug>",
    /let canonical: string \| undefined = site\?\.url/.test(themeProduct) && /productUrl\(origin, slug\)/.test(code("app/(site)/w/[username]/products/[slug]/page.tsx"))
      && /if \(handle\) canonical = getProductShareUrl\(handle, product\.slug\)/.test(themeProduct) && /plainSummary\(product\.description\)/.test(themeProduct))
}

section("IndexNow: off without a key, never in the way of a save, one notice per change")
{
  const before = process.env.INDEXNOW_KEY
  delete process.env.INDEXNOW_KEY
  check("no key, no feature", indexNowKey() === null)
  process.env.INDEXNOW_KEY = "bad key!"
  check("a key that is not a key is refused", indexNowKey() === null)
  process.env.INDEXNOW_KEY = "3f1c9a7e2b8d4c6f"
  check("a real key is read from the environment", indexNowKey() === "3f1c9a7e2b8d4c6f")
  if (before === undefined) delete process.env.INDEXNOW_KEY
  else process.env.INDEXNOW_KEY = before

  const seen = new Map<string, number>([["https://storelib.com/mara", 1_000]])
  const now = 1_000 + 5 * 60_000
  const out = worthSending(["https://storelib.com/mara", "https://storelib.com/mara/pack", "https://storelib.com/mara/pack", "http://x.com/", "https://preview.vercel.app/a", "not a url"], now, seen)
  check("an address sent in the last ten minutes is not sent again, nor twice in one go", JSON.stringify(out) === JSON.stringify(["https://storelib.com/mara/pack"]))
  check("only public https addresses", !out.some((u) => u.startsWith("http:") || u.includes("vercel.app")))
  check("ten minutes later it may be sent again", worthSending(["https://storelib.com/mara"], 1_000 + 11 * 60_000, seen).length === 1)
  const hosts = byHost(["https://storelib.com/a", "https://mara.storelib.com/", "https://storelib.com/b"])
  check("one request per host, as the protocol asks", hosts.size === 2 && hosts.get("storelib.com")?.length === 2)

  const proxy = code("proxy.ts")
  check("the key file is served at the root of every host, before any other rule",
    /pathname === `\/\$\{indexNowKey\}\.txt`/.test(proxy) && proxy.indexOf("indexNowKey") < proxy.indexOf("if (bareHost.endsWith(`.${SITES_DOMAIN}`))"))
  const publish = code("app/api/website-builder/themes/[installId]/publish/route.ts")
  check("publishing and taking a site down announce its pages after the answer",
    (publish.match(/after\(\(\) => announce\(\(\) => websiteAddresses\(announced\)\)\)/g) ?? []).length === 2)
  const api = code("app/api/seo/indexnow/route.ts")
  check("products and profiles are announced from the server, after the answer, for the signed in creator only",
    /after\(\(\) => announce\(\(\) => productAddresses\(productId, creatorId\)\)\)/.test(api) && /after\(\(\) => announce\(\(\) => profileAddresses\(creatorId\)\)\)/.test(api) && /\.eq\("user_id", user\.id\)/.test(api))
  const announce = code("lib/seo/announce.ts")
  check("a link farm's pages are never announced", /deservesIndexing\(\{ publishedProducts: 1, handle \}\)/.test(announce) && /if \(!p\?\.slug \|\| p\.creator_id !== creatorId \|\| !notSpam\(handle\)\) return \[\]/.test(announce))
  check("announcing never throws into the caller", /try \{\s*await submitToIndexNow\(await addresses\(\)\)\s*\} catch/.test(announce))
  const client = code("lib/seo/announce-client.ts")
  check("the screens that save call it only after the save succeeded, and never wait for it",
    /keepalive: true/.test(client) && /\.catch\(\(\) => \{\}\)/.test(client) &&
      /if \(finalProductId\) announceChange\(\{ product: finalProductId \}\)/.test(code("app/app/products/new/product-editor.tsx")) &&
      /if \(!statusError\) announceChange\(\{ product: product\.id \}\)/.test(code("components/app/product-edit-form.tsx")) &&
      /announceChange\(\{ profile: true \}\)/.test(code("components/app/settings-form-new.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
