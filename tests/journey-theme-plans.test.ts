/**
 * ===========================================================================
 *  A MEMBERSHIP OR A COMMUNITY'S TIER ON AN IMPORTED THEME'S PRODUCT FORM
 * ===========================================================================
 * The buyer's journey audit found it: a Materia product page (or a featured
 * product) selling a membership or a community's tier added it to the cart,
 * and the website's checkout then dropped it ("can't be bought right now",
 * lib/checkout/pricing), or, for a tier only a picker can name, Add to cart
 * said "This product is not available". A plan is joined on Storelib's own
 * checkout, with an account and its recurring price, never carried in a cart.
 *
 * Driven through the real lib/storelib-theme/compat/site.ts `answer`:
 *
 *   a plain post and Buy it now   303 to /checkout?productId=… with src,
 *                                 site, return and cancel on this website
 *   a theme's fetch               422 with X-Storelib-Go, which the page's
 *                                 head script (shims.ts PLAN_GO) follows,
 *                                 only to a path of this site
 *   a course, a download          still go in the cart as before
 */
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, PLAN_GO_HEADER, planJoinHref, type CartEntry, type SiteData, type SiteRequest } from "../lib/storelib-theme/compat/site"
import { PLAN_GO, shopifyBootstrap } from "../lib/storelib-theme/compat/shims"
import { coursePlayerHref, ownedBanner } from "../lib/storelib-theme/compat/owned-banner"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}

const SHOP = "7a1c0000-0000-4000-8000-000000000001"
const COURSE = "7a1c0000-0000-4000-8000-0000000000a1"
const CLUB = "7a1c0000-0000-4000-8000-0000000000a2"
const TIER = "7a1c0000-0000-4000-8000-0000000000a3"
const TIER_YEAR = "7a1c0000-0000-4000-8000-0000000000b3"

