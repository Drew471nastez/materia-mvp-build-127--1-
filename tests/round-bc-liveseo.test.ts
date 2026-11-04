/**
 * ===========================================================================
 *  ROUND BC: A PUBLISHED WEBSITE AS SEARCH ENGINES AND SHARE CARDS READ IT
 * ===========================================================================
 * Measured on andrewrullz.storelib.com (an imported theme) before this round:
 *
 *   - no page had an og:image or twitter:image, not even a product page, so
 *     every share was a bare line of text;
 *   - the theme's Product JSON-LD named its pictures "https:/_next/image?…",
 *     an address that goes nowhere, and there was no BreadcrumbList, no
 *     WebSite or Organization anywhere;
 *   - the front page and the About page had no meta description;
 *   - the password page was indexable and named language versions of itself;
 *   - a phone's home screen icon was missing on every page that drew a tab icon;
 *   - the sitemap listed /collection, /page and /article (theme templates
 *     drawn with nothing in them), and no page or collection had a lastmod;
 *   - a website behind a password still had a sitemap of pages nobody could read.
 *
 * A Storelib theme's product and collection pages had no BreadcrumbList.
 *
 * Run with:  npx tsx --conditions react-server tests/round-bc-liveseo.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { withSearchHead, isFullImageUrl } from "../lib/storelib-theme/compat/search-head"
import { compatSearchHead, fullImageUrl, type CompatSearchSite } from "../lib/website-builder/compat-search"
import { breadcrumbJsonLd } from "../lib/website-builder/breadcrumbs"
import { listedPageKeys, pageLastmod, robotsTxt, TEMPLATE_PAGE_KEYS } from "../lib/website-builder/site-seo"
import { withSiteIcon } from "../lib/website-builder/site-icon"
import { CompatTheme, wrapCompatTemplate, type CompatPage } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { TOUCH_PREFETCH_MAX, TOUCH_PREFETCH_STARTER, withTouchPrefetch } from "../lib/storelib-theme/compat/touch-prefetch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const lds = (html: string) => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]) } catch { return { unparsed: m[1] } } })

const ORIGIN = "https://shop.example.com"
const PRODUCT = {
  id: "11111111-1111-4111-8111-111111111111",
  settings: { title: "Black Sleeves", slug: "black-sleeves", url: "/products/black-sleeves", price: 503, available: true, images: ["https://storelib.com/media/product-images/a/tee.webp", "https://storelib.com/media/product-images/a/tee-2.webp"], description: "A best selling tee." },
  descriptionHtml: "<p>A best selling <b>tee</b>.</p>",
}
const REVIEWS = { enabled: true, sample: false, product: { summary: { count: 2, average: 4.5 }, items: [{ author: "Maya R.", rating: 5, body: "Great", title: "Love it", iso: "2026-09-30T10:00:00Z" }, { author: "Jonas", rating: 4, body: "Good", iso: "2026-09-20T10:00:00Z" }] } }
const site: CompatSearchSite = {
  origin: ORIGIN,
  storeName: "BESTSHOPS",
  shareImage: "https://cdn.shopify.com/s/files/hero.png",
  logo: "https://storelib.com/media/logo.png",
  currency: "BRL",
  pageSeo: (key) => (key === "about" ? { description: "About our shop" } : null),
  keyOf: (path) => (path === "/" ? "home" : path.match(/^\/([a-z0-9-]+)$/)?.[1] ?? null),
}
const page = (extra: Partial<CompatPage>): CompatPage => ({ template: "page", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "BESTSHOPS" }, ...extra }) as CompatPage

async function main() {
console.log("\nA share picture a card can fetch\n")
{
  check("an image the site serves through /_next/image is the picture itself", fullImageUrl("/_next/image?url=https%3A%2F%2Fstorelib.com%2Fmedia%2Fx.webp&w=1920&q=90", ORIGIN) === "https://storelib.com/media/x.webp")
  check("  and the same with the host in front", fullImageUrl("https://shop.example.com/_next/image?url=https%3A%2F%2Fstorelib.com%2Fmedia%2Fx.webp&w=32", ORIGIN) === "https://storelib.com/media/x.webp")
  check("a //host address takes https", fullImageUrl("//cdn.shopify.com/s/x.png", ORIGIN) === "https://cdn.shopify.com/s/x.png")
  check("a path takes the site's own origin", fullImageUrl("/media/x.png", ORIGIN) === `${ORIGIN}/media/x.png`)
  check("the theme's broken https:/_next/image is not a full address", !isFullImageUrl("https:/_next/image?url=x") && isFullImageUrl("https://a.b/c.png"))
}

console.log("\nThe head an imported theme left short\n")
{
  const theme = `<html><head><title>x</title><meta name="description" content=""><meta property="og:image" content="http:/_next/image?url=x"><script type="application/ld+json">{"@context":"http://schema.org/","@type":"Product","image":["https:/_next/image?url=x"]}</script><script type="application/ld+json">{"@type":"FAQPage"}</script></head><body><script type="application/ld+json">{"@type": "BreadcrumbList"}</script></body></html>`
  const out = withSearchHead(theme, { description: "A shop", image: "https://cdn.x/a.png", noindex: true, jsonLd: ['{"@type":"Product","name":"Ours"}'] })
  check("an empty meta description is replaced by the page's", !/content=""/.test(out) && /<meta name="description" content="A shop"/.test(out))
  check("a share picture with no host is taken out, ours put in, for Open Graph and X", !/http:\/_next/.test(out) && /<meta property="og:image" content="https:\/\/cdn\.x\/a\.png"/.test(out) && /<meta name="twitter:image" content="https:\/\/cdn\.x\/a\.png"/.test(out))
  check("the theme's Product and BreadcrumbList structured data give way to Storelib's", !/https:\/_next/.test(out) && !/"BreadcrumbList"/.test(out) && /"name":"Ours"/.test(out))
  check("  anything else it describes (an FAQ) stays", /"@type":"FAQPage"/.test(out))
  check("noindex is said once", (out.match(/name="robots"/g) ?? []).length === 1 && /content="noindex, follow"/.test(out))
  const kept = withSearchHead(`<html><head><meta name="description" content="Theme's own"><meta property="og:image" content="https://cdn.x/own.png"></head><body></body></html>`, { description: "Ours", image: "https://cdn.x/ours.png" })
  check("a theme's own description and picture are kept", /Theme's own/.test(kept) && !/content="Ours"/.test(kept) && /own\.png/.test(kept) && !/ours\.png" data-storelib-seo><meta property="og:image"/.test(kept))
  check("  and X's card gets the picture the theme left it without", /<meta name="twitter:image" content="https:\/\/cdn\.x\/ours\.png"/.test(kept))
  check("no head, nothing done", withSearchHead("<div>x</div>", { description: "d" }) === "<div>x</div>")
  check("nothing to add, the page as it came", withSearchHead("<html><head></head></html>", null) === "<html><head></head></html>")
}

console.log("\nWhat each page says (lib/website-builder/compat-search.ts)\n")
{
  const product = compatSearchHead(site, page({ template: "product", path: "/products/black-sleeves", product: PRODUCT, reviews: REVIEWS }), "/products/black-sleeves")!
  const [ld, crumbs] = (product.jsonLd ?? []).map((s) => JSON.parse(s))
  check("a product page shares the product's first photo", product.image === "https://storelib.com/media/product-images/a/tee.webp", product.image)
  check("  is described by its own words", product.description === "A best selling tee.", product.description)
  check("Product: name, url, real pictures", ld["@type"] === "Product" && ld.name === "Black Sleeves" && ld.url === `${ORIGIN}/products/black-sleeves` && ld.image.length === 2 && ld.image.every((u: string) => u.startsWith("https://storelib.com/")), ld)
  check("  an Offer with the price, the store's currency and stock", ld.offers?.price === "5.03" && ld.offers.priceCurrency === "BRL" && ld.offers.availability === "https://schema.org/InStock", ld.offers)
  check("  and the Storelib Reviews rating with the reviews", ld.aggregateRating?.ratingValue === "4.5" && ld.aggregateRating.reviewCount === 2 && ld.review?.length === 2 && ld.review[0].author.name === "Maya R.", ld.aggregateRating)
  check("a BreadcrumbList: the site, its products, the product", crumbs["@type"] === "BreadcrumbList" && crumbs.itemListElement.length === 3 && crumbs.itemListElement[0].item === `${ORIGIN}/` && crumbs.itemListElement[2].item === `${ORIGIN}/products/black-sleeves` && crumbs.itemListElement[2].position === 3, crumbs)
  const sample = compatSearchHead(site, page({ template: "product", path: "/products/black-sleeves", product: PRODUCT, reviews: { ...REVIEWS, sample: true } }), "/products/black-sleeves")!
  check("sample reviews never become a rating", !("aggregateRating" in JSON.parse(sample.jsonLd![0])))
  const off = compatSearchHead(site, page({ template: "product", path: "/products/black-sleeves", product: PRODUCT, reviews: { ...REVIEWS, enabled: false } }), "/products/black-sleeves")!
  check("  nor do reviews while the app is off", !("aggregateRating" in JSON.parse(off.jsonLd![0])))
  const sold = compatSearchHead(site, page({ template: "product", path: "/products/x", product: { ...PRODUCT, settings: { ...PRODUCT.settings, available: false } } }), "/products/x")!
  check("a sold out product says OutOfStock", JSON.parse(sold.jsonLd![0]).offers.availability === "https://schema.org/OutOfStock")

  const home = compatSearchHead(site, page({ template: "index", path: "/" }), "/")!
  const graph = JSON.parse(home.jsonLd![0])["@graph"]
  check("the front page: the WebSite and the Organization that owns it, with its logo", graph[0]["@type"] === "WebSite" && graph[0].url === `${ORIGIN}/` && graph[1]["@type"] === "Organization" && graph[1].logo === site.logo, graph)
  check("  shared with the site's picture, described even with no SEO description", home.image === site.shareImage && home.description === "Visit BESTSHOPS's website on Storelib" && !home.noindex)
  const about = compatSearchHead(site, page({ template: "page", suffix: "about", path: "/about", pageObject: { title: "About", content: "", handle: "about", url: "/pages/about" } }), "/about")!
  check("a page: its own description, a BreadcrumbList home › page", about.description === "About our shop" && JSON.parse(about.jsonLd![0]).itemListElement[1].name === "About")
  const coll = compatSearchHead(site, page({ template: "collection", path: "/collections/summer", collection: { id: "c", title: "Summer", handle: "summer", image: "/_next/image?url=https%3A%2F%2Fstorelib.com%2Fc.png&w=900", description: "<p>Hot</p>" } }), "/collections/summer")!
  check("a collection: its picture, its words, home › collections › it", coll.image === "https://storelib.com/c.png" && coll.description === "Hot" && JSON.parse(coll.jsonLd![0]).itemListElement[2].item === `${ORIGIN}/collections/summer`)

  check("the password page is noindex", compatSearchHead(site, page({ template: "password", path: "/password" }), "/password")?.noindex === true)
  check("a template with nothing in it is noindex: /collection, /article, /blog, /page", [
    compatSearchHead(site, page({ template: "collection", path: "/collection" }), "/collection"),
    compatSearchHead(site, page({ template: "article", path: "/article" }), "/article"),
    compatSearchHead(site, page({ template: "blog", path: "/blog" }), "/blog"),
    compatSearchHead(site, page({ template: "page", path: "/page" }), "/page"),
  ].every((h) => h?.noindex === true))
  check("the cart and search are left to robots.txt", compatSearchHead(site, page({ template: "cart", path: "/cart" }), "/cart") === null && compatSearchHead(site, page({ template: "search", path: "/search" }), "/search") === null)
}

console.log("\nDrawn through the site, as the live page is (lib/storelib-theme/compat/site.ts)\n")
{
  const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
  /* A head as Dawn's meta-tags.liquid writes it: og:image only from page_image, and the Product JSON-LD's pictures as "https:" + image_url. */
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><head><title>{{ page_title }}</title>{% if page_description %}<meta name="description" content="{{ page_description | escape }}">{% endif %}<link rel="canonical" href="{{ canonical_url }}"><link rel="icon" href="/t.png">{% if page_image %}<meta property="og:image" content="http:{{ page_image | image_url }}">{% endif %}{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>`),
    "sections/main-product.storelib": section("main-product", `<h1>{{ product.title }}</h1><script type="application/ld+json">{"@context":"http://schema.org/","@type":"Product","name":{{ product.title | json }},"image":["https:{{ product.featured_image | image_url: width: 1920 }}"]}</script>`),
    "sections/hero.storelib": section("hero", `<h1>Home</h1>`),
    "sections/pw.storelib": section("pw", `<form>password</form>`),
  }
  const sd: SiteData = {
    creatorId: "c",
    theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }),
    pages: { home: [{ id: "hero", type: "hero" }], product: [{ id: "main", type: "main-product" }], password: [{ id: "pw", type: "pw" }] },
    products: [PRODUCT],
    collections: [],
    menus: {},
    shop: { name: "BESTSHOPS", currency: "BRL", moneyFormat: "R${{amount}}" },
    host: "andrewrullz.storelib.com",
    canonicalHost: "shop.example.com",
    icon: "https://storelib.com/media/favicon.png",
    i18n: { locale: "en", defaultLanguage: "en", languages: ["en", "ro"] } as never,
    product: async () => PRODUCT,
    searchHead: (p, path) => compatSearchHead(site, p, path),
  }
  const get = async (path: string) => String((await answer(sd, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  const productHtml = await get("/products/black-sleeves")
  const found = lds(productHtml)
  check("the product page has one Product, Storelib's, with real pictures", found.filter((x) => x["@type"] === "Product").length === 1 && !/https:\/_next/.test(productHtml) && found.find((x) => x["@type"] === "Product")?.image?.[0] === "https://storelib.com/media/product-images/a/tee.webp", found)
  check("  and its BreadcrumbList", found.some((x) => x["@type"] === "BreadcrumbList"))
  check("  a share picture, the product's", /<meta property="og:image" content="https:\/\/storelib\.com\/media\/product-images\/a\/tee\.webp"/.test(productHtml))
  check("  the theme's own description kept, not doubled", (productHtml.match(/name="description"/g) ?? []).length === 1)
  check("  and the home screen icon beside the theme's tab icon", /<link rel="apple-touch-icon" sizes="180x180" href="https:\/\/storelib\.com\/media\/favicon\.png">/.test(productHtml) && /<link rel="icon" href="\/t\.png">/.test(productHtml))
  const homeHtml = await get("/")
  check("the front page: a description, a picture and the WebSite", /name="description" content="Visit BESTSHOPS/.test(homeHtml) && /og:image" content="https:\/\/cdn\.shopify\.com\/s\/files\/hero\.png"/.test(homeHtml) && lds(homeHtml).some((x) => x["@graph"]?.[0]?.["@type"] === "WebSite"))
  check("  and its language versions (hreflang)", /hreflang="ro"/.test(homeHtml))
  const pw = await get("/password")
  check("the password page is noindex and names no language versions of itself", /<meta name="robots" content="noindex, follow"/.test(pw) && !/hreflang=/.test(pw))
  const noSearch = await answer({ ...sd, searchHead: undefined }, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
  check("with no searchHead (the builder, a preview) the page is as the theme drew it", !/data-storelib-seo/.test(String(noSearch.body)))
}

console.log("\nThe sitemap and robots.txt\n")
{
  const keys = ["home", "about", "collection", "page", "article", "blog", "collections", "home-new", "cart"]
  check("an imported theme's template pages are not listed", JSON.stringify(listedPageKeys(keys, { imported: true })) === JSON.stringify(["home", "about", "collections", "home-new"]), listedPageKeys(keys, { imported: true }))
  check("  a Storelib theme's page called blog or page is the creator's, and is", listedPageKeys(keys).includes("blog") && listedPageKeys(keys).includes("page"))
  check("  the four template keys", [...TEMPLATE_PAGE_KEYS].sort().join() === "article,blog,collection,page")
  check("a page's lastmod is the earlier of its last edit and the publish", pageLastmod("2026-10-20T00:00:00Z", "2026-10-10T00:00:00Z") === "2026-10-10T00:00:00.000Z" && pageLastmod("2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z") === "2026-10-01T00:00:00.000Z")
  check("  either alone, and nothing when neither is known", pageLastmod(null, "2026-10-10T00:00:00Z") === "2026-10-10T00:00:00.000Z" && pageLastmod(undefined, null) === undefined && pageLastmod("nonsense", null) === undefined)
  const data = code("lib/website-builder/site-seo-data.ts")
  check("pages, the shop page and collections carry a lastmod", /pageLastmod\(times\.pages\[key\], times\.publishedAt\)/.test(data) && /entries\.push\(\{ loc: shop, \.\.\.\(newest \?/.test(data) && /const shop = shopUrl\(origin, \{ imported \}\)/.test(data) && /collections\/\$\{c\.handle\}`, \.\.\.\(c\.lastmod \?/.test(data))
  check("  the page times held with the site, cleared by a publish", /\["site-seo-page-times", installId\],\s*\{ tags: \[creatorSiteTag\(creatorId\)\]/.test(data))
  check("a website behind a password is not indexable: no sitemap, robots.txt names none", /readSiteAccess\(createAdminClient\(\), site\.creatorId\)/.test(data) && /&& access\?\.enabled !== true/.test(data) && !robotsTxt(ORIGIN, false).includes("Sitemap"))
  check("the sitemap's template rule is the imported theme's only", /listedPageKeys\(Object\.keys\(site\.pages\), \{ imported \}\)/.test(data) && /const imported = !!compatOf\(site\.themeSettings\)/.test(data))
}

console.log("\nA Storelib theme's pages\n")
{
  const b = breadcrumbJsonLd([{ name: "Shop", url: `${ORIGIN}/` }, { name: " ", url: `${ORIGIN}/x` }, { name: "Tee", url: "/rel" }, { name: "Tee", url: `${ORIGIN}/products/tee` }])
  check("a breadcrumb leaves out a step with no name or no full address, and numbers the rest", b.itemListElement.length === 2 && b.itemListElement[1].position === 2 && b.itemListElement[1].item === `${ORIGIN}/products/tee`)
  const product = code("app/(site)/w/[username]/products/[slug]/page.tsx")
  check("a product page prints a BreadcrumbList: the site, the shop, the product", /breadcrumbJsonLd\(\[\{ name: creator\.displayName, url: `\$\{origin\}\/` \}, \{ name: "Shop", url: `\$\{origin\}\/products` \}, \{ name: productName, url: productUrl\(origin, slug\) \}\]\)/.test(product) && /__html: crumbs/.test(product))
  const collection = code("app/(site)/w/[username]/collections/[handle]/collection-page.tsx")
  check("a collection page prints one: the site, collections, the collection", /\{ name: "Collections", url: `\$\{origin\}\/collections` \}, \{ name: collection\.title, url: `\$\{origin\}\/collections\/\$\{handle\}` \}/.test(collection) && /__html: crumbs/.test(collection))
}

console.log("\nWired into the live site (lib/website-builder/compat-site.ts)\n")
{
  const cs = code("lib/website-builder/compat-site.ts")
  check("searchHead only on the live site, where the website's own origin is known", /searchHead: origin\s*\?/.test(cs))
  check("the creator's photo is asked beside the rest, never a round trip in a row", /const avatarAsked = live \? quiet\(creatorAvatar\(/.test(cs) && cs.indexOf("const avatarAsked") < cs.indexOf("readInstall(admin, creator.creatorId)"))
  check("the share picture: logo, the front page's first picture, the photo", /export function compatShareImage\(/.test(cs))
  const st = code("lib/storelib-theme/compat/site.ts")
  check("site.ts adds what is missing after the theme draws, before the icon", /const out = withSearchHead\(route\.page\.template === "password" \? withoutShopifyMark\(drawn\.html\) : drawn\.html, site\.searchHead\?\.\(route\.page, path\)\)/.test(st) && /withTabTitle\(out,/.test(st))
  check("  the canvas's file imports nothing (the database side is compat-search.ts)", !/^import\b(?!\s+type\b)/m.test(code("lib/storelib-theme/compat/search-head.ts")))
}

console.log("\nOn a phone, the next page is fetched before the tap (lib/storelib-theme/compat/touch-prefetch.ts)\n")
  {
    const page = "<html><head></head><body><p>x</p></body></html>"
    const once = withTouchPrefetch(page)
    check("added once, just before the body ends", /<script data-storelib-touch-prefetch>[\s\S]*<\/script><\/body><\/html>$/.test(once) && withTouchPrefetch(once) === once)
    check("  a page with no body is left alone", withTouchPrefetch("<div>x</div>") === "<div>x</div>")
    check("the starter is valid script", (() => { try { new Function(TOUCH_PREFETCH_STARTER); return true } catch { return false } })())
    check("a touch screen only, never with Data Saver or under 4G", /matchMedia\("\(hover: none\)"\)/.test(TOUCH_PREFETCH_STARTER) && /c\.saveData/.test(TOUCH_PREFETCH_STARTER) && /effectiveType!=="4g"/.test(TOUCH_PREFETCH_STARTER))
    check("prefetch only, never prerender, as a list of the links in view", /prefetch:\[\{source:"list",urls:\[k\]\}\]/.test(TOUCH_PREFETCH_STARTER) && !/prerender/.test(TOUCH_PREFETCH_STARTER))
    check(`at most ${TOUCH_PREFETCH_MAX} pages, a link visible for a second, half of it in view`, TOUCH_PREFETCH_MAX === 3 && /WAIT=1000/.test(TOUCH_PREFETCH_STARTER) && /threshold:0\.5/.test(TOUCH_PREFETCH_STARTER) && /checkVisibility\(\{opacityProperty:true,visibilityProperty:true\}\)/.test(TOUCH_PREFETCH_STARTER))
    check("never the cart, checkout, account, the API, another site, a new tab, nofollow or data-no-prefetch", /cart\|checkout\|account\|api/.test(TOUCH_PREFETCH_STARTER) && /u\.origin!==location\.origin/.test(TOUCH_PREFETCH_STARTER) && /\[rel~=nofollow\],\[data-no-prefetch\]/.test(TOUCH_PREFETCH_STARTER) && /a\.target==="_blank"/.test(TOUCH_PREFETCH_STARTER))
    check("started after the page has loaded and gone idle", /addEventListener\("load",later/.test(TOUCH_PREFETCH_STARTER) && /requestIdleCallback/.test(TOUCH_PREFETCH_STARTER))
    const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the live route adds it to a page opened as a document, beside the desktop prerender", /if \(!runsThirdPartyScripts\(html\)\) html = withDesktopPrerender\(html\)\n[^\n]*\n\s+html = withTouchPrefetch\(html\)/.test(route))
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
