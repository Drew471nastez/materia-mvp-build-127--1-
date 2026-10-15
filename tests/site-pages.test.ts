/**
 * ===========================================================================
 *  A SITE IS MORE THAN ITS FRONT PAGE
 * ===========================================================================
 * The website builder has always offered an About page, a Contact page and
 * pages a creator makes themselves. Every one of them saved, published, and
 * served by nothing: `app/(site)/w/` held one route, for the home page,
 * so `<name>.storelib.com/about` was a 404 on every site ever built — including
 * for the `/about` link the shipped header puts in the nav of a brand new one.
 *
 * Three things had to be true at once for that page to appear, and this file
 * is one check for each:
 *
 *   1. THE CACHE HAS TO HOLD IT. `buildSite` read one row, `page_key = home`,
 *      so the sections of every other page never left the database.
 *   2. A ROUTE HAS TO ANSWER. The proxy already forwards the path; nothing
 *      caught it.
 *   3. THE EDITOR HAS TO KEEP IT. A page made in the builder lived in React
 *      state: gone on reload, and its delete button deleted nothing.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BUILT_IN_PAGE_KEYS,
  RESERVED_PAGE_KEYS,
  pageKeyFromSegment,
  pageTitleFromKey,
  templateForPage,
} from "@/lib/website-builder/site-pages"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const cache = read("lib/website-builder/published-site.ts")
const renderer = read("app/(site)/w/[username]/render-site.tsx")
const home = read("app/(site)/w/[username]/page.tsx")
const sub = read("app/(site)/w/[username]/[page]/page.tsx")
const sectionsApi = read("app/api/website-builder/themes/[installId]/sections/route.ts")
const editor = read("app/website-builder/editor/[installId]/page.tsx")
const switcher = read("components/website-builder/page-switcher.tsx")
const proxy = read("proxy.ts")

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("An address, as a page of a site")
  // ═══════════════════════════════════════════════════════════════════════
  {
    // Run, not read.
    check("a plain name is a page", pageKeyFromSegment("about") === "about")
    check("a hyphenated one too", pageKeyFromSegment("size-guide") === "size-guide")
    check("case does not matter, because a visitor types what they like", pageKeyFromSegment("About") === "about")
    check("an escaped segment is decoded first", pageKeyFromSegment("size%2Dguide") === "size-guide")

    check("the front page is not a second address", pageKeyFromSegment("home") === null)
    check("and neither is the product template", pageKeyFromSegment("product") === null)
    for (const reserved of RESERVED_PAGE_KEYS) {
      check(`"${reserved}" is refused`, pageKeyFromSegment(reserved) === null)
    }

    check("a path separator is not a key", pageKeyFromSegment("about/team") === null)
    check("nor a traversal", pageKeyFromSegment("..") === null && pageKeyFromSegment("%2e%2e%2f") === null)
    check("nor a query or a fragment smuggled in", pageKeyFromSegment("about?x=1") === null)
    check("nor an empty segment", pageKeyFromSegment("") === null)
    check("nor one that starts with a hyphen", pageKeyFromSegment("-about") === null)
    check("nor one longer than a key can be", pageKeyFromSegment("a".repeat(64)) === null)
    check("a malformed escape is refused rather than thrown", pageKeyFromSegment("%E0%A4%A") === null)

    check("the front page draws as the index template", templateForPage("home") === "index")
    check("and every other page as its own", templateForPage("about") === "page.about")
    check("a key reads back as the name somebody typed", pageTitleFromKey("size-guide") === "Size guide")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The cache holds every published page, not only home")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const build = cache.slice(cache.indexOf("async function buildSite"), cache.indexOf("export async function publishedSiteByName"))
    check("it no longer asks for one page by name", !/\.eq\("page_key", "home"\)/.test(build))
    check("it reads the install's pages", /\.from\("store_theme_pages"\)[\s\S]{0,120}\.eq\("install_id", row\.id\)/.test(build))
    /* Cleaned by the built-in schemas and by the ones the creator's own section files declare. */
    check("and keeps them by key", /pages\[r\.page_key\] = sanitizeSections\(published, ownSchemas\)/.test(build))

    /**
     * A page with no published sections is a page that has been made and not
     * published. Serving it would put an empty page at a real address, and
     * on a site whose header links to it that reads as a broken site.
     */
    check("a page that was never published is not one a visitor can see", /if \(!published \|\| published\.length === 0\) continue/.test(build))

    // The narrow shape is the guarantee, and the new field must stay inside it.
    const shape = cache.slice(cache.indexOf("export interface PublishedSite"), cache.indexOf("export type SiteLookup"))
    check("the pages are part of the declared shape", /pages: Record<string, SectionInstance\[\]>/.test(shape))
    check("and no draft came with them", !/draft_sections/.test(shape))
    check("what came out of the database is still cleaned on the way in", /sanitizeSections\(published, ownSchemas\)/.test(build) && /const ownSchemas = schemaLookupFrom\(sources\)/.test(build))

    check("the lookup takes the page being asked for", /* Changed on purpose (round AC): the market (currency) rides beside the language. */ /export async function publishedSiteByName\(name: string, pageKey = "home", locale: string \| null = null, market: string \| null = null\)/.test(cache))
    /* `stored` rather than `sections` since the chrome repair runs between the
       two: what the site stored, then what is actually drawn. The question
       here is unchanged — a key the site has not published is missing. */
    check(
      "a page the site has not published is missing, not the home page under another name",
      /* Changed on purpose (round AB): the website in another language. */ /const original = site\.pages\[pageKey\] \?\? \(pageKey === "home" \? site\.sections : undefined\)/.test(cache) &&
        /if \(!original\) return \{ kind: "missing" \}/.test(cache),
    )
    check("and the template follows the page", /const template = templateForPage\(pageKey\)/.test(cache))

    /**
     * One cache entry for the whole site. The pages are published together
     * and invalidated together, so splitting them would be more round trips
     * for no more freshness.
     */
    check("it is still one entry per creator, tagged for Publish", /\["published-site", match\.creatorId\]/.test(cache) && /tags: \[creatorSiteTag\(match\.creatorId\)\]/.test(cache))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A route answers at the address the proxy sends")
  // ═══════════════════════════════════════════════════════════════════════
  {
    // The proxy has always forwarded the whole path. This is the half that
    // was missing.
    check("the proxy forwards the path to /w", /\/w\/\$\{subdomain\}\$\{pathname === "\/" \? "" : pathname\}/.test(proxy))
    check("the sub-page route exists", /export default async function WebsiteSubPage/.test(sub))
    /**
     * The query argument is gone on both: a page that reads `searchParams` is
     * rendered fresh for every visitor forever, which is what kept the
     * published site out of every cache. Previews have their own address now.
     */
    check("it draws the site through the same renderer as the front page", /renderSite\(username, undefined, key\)/.test(sub) && /renderSite\(username, undefined, "home"\)/.test(home))
    check("a segment that is not a page key is a 404", /if \(!key\) notFound\(\)/.test(sub))
    check("and /home goes to the front page rather than being served twice", /* Changed on purpose (round AB): the website in another language. */ /redirect\(locale \? `\/\$\{locale\}` : "\/"\)/.test(sub))
    check("one segment deep, because a page key is one segment", !/\[\.\.\./.test(sub))

    check("a sub-page says which page it is in the tab", /* Round I: through the one tab rule, "<page> | <store>" (lib/website-builder/tab-title.ts). */ /pageKey === "home" \? \{ kind: "home" \}[\s\S]{0,120}\{ kind: "page", name: pageTitleFromKey\(pageKey\) \}/.test(renderer))
    check("a preview link works on a sub-page too", /previewPage\(username, wantedToken, pageKey\)/.test(renderer))
    check("and a preview of a page that does not exist is still a 404", /if \(!pageData && pageKey !== "home" && pageKey !== "contact"\) notFound\(\)/.test(renderer))
    /* Contact is the one exception: every website has one, generated until
       the creator makes their own (lib/website-builder/account-pages). */
    check("and a contact page nobody made previews as the generated one", /pageKey === "contact" \? contactSections\(/.test(renderer))
    check("the sections a visitor gets are cleaned", /sanitizeSections\(/.test(renderer))
    check("and the page knows whose site it is on", /* Changed on purpose (round AB): the website in another language. */ /storefront=\{\{ creatorId: site\.creatorId, installId: site\.installId(, pages: Object\.keys\(site\.pages\))?(, pageKey)?(, language)?(, words: localizer\?\.words, display: localizer\?\.display)?(, currency: await cachedStoreCurrency\(site\.creatorId\))? \}\}/.test(renderer))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A page made in the builder stays made")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the pages come back from the install on load", /const restored = \(inst\.pages \?\? \[\]\)/.test(editor) && /setCustomPages\(restored\)/.test(editor))
    check("the theme's own four are not listed as somebody's", /!BUILT_IN_PAGE_KEYS\.has\(key\)/.test(editor))
    /* Six now: the shop and the search page are pages every site has, built
       on read until a creator arranges them, and reserved so nobody can also
       make a page by either name. */
    /* Ten now: the 404 page, and the visitor's account, its sign in page and
       the wishlist (lib/website-builder/account-pages). */
    /* Twelve: the password page a website shows while it asks for one (lib/site-password), and the
       collections page, Shopify's list-collections (lib/website-builder/shop-page). */
    /* Thirteen: the Collection page template (round 25), drawn for every /collections/<handle>. */
    check("and the thirteen are the thirteen", BUILT_IN_PAGE_KEYS.size === 13 && ["home", "product", "about", "contact", "products", "search", "404", "account", "login", "wishlist", "password", "collections", "collection"].every((k) => BUILT_IN_PAGE_KEYS.has(k)))

    check("delete calls the server", /handleDeletePage/.test(editor) && /method: "DELETE"/.test(editor))
    check("it leaves the page it is deleting first", /if \(currentPage === key\) await handlePageChange\("home"\)/.test(editor))
    check("and a refusal puts the page back rather than lying", /setCustomPages\(before\)/.test(editor))

    check("the endpoint deletes the row", /export async function DELETE/.test(sectionsApi) && /\.delete\(\)[\s\S]{0,120}\.eq\("page_key", pageKey\)/.test(sectionsApi))
    check("the theme's own pages cannot be deleted", /pageKey === "home" \|\| pageKey === "product"/.test(sectionsApi))
    check("and the live site stops serving what was deleted", (() => {
      const del = sectionsApi.slice(sectionsApi.indexOf("export async function DELETE"))
      return /revalidatePublishedSite\(creatorId\)/.test(del)
    })())

    /**
     * The name a person types becomes the address, and nothing checked what
     * it turned into: "Home" made the key `home` and saved a bare header and
     * footer over the home page's draft.
     */
    check("a new page cannot be named onto another page", /BUILT_IN_PAGE_KEYS\.has\(pageKey\)/.test(editor) && /customPages\.some\(\(p\) => p\.key === pageKey\)/.test(editor))
    check("nor onto a name that cannot be an address", /pageKeyFromSegment\(pageKey\) === null/.test(editor))
    check("the key comes from the same slug rule as the rest of the product", /const pageKey = toPageSlug\(newPageTitle\) as PageKey/.test(editor))
    check("and a page that did not save is not shown as one that did", /if \(!res\.ok\) throw new Error\(String\(res\.status\)\)/.test(editor) && /showNotification\("Could not create the page\. Try again\.", "error"\)/.test(editor))

    check("a delete that cannot be undone asks first", /confirming === p\.key/.test(switcher))
    check("and the way to ask is reachable on a phone, not only on hover", /sm:opacity-0 sm:group-hover\/row:opacity-100/.test(switcher))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The site's own links lead somewhere")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const shop = read("app/(site)/w/[username]/products/page.tsx")
    const productRoute = read("app/(site)/w/[username]/products/[slug]/page.tsx")
    const productRenderer = read("components/website-builder/theme/render-product.tsx")
    const shopPage = read("lib/website-builder/shop-page.ts")
    const grid = read("themes/default/sections/product_grid.storelib")
    const registry = read("lib/website-builder/theme-registry.ts")

    /**
     * Every product card, Product Featured and the header's link picker emit
     * `/products/<slug>`; the themes ship "Shop" pointing at `/products`.
     * Both were 404 on every published site, which is the whole path to a
     * sale.
     */
    check("a product card still links the way it always did", /`\/products\/\$\{(slug|row\.slug|targetId)\}`/.test(read("lib/website-builder/shop-products.ts")))
    check("and that address now has a route on the site", /export default async function SiteProductPage/.test(productRoute))
    check(
      "which draws it with the creator's theme, not a bare page",
      /* Changed on purpose (round AC): the market (currency) rides beside the language. */ /renderProduct\(slug, \{ creatorId: creator\.creatorId, locale, market \}\)/.test(productRoute),
    )
    check(
      "a product belonging to somebody else is not at this creator's address",
      /* Changed on purpose (round AB): the website in another language. */ /if \(owner && found\.creator_id !== owner\.creatorId\) notFound\(\)/.test(productRenderer),
    )
    check("and the platform's own address draws the same page", /renderProduct\(slug\)/.test(read("app/products/[slug]/page.tsx")))

    check("the Shop link the themes ship points at /products", /url: "\/products"/.test(registry))
    check("and /products is a page now", /export default async function SiteShopPage/.test(shop))
    check(
      "built from the site's own header and footer, not a second design",
      /* The whole Header and Footer groups from home, announcement bars and a header section file included. */
      /return withUniversalChrome\(\[grid\], chromeOf\(homeSections\)\)/.test(shopPage),
    )
    check(
      "and one product grid reading the shop, which is a section that already exists",
      /type: "product_grid"/.test(shopPage) && /source: "shop"/.test(shopPage) && /settings\.source == 'shop'/.test(grid),
    )
    check("it does not offer a button back to itself", /button_text: ""/.test(shopPage))
    check("nothing is invented per request, so the same page renders the same twice", /const GRID_ID = "shop-all-products"/.test(shopPage))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What on a site is not the site")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const site = proxy.slice(proxy.indexOf("if (bareHost.endsWith(`.${SITES_DOMAIN}`))"))

    /**
     * The newsletter section posts to /api/website-builder/subscribe. On a
     * published site that was rewritten into /w and answered 404, so the form
     * that says "you're subscribed" could not have been.
     */
    check(
      "the site's own API calls are served on the site's host",
      /if \(pathname === "\/api" \|\| pathname\.startsWith\("\/api\/"\)\) return NextResponse\.next\(\)/.test(site),
    )
    check(
      "and a checkout goes to the apex, where the session is",
      /PLATFORM_APEX_PATHS\.some/.test(site) && /status: 307/.test(site),
    )
    check("307, so a POST keeps its method and body", /\/\/ 307: the method and body survive/.test(proxy))
    check(
      "the list is short, because every other name is a page a creator may make",
      (() => {
        const list = /const PLATFORM_APEX_PATHS = \[([^\]]*)\]/.exec(proxy)?.[1] ?? ""
        const paths = list.split(",").map((p) => p.trim().replace(/"/g, "")).filter(Boolean)
        return paths.length <= 4 && paths.every((p) => RESERVED_PAGE_KEYS.has(p.slice(1)))
      })(),
      "every platform path must also be a reserved page key, or the editor can make a page nobody can reach",
    )
    check("and the shop index is reserved for the same reason", RESERVED_PAGE_KEYS.has("products") && RESERVED_PAGE_KEYS.has("api"))

    /**
     * A connected domain used to land on the creator's PROFILE, and threw
     * the path away on the way: somebody who bought a domain for the site
     * they built got the profile at it and their site only at the subdomain
     * they were replacing.
     */
    check("a connected domain shows the website that was built", /* Changed on purpose (round AB): the website in another language. */ /rewritePath = inLanguage\?\.kind === "page" \? inLanguage\.path : `\/w\/\$\{username\}\$\{pathname === "\/" \|\| pathname === "" \? "" : pathname\}`/.test(proxy))
    check("with the path kept, so About on a domain is About", /\$\{pathname === "\/" \|\| pathname === "" \? "" : pathname\}/.test(proxy))
    check("a creator with no published website keeps the profile they had", /hasPublishedWebsite\(username\)/.test(proxy) && /rewritePath = `\/u\/\$\{username\}`/.test(proxy))
    check("and an asset never pays for the two lookups", /const looksLikeFile = \/\\\.\[a-z0-9\]\{1,8\}\$\/i\.test\(pathname\)\s*\n\s*const builtSite/.test(proxy))
    /* A lookup that fails keeps the last answer it had (a live website stays up through a blip), and with none it is no website, which is the profile. */
    check("a lookup that fails reads as the last answer, else no website, which is the profile", /async function hasPublishedWebsite[\s\S]*?return remembered\(/.test(proxy) && /if \(fresh\.failed\) return held\?\.value \?\? false/.test(proxy))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A page that is not there does not send the visitor to Storelib")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const nf = read("app/not-found.tsx")
    const body = read("components/platform/not-found-body.tsx")
    const home = read("app/(site)/w/[username]/page.tsx")

    /**
     * ONE 404, TWO ANSWERS, CHOSEN BY THE HOST IN THE BROWSER.
     *
     * A nested `not-found.tsx` under the site routes was tried first and both
     * halves of it failed, in production, measured rather than reasoned
     * about. Reading the request in it — the only way a boundary can learn
     * whose site it is on — turns a render that began static into a dynamic
     * one, and Next answers that at runtime with "Page changed from static to
     * dynamic": a 500 where a 404 belongs, on every missing page of every
     * site, and on the front pages too. With the request read taken out, the
     * payload carried both boundaries and the platform's was the one that
     * showed.
     */
    check("the platform's 404 has a second body for a creator's own address", /<NotFoundBody platform=\{<PlatformNotFound \/>\} site=\{<SiteNotFound fallback=\{<PlainSiteNotFound \/>\} \/>\} \/>/.test(nf))
    check("which says the page is not here", /That page is not here/.test(nf))
    check("and offers the site's own front page, not Storelib", /href="\/"[\s\S]{0,200}Back to the home page/.test(nf))
    check("the site body mentions neither Storelib nor Explore", (() => {
      const siteBody = nf.slice(nf.indexOf("function PlainSiteNotFound"), nf.indexOf("function PlatformNotFound"))
      return !/Storelib/.test(siteBody) && !/Explore/.test(siteBody)
    })())

    check("the choice is the host, and the browser always knows it", /window\.location\.hostname/.test(body) && /getMainDomain\(\)/.test(body))
    check("computed at the first render rather than in an effect, so nothing flashes", /useState\(\(\) => \{/.test(body) && !/useEffect/.test(body))
    check("localhost is the platform, whatever the host looks like", /host === "localhost"/.test(body))
    check(
      "and nothing about the request is read on the server",
      !/headers\(\)/.test(body) && !/cookies\(\)/.test(nf),
    )
    check("which is a rule because the pages under it are cached", /export const revalidate = 60/.test(home))
    check("there is no second not-found under the site routes to compete with it", !existsSync(join(process.cwd(), "app/(site)/w/[username]/not-found.tsx")))

    /**
     * THE CREATOR'S OWN 404 PAGE, INSIDE THE REAL 404. The site body asks
     * the same host for the page the creator arranged and draws it with
     * their header and footer; the status is still the root 404's.
     */
    const siteNf = read("components/website-builder/site-not-found.tsx")
    const siteNfPage = read("components/website-builder/site-not-found-page.tsx")
    const nfRoute = read("app/(site)/w/[username]/not_found/route.ts")
    check("the site body asks its own host for the creator's 404 page", /* Changed on purpose (translation coverage): the page's language's own address first (/fr/not_found), then /not_found. */ /ask\("\/not_found"\)/.test(siteNf) && /fetch\(path, /.test(siteNf) && /credentials: "omit"/.test(siteNf))
    check("and falls back to the plain page when it cannot, without swapping later", /setPlain\(true\)/.test(siteNf) && /if \(settled\) return/.test(siteNf))
    check("the theme is loaded only on a creator's site", /import\("@\/components\/website-builder\/site-not-found-page"\)/.test(siteNf) && !/from "@\/components\/website-builder\/theme\/ThemePage"/.test(siteNf))
    check("the page is drawn like every page of the site", /<ThemePage theme=\{page\.theme\} sections=\{page\.sections\}/.test(siteNfPage) && /<SiteDocument \/>/.test(siteNfPage))
    check("the address it asks is published content, cached, and never indexed", /* Changed on purpose (translation coverage): the name read with its language ("andrew~fr"). */ /publishedNotFoundPage\(name, locale\)/.test(nfRoute) && /s-maxage=60/.test(nfRoute) && /"X-Robots-Tag": "noindex"/.test(nfRoute))
    check("the address cannot collide with a page a creator makes", pageKeyFromSegment("not_found") === null)
    check("a missing page is still a real 404 from the page route", /if \(!key\) notFound\(\)/.test(read("app/(site)/w/[username]/[page]/page.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing in the header points at a page that does not exist")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
    const code = header.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
    const headerSchema = read("themes/default/sections/header.json")
    const themeSettings = read("lib/website-builder/theme-settings-schema.ts")
    const editor = read("app/website-builder/editor/[installId]/page.tsx")

    /**
     * FOUR ICONS, AND THREE OF THEM DID NOTHING. Search, Account and
     * Wishlist were buttons whose entire behaviour was `preventDefault()`;
     * the cart opened a drawer that could only say it was empty, or went to
     * /cart, which was not a route in this product.
     *
     * THE CART IS BACK, and the rule it was removed under is the one it has
     * to keep: a control in the header exists only while the thing behind
     * it does. So the bag is allowed because a cart page, a drawer with the
     * shop's own contents in it and a checkout that can take the money all
     * exist. If any of those goes, this fails and the bag goes with it.
     */
    check(
      "the cart icon is in the header",
      /aria-label=\{ready && count > 0 \? `Cart, /.test(code) && /HeaderCartDrawer/.test(code) && /show_cart_icon/.test(headerSchema),
    )
    check(
      "and every part it promises exists",
      existsSync("app/(site)/w/[username]/cart/page.tsx") &&
        existsSync("app/api/checkout/cart/route.ts") &&
        existsSync("app/api/checkout/cart/complete/route.ts") &&
        existsSync("lib/website-builder/cart.ts"),
      "a bag that cannot be filled or paid for is the dead button this was removed for",
    )
    check(
      "the drawer's Check out goes to the cart page",
      /href="\/cart"/.test(code),
    )
    check(
      "and the old settings that configured the fake one did not come back",
      !/cart_show_count|cart_show_subtotal/.test(themeSettings),
    )
    /*
      CART TYPE CAME BACK WITH A CART TO CONFIGURE. It was removed as a
      control over nothing; the cart is real now, and Cart type is Shopify's
      drawer, page or notification, which SiteCartProvider does on Add to
      cart. So it may be in the panel only while the cart reads it.
    */
    const cart = read("components/website-builder/site-cart.tsx")
    check(
      "Cart type is in the panel only because the cart does what it says",
      !/cart_type/.test(themeSettings) ||
        (/cartType === "page" && shopId/.test(cart) && /cartType === "notification"/.test(cart) && /window\.location\.assign\("\/cart"\)/.test(cart) &&
          /cartType=\{themeCartType\(theme\)\}/.test(read("components/website-builder/theme/ThemePage.tsx"))),
    )
    /*
      ═══════════════════════════════════════════════════════════════════════
       SEARCH IS BACK, AND THIS TIME THERE IS SOMETHING BEHIND IT
      ═══════════════════════════════════════════════════════════════════════
      It was removed for the right reason: the icon's entire behaviour was
      preventDefault(), so it was a control that looked like a promise and
      kept none of it. The rule was never "no search", it was "nothing in a
      header that does not work".

      So the icon may exist only while the page it points at does. If
      app/(site)/w/[username]/search ever goes away, this fails, and the icon
      has to go with it rather than quietly becoming a dead button again.
    */
    /*
      ═══════════════════════════════════════════════════════════════════════
       ACCOUNT, AND A WAY TO MAKE ONE
      ═══════════════════════════════════════════════════════════════════════
      A built site cannot see the session: the cookie is host-only to the
      platform so that a site somebody generated with a prompt can never read
      a Storelib token. So the site must not try to find out, and these
      controls must not be a link that guesses. They go to a platform route
      that knows, and it forwards the visitor.

      The rule this file exists for applies: the control is allowed only
      while the thing behind it is there.
    */
    /*
      THE ACCOUNT IS THE WEBSITE'S OWN, the way a Shopify store's customer
      accounts are: an email and a code on the website's sign in page, and
      the website's own session (lib/site-accounts). So the icon says Sign in
      and goes to that page for somebody who is not signed in, and Account
      and the account page once they are, and the rule here holds: both
      pages exist.
    */
    check(
      "account goes to the website's own sign in page, or its account page once signed in, both of which exist",
      /const ACCOUNT_PATH = "\/account"/.test(code) && /const SIGN_IN_PATH = "\/account\/login"/.test(code) &&
        /* Changed on purpose (translation coverage): the labels are shop words, in the page's language. */ /signedIn \? \{ href: ACCOUNT_PATH, label: w\("account"\) \} : \{ href: SIGN_IN_PATH, label: w\("sign_in"\) \}/.test(code) &&
        (code.match(/href=\{account\.href\}/g) ?? []).length === 2 &&
        existsSync("app/(site)/w/[username]/account/page.tsx") && existsSync("app/(site)/w/[username]/account/login/page.tsx"),
    )
    check(
      "a visitor with no account makes one by signing in, with no separate form",
      !/Create account/.test(code) && !/account_register_url/.test(code) &&
        existsSync("app/api/site-account/code/route.ts") && existsSync("app/api/site-account/verify/route.ts") &&
        /findOrCreateCustomer/.test(read("lib/site-accounts/sign-in.ts")),
    )
    check(
      "and where to come back to is this request's own host, never one the page names",
      ["app/api/site-account/start/route.ts", "app/api/site-account/code/route.ts", "app/api/site-account/verify/route.ts"].every((f) => /const host = hostOf\(request\)/.test(read(f))) &&
        /returnPathOf\(new URL\(request\.url\)\.searchParams\.get\("return"\)\)/.test(read("app/api/site-account/start/route.ts")) &&
        /returnPathOf\(form\?\.get\("return"\)\)/.test(read("app/api/site-account/code/route.ts")),
      "the same markup is served on a subdomain, a custom domain and /w/<name>",
    )
    check(
      "the platform checks a return target before following it",
      /* Changed on purpose: the login page reads `next` with readCarry (lib/auth/continue.ts), which checks it with safeReturnTarget. */
      /readCarry\(searchParams, getMainDomain\(\)\)/.test(read("app/(auth)/login/page.tsx")) && /safeReturnTarget\(raw, \{ mainDomain \}\)/.test(read("lib/auth/continue.ts")) &&
        /safeReturnTarget/.test(read("app/account/continue/route.ts")),
      "an unchecked one turns sign-in into an open redirect",
    )
    check(
      "and nothing follows a raw redirect parameter any more",
      !/const redirectUrl = searchParams\.get\("redirect"\)/.test(read("app/(auth)/login/page.tsx")),
    )

    check(
      "search is in the header",
      /aria-label="Search"/.test(code) && /show_search_icon/.test(headerSchema),
    )
    check(
      "and it points at a page that exists",
      /href="\/search"/.test(code) && existsSync("app/(site)/w/[username]/search/page.tsx"),
      "an icon whose page does not exist is the dead button this was removed for",
    )
    check(
      "which searches the shop rather than pretending to",
      /productMatchesQuery/.test(read("app/(site)/w/[username]/search/page.tsx")) &&
        /searchSections/.test(read("app/(site)/w/[username]/search/page.tsx")),
    )
    check(
      "wishlist is a link to the website's own Wishlist page, which exists",
      /const WISHLIST_PATH = "\/wishlist"/.test(code) && /href=\{WISHLIST_PATH\}/.test(code) && existsSync("app/(site)/w/[username]/wishlist/page.tsx"),
    )
    check("no icon in the header is a button that only prevents its own default", !/onClick=\{e => e\.preventDefault\(\)\}/.test(code))
    check(
      "and every account control goes to a page or route of the website, none to a guess on the platform",
      !/account\/continue/.test(code) && !/getMainDomain\(\)\}\/wishlist/.test(code) && /onEditorNavigate\(account\.href, true\)/.test(code),
    )
    check("with no invented count beside any of them", !/leading-none flex items-center justify-center">\s*0\s*</.test(code))

    /**
     * COLLECTIONS DO NOT EXIST. The link picker had a group fed by
     * `/api/collections`, which is not a route, and the nav link offered
     * "Collection" pointing at /collections/<id>, which is not one either.
     */
    check("a nav link cannot be pointed at a collection", !/collections\//.test(code) && !/"value": "collection"/.test(headerSchema))
    check("and the editor no longer fetches a list that cannot answer", !/api\/collections/.test(editor.replace(/\/\*[\s\S]*?\*\//g, " ")))
    check("the shop link in the picker is the address the shop is at", /\{ href: "\/products", label: "Shop", kind: "page" \}/.test(read("lib/website-builder/link-targets.ts")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A preview shows the shop and a product, like the rest of the site")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const shop = read("app/(site)/w/[username]/preview/[token]/products/page.tsx")
    const product = read("app/(site)/w/[username]/preview/[token]/products/[slug]/page.tsx")
    const renderer = read("components/website-builder/theme/render-product.tsx")

    check("the preview has a shop index", /export default async function PreviewShopPage/.test(shop))
    check("and a product page", /export default async function PreviewProductPage/.test(product))
    check("both refuse anything that is not token-shaped", /if \(!clean\) notFound\(\)/.test(shop) && /if \(!clean\) notFound\(\)/.test(product))
    check("neither is indexed", /robots: \{ index: false, follow: false \}/.test(shop) && /robots: \{ index: false, follow: false \}/.test(product))
    check("neither is cached", /export const dynamic = "force-dynamic"/.test(shop) && /export const dynamic = "force-dynamic"/.test(product))
    check(
      "the product page draws the drafts only for a token that matches",
      /const preview = previewToken \? mayPreview\(/.test(renderer) &&
        /pageSections<SectionInstance\[\]>\(pageData, preview\)/.test(renderer),
    )
    check(
      "and a public request still gets the published version",
      /* Changed on purpose (round AC): the market (currency) rides beside the language. */ /export async function renderProduct\(\s*slug: string,\s*(?:\/\*\*[^*]*\*\/\s*)?owner\?: \{ creatorId: string; locale\?: string \| null; market\?: string \| null \},/.test(renderer) &&
        /renderProduct\(slug\)/.test(read("app/products/[slug]/page.tsx")),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
