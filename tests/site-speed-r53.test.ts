/**
 * Round 53: an imported theme's page is ONE page for everybody, held by the
 * CDN, and what is a visitor's own is filled in after load.
 *
 *   THE DRAW NOTES WHAT IS PERSONAL   every read of `cart` or `customer` is
 *                                     noted against its section or the layout
 *   THE SHARED PAGE HOLDS NONE OF IT  a stranger's draw with a cart and a
 *                                     customer about holds neither (the
 *                                     handler gives it neither: pinned)
 *   THE PRIVATE ANSWER                each personal section drawn both ways,
 *                                     the layout both ways, the count
 *   THE PROXY                         a cart or a sign in no longer keeps a
 *                                     page private, only one without its hint;
 *                                     unknown query keys are not a new copy
 *   THE CDN                           Vercel-CDN-Cache-Control and the site's
 *                                     tags, only on a shared document
 *   LIMITS                            posts, private draws, shared misses
 *
 *   npx tsx tests/site-speed-r53.test.ts
 */
import { readFileSync } from "node:fs"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData, type SiteRequest } from "../lib/storelib-theme/compat/site"
import { hintedCookies, sharedQuery, strangerPage, SHARED_PAGE_CDN, PUBLIC_PAGE_CACHE, type StrangerRequest } from "../lib/storelib-theme/compat/anonymous-cache"
import { personalFillTag, personalIds, cartHintCookie, SLOT_MARK } from "../lib/storelib-theme/compat/personal-fill"
import type { StorelibCustomer } from "../lib/storelib-theme/compat/account"
import { withLcpHint } from "../lib/storelib-theme/compat/lcp-hint"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const card = (i: number) => ({
  id: ID(i),
  settings: { title: `Shirt ${i}`, price: "$40.00", image: "https://img.test/a.png", url: `/products/shirt-${i}`, slug: `shirt-${i}`, kind: "physical", available: true, variants: [], options: [] },
})
const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<div id="lay-count" data-n="{{ cart.item_count }}">{{ cart.item_count }}</div><main id="MainContent">{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`),
  "sections/cart-count.storelib": section("cart-count", `<a id="cart-icon" href="/cart"><span class="count" data-count="{{ cart.item_count }}">{{ cart.item_count }}</span></a>`),
  "sections/who.storelib": section("who", `{% if customer %}<a class="acct" href="/account">Hi {{ customer.first_name }}</a>{% else %}<a class="acct" href="/account/login">Log in</a>{% endif %}`),
  "sections/drawer.storelib": section("drawer", `<aside class="drawer">{% for i in cart.items %}<p class="line">{{ i.title }}</p>{% endfor %}</aside>`),
  "sections/hero.storelib": section("hero", `<h1>Linen for summer</h1>`),
  "sections/foot.storelib": section("foot", `<footer>Shop footer</footer>`),
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
const pages = {
  home: [
    { id: "cc", type: "cart-count", group: "header" },
    { id: "who", type: "who", group: "header" },
    { id: "hero", type: "hero" },
    { id: "drawer", type: "drawer" },
    { id: "foot", type: "foot", group: "footer" },
  ],
}
const shop = { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" }
const site: SiteData = { creatorId: "c0ffee00-0000-4000-8000-000000000000", theme, pages, products: [card(1), card(2)], collections: [], menus: {}, shop, host: "shop.test" }
const ANA: StorelibCustomer = { name: "Ana Pop", first_name: "Ana", email: "ana@mail.test", orders: [], orders_count: 0 }
const CART = [{ k: "k1", p: ID(1), v: null, q: 2 }]

function call(method: string, url: string, extra: Partial<SiteRequest> = {}) {
  const [p, q] = url.split("?")
  return answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body: null, cart: [], ...extra })
}
const body = (r: { body: string | Uint8Array }) => String(r.body)

async function main() {
  console.log("\nThe draw notes what is personal\n")
  {
    const r = await call("GET", "/")
    const personal = r.personal
    check("a page says which of its sections read the cart or the customer", !!personal && personal.sections.includes("cc") && personal.sections.includes("who") && personal.sections.includes("drawer"), personal)
    check("  and not the ones that read neither", !!personal && !personal.sections.includes("hero") && !personal.sections.includes("foot"), personal)
    check("  and that the layout read the cart outside any section", personal?.layout === true, personal)
  }

  console.log("\nThe shared page holds nothing of a visitor's\n")
  {
    const stranger = body(await call("GET", "/"))
    const buyer = body(await call("GET", "/", { cart: CART, account: { customer: ANA } }))
    check("drawn for a buyer who is signed in, the page shows their cart and name (the draw reads them)", buyer.includes('data-count="2"') && buyer.includes("Hi Ana") && buyer.includes("Shirt 1"))
    check("drawn as the shared copy is (no cart, nobody), none of it", stranger.includes('data-count="0"') && !stranger.includes("Ana") && !stranger.includes("ana@mail.test") && !stranger.includes("Shirt 1</p>"))
    check("  and the Shopify object says nobody signed in, nothing in the cart", /"storelibSignedIn":false/.test(stranger) && /CART_AT_DRAW=0/.test(stranger))

    /* The handler is what makes the marked page a stranger's: it must hand the draw no cookie, no account, nothing owned, the marker's country. */
    const route = readFileSync("app/api/site-theme/site/[username]/[[...path]]/route.ts", "utf8")
    check("the marked page reads no cart cookie", /const cookie = stranger \? undefined : req\.headers\.get\("cookie"\)/.test(route))
    check("  no website session", /const account = token \|\| stranger \|\| !page \? undefined : await siteAccountOf/.test(route))
    check("  nothing owned (signed in or as a guest)", /owned: account\?\.customer\?\.email/.test(route) && /!token && !stranger && page && \/\(\?:\^\|;\\s\*\)sl_owned=\//.test(route))
    check("  no chosen country, only the marker's", /const visitorCountry = stranger\s*\?\s*siteVisitorCountry\(\{ chosen: null, told: stranger\.country, seen: null \}\)/.test(route))
    check("  and no checkout pricing", /const site = token \|\| stranger \? found\.site :/.test(route))
    check("its fill script is put on the shared copy only", /if \(shared\) \{\s*const end = html\.search/.test(route) && route.includes("personalFillTag(out.personal"))
  }

  console.log("\nThe private answer\n")
  {
    const r = await call("GET", "/?sl_personal=cc,who,drawer,hero&sl_layout=1", { cart: CART, account: { customer: ANA } })
    const d = JSON.parse(body(r))
    check("JSON, never kept", r.type.startsWith("application/json") && r.headers?.["Cache-Control"] === "private, no-store")
    check("the count and the sign in", d.count === 2 && d.signedIn === true, d)
    check("the cart count drawn both ways: the shared copy's 0, the buyer's 2", Array.isArray(d.sections.cc) && d.sections.cc[0].includes('data-count="0"') && d.sections.cc[1].includes('data-count="2"'), d.sections.cc)
    check("the account link both ways", d.sections.who?.[0]?.includes("Log in") && d.sections.who?.[1]?.includes("Hi Ana"), d.sections.who)
    check("the drawer's lines", d.sections.drawer?.[1]?.includes("Shirt 1") && !d.sections.drawer?.[0]?.includes("Shirt 1"))
    check("a section that is the same both ways is not sent", d.sections.hero === null, d.sections.hero)
    check("the layout drawn alone both ways, the page's place marked", Array.isArray(d.layout) && d.layout[0].includes('data-n="0"') && d.layout[1].includes('data-n="2"') && d.layout[0].includes(SLOT_MARK), d.layout)
    check("  never the page's own sections in it", !d.layout?.[1]?.includes("Linen for summer"))

    const stranger = JSON.parse(body(await call("GET", "/?sl_personal=cc,who")))
    check("for somebody with nothing, nothing differs", stranger.count === 0 && stranger.signedIn === false && stranger.sections.cc === null && stranger.sections.who === null, stranger)
    check("ids are shaped as ids, each once, at most sixteen", personalIds("a,b,a,<x>,c d,e").join() === "a,b,e" && personalIds(Array.from({ length: 30 }, (_, i) => `s${i}`).join()).length === 16)
  }

  console.log("\nThe proxy\n")
  {
    const base: StrangerRequest = { method: "GET", path: "/", query: new URLSearchParams(), cookie: null, accept: "text/html", contentType: null, requestedWith: null, protectedSite: false, offersLanguage: false }
    const page = (cookie: string) => strangerPage({ ...base, cookie })
    check("a stranger: the shared page", strangerPage(base))
    check("a buyer whose cart has its count beside it: the shared page", page("sl_theme_cart=abc; sl_cart_n=2"))
    check("a signed in customer with the hint: the shared page", page("__Host-sl_site_session=tok; sl_signed_in=1"))
    check("a guest who bought here, with the hint: the shared page", page("sl_owned=g; sl_owned_hint=1"))
    check("the owner, signed in to Storelib: the shared page", page("sb-abc-auth-token=x; sl_country=RO"))
    check("a cart from before the count: drawn for itself once (which sets the count)", !page("sl_theme_cart=abc"))
    check("  a session without its hint, the same", !page("__Host-sl_site_session=tok") && !page("sl_owned=g"))
    check("the cart, checkout, account and search are never shared", ["/cart", "/checkout", "/account", "/account/orders", "/search"].every((path) => !strangerPage({ ...base, path })))
    check("nor a script's request, nor the private fill answer", !strangerPage({ ...base, accept: "application/json" }) && !strangerPage({ ...base, query: new URLSearchParams("sl_personal=cc") }) && !strangerPage({ ...base, path: "/cart.js" }))
    check("hintedCookies: no cookie at all is fine", hintedCookies(null) && hintedCookies(""))

    check("unknown query keys are left out of the shared copy's address", sharedQuery(new URLSearchParams("utm_source=x&fbclid=y&z=123")) === "")
    check("  the keys a page reads are kept, in one order", sharedQuery(new URLSearchParams("sort_by=price&page=2&utm_x=1")) === "?page=2&sort_by=price")
    check("  filters kept, two values of one too, each once", sharedQuery(new URLSearchParams("filter.v.option.size=L&filter.v.option.size=M&filter.v.option.size=L")) === "?filter.v.option.size=L&filter.v.option.size=M")
    check("  a long value is left out", sharedQuery(new URLSearchParams(`page=${"9".repeat(300)}`)) === "")
    const proxy = readFileSync("proxy.ts", "utf8")
    check("the proxy draws a shared page with that query", proxy.includes("to.search = marker ? sharedQuery(new URLSearchParams(query)) : query"))
    const handler = readFileSync("app/api/site-theme/site/[username]/[[...path]]/route.ts", "utf8")
    check("  and the handler draws and holds it with that query (a rewrite carries the browser's own query along)", /segments = segments\.slice\(1\)\s*\/\*[^*]*\*\/\s*url\.search = sharedQuery\(url\.searchParams\)/.test(handler) && /url\.search = sharedQuery\(url\.searchParams\)\s*const page = await heldStrangerPage\(/.test(handler))
    check("a cart from before its count is given one by the proxy (its next page may be the CDN's)", proxy.includes('if (request.method === "GET" && request.cookies.get("sl_theme_cart")?.value && !request.cookies.get("sl_cart_n")) {') && proxy.includes('r.cookies.set("sl_cart_n", "1",'))
  }

  console.log("\nThe CDN\n")
  {
    const route = readFileSync("app/api/site-theme/site/[username]/[[...path]]/route.ts", "utf8")
    check("a shared page is the CDN's, five minutes fresh, then served at once for a day while drawn again (Changed on purpose (r54))", SHARED_PAGE_CDN === "public, s-maxage=300, stale-while-revalidate=86400")
    check("  the browser still told what any page says (Vercel never passes the CDN header on)", PUBLIC_PAGE_CACHE === "private, no-cache")
    check("  only on a shared page opened as a page, and never in a market's currency (the CDN keys on the browser's address: round 48)", /if \(openedAsDocument\(req\.headers\) && stranger\?\.market === null\) \{\s*const id = found\.site\.creatorId\s*headers\.set\("Vercel-CDN-Cache-Control", SHARED_PAGE_CDN\)/.test(route))
    check("  under the tags the hold is kept under, which Publish and saves expire", route.includes('headers.set("Vercel-Cache-Tag", [creatorSiteTag(id), creatorShopTag(id), siteBlogTag(id)].join(","))'))
    check("  a document and a script's fetch of it are held apart, and the country the selector shows", route.includes('headers.set("Vary", "Sec-Fetch-Dest, X-Vercel-IP-Country")'))
    check("  decided by publicAnswer: a plain 200 page that set no cookie", /const shared = stranger !== null && !ajax && publicAnswer\(/.test(route))
    check("the cart's count is written beside the cart cookie", route.includes("cartHintCookie(out.cart.reduce(") && cartHintCookie(3) === "sl_cart_n=3; Path=/; Max-Age=1209600; SameSite=Lax; Secure")
    const checkout = readFileSync("app/api/checkout/site/route.ts", "utf8")
    check("  and by checkout, which changes the cart too", (checkout.match(/themeCartHeaders\(/g) ?? []).length === 3 && checkout.includes("${CART_HINT_COOKIE}=; Path=/; Max-Age=0"))
  }

  console.log("\nThe fill script\n")
  {
    const tag = personalFillTag({ sections: ["cc", "who", "<bad>"], layout: true })
    check("names the sections and the layout, and nothing malformed", tag.includes('{"s":["cc","who"],"l":1}'))
    check("asks for nothing without a hint", /if\(!cart&&!signed&&!owned\)return/.test(tag))
    check("asks once, privately, for the page it is on", tag.includes('q.set("sl_personal",P.s.join(","))') && tag.includes('cache:"no-store"'))
    check("writes the real count back to the hint", tag.includes('document.cookie="sl_cart_n="+(d.count|0)'))
    check("small", tag.length < 4500, tag.length)
  }

  console.log("\nThe first big picture\n")
  {
    const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/a.css"></head><body>${body}</body></html>`
    const header = `<div id="shopify-section-header" class="shopify-section shopify-section-group-header-group"><img src="/logo.png" width="120" height="40"></div>`
    const slide = `<div id="shopify-section-slideshow" class="shopify-section"><img src="/hero.jpg" srcset="/hero-600.jpg 600w, /hero-1200.jpg 1200w" sizes="100vw" width="1200" height="800"></div>`
    const r = withLcpHint(page(header + slide))
    check("the first picture of the page's own first section is chosen, never the header's logo", r.src === "/hero.jpg", r.src)
    check("  preloaded from the top of the head, with its srcset and sizes, before any stylesheet", /<meta name="viewport" content="width=device-width"><link rel="preload" as="image" data-sl-lcp href="\/hero\.jpg" imagesrcset="\/hero-600\.jpg 600w, \/hero-1200\.jpg 1200w" imagesizes="100vw" fetchpriority="high"><link rel="stylesheet"/.test(r.html), r.html.slice(0, 400))
    check("  and asked for first", r.html.includes('<img fetchpriority="high" src="/hero.jpg"'))
    const lazy = withLcpHint(page(header + slide.replace("<img ", '<img loading="lazy" ')))
    check("a picture the theme loads late is left alone", lazy.src === null && !lazy.html.includes("data-sl-lcp"))
    const own = withLcpHint(page(header + slide.replace("<img ", '<img fetchpriority="auto" ')))
    check("  a priority the theme set is kept (the preload still made)", own.html.includes('<img fetchpriority="auto"') && own.html.includes("data-sl-lcp"))
    const pic = withLcpHint(page(`<div id="shopify-section-s" class="shopify-section"><picture><source media="(max-width: 767px)" srcset="https://img.example/m.jpg 600w"><img src="https://img.example/d.jpg" width="1500"></picture></div>`))
    check("in a <picture>: the source for its media, the <img> for the rest, the host's connection opened", pic.html.includes('<link rel="preconnect" href="https://img.example" data-sl-lcp>') && pic.html.includes('imagesrcset="https://img.example/m.jpg 600w" media="(max-width: 767px)"') && pic.html.includes('href="https://img.example/d.jpg" media="not all and (max-width: 767px)"'))
    const typed = withLcpHint(page(`<div id="shopify-section-s" class="shopify-section"><picture><source type="image/avif" srcset="/a.avif"><img src="/a.jpg" width="900"></picture></div>`))
    check("  a source of one type only is not preloaded (a browser without it would fetch it anyway)", typed.src === null)
    check("a small picture (an icon) is not chosen", withLcpHint(page(`<div id="shopify-section-s" class="shopify-section"><img src="/i.png" width="24"></div>`)).src === null)
    check("a page with no section is returned as it came", withLcpHint(page("<p>hi</p>")).html === page("<p>hi</p>"))
    const shopifyHost = withLcpHint(page(`<div id="shopify-section-s" class="shopify-section"><img src="https://cdn.shopify.com/x.jpg" width="900"></div>`))
    check("no connection named for the platform the theme came from", !shopifyHost.html.includes('rel="preconnect"') && shopifyHost.src !== null)
  }

  console.log("\nLimits on a website's own host\n")
  {
    const route = readFileSync("app/api/site-theme/site/[username]/[[...path]]/route.ts", "utf8")
    check("a cart change or form post: 120 a minute an address", /bucket: "site-theme-post", subjects: \[addressSubject\(req\)\], windows: \[\{ limit: 120, seconds: 60 \}\]/.test(route))
    check("a page drawn for one visitor: 300 a minute", /bucket: "site-theme-draw", subjects: \[addressSubject\(req\)\], windows: \[\{ limit: 300, seconds: 60 \}\]/.test(route))
    check("a shared page the CDN did not have: 120 a minute, before the hold", /bucket: "site-theme-shared"/.test(route) && route.indexOf('bucket: "site-theme-shared"') < route.indexOf("const page = await heldStrangerPage("))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
