/**
 * ===========================================================================
 *  ROUND V1: A PUBLISHED WEBSITE THAT OPENS FAST AND MOVES FAST
 * ===========================================================================
 * The owner: "when I go to a URL of a published live website of Storelib it
 * takes too much to load ... navigation between pages on the live website
 * should be faster". Held here:
 *
 *   CACHE      the published routes are held (revalidate, no request reads,
 *              no fetchCache), the proxy's header on the front page matches,
 *              Publish and a product save clear what was held
 *   DATABASE   a page view through the real data path, over the fake
 *              PostgREST of scripts/speed18 and Next's cache kept as Next
 *              keeps it: a budget of round trips for the first visitor and
 *              none for the next one
 *   IMPORTED   an imported theme's page for a stranger, drawn once and handed
 *              on (stranger-hold.ts), never when it set a cookie; no five
 *              copies of an unsizeable picture in a srcset
 *   PICTURES   the first picture of a page eager and fetchpriority="high",
 *              the rest lazy; a website's pictures at quality 90
 *   LINKS      a link to another page of the site opens in place and is
 *              fetched ahead; the rest are left to the browser
 *   FAVICON    one value, read through faviconOf everywhere, written as an
 *              icon and an apple-touch-icon; no browser tab drawn beside the
 *              favicon tile
 *   TABS       a tab opened for the website says "Opening your website",
 *              never about:blank, and says why when it cannot
 *
 * The timings, the bundle and the bytes are measured by
 * scripts/check-live-speed.ts.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeFetch, setRtt, useFixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
import * as nextHeaders from "../scripts/speed18/shims/next-misc"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* Code without its comments, so a sentence about a thing is never taken for the thing. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)

const settle = () => Promise.allSettled(nextCache.pending.splice(0))

/** The most round trips a first visitor's page view may cost; the next visitor's is zero. */
const FIRST_VIEW_BUDGET = 30

function cacheRules() {
  section("Published pages are held, and say so")
  const routes = "app/(site)/w/[username]"
  for (const r of ["page.tsx", "[page]/page.tsx", "products/[slug]/page.tsx", "reviews/page.tsx"]) {
    const src = code(`${routes}/${r}`)
    check(`${r}: revalidate = 60`, /export const revalidate = 60/.test(src))
    check(`${r}: not drawn per visitor`, !/export const dynamic = "force-dynamic"/.test(src) && !/export const fetchCache/.test(src) && !/\bcookies\(\)|\bheaders\(\)/.test(src))
  }
  for (const r of ["page.tsx", "[page]/page.tsx", "products/[slug]/page.tsx"]) check(`${r}: every name may be generated on demand and kept`, /export function generateStaticParams\(\)/.test(code(`${routes}/${r}`)))
  const layout = code("app/(site)/layout.tsx")
  check("the site layout reads nothing from the request", !/\bcookies\(\)|\bheaders\(\)|searchParams/.test(layout))
  const renderSite = code(`${routes}/render-site.tsx`)
  check("a page's data is read through the admin client, never the visitor's cookies", !/@\/lib\/supabase\/server/.test(renderSite))
  const proxy = read("proxy.ts")
  check("the front page's CDN header matches the route's minute", /rewritten\.headers\.set\("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300"\)/.test(proxy))
  check("a visitor let in with a password is never in a shared cache", /if \(guarded\) rewritten\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy))
}

function publishClears() {
  section("Publish, and a product saved, clear what was held")
  const site = code("lib/website-builder/published-site.ts")
  check("Publish clears the site's data", /revalidateTag\(creatorSiteTag\(creatorId\), \{ expire: SITE_TTL \}\)/.test(site))
  check("and every rendered page, at every name the site answers to", /for \(const name of await siteNames\(creatorId\)\) revalidatePath\(`\/w\/\$\{name\}`, "layout"\)/.test(site))
  const publish = code("app/api/website-builder/themes/[installId]/publish/route.ts")
  check("the publish route calls it", /await revalidatePublishedSite\(creator\.id\)/.test(publish))
  const save = code("app/api/revalidate/route.ts")
  check("a product save clears the shop and the pages drawn from it", /revalidateTag\(creatorShopTag\(owned\.creator_id\), "max"\)/.test(save) && /await revalidatePublishedPages\(owned\.creator_id\)/.test(save))
  check("so does taking a product off the website channel", /await revalidatePublishedPages\(c\.creatorId\)/.test(code("app/api/store/channels/product/route.ts")))
  check("an imported theme's held stranger page goes with the site's and the shop's tags", /\[creatorSiteTag\(creator\.creatorId\), creatorShopTag\(creator\.creatorId\)\]/.test(code("app/api/site-theme/site/[username]/[[...path]]/route.ts")))
}

