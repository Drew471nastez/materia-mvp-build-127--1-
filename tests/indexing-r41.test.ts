/**
 * Round 41: search indexing across Storelib.
 *
 *   robots      every published OnePage is indexable (no product needed),
 *               except a draft, a page that shows only a name and a photo,
 *               a page with a link marked sensitive, a banned owner and a
 *               link farm (handle score or an operator's verdict). Links are
 *               followed only once the account sells something.
 *   sitemaps    creator pages count physical products; OnePages are listed
 *               without products; communities and websites have their files.
 *   websites    each host's robots.txt, sitemap and canonical are its own,
 *               and its icon is served square from that same host, on a
 *               storelib.com subdomain and on a connected domain.
 *
 * Run: npx tsx --conditions=react-server tests/indexing-r41.test.ts
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { deservesIndexing, trustsOutboundLinks } from "@/lib/security/spam-signals"
import {
  PLATFORM_DISALLOW,
  SITE_DISALLOW,
  SITEMAP_CHUNK,
  builtSiteIndexable,
  creatorIndexable,
  onePageIndexable,
  pageRobots,
  productIndexable,
  siteOrigin,
  urlsetXml,
} from "@/lib/seo/indexing"
import { creatorChunkEntries, type CreatorChunkRows } from "@/lib/seo/sitemaps"
import { onePageRowListable, onePageSensitive, onePageShowsSomething } from "@/lib/onepage/page-presence"
import { MAX_SITEMAP_URLS, robotsTxt as siteRobotsTxt, sitemapChunks, sitemapXml, pageUrl } from "@/lib/website-builder/site-seo"
import {
  FAVICON_SIZE,
  TOUCH_ICON_SIZE,
  fetchableIconSource,
  isSiteIconPath,
  ownHostIcons,
  ownIconPath,
  siteManifest,
} from "@/lib/website-builder/site-favicon"
import { squareIconResponse } from "@/lib/website-builder/site-favicon-server"
import { withSiteIcon } from "@/lib/website-builder/site-icon"
import { pageAskedAsSubresource } from "@/lib/security/subresource-guard"
import { communityJsonLd, communityMetadata, type SeoFacts } from "@/components/community/public/seo"

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
const section = (name: string) => console.log(`\n  ${name}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** robots.txt as Google reads it: a rule is a prefix, `$` ends it, `*` is anything. */
function allowedBy(disallow: string[], path: string): boolean {
  return !disallow.some((rule) => {
    const anchored = rule.endsWith("$")
    const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path)
  })
}

const FARM = "powerokebos999"
const shown = (type: string, data: Record<string, unknown> = {}) => ({ id: type, type, enabled: true, data })

