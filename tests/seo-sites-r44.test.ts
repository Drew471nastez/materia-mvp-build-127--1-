/**
 * ===========================================================================
 *  ROUND 44: EVERY PAGE OF A PUBLISHED WEBSITE, AS A SEARCH ENGINE READS IT
 * ===========================================================================
 * A website built in the website builder answers at <name>.storelib.com, at
 * a domain its creator connected (www and apex, a second domain), and at
 * storelib.com/w/<name>. Found and fixed in this round:
 *
 *   - a shop's sitemap stopped at 5,000 products, held in one cache entry a
 *     big shop's list was too large for, and at 200 collections;
 *   - the Storelib address's /sitemap.xml listed the domain's addresses on
 *     a host that is not the domain, once a domain was connected;
 *   - every address of a website that is not live answered 200 with the
 *     Coming soon page, where only its front page should;
 *   - a renamed product's old address drew the product, 200, naming itself
 *     canonical, beside the new one;
 *   - an imported theme's page under a handle the spam rules hold back said
 *     index, while a Storelib theme's said noindex;
 *   - an imported theme's canonical named /collections/<c>/products/<p> and,
 *     on a page in another language, the default language's page;
 *   - a publish that dropped pages, and a page deleted from a live site,
 *     never told IndexNow about the addresses that went.
 *
 * Held here with the rules around them that were already right, so the
 * whole of a website's search story is in one place.
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  listedPageKeys,
  pageUrl,
  productUrl,
  robotsTxt,
  sitemapChunks,
  sitemapIndexXml,
  sitemapXml,
  SITEMAP_CHUNK_URLS,
  SITEMAP_CHUNK_BYTES,
  type SitemapEntry,
} from "@/lib/website-builder/site-seo"
import { addressesAt, goneAddresses, pagePath } from "@/lib/website-builder/site-changes"
import { domainAddress, sendsToDomain } from "@/lib/custom-domains/subdomain-redirect"
import { canonicalPath } from "@/lib/storelib-theme/compat/theme"
import { withSearchHead } from "@/lib/storelib-theme/compat/search-head"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    const d = typeof detail === "string" ? detail : JSON.stringify(detail)
    console.log(`  FAIL  ${name}${d ? `\n        ${d.slice(0, 900)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const O = "https://www.astrid.com"

console.log("\nOne indexable host per website")
{
  const page = { method: "GET", pathname: "/about", search: "?ref=ig", fetchDest: "document" }
  check("a page opened at the Storelib address goes to the website's domain", sendsToDomain(page) && domainAddress("www.astrid.com", "/about", "?ref=ig") === "https://www.astrid.com/about?ref=ig")
  check("  never a checkout, a receipt, an API call, a preview or a framed page",
    [
      { ...page, pathname: "/checkout" },
      { ...page, pathname: "/receipt/abc" },
      { ...page, pathname: "/api/website-builder/subscribe" },
      { ...page, pathname: "/preview/tok/about" },
      { ...page, search: "?preview=tok" },
      { ...page, fetchDest: "iframe" },
      { ...page, method: "POST" },
    ].every((r) => !sendsToDomain(r)))
  check("  nor a file, robots.txt and the sitemap among them (they are answered on their own)", !sendsToDomain({ ...page, pathname: "/sitemap.xml" }) && !sendsToDomain({ ...page, pathname: "/robots.txt" }))
  const proxy = read("proxy.ts")
  check("the Storelib address's sitemap goes to the domain's once one is connected",
    /if \(pathname === "\/sitemap\.xml" && \(request\.method === "GET" \|\| request\.method === "HEAD"\) && !\(await hasLiveAiSite\(subdomain\)\)\) \{\s*const domain = await websiteDomainOf\(subdomain\)\s*if \(domain\) return NextResponse\.redirect\(domainAddress\(domain, pathname, search\), \{ status: 302 \}\)/.test(proxy))
  check("  and it is asked before the sitemap is rewritten to the website's", proxy.indexOf('if (pathname === "/sitemap.xml" && (request.method') < proxy.indexOf('const seoFile = pathname === "/robots.txt" || pathname === "/sitemap.xml"'))
  check("only a live, primary website domain is that domain (a domain still verifying is not)", /\.eq\("is_primary", true\)\s*\.eq\("status", "active"\)/.test(proxy.slice(proxy.indexOf("async function websiteDomainOf"), proxy.indexOf("async function websiteDomainOf") + 2000)))
  check("an apex domain answers a 301 to www, pages only", /isExternalDomain && !hostWithoutPort\.startsWith\("www\."\) && isApexHost\(hostWithoutPort\)/.test(proxy) && /return NextResponse\.redirect\(canonicalUrl, \{ status: 301 \}\)/.test(proxy))
  check("a second domain answers a 308 to the primary one", /if \(connected\.redirectTo && !isApiCall && !isReservedPath\(pathname\)\)/.test(proxy) && /\.eq\("is_primary", true\)\s*\.eq\("status", "active"\)\s*\.maybeSingle\(\)\s*const primaryDomain/.test(proxy))
  const data = read("lib/website-builder/site-seo-data.ts")
  check("every page's canonical, sitemap and robots.txt name the primary domain, else the Storelib address",
    /const host = await primaryHostFor\(creatorId, "website"\)\.catch\(\(\) => null\)/.test(data) && /const origin = host \?\? `\$\{\(handle \?\? name\)\.toLowerCase\(\)\}\.\$\{getMainDomain\(\)\}`/.test(data))
  check("so a second host's robots.txt names the primary's sitemap, never its own duplicates", robotsTxt(O, true).includes(`Sitemap: ${O}/sitemap.xml`))
  check("storelib.com/w/<name> is not crawled (storelib.com's robots.txt) and its pages name the primary as canonical",
    /"w",/.test(read("lib/seo/indexing.ts")) && /alternates: \{ canonical: url,/.test(read("app/(site)/w/[username]/render-site.tsx")))
}

console.log("\nA website that is not live")
{
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("every address but the front page of a website not live is a 404",
    /if \(found\.kind === "unpublished" && pageKey !== "home"\) notFound\(\)/.test(render) &&
      render.indexOf('found.kind === "unpublished" && pageKey !== "home"') < render.indexOf('found.kind === "unpublished") return <SiteNotPublished'))
  check("  its front page is Coming soon, kept out of search", /if \(found\.kind !== "site"\) \{\s*return \{ title: \{ absolute: siteStoreName\(\{ displayName: creator\.displayName, handle: defaultHandle \}\) \}, robots: \{ index: false, follow: true \} \}/.test(render))
  check("a name nobody has (a deleted account) is a 404, a renamed one a 308", /if \(found\.kind === "missing"\) notFound\(\)/.test(render) && /if \(found\.kind === "renamed"\) permanentRedirect\(/.test(render))
  check("a banned creator's name is nobody's", (read("lib/website-builder/published-site.ts").match(/if \(isBanned\(/g) ?? []).length >= 3)
  const robots = read("app/(site)/w/[username]/robots.txt/route.ts")
  check("its robots.txt names no sitemap, and its sitemap is a 404",
    /seo\.kind === "site" \? robotsTxt\(seo\.origin, seo\.indexable\) : "User-agent: \*\\nAllow: \/\\n"/.test(robots) &&
      /if \(seo\.kind !== "site"\) return new Response\("Not found", \{ status: 404 \}\)/.test(read("app/(site)/w/[username]/sitemap.xml/route.ts")))
  const data = read("lib/website-builder/site-seo-data.ts")
  check("a website behind a password, or hidden from search, lists nothing", /&& access\?\.enabled !== true/.test(data) && /if \(indexable\) \{/.test(data))
  check("a preview is never indexed, and never crawled", /return \{ title: \{ absolute: title \}, robots: \{ index: false, follow: false \} \}/.test(render) && !robotsTxt(O, true).split("\n").every((l) => l !== "Disallow: /preview/"))
}

console.log("\nA missing page is a real 404")
{
  const sub = read("app/(site)/w/[username]/[page]/page.tsx")
  check("an address no page could have is a 404, and /home is the front page", /if \(!key\) notFound\(\)/.test(sub) && /redirect\(locale \? `\/\$\{locale\}` : "\/"\)/.test(sub))
  check("a page the website does not have comes back missing, and is a 404", /if \(!original\) return \{ kind: "missing" \}/.test(read("lib/website-builder/published-site.ts")))
  check("a product that is not the website's, or not published, is a 404", /if \(owner && found\.creator_id !== owner\.creatorId\) notFound\(\)/.test(read("components/website-builder/theme/render-product.tsx")) && /if \(!install\) notFound\(\)/.test(read("components/website-builder/theme/render-product.tsx")))
  check("the website's own 404 page is drawn without changing the status", /"X-Robots-Tag": "noindex"/.test(read("app/(site)/w/[username]/not_found/route.ts")))
}

console.log("\nA renamed product has one address")
{
  const product = read("app/(site)/w/[username]/products/[slug]/page.tsx")
  const render = read("components/website-builder/theme/render-product.tsx")
  check("the old slug answers a 308 to the new one, in the page's language",
    /const renamed = await renamedProductSlug\(slug, creator\.creatorId\)/.test(product) &&
      /permanentRedirect\(pageLocale && langs \? localizedPath\(path, pageLocale, langs\.defaultLanguage\) : path\)/.test(product) &&
      product.indexOf("renamedProductSlug(slug, creator.creatorId)") < product.indexOf("renderProduct(slug,"))
  check("  found through the same read the page makes (product_slug_history, held to the owner)",
    /export async function renamedProductSlug\(slug: string, creatorId: string\)[\s\S]{0,200}fetchProductBySlug\(slug, creatorId\)[\s\S]{0,120}found\?\.slug && found\.slug !== slug \? found\.slug : null/.test(render))
}

console.log("\nThe sitemap, at any size")
{
  const entries: SitemapEntry[] = Array.from({ length: 100_001 }, (_, i) => ({ loc: productUrl(O, `p-${i}`), lastmod: "2026-10-01T00:00:00.000Z" }))
  const chunks = sitemapChunks(entries)
  check("a hundred thousand addresses are three files, none past the limit", chunks.length === 3 && chunks.every((c) => c.length <= SITEMAP_CHUNK_URLS) && chunks.reduce((n, c) => n + c.length, 0) === entries.length, chunks.map((c) => c.length))
  check("  every address once, in order", chunks.flat().every((e, i) => e.loc === entries[i].loc))
  const index = sitemapIndexXml(chunks.map((_, i) => `${O}/sitemap.xml?page=${i + 1}`))
  check("  named by an index on the website's own host", (index.match(/<sitemap><loc>/g) ?? []).length === 3 && index.includes(`<loc>${O}/sitemap.xml?page=3</loc>`) && index.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex'))
  const one = sitemapXml(chunks[0])
  check("  each file a urlset with real lastmod values", (one.match(/<url>/g) ?? []).length === SITEMAP_CHUNK_URLS && (one.match(/<lastmod>2026-10-01T00:00:00\.000Z<\/lastmod>/g) ?? []).length === SITEMAP_CHUNK_URLS)
  const heavy: SitemapEntry[] = Array.from({ length: 4000 }, (_, i) => ({
    loc: productUrl(O, `p-${i}`),
    alternates: ["en", "fr", "de", "es", "it", "nl", "pt", "sv"].map((l) => ({ hreflang: l, href: `${O}/${l}/products/p-${i}/${"x".repeat(2000)}` })),
  }))
  const heavyChunks = sitemapChunks(heavy)
  check("a website in many languages splits by size before it passes 50MB", heavyChunks.length > 1 && heavyChunks.every((c) => sitemapXml(c).length <= SITEMAP_CHUNK_BYTES + 1000), heavyChunks.map((c) => c.length))
  const route = read("app/(site)/w/[username]/sitemap.xml/route.ts")
  check("the route answers the index for more than one file, each file by ?page=, and a 404 past the last",
    /else body = sitemapIndexXml\(chunks\.map\(\(_, i\) => `\$\{seo\.origin\}\/sitemap\.xml\?page=\$\{i \+ 1\}`\)\)/.test(route) && /return new Response\("Not found", \{ status: 404 \}\)/.test(route))
  const data = read("lib/website-builder/site-seo-data.ts")
  check("products are read to 50,000, a thousand per request, each page held on its own under the shop's tag",
    /export const MAX_LISTED_PRODUCTS = 50_000/.test(data) && /\["site-seo-products", creatorId, String\(from\)\]/.test(data) && /\.order\("id", \{ ascending: true \}\)\s*\.range\(from, from \+ PRODUCT_PAGE - 1\)/.test(data) && /tags: \[creatorShopTag\(creatorId\)\], revalidate: shopHoldSeconds\(\)/.test(data)) /* Changed on purpose (r54): the shop's hold. */
  check("  each page small enough for the data cache (pictures capped)", /gallery_urls: \(p\.gallery_urls \?\? \[\]\)\.slice\(0, LISTED_IMAGES\)/.test(data) && /const LISTED_IMAGES = 10/.test(data))
  check("  once each, and not one taken off the Online store", /!off\.has\(p\.id \?\? ""\) && !seen\.has\(p\.slug\)/.test(data))
  check("collections are read past 200, a thousand at a time", !/\.limit\(200\)/.test(data) && /const MAX_LISTED_COLLECTIONS = 10_000/.test(data) && /\.from\("product_collections"\)[\s\S]{0,300}\.range\(from, from \+ PRODUCT_PAGE - 1\)/.test(data))
  check("pages, the shop and products carry the time they changed", /pageLastmod\(times\.pages\[key\], times\.publishedAt\)/.test(data) && /p\.updated_at \? \{ lastmod: new Date\(p\.updated_at\)\.toISOString\(\) \}/.test(data))
  check("home first, never the cart, search, account or the product template", listedPageKeys(["cart", "about", "home", "search", "account", "product", "login", "wishlist"]).join() === "home,about")
  check("an imported theme's empty templates are not pages", listedPageKeys(["home", "collection", "page", "blog", "article", "faq"], { imported: true }).join() === "home,faq")
  check("a page is /<key>, home is /", pageUrl(O, "home") === `${O}/` && pageUrl(O, "faq") === `${O}/faq`)
}