async function databaseBudget() {
  section("A page view's round trips to the database (fake PostgREST, Next's cache as Next keeps it)")
  const { publishedSiteByName, revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  const { siteMetadata, renderSite } = await import("@/app/(site)/w/[username]/render-site")
  nextCache.resetCache()
  useFixture(buildFixture())
  const pageView = () => visit(async () => {
    await siteMetadata(SITE.username, undefined, "home")
    return renderSite(SITE.username, undefined, "home")
  })
  const first = await pageView()
  await settle()
  const second = await pageView()
  await settle()
  check("the first visitor's page view renders", !first.error, String(first.error))
  check(`the first visitor's page view stays within ${FIRST_VIEW_BUDGET} round trips`, first.foreground > 0 && first.foreground <= FIRST_VIEW_BUDGET, { trips: first.foreground, tables: first.trips.map((t) => t.table) })
  check("the next visitor's costs none: everything it reads is held", second.foreground === 0, second.trips.map((t) => t.table))
  console.log(`        measured: ${first.foreground} round trips for the first view, ${second.foreground} for the next`)

  const data1 = await visit(() => publishedSiteByName(SITE.username, "about"))
  check("another page of the same site reads no more than the first did", data1.foreground <= first.foreground, data1.trips.map((t) => t.table))

  nextCache.purgedPaths.splice(0)
  await revalidatePublishedSite(SITE.creatorId)
  check("Publish purges the rendered site at its name", nextCache.purgedPaths.some((p) => p.path === `/w/${SITE.username}` && p.type === "layout"), nextCache.purgedPaths)
  const afterPublish = await visit(() => publishedSiteByName(SITE.username, "home"))
  await settle()
  check("and the site's data is read again for the next visitor (in the background at most)", afterPublish.foreground + afterPublish.background > 0)
}

async function strangerHold() {
  section("An imported theme's page for a stranger, drawn once (lib/storelib-theme/compat/stranger-hold.ts)")
  const { heldStrangerPage, strangerKey } = await import("@/lib/storelib-theme/compat/stranger-hold")
  nextCache.resetCache()
  let draws = 0
  const big = `<!doctype html><html><head></head><body>${"<p>page</p>".repeat(20000)}</body></html>`
  const draw = async () => {
    draws++
    return { status: 200, headers: [["content-type", "text/html"], ["cache-control", "public, s-maxage=60"]] as [string, string][], body: big, share: true }
  }
  const key = strangerKey("Maya", ["~anon~maya.storelib.com~US~_~_"], "")
  const tags = ["published-site:c1", "shop-products:c1"]
  const a = await heldStrangerPage(key, tags, draw)
  const b = await heldStrangerPage(key, tags, draw)
  check("drawn for the first stranger", a.held === false && a.body === big)
  check("handed to the next one without a draw, byte for byte", b.held === true && b.body === big && draws === 1)
  const stored = nextCache.cacheEntries().find((e) => e.key.includes("compat-stranger-page"))
  check("kept compressed, well under the data cache's 2MB item", !!stored && JSON.stringify(stored.value).length < big.length / 4, stored ? JSON.stringify(stored.value).length : null)
  check("under the site's and the shop's tags", !!stored && stored.tags.join(",") === tags.join(","))
  nextCache.revalidateTag("published-site:c1", { expire: 0 })
  const c = await heldStrangerPage(key, tags, draw)
  await settle()
  check("Publish (the site's tag) means a new draw", draws === 2 || (c.held && draws === 2), { draws })

  let privateDraws = 0
  const cookieKey = strangerKey("maya", ["~anon~maya.storelib.com~US~_~_", "cart"], "")
  const withCookie = async () => {
    privateDraws++
    return { status: 200, headers: [["set-cookie", "x=1"]] as [string, string][], body: "mine", share: false }
  }
  await heldStrangerPage(cookieKey, tags, withCookie)
  const again = await heldStrangerPage(cookieKey, tags, withCookie)
  check("an answer that is not everybody's is drawn for each visitor, never reused", privateDraws === 2 && again.held === false)
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the route checks the seal and the marker before it looks anything up", /if \(!\(await siteSealed\(req\.headers\.get\(SITE_SEAL_HEADER\), username, host\)\)\) return handle\(req, ctx\)/.test(route) && /stranger\.host !== host/.test(route))
  check("and shares only a plain 200 marked public with no cookie", /share: res\.status === 200 && res\.headers\.get\("Cache-Control"\) === PUBLIC_PAGE_CACHE && !res\.headers\.has\("Set-Cookie"\)/.test(route))
  check("GET goes through the hold; POST and HEAD never do", /export const GET = timed\("sites", "\/api\/site-theme\/site", handleHeld\)/.test(route) && /export const POST = timedHandle/.test(route) && /export const HEAD = handle/.test(route))
}

async function importedPictures() {
  section("An imported theme's pictures")
  const { compatFilter } = await import("@/lib/storelib-theme/compat/filters")
  const tag = compatFilter("image_tag")!
  const flag = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E"
  const flagTag = String(tag(flag, [], {}, undefined as never))
  check("a picture the optimizer cannot size has no srcset of five copies of itself", !/srcset=/.test(flagTag) && flagTag.length < flag.length + 80, flagTag)
  const photo = "https://storelib.com/media/product-images/a/b.jpg"
  const photoTag = String(tag(photo, [], {}, undefined as never))
  check("a photograph still has its widths, through the optimizer at quality 90", /srcset="[^"]*w=384&amp;q=90 352w/.test(photoTag) || /srcset="[^"]*q=90/.test(photoTag), photoTag)
  const { tidyHead } = await import("@/lib/storelib-theme/compat/site")
  const tidied = tidyHead(`<head><link rel="preload" as="font" href="" type="font/woff2" crossorigin><link rel="preload" as="image" href="/a.png"></head>`)
  check("a preload with no address is dropped, one with an address kept", !/href=""/.test(tidied) && /href="\/a\.png"/.test(tidied), tidied)
}