const card = (id: string, title: string, kind: string, variants: { id: string; name: string }[] = []) => {
  const slug = title.toLowerCase().replace(/ /g, "-")
  return { id, settings: { title, price: "$20.00", image: "", url: `/products/${slug}`, slug, kind, available: true, checkout_url: `/checkout?productId=${id}&src=website`, variants: variants.map((v) => ({ ...v, price: "", available: true })), options: [] } }
}
const theme = new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>`) }, {}, { assetUrl: (n) => `/a/${n}` })
const site: SiteData = {
  creatorId: SHOP,
  theme,
  pages: {},
  /* The shop's own list: a course and a membership (a community's tier is never in it, lib/communities/listing). */
  products: [card(COURSE, "Editing Course", "course"), card(CLUB, "Studio Club", "membership")] as never,
  /* What a picker may name: the tier too, with a yearly option. */
  pickable: [card(COURSE, "Editing Course", "course"), card(CLUB, "Studio Club", "membership"), card(TIER, "Inner Circle", "community", [{ id: TIER_YEAR, name: "Yearly" }])] as never,
  collections: [],
  menus: {},
  shop: { name: "Cutroom", currency: "USD", moneyFormat: "${{amount}}" },
  host: "cutroom.storelib.com",
}

async function ask(method: string, url: string, body: Record<string, unknown> | null, opts: { ajax?: boolean; cart?: CartEntry[]; referer?: string } = {}) {
  const u = new URL(url, "https://cutroom.storelib.com")
  const req: SiteRequest = { method, path: u.pathname, query: u.searchParams, body, cart: opts.cart ?? [], ajax: opts.ajax ?? false, referer: opts.referer ?? "/products/studio-club" }
  return answer(site, req)
}

async function main() {
  console.log("\n1. A plain post of the product form")
  {
    const out = await ask("POST", "/cart/add", { id: CLUB, quantity: "1", form_type: "product" })
    const to = new URL(out.headers?.Location ?? "/", "https://cutroom.storelib.com")
    check("Add to cart on a membership goes to joining it (303 to /checkout?productId=)", out.status === 303 && to.pathname === "/checkout" && to.searchParams.get("productId") === CLUB, { status: out.status, location: out.headers?.Location })
    check("  from this website, coming back to the page it was pressed on", to.searchParams.get("src") === "website" && to.searchParams.get("site") === "cutroom.storelib.com" && to.searchParams.get("return") === "https://cutroom.storelib.com/products/studio-club" && to.searchParams.get("cancel") === "https://cutroom.storelib.com/products/studio-club", Object.fromEntries(to.searchParams))
    check("  and the cart is left as it was: nothing for the checkout to drop", out.cart === undefined, out.cart)
  }

  console.log("\n2. Buy it now on a community's tier a featured product picked")
  {
    const out = await ask("POST", "/cart/add", { id: TIER_YEAR, quantity: "1", checkout: "1" }, { referer: "/" })
    const to = new URL(out.headers?.Location ?? "/", "https://cutroom.storelib.com")
    check("the tier, which is not in the shop's list, still goes to its checkout (it said \"not available\")", out.status === 303 && to.searchParams.get("productId") === TIER && to.searchParams.get("variantId") === TIER_YEAR, out.headers)
    check("  with the home page it was on to come back to", to.searchParams.get("return") === "https://cutroom.storelib.com/", Object.fromEntries(to.searchParams))
    const bare = await ask("POST", "/cart/add", { id: TIER }, { referer: "" })
    const back = new URL(bare.headers?.Location ?? "/", "https://x").searchParams.get("return")
    check("  a press from no page of the site comes back to the plan's own page, never the cart", back === "https://cutroom.storelib.com/products/inner-circle", back)
  }

  console.log("\n3. A theme's script adding by fetch")
  {
    const out = await ask("POST", "/cart/add.js", { id: CLUB, quantity: 1 }, { ajax: true })
    const go = out.headers?.[PLAN_GO_HEADER] ?? ""
    const body = JSON.parse(String(out.body))
    check("answered 422 with the plan's checkout in X-Storelib-Go", out.status === 422 && go.startsWith(`/checkout?productId=${CLUB}`), { status: out.status, headers: out.headers })
    check("  and words the theme can show meanwhile", /Studio Club is joined on its own page/.test(body.description ?? ""), body)
    const mixed = await ask("POST", "/cart/add.js", { items: [{ id: COURSE, quantity: 1 }, { id: CLUB, quantity: 1 }] }, { ajax: true })
    check("  a plan among other lines is refused whole, nothing added", mixed.status === 422 && mixed.cart === undefined, { status: mixed.status, body: String(mixed.body).slice(0, 200) })
  }

  console.log("\n4. A course still goes in the cart")
  {
    const out = await ask("POST", "/cart/add.js", { id: COURSE, quantity: 1 }, { ajax: true })
    check("the course is added (200, one line, no X-Storelib-Go)", out.status === 200 && out.cart?.length === 1 && out.cart[0].p === COURSE && !out.headers?.[PLAN_GO_HEADER], { status: out.status, cart: out.cart })
    check("planJoinHref is null for anything that is not a plan", planJoinHref(site, COURSE, "/") === null && planJoinHref(site, "nope", "/") === null)
  }

  console.log("\n5. The page follows the header, and only to this site")
  {
    const head = shopifyBootstrap({ shopName: "Cutroom", currency: "USD", designMode: false })
    check("the live page's head carries the follower", head.includes("X-Storelib-Go"))
    check("  beside Buy it now in the page's own head script", head.indexOf(PLAN_GO) > head.indexOf("data-storelib-buy-now"))
    /* The follower alone, in a bare window: what it does with each answer. */
    const run = (go: string | null, editing = false) => {
      const went: string[] = []
      const win: Record<string, any> = {
        fetch: async () => ({ headers: { get: (n: string) => (n === "X-Storelib-Go" ? go : null) } }),
        XMLHttpRequest: function () {},
      }
      win.XMLHttpRequest.prototype = { open() {}, addEventListener() {} }
      const location = { assign: (u: string) => went.push(u) }
      try {
        new Function("window", "location", "XMLHttpRequest", "EDITING", PLAN_GO)(win, location, win.XMLHttpRequest, editing)
      } catch (e) {
        return { error: String(e), went }
      }
      return { win, went }
    }
    const a = run("/checkout?productId=x")
    if ("error" in a) check("the head script runs in a bare window", false, a)
    else {
      await a.win.fetch("/cart/add.js")
      check("a fetch answered with X-Storelib-Go: /checkout?… goes there", a.went.join() === "/checkout?productId=x", a.went)
    }
    for (const evil of ["//evil.example/x", "https://evil.example/", "/\\evil.example"]) {
      const b = run(evil)
      if (!("error" in b)) await b.win.fetch("/cart/add.js")
      check(`  never to another site: ${evil}`, !("error" in b) && b.went.length === 0, b.went)
    }
    const c = run("/checkout?productId=x", true)
    if (!("error" in c)) await c.win.fetch("/cart/add.js")
    check("  never in the builder's canvas", !("error" in c) && c.went.length === 0, c.went)
  }

  console.log("\n6. A course already bought opens from its own page")
  {
    const href = coursePlayerHref("storelib.com", COURSE)
    check("the course's player on Storelib, by the product's id", href === `https://storelib.com/account/library/courses/${COURSE}`, href)
    check("  nothing for an id that is not one, or a host that is not a host", coursePlayerHref("storelib.com", "../x") === null && coursePlayerHref("evil.example/x?", COURSE) === null)
    const course = ownedBanner({ whole: true, options: [] }, null, null, { course: href })
    check("the notice says it is a course and opens it in one press", /You already own this course\./.test(course) && course.includes(`<a href="${href}">Open course</a>`) && !/Go to your downloads/.test(course), course.slice(course.indexOf("<div"), course.indexOf("<div") + 400))
    const forged = ownedBanner({ whole: true, options: [] }, null, null, { course: "javascript:alert(1)" })
    check("  a link that is not a course player is the downloads notice, as before", /href="\/account">Go to your downloads</.test(forged) && !/javascript:/.test(forged))
  }

  console.log("\n7. The page of a course a signed in customer owns")
  {
    const u = new URL("https://cutroom.storelib.com/products/editing-course")
    const withProduct: SiteData = { ...site, pages: { product: [{ id: "main", type: "main-product" }] as never }, theme: new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>`), "sections/main-product.storelib": `${wrapCompatTemplate(`<h1>{{ product.title }}</h1>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [] })}\n</schema>\n`, "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product" } }, order: ["main"] }) }, {}, { assetUrl: (n) => `/a/${n}` }) }
    const out = await answer(withProduct, { method: "GET", path: u.pathname, query: u.searchParams, body: null, cart: [], owned: async (id) => (id === COURSE ? { whole: true, options: [] } : null) })
    const html = String(out.body)
    check("its notice opens the course player, not the downloads", out.status === 200 && /Open course<\/a>/.test(html) && new RegExp(`/account/library/courses/${COURSE}`).test(html), { status: out.status, tail: html.slice(-700) })
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