console.log("\nAn imported theme's head")
{
  check("a product reached from a collection names the product's own page", canonicalPath("/collections/summer/products/tee") === "/products/tee" && canonicalPath("/products/tee") === "/products/tee" && canonicalPath("/collections/summer") === "/collections/summer")
  const i18n = { locale: "fr", defaultLanguage: "en", languages: ["en", "fr"] } as never
  check("a page in another language is its own canonical", canonicalPath("/about", i18n) === "/fr/about" && canonicalPath("/", i18n) === "/fr" && canonicalPath("/about", { locale: "en", defaultLanguage: "en", languages: ["en", "fr"] } as never) === "/about")
  const theme = read("lib/storelib-theme/compat/theme.ts")
  check("  on the website's primary host", /canonical_url: page\.canonicalHost \?\? page\.host \? `https:\/\/\$\{page\.canonicalHost \?\? page\.host\}\$\{canonicalPath\(page\.path, page\.i18n\)\}\$\{pagedCanonical\(page\)\}`/.test(theme))
  check("  and its languages (hreflang) name the same path", /const own = canonicalPath\(path\)/.test(read("lib/storelib-theme/compat/site.ts")))
  const compat = read("lib/website-builder/compat-site.ts")
  check("a handle the spam rules hold back says noindex on every page, as a Storelib theme's do",
    /const heldBack = !builtSiteIndexable\(\{\}, name\)/.test(compat) && /return heldBack \? \{ \.\.\.seo, noindex: true \} : seo/.test(compat))
  const out = withSearchHead(`<html><head><title>T</title><meta name="robots" content="index"></head><body></body></html>`, { noindex: true })
  check("noindex is said once, and replaces the theme's own", (out.match(/name="robots"/g) ?? []).length === 1 && /content="noindex, follow"/.test(out))
}