async function firstPicture() {
  section("The first picture of a page is asked for first")
  const { heroMedia, eagerMedia, optimizeSectionMedia } = await import("@/lib/website-builder/media-pass")
  const passed = optimizeSectionMedia(`<section><img src="https://storelib.com/media/a.jpg" alt=""><img src="https://storelib.com/media/b.jpg" alt=""></section>`)
  check("the pass makes pictures lazy, with sizes and a srcset at quality 90", /loading="lazy"/.test(passed) && /sizes="/.test(passed) && /q=90/.test(passed), passed)
  const hero = heroMedia(passed)!
  const [img0 = "", img1 = ""] = hero.match(/<img\b[^>]*>/g) ?? []
  check("the first picture is eager and fetchpriority high", /loading="eager"/.test(img0) && /fetchpriority="high"/.test(img0) && !/loading="lazy"/.test(img0), img0)
  check("the rest of that section eager, without the priority", /loading="eager"/.test(img1) && !/fetchpriority/.test(img1), img1)
  check("its srcset and sizes kept", /srcset="/.test(img0) && /sizes="/.test(img0))
  check("an author's own fetchpriority is kept", /fetchpriority="low"/.test(heroMedia(`<img src="/a.png" fetchpriority="low">`) ?? ""))
  check("a section with no picture is not the hero", heroMedia("<p>text</p>") === null)
  check("eagerMedia leaves fetchpriority alone", !/fetchpriority/.test(eagerMedia(passed)) && !/loading="lazy"/.test(eagerMedia(passed)))
  const render = code("lib/website-builder/storefront-render.ts")
  check("the live page marks its top sections, its first content picture as the hero", /const top = visible && shown < TOP_SECTIONS/.test(render) && /!heroDone && !CHROME_TYPE\.test\(section\.type\) \? heroMedia\(html\) : null/.test(render))
  check("a website's quality is one the optimizer serves", /qualities: \[75, 88, 90\]/.test(read("next.config.mjs")) && /export const SITE_PICTURE_QUALITY = 90/.test(read("lib/images/optimized-url.ts")))
  const theme = code("components/website-builder/theme/ThemePage.tsx")
  check("the theme's fonts are connected to and fetched from the head, display=swap", /preconnect\("https:\/\/fonts\.gstatic\.com", \{ crossOrigin: "anonymous" \}\)/.test(theme) && /preload\(fontHref, \{ as: "style" \}\)/.test(theme) && /&display=swap/.test(read("lib/website-builder/font-link.ts")))
}

async function links() {
  section("A link to another page of the site opens in place, fetched ahead")
  const { inPlaceTarget, plainPress, viewportPrefetchBudget } = await import("@/lib/website-builder/site-navigation")
  const here = "https://maya.storelib.com/"
  check("another page: in place", inPlaceTarget({ href: "/about" }, here) === "/about")
  check("a product: in place, with its query and hash", inPlaceTarget({ href: "https://maya.storelib.com/products/a?v=1#reviews" }, here) === "/products/a?v=1#reviews")
  check("a #section of this page: section-motion's, not the router's", inPlaceTarget({ href: "#faq" }, here) === null && inPlaceTarget({ href: "/#faq" }, here) === null)
  check("another website or storelib.com: the browser's", inPlaceTarget({ href: "https://storelib.com/maya" }, here) === null && inPlaceTarget({ href: "https://leo.storelib.com/" }, here) === null)
  check("the cart, checkout, the account, the API: whole pages", ["/cart", "/checkout?items=1", "/account/orders", "/api/x", "/password", "/receipt/1", "/wishlist"].every((h) => inPlaceTarget({ href: h }, here) === null))
  check("a file: the browser's", inPlaceTarget({ href: "/sitemap.xml" }, here) === null && inPlaceTarget({ href: "/guide.pdf" }, here) === null)
  check("a new tab, a download or a link marked to reload: the browser's", inPlaceTarget({ href: "/about", target: "_blank" }, here) === null && inPlaceTarget({ href: "/about", download: true }, here) === null && inPlaceTarget({ href: "/about", reload: true }, here) === null)
  check("into another language of the site: a whole page", inPlaceTarget({ href: "/fr/about" }, here, ["en", "fr"]) === null && inPlaceTarget({ href: "/fr/contact" }, "https://maya.storelib.com/fr/about", ["en", "fr"]) === "/fr/contact")
  check("a page whose name is not a language stays in place", inPlaceTarget({ href: "/faq" }, here, ["en", "fr"]) === "/faq")
  check("only a plain press", plainPress({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }) && !plainPress({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }) && !plainPress({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: true }))
  check("pages on screen fetched within a budget, none on Data Saver or 2G", viewportPrefetchBudget({ connection: { saveData: true } }) === 0 && viewportPrefetchBudget({ connection: { effectiveType: "2g" } }) === 0 && viewportPrefetchBudget({}) === 8)
  const island = code("components/website-builder/site-links.tsx")
  check("the router follows the press and fetches ahead on intent and on screen", /router\.push\(to\)/.test(island) && /router\.prefetch\(key\)/.test(island) && /"pointerover"/.test(island) && /"touchstart"/.test(island) && /new IntersectionObserver/.test(island))
  check("after the section links and the new tab links have had their say", /window\.addEventListener\("click", onClick\)/.test(island) && /if \(!plainPress\(e\)\) return/.test(island))
  check("the next page's section renderers fetched with the first sign of interest", /void preloadSectionRenderers\(\)/.test(island))
  const layout = code("app/(site)/layout.tsx")
  check("on every page of a Storelib theme's site", /<SiteLinks \/>/.test(layout) && !/speculationrules/.test(layout))
  check("the header's menu drawer follows its links the same way", /if \(!followSectionLink\(href\) && !followSitePage\(href\)\) window\.location\.assign\(href\)/.test(code("components/website-builder/sections/renderers/HeaderSection.tsx")))
  check("imported themes keep the browser's prefetch rules", /speculationrules/.test(code("lib/storelib-theme/compat/shims.ts")))
}

async function renderers() {
  section("Only the sections a page draws are downloaded")
  const registry = code("components/website-builder/sections/registry.ts")
  const lazyCount = (registry.match(/= lazySection\(\(\) => import\("\.\/renderers\//g) ?? []).length
  check("the legacy renderers are fetched on demand", lazyCount >= 40, lazyCount)
  check("the header, the footer and the product section stay in the bundle", /import \{ HeaderSection \} from "\.\/renderers\/HeaderSection"/.test(registry) && /import \{ FooterSection \} from "\.\/renderers\/FooterSection"/.test(registry) && /import \{ ProductSection \} from "\.\/renderers\/ProductSection"/.test(registry))
  const { preloadSectionRenderers, SECTION_COMPONENTS } = await import("@/components/website-builder/sections/registry")
  await preloadSectionRenderers()
  check("every type still has a renderer", ["rich_text", "faq", "gallery", "header", "footer", "product"].every((t) => typeof SECTION_COMPONENTS[t] === "function"))
  const lazy = code("components/website-builder/sections/lazy-section.tsx")
  check("the same Suspense on the server and in the browser, so hydration matches", /<Suspense fallback=\{null\}>\{Ready \? <Ready \{\.\.\.props\} \/> : <Lazy \{\.\.\.props\} \/>\}<\/Suspense>/.test(lazy) && /useState\(\(\) => loaded\)/.test(lazy))
}

async function favicon() {
  section("One favicon")
  const { siteIcons, siteIconTags, siteIconUrl, withSiteIcon } = await import("@/lib/website-builder/site-icon")
  const imported = { compat: { kind: "shopify" }, shopify: { favicon: "https://storelib.com/media/f.png" } }
  check("an imported theme's own favicon is the site's when the site has none", siteIconUrl(imported) === "https://storelib.com/media/f.png")
  check("the site's own wins", siteIconUrl({ ...imported, favicon_url: "https://storelib.com/media/own.png" }) === "https://storelib.com/media/own.png")
  const icons = siteIcons({ favicon_url: "https://storelib.com/media/own.png" })!
  check("written as an icon with its type, and an apple-touch-icon with sizes", icons.icon[0].url.endsWith("own.png") && icons.icon[0].type === "image/png" && icons.apple[0].sizes === "180x180", icons)
  check("an SVG says it draws at any size", (siteIcons({ favicon_url: "/f.svg" })!.icon[0] as { sizes?: string }).sizes === "any")
  const tags = siteIconTags("https://storelib.com/media/own.png")
  check("as markup too", /<link rel="icon" href="https:\/\/storelib\.com\/media\/own\.png" type="image\/png">/.test(tags) && /<link rel="apple-touch-icon" sizes="180x180"/.test(tags), tags)
  check("an imported theme's page without an icon gets the site's", /rel="icon"/.test(withSiteIcon("<html><head><title>x</title></head><body></body></html>", "/f.png")))
  check("one that draws its own keeps it", withSiteIcon(`<html><head><link rel="shortcut icon" href="/t.png"></head></html>`, "/f.png") === `<html><head><link rel="shortcut icon" href="/t.png"></head></html>`)
  check("nothing a tab cannot fetch", siteIconTags("javascript:alert(1)") === "" && siteIconTags("//evil.example/x.png") === "")

  /* THE SINGLE SOURCE OF TRUTH: every reader of the stored value asks faviconOf, and every writer goes through the editor's one writer. */
  const readers = ["lib/website-builder/site-icon.ts", "lib/storelib-theme/resolve.ts", "lib/checkout/brand-server.ts", "app/(site)/w/[username]/render-site.tsx", "components/website-builder/website-settings/general.tsx", "app/website-builder/editor/[installId]/page.tsx"]
  check("every place that reads the favicon asks faviconOf", readers.every((f) => /faviconOf\(/.test(code(f))), readers.filter((f) => !/faviconOf\(/.test(code(f))))
  const strayReads = ["lib/storelib-theme/resolve.ts", "lib/checkout/brand-server.ts", "app/(site)/w/[username]/render-site.tsx", "lib/website-builder/site-icon.ts", "components/website-builder/website-settings/seo.tsx"].filter((f) => /\.favicon_url\b|"favicon_url"\)/.test(code(f)))
  check("and none reads the stored field around it", strayReads.length === 0, strayReads)
  const editor = code("app/website-builder/editor/[installId]/page.tsx")
  check("the builder's Branding panel shows the same value Website settings does", /value=\{faviconOf\(settingsDraft as Record<string, unknown>\) \|\| undefined\}/.test(editor))
  check("both write through the editor's one writer, which carries an imported theme's copy along", /onChange=\{url => updateSetting\("favicon_url", url \?\? ""\)\}/.test(editor) && /ctx\.onSettingChange\("favicon_url", url \?\? ""\)/.test(code("components/website-builder/website-settings/general.tsx")) && /onSettingChange=\{updateSetting\}/.test(editor) && /faviconFollows\(prev as Record<string, unknown>, key, value\)/.test(editor))
  const general = code("components/website-builder/website-settings/general.tsx")
  check("Website settings' Favicon card: upload, drop, replace and remove, no browser tab drawn beside it", /layout="icon"/.test(general) && !/BrowserTabPreview/.test(general) && !/aside=/.test(general))
  check("an imported theme's live page carries the site's icon", /icon: siteIconUrl\(settings as Record<string, unknown>\) \|\| undefined/.test(code("lib/website-builder/compat-site.ts")) && /withSiteIcon\(/.test(code("lib/storelib-theme/compat/site.ts")))
}

async function openingTab() {
  section("A tab opened for the website never sits on about:blank")
  const written: string[] = []
  let replaced: string | null = null
  let closed = false
  const timers: (() => void)[] = []
  const fakeTab = {
    opener: {} as unknown,
    closed: false,
    document: { open() {}, write(h: string) { written.push(h) }, close() {} },
    location: { replace(u: string) { replaced = u } },
    close() { closed = true },
  }
  const win = {
    open: (url: string) => (url === "" ? fakeTab : null),
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length },
    clearTimeout: () => {},
  }
  ;(globalThis as { window?: unknown }).window = win
  const { openOpeningTab, OPENING_TITLE } = await import("@/lib/website-builder/opening-tab")
  const tab = openOpeningTab("Getting the preview of your drafts.")!
  check("it opens at the press and says what it is from the first frame", !!tab && written.length === 1 && written[0].includes(`<title>${OPENING_TITLE}</title>`) && /Opening your website/.test(written[0]))
  check("its way back to the builder is cut", fakeTab.opener === null)
  check("pointed at the website, replacing the holding page", tab.go("https://maya.storelib.com/preview/abc") && replaced === "https://maya.storelib.com/preview/abc")
  written.splice(0)
  const failing = openOpeningTab()!
  failing.fail("Could not make a preview link.")
  check("a failure is said in that tab, with a way to close it", written.some((h) => /Could not make a preview link\./.test(h) && /Close this tab/.test(h)) && !closed)
  written.splice(0)
  openOpeningTab()
  timers[timers.length - 1]()
  check("nothing waits forever: a tab with no answer says so", written.some((h) => /taking longer than it should/.test(h)))
  delete (globalThis as { window?: unknown }).window
  for (const f of ["components/website-builder/publish-panel.tsx", "lib/website-builder/open-preview.ts"]) {
    const src = code(f)
    check(`${f}: no blank tab`, !/window\.open\(""/.test(src) && /openOpeningTab\(/.test(src) && /\.fail\(/.test(src))
  }
  const builder = ["components/website-builder", "app/website-builder"]
  void builder
  check("the live site's own address opens directly when it is known", /window\.open\(previewUrl, "_blank", "noopener"\)/.test(code("components/website-builder/publish-panel.tsx")))
}

async function main() {
  cacheRules()
  publishClears()
  await databaseBudget()
  await strangerHold()
  await importedPictures()
  await firstPicture()
  await links()
  await renderers()
  await favicon()
  await openingTab()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