async function main() {
  section("Who may be indexed: no product needed, farms and verdicts still kept out")
  check("a creator with nothing for sale may be indexed", deservesIndexing({ handle: "mariapopescu" }))
  check("a farm's handle may not", !deservesIndexing({ handle: FARM }))
  check("an operator's confirmed verdict keeps a clean handle out", !deservesIndexing({ handle: "mariapopescu", spamState: "confirmed" }))
  check("and an operator's clear lets a handle the score got wrong in", deservesIndexing({ handle: FARM, spamState: "clear" }))

  section("A OnePage's robots decision")
  check("published, no products: index", onePageIndexable({ status: "published", handle: "mariapopescu" }))
  check("a draft: not", !onePageIndexable({ status: "draft", handle: "mariapopescu" }))
  check("no handle: not", !onePageIndexable({ status: "published", handle: null }))
  check("a farm: not", !onePageIndexable({ status: "published", handle: FARM }))
  check("confirmed spam: not", !onePageIndexable({ status: "published", handle: "mariapopescu", spamState: "confirmed" }))
  check("indexed with nothing for sale: index, nofollow", JSON.stringify(pageRobots({ indexable: true, publishedProducts: 0 })) === JSON.stringify({ index: true, follow: false }))
  check("with a product, of any type: index, follow", JSON.stringify(pageRobots({ indexable: true, publishedProducts: 1 })) === JSON.stringify({ index: true, follow: true }))
  check("an operator's clear follows without a product", pageRobots({ indexable: true, publishedProducts: 0, spamState: "clear" }).follow)
  check("not indexable: noindex, nofollow", JSON.stringify(pageRobots({ indexable: false, publishedProducts: 9 })) === JSON.stringify({ index: false, follow: false }))
  check("trust is a product or a clear, never a confirmed verdict", trustsOutboundLinks({ publishedProducts: 1 }) && !trustsOutboundLinks({ publishedProducts: 0 }) && !trustsOutboundLinks({ publishedProducts: 5, spamState: "confirmed" }))

  const bioOnly = { blocks: [], bio: "Ceramics in Cluj", socialLinks: {} }
  const nameAndPhoto = { blocks: [shown("header"), { ...shown("link_button", { url: "https://x.com", label: "Off" }), enabled: false }], bio: "", socialLinks: {} }
  check("a page with a bio shows something", onePageShowsSomething(bioOnly))
  check("a page with only a name and a photo shows nothing", !onePageShowsSomething(nameAndPhoto))
  const sensitive = [shown("link_button", { url: "https://x.com", label: "18+", sensitive: true })]
  const sensitiveInGroup = [shown("group", { layout: "stack", children: [shown("link_button", { url: "https://x.com", label: "18+", sensitive: true })] })]
  const sensitiveOff = [{ ...shown("link_button", { url: "https://x.com", label: "18+", sensitive: true }), enabled: false }, shown("link_button", { url: "https://y.com", label: "Shop" })]
  check("a shown link marked sensitive makes the page sensitive", onePageSensitive({ blocks: sensitive }) && onePageSensitive({ blocks: sensitiveInGroup }))
  check("a sensitive link switched off does not", !onePageSensitive({ blocks: sensitiveOff }))
  check("the sitemap's row rule: something on it and nothing sensitive",
    onePageRowListable({ published_blocks: sensitiveOff }) && !onePageRowListable({ published_blocks: sensitive }) && !onePageRowListable({ published_blocks: [shown("header")] }) &&
      onePageRowListable({ published_blocks: [], published_profile: { bio: "Hello there" } }) && onePageRowListable({ draft_blocks: [shown("link_button", { url: "https://y.com", label: "Shop" })] }))

  const onepage = code("app/(marketing)/l/[slug]/page.tsx")
  check("the OnePage route asks no product count to index, and asks about sensitive links",
    /onePageIndexable\(\{ status: onepage\.status, handle: owner\.handle, spamState: owner\.spamState \}\)/.test(onepage) && !/onePageIndexable\(\{[^}]*publishedProducts/.test(onepage) && /!onePageSensitive\(\{ blocks: drawn\.blocks \}\)/.test(onepage))
  check("and its follow comes from pageRobots", /const \{ follow \} = pageRobots\(/.test(onepage) && /onePageMetadataFrom\(seo, \{ handle: owner\.handle, indexable, follow,/.test(onepage))
  check("the metadata writes follow as it is told", /follow: extra\.follow !== false/.test(code("lib/onepage/seo.ts")))

  section("A creator page's robots decision counts physical products")
  check("no product: not indexed (an empty shop)", !creatorIndexable({ publishedProducts: 0, handle: "mariapopescu" }))
  check("one product: indexed", creatorIndexable({ publishedProducts: 1, handle: "mariapopescu" }))
  check("a farm with a decoy product: not", !creatorIndexable({ publishedProducts: 1, handle: FARM }))
  const storefront = code("app/(marketing)/u/[username]/page.tsx")
  const metaCount = storefront.slice(storefront.indexOf('.select("id", { count: "exact", head: true })'), storefront.indexOf(".then(({ count }) => count ?? 0)"))
  check("the storefront's metadata counts every product type", metaCount.length > 0 && !/neq\("type", "physical"\)/.test(metaCount))
  check("and its body counts them when none is drawn", /creatorIndexable\(\{ publishedProducts: listedCount,/.test(storefront))
  check("a product page and a website keep the handle rule", productIndexable({ status: "published", slug: "pack" }, "mariapopescu") && !productIndexable({ status: "published", slug: "pack" }, FARM) && builtSiteIndexable({}, "mariapopescu") && !builtSiteIndexable({}, FARM) && !builtSiteIndexable({ seo_robots: false }, "mariapopescu"))

  section("What storelib.com's robots.txt keeps out")
  const blocked = ["/app", "/app/orders", "/checkout", "/checkout/x", "/receipt/abc", "/purchase/1", "/library", "/onepage-preview", "/review/tok", "/order-help/1", "/pay/wallet-return", "/payouts-sheet", "/explore?q=clay", "/explore?sort=new", "/website-builder/x", "/w/mara"]
  check("the app, checkout, receipts, previews, buyer links and search queries", blocked.every((p) => !allowedBy(PLATFORM_DISALLOW, p)), blocked.filter((p) => allowedBy(PLATFORM_DISALLOW, p)).join(", "))
  const open = ["/", "/mara", "/mara/pack", "/community/clay-club", "/community/clay-club/about", "/explore", "/explore/design", "/reviewer-joe", "/payton"]
  check("public pages, communities and handles that start like a route stay open", open.every((p) => allowedBy(PLATFORM_DISALLOW, p)), open.filter((p) => !allowedBy(PLATFORM_DISALLOW, p)).join(", "))
  const siteBlocked = ["/preview/tok", "/search?q=mug", "/cart", "/account", "/wishlist"]
  check("a website keeps out its previews, search results, cart and account", siteBlocked.every((p) => !allowedBy(SITE_DISALLOW, p)) && ["/", "/products/mug", "/about", "/search-tips"].every((p) => allowedBy(SITE_DISALLOW, p)))
  const member = read("app/(marketing)/community/[slug]/(member)/layout.tsx")
  check("member only community areas say noindex", /return \{ robots: \{ index: false, follow: false \} \}/.test(member))

  section("Sitemaps, each type")
  const rows: CreatorChunkRows = {
    creators: [
      { id: "c-phys", user_id: "u-phys", cover_url: "https://x.supabase.co/storage/v1/object/public/c/phys.jpg" },
      { id: "c-links", user_id: "u-links" },
      { id: "c-farm", user_id: "u-farm" },
      { id: "c-banned", user_id: "u-banned" },
      { id: "c-spam", user_id: "u-spam" },
      { id: "c-domain", user_id: "u-domain" },
      { id: "c-empty", user_id: "u-empty" },
      { id: "c-nouser", user_id: null },
    ],
    /* Counted over every type: c-phys sells only physical products. */
    products: new Map([
      ["c-phys", { n: 2, at: "2026-10-01T00:00:00.000Z" }],
      ["c-farm", { n: 1, at: null }],
      ["c-banned", { n: 3, at: null }],
      ["c-spam", { n: 1, at: null }],
      ["c-domain", { n: 1, at: null }],
    ]),
    sellers: new Map([
      ["u-phys", { username: "potter", avatar_url: null }],
      ["u-links", { username: "dj-ana", avatar_url: null }],
      ["u-farm", { username: FARM, avatar_url: null }],
      ["u-banned", { username: "bannedone", avatar_url: null }],
      ["u-spam", { username: "cleanlooking", avatar_url: null }],
      ["u-domain", { username: "owndomain", avatar_url: null }],
      ["u-empty", { username: "emptypage", avatar_url: null }],
    ]),
    onePages: new Map([
      ["c-phys", "2026-10-02T00:00:00.000Z"],
      ["c-links", "2026-10-03T00:00:00.000Z"],
      ["c-farm", null],
      ["c-banned", null],
      ["c-spam", null],
      ["c-domain", null],
    ]),
    banned: new Set(["c-banned"]),
    ownDomain: new Set(["c-domain"]),
    spam: new Set(["u-spam"]),
  }
  const listed = creatorChunkEntries(rows, (h) => `https://storelib.me/${h}`)
  const creatorUrls = listed.creators.map((e) => e.url)
  const onePageUrls = listed.onePages.map((e) => e.url)
  check("a seller of physical products only: creator page listed", JSON.stringify(creatorUrls) === JSON.stringify(["https://storelib.com/potter"]), creatorUrls.join(", "))
  check("OnePages listed with and without products; never a farm's, a banned, a confirmed spammer's or one on its own domain",
    JSON.stringify(onePageUrls) === JSON.stringify(["https://storelib.me/potter", "https://storelib.me/dj-ana"]), onePageUrls.join(", "))
  check("each with its real date", listed.onePages[1].lastModified === "2026-10-03T00:00:00.000Z" && listed.creators[0].lastModified === "2026-10-01T00:00:00.000Z")
  const maps = code("lib/seo/sitemaps.ts")
  const chunkRead = maps.slice(maps.indexOf("async function creatorChunk"), maps.indexOf("async function publishedOnePages"))
  check("the creator chunk counts every product type", /\.from\("products"\)/.test(chunkRead) && !/neq\("type", "physical"\)/.test(chunkRead))
  check("and reads confirmed spam and the OnePage's row rule", /confirmedSpamUserIds\(admin\)/.test(chunkRead) && /onePageRowListable\(p, now\)/.test(maps))
  check("storelib.com's index names pages, products, creators, websites and communities, by chunk",
    /\/sitemap\/pages\.xml/.test(maps) && /\/sitemap\/products-\$\{i\}\.xml/.test(maps) && /\/sitemap\/creators-\$\{i\}\.xml/.test(maps) && /\/sitemap\/websites-\$\{i\}\.xml/.test(maps) && /\/sitemap\/communities-\$\{i\}\.xml/.test(maps))
  check("storelib.me's index names its OnePage files", /\$\{origin\}\/sitemap\/onepages-\$\{i\}\.xml/.test(maps))
  check("a chunk is under Google's 50,000", SITEMAP_CHUNK <= 50_000)
  const tenThousand = Array.from({ length: SITEMAP_CHUNK }, (_, i) => ({ url: `https://storelib.com/creator-${i}`, lastModified: "2026-10-01T00:00:00Z", images: Array.from({ length: 10 }, (_, j) => `https://x.supabase.co/storage/v1/object/public/p/${i}-${j}.webp`) }))
  const bytes = Buffer.byteLength(urlsetXml(tenThousand))
  check("a full chunk with ten pictures a page is under 50 MB", bytes < 50 * 1024 * 1024, `${bytes} bytes`)
  check("communities are listed from the public, published ones, and not a banned creator's",
    /communitiesSitemap/.test(maps) && /!banned\.has\(r\.creator_id\)/.test(maps) && /\.eq\("visibility", "public"\)/.test(read("lib/communities/server/public.ts")))

  section("A public community's page says what it is")
  const facts: SeoFacts = {
    slug: "clay-club", name: "Clay Club", tagline: "Wheel throwing, weekly", summary: null, description: "<p>Live sessions</p>", seoTitle: null, seoDescription: null,
    coverUrl: "https://x.supabase.co/storage/v1/object/public/c/cover.jpg", logoUrl: "https://x.supabase.co/storage/v1/object/public/c/logo.png", indexable: true, creatorName: "Ana", shareVersion: "v1",
  }
  const meta = communityMetadata(facts) as { title: { absolute: string }; description: string; alternates: { canonical: string }; openGraph: { images: Array<{ url: string }> }; robots: { index: boolean } }
  check("title, description and canonical", meta.title.absolute === "Clay Club" && meta.description === "Wheel throwing, weekly" && meta.alternates.canonical === "https://storelib.com/community/clay-club")
  check("an Open Graph picture", Array.isArray(meta.openGraph.images) && meta.openGraph.images.length === 1 && /clay-club/.test(meta.openGraph.images[0].url))
  check("indexed", meta.robots.index === true)
  check("canonical on its own domain once connected", (communityMetadata({ ...facts, origin: "https://www.clayclub.ro" }) as { alternates: { canonical: string } }).alternates.canonical === "https://www.clayclub.ro/")
  check("a community that is not public is noindex", (communityMetadata({ ...facts, indexable: false }) as { robots: { index: boolean } }).robots.index === false)
  const ld = communityJsonLd({ slug: "clay-club", name: "Clay Club", tagline: "Wheel throwing, weekly", logoUrl: facts.logoUrl, coverUrl: facts.coverUrl, descriptionHtml: null, descriptionText: "Live sessions", creator: null, options: [] } as never, true)
  check("free community: Organization JSON-LD with name, url and logo", ld?.["@type"] === "Organization" && ld?.name === "Clay Club" && ld?.url === "https://storelib.com/community/clay-club" && ld?.logo === facts.logoUrl)

  section("A website on a storelib.com subdomain and on a connected domain")
  const sub = siteOrigin({ handle: "Mara", mainDomain: "storelib.com" })
  const own = siteOrigin({ handle: "mara", customDomain: "mara.shop", mainDomain: "storelib.com" })
  check("the subdomain origin", sub === "https://mara.storelib.com")
  check("a connected apex is canonical at www", own === "https://www.mara.shop")
  check("a connected subdomain as it is", siteOrigin({ handle: "mara", customDomain: "shop.mara.ro", mainDomain: "storelib.com" }) === "https://shop.mara.ro")
  for (const [label, origin] of [["subdomain", sub], ["custom domain", own]] as const) {
    const robots = siteRobotsTxt(origin, true)
    check(`${label}: robots.txt names its own sitemap`, robots.includes(`Sitemap: ${origin}/sitemap.xml`) && /Disallow: \/preview\//.test(robots))
    /* Not `Disallow: /`: a crawler has to read each page's noindex to drop it (lib/website-builder/site-seo.ts robotsTxt). */
    check(`${label}: a hidden site names no sitemap and stays readable`, !siteRobotsTxt(origin, false).includes("Sitemap:") && !/^Disallow: \/$/m.test(siteRobotsTxt(origin, false)))
    const map = sitemapXml([{ loc: pageUrl(origin, "home") }, { loc: pageUrl(origin, "about") }])
    check(`${label}: its sitemap lists only its own host`, map.includes(`<loc>${origin}/</loc>`) && map.includes(`<loc>${origin}/about</loc>`) && !/storelib\.com\/w\//.test(map))
    check(`${label}: the canonical page address is on that host`, pageUrl(origin, "about") === `${origin}/about`)
    const source = "https://storelib.com/media/site-assets/mara/favicon.png"
    const tags = ownHostIcons(origin, source)!
    const icon = tags.icons.icon[0]
    check(`${label}: the favicon link is on the site's own host`, icon.url.startsWith(`${origin}/favicon.ico?v=`) && icon.sizes === `${FAVICON_SIZE}x${FAVICON_SIZE}` && icon.type === "image/png", icon.url)
    check(`${label}: and the home screen icon and the manifest`, tags.icons.apple[0].url.startsWith(`${origin}/apple-touch-icon?v=`) && tags.icons.apple[0].sizes === `${TOUCH_ICON_SIZE}x${TOUCH_ICON_SIZE}` && tags.manifest.startsWith(`${origin}/site.webmanifest?v=`))
  }
  const a = ownHostIcons(sub, "https://storelib.com/media/a.png")!.icons.icon[0].url
  check("the address is stable for the same picture and moves with a new one", a === ownHostIcons(sub, "https://storelib.com/media/a.png")!.icons.icon[0].url && a !== ownHostIcons(sub, "https://storelib.com/media/b.png")!.icons.icon[0].url)
  check("no picture: no icon tags, the route's default stays", ownHostIcons(sub, "") === undefined)
  check("Google's 48 by 48: both sizes are at least that and square", FAVICON_SIZE >= 48 && FAVICON_SIZE % 48 === 0 && TOUCH_ICON_SIZE >= 48)
  const manifest = siteManifest({ name: "Mara Ceramics", source: "https://storelib.com/media/a.png", themeColor: "#aa3311" }) as { icons: Array<{ src: string; sizes: string }>; name: string }
  check("the manifest names the icons on the same host", manifest.name === "Mara Ceramics" && manifest.icons.every((i) => i.src.startsWith("/")) && manifest.icons[0].sizes === "192x192")
  const imported = withSiteIcon("<html><head></head><body></body></html>", ownIconPath("https://storelib.com/media/a.png"))
  check("an imported theme's page links the icon at its own host", /<link rel="icon" href="\/favicon\.ico\?v=[a-z0-9]+"/.test(imported) && /rel="apple-touch-icon"[^>]*href="\/favicon\.ico\?v=/.test(imported))

  check("the paths a website host answers itself", isSiteIconPath("/favicon.ico") && isSiteIconPath("/apple-touch-icon") && isSiteIconPath("/site.webmanifest") && !isSiteIconPath("/favicon.png"))
  check("the browser's own picture request for the home screen icon is not refused", !pageAskedAsSubresource("image", "/apple-touch-icon") && pageAskedAsSubresource("image", "/DJ"))
  const proxy = code("proxy.ts")
  check("the proxy sees /favicon.ico now", !/favicon\.ico\|/.test(proxy.slice(proxy.indexOf("export const config"))))
  check("storelib.com's own passes straight on", /pathname === SITE_ICON_PATH && \(bareHost === MAIN_DOMAIN/.test(proxy))
  check("a subdomain sends the icon paths to its website", /if \(isSiteIconPath\(pathname\)\) \{[\s\S]{0,300}NextResponse\.rewrite\(new URL\(`\/w\/\$\{subdomain\}\$\{pathname\}\$\{search\}`/.test(proxy))
  check("a connected website domain does too", /if \(username && isCustomDomain && isSiteIconPath\(pathname\)\) \{[\s\S]{0,300}NextResponse\.rewrite\(new URL\(`\/w\/\$\{username\}\$\{pathname\}\$\{search\}`/.test(proxy))
  check("and the routes exist", ["favicon.ico", "apple-touch-icon", "site.webmanifest"].every((r) => /export async function GET/.test(read(`app/(site)/w/[username]/${r}/route.ts`))))
  check("the site's pages link the own host icons", /ownHostIcons\(origin, siteIconUrl\(/.test(code("app/(site)/w/[username]/render-site.tsx")) && /ownHostIcons\(origin, siteIconUrl\(/.test(code("app/(site)/w/[username]/products/[slug]/page.tsx")))

  section("The icon itself: square PNG from the site's picture")
  const env = { mainDomain: "storelib.com", supabaseUrl: "https://abc.supabase.co" }
  check("Storelib's /media/ address is fetched from storage", fetchableIconSource("https://storelib.com/media/site-assets/a.png", env) === "https://abc.supabase.co/storage/v1/object/public/site-assets/a.png" && fetchableIconSource("/media/x/y.png", env) === "https://abc.supabase.co/storage/v1/object/public/x/y.png")
  check("a storage address as it is", fetchableIconSource("https://abc.supabase.co/storage/v1/object/public/a/b.png", env) === "https://abc.supabase.co/storage/v1/object/public/a/b.png")
  check("anything else is never fetched by the server", fetchableIconSource("https://evil.example/a.png", env) === null && fetchableIconSource("http://169.254.169.254/latest", env) === null && fetchableIconSource("https://evil.example/media/a.png", env) === null)

  const wide = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer()
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(new Uint8Array(wide), { headers: { "Content-Type": "image/png" } })) as typeof fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
  try {
    const res = await squareIconResponse("https://abc.supabase.co/storage/v1/object/public/a/wide.png", FAVICON_SIZE, false)
    const out = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    check("a wide logo becomes a 192 by 192 PNG", res.status === 200 && res.headers.get("content-type") === "image/png" && out.width === 192 && out.height === 192 && out.format === "png", `${res.status} ${out.width}x${out.height}`)
    check("with a clear background around it", out.hasAlpha === true)
    check("held a day, with a stable address", /max-age=86400/.test(res.headers.get("cache-control") ?? ""))
    const touch = await squareIconResponse("https://abc.supabase.co/storage/v1/object/public/a/wide.png", TOUCH_ICON_SIZE, true)
    const t = await sharp(Buffer.from(await touch.arrayBuffer())).metadata()
    check("the home screen icon is 180 by 180 on white", t.width === 180 && t.height === 180 && t.hasAlpha === false)
    const away = await squareIconResponse("https://cdn.example.com/logo.png", FAVICON_SIZE, false)
    check("a picture on another site: the browser is sent there, the server never fetches it", away.status === 302 && away.headers.get("location") === "https://cdn.example.com/logo.png")
    globalThis.fetch = (async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })) as typeof fetch
    const broken = await squareIconResponse("https://abc.supabase.co/storage/v1/object/public/a/broken.png", FAVICON_SIZE, false)
    check("a file that is not a picture: sent to it, never a broken PNG", broken.status === 302)
  } finally {
    globalThis.fetch = realFetch
  }

  section("A website's own sitemap respects Google's limits")
  const many = Array.from({ length: 100_001 }, (_, i) => ({ loc: `${own}/products/p-${i}` }))
  const chunks = sitemapChunks(many)
  check("over 50,000 addresses becomes several files, each under the limit", chunks.length >= 3 && chunks.every((c) => c.length <= MAX_SITEMAP_URLS) && chunks.reduce((n, c) => n + c.length, 0) === many.length)
}

main()
  .catch((e) => {
    failed++
    failures.push(`threw: ${e instanceof Error ? e.stack : String(e)}`)
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`)
    if (failed > 0) {
      console.log("Failing:", failures.join(", "))
      process.exit(1)
    }
  })