console.log("\nSearch engines are told what changed")
{
  const before = [`${O}/`, `${O}/about`, `${O}/faq`, `${O}/products/tee`]
  const after = [`${O}/`, `${O}/about`, `${O}/products/tee`, `${O}/contact`]
  check("a publish announces the addresses that went", JSON.stringify(goneAddresses(before, after)) === JSON.stringify([`${O}/faq`]) && goneAddresses(after, after).length === 0)
  check("a page is announced at its own address", pagePath("home") === "/" && pagePath("faq") === "/faq" && JSON.stringify(addressesAt(before, [pagePath("faq")])) === JSON.stringify([`${O}/faq`]) && JSON.stringify(addressesAt(before, ["/"])) === JSON.stringify([`${O}/`]))
  check("  an address that is not one is passed over", addressesAt(["not a url", `${O}/faq`], ["/faq"]).length === 1)
  const publish = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  check("publish and take down announce every page of the website, after the answer", (publish.match(/after\(\(\) => announce\(\(\) => websiteAddresses\(announced\)\)\)/g) ?? []).length === 2)
  check("  publish also the ones it took down, read before it, only when IndexNow is on",
    /const liveBefore = indexNowKey\(\) \? websiteAddresses\(creator\.id\)\.catch\(\(\) => \[\] as string\[\]\) : null/.test(publish) &&
      /if \(liveBefore\) after\(\(\) => announce\(async \(\) => goneAddresses\(await liveBefore, await websiteAddresses\(announced\)\)\)\)/.test(publish) &&
      publish.indexOf("const liveBefore") < publish.indexOf('.update({ status: "published"'))
  const sections = read("app/api/website-builder/themes/[installId]/sections/route.ts")
  check("a page deleted from the live website is announced, read before the delete",
    /const liveBefore = creatorId && indexNowKey\(\) \? addressesAt\(await websiteAddresses\(creatorId\)\.catch\(\(\) => \[\] as string\[\]\), \[pagePath\(pageKey\)\]\) : \[\]/.test(sections) &&
      sections.indexOf("const liveBefore") < sections.indexOf('.from("store_theme_pages")\n    .delete()') &&
      /if \(liveBefore\.length > 0\) after\(\(\) => announce\(async \(\) => liveBefore\)\)/.test(sections))
  check("a page published on its own is announced", /if \(indexNowKey\(\)\) after\(\(\) => announce\(async \(\) => addressesAt\(await websiteAddresses\(announced\), \[pagePath\(page_key\)\]\)\)\)/.test(sections))
  check("a release put back is announced", /after\(\(\) => announce\(\(\) => websiteAddresses\(creatorId\)\)\)/.test(read("app/api/website-builder/themes/[installId]/releases/[releaseId]/restore/route.ts")))
  check("the addresses are the sitemap's, on the primary host", /const seo = await siteSeo\(handle\)/.test(read("lib/seo/sitemaps.ts")))
  check("nothing new is loaded by a module every route shares", !/site-changes|lib\/seo\/announce/.test(read("proxy.ts")) && !/lib\/seo\/announce/.test(read("lib/website-builder/published-site.ts")))
}

console.log("\nStructured data, once and true")
{
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("the website and its owner once, on the front page", /pageKey === "home" \? homeStructuredData\(site, username\) : null/.test(render))
  const product = read("app/(site)/w/[username]/products/[slug]/page.tsx")
  check("a product page: the product and its breadcrumb, once each", (product.match(/application\/ld\+json/g) ?? []).length === 2 && /breadcrumbJsonLd\(\[/.test(product))
  check("a rating only from real reviews", /const rated = p\.rating && p\.rating\.count > 0 && p\.rating\.average > 0 \? p\.rating : null/.test(read("lib/website-builder/site-seo.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
