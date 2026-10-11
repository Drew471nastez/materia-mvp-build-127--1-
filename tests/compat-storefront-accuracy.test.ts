/**
 * ===========================================================================
 *  AN IMPORTED THEME, AS ITS OWN STORE SHOWED IT
 * ===========================================================================
 * What this holds, and why:
 *
 *   BUTTON LABELS      a rule written for a button AND `that button *`
 *                      (Posturex's cart drawer Check out) painted the label's
 *                      <span> with the button's resting colour; on hover the
 *                      word sat on a dark box of its own. What is inside a
 *                      button gets a clear background, at the same weight
 *                      (lib/storelib-theme/compat/css-fixes.ts).
 *   ICONS              an icon from a sprite FILE (`<use href="icons.svg#x">`)
 *                      drew nothing in the builder's canvas, a frame with no
 *                      origin; it is drawn in place (./icons.ts). And an icon
 *                      written as a base64 data URI needs base64_encode.
 *   THE CART ICON      in the canvas, a link the theme handles itself (the
 *                      header's cart opening its drawer) is the theme's: the
 *                      builder opens a page only for a link nobody took.
 *   ACCOUNT PAGES      /account, /account/login and /account/register draw in
 *                      the canvas, in the theme; signing in there says it
 *                      works on the live site.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fixInlineStyles, fixThemeCss } from "../lib/storelib-theme/compat/css-fixes"
import { inlineSpriteFiles } from "../lib/storelib-theme/compat/icons"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, canvasAccountPage, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { themeCustomer } from "../lib/storelib-theme/compat/account"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`

async function main() {
  console.log("\nA button's label never wears a box of its own\n")
  {
    const posturex = `/* Checkout button, cart scheme's primary. */
  cart-notification.minicart .btn-checkout,
  cart-notification.minicart .btn-checkout * {
    background-color: #171717 !important;
    color: #ffffff !important;
    border-color: #171717 !important;
  }
  cart-notification.minicart .btn-checkout:hover { background-color: #383838 !important; }`
    const out = fixThemeCss(posturex)
    check("the button keeps its colour, as written", /cart-notification\.minicart \.btn-checkout\{\s*background-color: #171717 !important;/.test(out), out)
    check("what is inside it is clear, with the same weight", /cart-notification\.minicart \.btn-checkout \*\{background-color:transparent !important;/.test(out), out)
    check("and keeps the colour the * was written for", /\.btn-checkout \*\{[^}]*color: #ffffff !important/.test(out), out)
    check("the hover rule is untouched", out.includes("cart-notification.minicart .btn-checkout:hover { background-color: #383838 !important; }"))
    check("a rule for something that is not a button is left alone", fixThemeCss(".card, .card * { background: red }") === ".card, .card * { background: red }")
    check("a rule with no background is left alone", fixThemeCss(".btn, .btn * { color: red }") === ".btn, .btn * { color: red }")
    check("only `X` with `X *`: a lone `.btn *` is the theme's choice", fixThemeCss(".btn * { background: red }") === ".btn * { background: red }")
    check("inside @media too", /\.btn-primary \*\{background:transparent; color: white \}/.test(fixThemeCss("@media (max-width: 10px) { .btn-primary, .btn-primary * { background: blue; color: white } }")))
    check("background-image is cleared to none", /\.button \*\{background-image:none\}/.test(fixThemeCss(".button, .button * { background-image: linear-gradient(red, blue) }")))
    check(":not(.btn *) inside a selector is not a pair", fixThemeCss(".x:not(.btn *), .btn { background: red }") === ".x:not(.btn *), .btn { background: red }")
    check("a stylesheet with nothing to fix comes back as the same string", fixThemeCss("a{color:red}") === "a{color:red}")
    check("a page's <style> blocks are fixed, the rest of it untouched", fixInlineStyles(`<p>.btn, .btn * {background:red}</p><style>.btn, .btn * {background:red}</style>`) === `<p>.btn, .btn * {background:red}</p><style>.btn{background:red}.btn *{background:transparent}</style>`)

    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head><style>.btn-checkout, .btn-checkout * { background: #111 }</style></head><body>{{ content_for_layout }}</body></html>`),
      "sections/s.storelib": section("s", `<style>.drawer .btn-checkout, .drawer .btn-checkout * { background-color: #111 !important }</style><button class="btn-checkout"><span>Checkout</span></button>`),
      "assets/theme.css": ".btn, .btn * { background: #222 }",
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}`, assetText: (n) => (files as Record<string, string>)[`assets/${n}`] ?? null })
    const ctx = theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } })
    const drawn = theme.renderSection(ctx, { id: "s1", type: "s", settings: {}, hidden: false, blocks: [] }).html
    check("a section's own <style> is fixed as it is drawn (and on every section re-render)", /\.drawer \.btn-checkout \*\{background-color:transparent !important\}/.test(drawn), drawn.slice(0, 300))
    const asset = themeAsset(theme, "theme.css", () => ctx)
    check("so is the theme's CSS asset", String(asset?.body) === ".btn{ background: #222 }.btn *{background:transparent}", asset?.body)
    const route = read("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
    check("and the asset route serves a stored stylesheet fixed the same way", /\/\^text\\\/css\/\.test\(type\) \? fixThemeCss\(text\) : text/.test(route))
  }

  console.log("\nIcons\n")
  {
    const sprite = `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="icon-cart" viewBox="0 0 24 24"><path d="M1 1h22"/></symbol><symbol id="icon-x" viewBox="0 0 10 10"><circle r="4"/></symbol></svg>`
    const page = `<svg class="icon"><use xlink:href="/a/icons.svg#icon-cart"></use></svg><svg><use href="#local"/></svg><svg><use href="https://elsewhere.test/i.svg#icon-x"/></svg>`
    const out = inlineSpriteFiles(page, (url) => (url === "/a/icons.svg" ? sprite : null))
    check("an icon from the theme's sprite file is drawn in place, with the symbol's viewBox", out.startsWith(`<svg class="icon"><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M1 1h22"/></svg></svg>`), out)
    check("a sprite in the page itself (#local) is left to the page", out.includes(`<use href="#local"/>`))
    check("a file that is not the theme's is left as written", out.includes(`<use href="https://elsewhere.test/i.svg#icon-x"/>`))
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{{ content_for_layout }}</body></html>`),
      "sections/s.storelib": section("s", `<a class="cart"><svg><use href="{{ 'icons.svg' | asset_url }}#icon-cart"/></svg></a><i style="background:url(data:image/svg+xml;base64,{{ '<svg/>' | base64_encode }})"></i>`),
      "assets/icons.svg": sprite,
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/api/site-theme/assets/i/1/${encodeURIComponent(n)}`, assetText: (n) => (files as Record<string, string>)[`assets/${n}`] ?? null })
    const ctx = theme.pageContext({ template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "" } })
    const drawn = theme.renderSection(ctx, { id: "s1", type: "s", settings: {}, hidden: false, blocks: [] }).html
    check("drawn through the theme: the sprite file's icon is inline, nothing to fetch", /<a class="cart"><svg><svg viewBox="0 0 24 24"[^>]*><path d="M1 1h22"\/><\/svg><\/svg><\/a>/.test(drawn), drawn.slice(0, 300))
    check("base64_encode makes a data URI an icon can be drawn from", drawn.includes("base64,PHN2Zy8+"), drawn)
    const enc = compatFilter("base64_encode")!
    const dec = compatFilter("base64_decode")!
    check("base64 of UTF-8 text, both ways", enc("✓ ok", [], {}, undefined as never) === "4pyTIG9r" && dec("4pyTIG9r", [], {}, undefined as never) === "✓ ok")
    check("url-safe base64", compatFilter("base64_url_safe_encode")!("??>", [], {}, undefined as never) === "Pz8-")
  }

  console.log("\nA palette's colours are colours (Horizon)\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{{ content_for_layout }}</body></html>`),
      "config/settings_schema.json": JSON.stringify([{ name: "Colors", settings: [{ type: "color_palette", id: "color_palette", default: { background: "#ffffff", foreground: "#000000" } }, { type: "color", id: "accent", default: "{{ settings.color_palette.color1 }}" }] }]),
      "sections/s.storelib": section("s", `{%- liquid
  assign lightest = '#ffffff'
  assign lightest_b = -1
  for c in settings.color_palette
    if c != blank and c.alpha == 1
      assign b = c | color_brightness
      if b > lightest_b
        assign lightest = c
        assign lightest_b = b
      endif
    endif
  endfor
-%}<i data-l="{{ lightest }}" data-rgb="{{ lightest.rgb }}" data-c3="{{ settings.color_palette.color3 }}" data-accent="{{ settings.accent.rgb }}"></i>`),
    }
    const theme = new CompatTheme(files, { color_palette: { background: "#ffffff", foreground: "#000000", color1: "#333333", color2: "#EEF1EA", color3: "#DFDFDF" }, accent: "{{ settings.color_palette.color1 }}" }, { assetUrl: (n) => `/a/${n}` })
    const ctx = theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } })
    const drawn = theme.renderSection(ctx, { id: "s1", type: "s", settings: {}, hidden: false, blocks: [] }).html
    check("walking the palette finds its lightest colour, as a colour with .rgb (--palette-lightest-rgb was empty)", /data-l="#ffffff" data-rgb="255 255 255"/.test(drawn), drawn)
    check("one of its colours by name prints as the colour", /data-c3="#dfdfdf"/i.test(drawn), drawn)
    check("a colour setting that names a palette colour is that colour", /data-accent="51 51 51"/.test(drawn), drawn)
  }

  console.log("\nThe header's cart in the canvas\n")
  {
    check("a link is followed only once every listener of the theme's has had the click, at the window, last", /var last = function \(ev\) \{ if \(ev === e\) decide\(\); \};\s*addEventListener\("click", last\);/.test(CANVAS_BRIDGE))
    check("  a click the theme prevented is the theme's: no page opened under its drawer", /e\.preventDefault = function \(\) \{ themeTook = true; return own\.call\(e\); \};/.test(CANVAS_BRIDGE) && /if \(themeTook\) \{ taken = /.test(CANVAS_BRIDGE))
    check("  the frame itself never follows a link either way", /if \(!e\.defaultPrevented\) own\.call\(e\);/.test(CANVAS_BRIDGE))
    check("  a theme that stops the click going further is asked as soon as its listener returns", /\["stopPropagation", "stopImmediatePropagation"\]\.forEach/.test(CANVAS_BRIDGE) && /Promise\.resolve\(\)\.then\(decide\)/.test(CANVAS_BRIDGE))
    check("  a theme that takes the link and opens the page itself still opens it in the builder", /addEventListener\("pagehide", function \(\) \{\s*if \(taken && Date\.now\(\) - taken\.at < 3000\) post\(\{ type: "navigate"/.test(CANVAS_BRIDGE))
    /* Run it: a page whose header cart opens a drawer, and a plain link. */
    const posted: unknown[] = []
    const listeners: Record<string, { fn: (e: unknown) => void; capture: boolean }[]> = {}
    const add = (type: string, fn: (e: unknown) => void, opt?: unknown) => { (listeners[type] ??= []).push({ fn, capture: opt === true || (typeof opt === "object" && !!(opt as { capture?: boolean })?.capture) }) }
    const remove = (type: string, fn: (e: unknown) => void) => { listeners[type] = (listeners[type] ?? []).filter((l) => l.fn !== fn) }
    const docListeners: Record<string, { fn: (e: unknown) => void; capture: boolean }[]> = {}
    const fakeDoc = { addEventListener: (t: string, fn: (e: unknown) => void, o?: unknown) => { (docListeners[t] ??= []).push({ fn, capture: o === true }) }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }), createTextNode: () => ({}), elementFromPoint: () => null, documentElement: { scrollHeight: 0 }, readyState: "complete", head: { appendChild() {} }, body: {} }
    const env = { window: { addEventListener: add, removeEventListener: remove } as Record<string, unknown>, document: fakeDoc, addEventListener: add, removeEventListener: remove, parent: { postMessage: (m: unknown) => posted.push(m) }, requestAnimationFrame: () => 0, CSS: { escape: (x: string) => x }, MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} }, innerHeight: 800, scrollY: 0, location: { pathname: "/" } }
    let ran = true
    try {
      new Function(...Object.keys(env), CANVAS_BRIDGE)(...Object.values(env))
    } catch (err) {
      ran = false
      console.log("   bridge:", String(err).slice(0, 200))
    }
    const click = (link: { href: string; inHeader: boolean }, theme: "prevents" | "stops" | "nothing") => {
      posted.length = 0
      let prevented = false
      const el = { closest: (sel: string) => (sel === "a[href]" ? { getAttribute: () => link.href, closest: () => (link.inHeader ? {} : null) } : null), getAttribute: () => null }
      const e: Record<string, unknown> = { target: el, defaultPrevented: false, preventDefault() { prevented = true; e.defaultPrevented = true }, stopPropagation() {}, stopImmediatePropagation() {} }
      for (const l of docListeners.click ?? []) if (l.capture) l.fn(e)
      let stopped = false
      if (theme === "prevents") (e.preventDefault as () => void)()
      if (theme === "stops") { (e.stopPropagation as () => void)(); stopped = true }
      if (!stopped) for (const l of [...(listeners.click ?? [])]) if (!l.capture) l.fn(e)
      return { prevented, nav: () => posted.filter((m) => (m as { type?: string }).type === "navigate") }
    }
    if (ran && docListeners.click) {
      const drawer = click({ href: "/cart", inHeader: true }, "prevents")
      check("run: the header's cart the theme opens a drawer from posts no page to open", drawer.nav().length === 0 && drawer.prevented)
      const plain = click({ href: "/collections/all", inHeader: true }, "nothing")
      check("run: a plain link nobody took opens its page, and the frame does not follow it", plain.nav().length === 1 && plain.prevented)
      const stopped = click({ href: "/pages/about", inHeader: true }, "stops")
      check("run: a click the theme stopped is kept from the frame at once", stopped.prevented)
      await Promise.resolve()
      check("  and, untaken, opens its page", stopped.nav().length === 1)
    } else check("the bridge runs", false, "it did not run in the fake page")
  }

  console.log("\nAccount pages in the canvas\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`),
      "sections/hdr.storelib": section("hdr", `<header class="hdr">{% if customer %}Hi {{ customer.first_name }}{% else %}Log in{% endif %}</header>`),
    }
    const site: SiteData = { creatorId: "", theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }), pages: { home: [{ id: "h", type: "hdr", group: "header" }] }, products: [], collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "" }
    const login = canvasAccountPage(site, "/account/login", { extraBodyEnd: "<script>bridge</script>" })
    check("/account/login draws in the theme's header, as a guest sees it", !!login && /class="hdr">Log in/.test(login.html) && /<h1>Sign in<\/h1>/.test(login.html) && login.html.includes("<script>bridge</script>"), login?.html.slice(0, 200))
    const register = canvasAccountPage(site, "/account/register/")
    check("/account/register too, worded for a new account", !!register && /<h1>Create account<\/h1>/.test(register.html) && register.path === "/account/register")
    const account = canvasAccountPage(site, "/account?x=1")
    check("/account draws the account page, about a sample customer, never a real one", !!account && /Sample customer/.test(account.html) && /Hi Sample/.test(account.html))
    check("any other address is not an account page of the canvas", canvasAccountPage(site, "/account/orders/1") === null && canvasAccountPage(site, "/cart") === null)
    check("sending a sign in form in the canvas says it works on the live site, and sends nothing", /var accountPost = function \(path, data\)/.test(CANVAS_BRIDGE.length ? read("lib/storelib-theme/compat/canvas-bridge.ts") : "") && /liveOnly\("account"\)/.test(read("lib/storelib-theme/compat/canvas-bridge.ts")))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas opens the account pages itself, drawn by the theme", /canvasAccountPage\(canvasSite\(\), accountPath, extra\)/.test(canvas) && /CANVAS_ACCOUNT_PATHS as readonly string\[\]\)\.includes\(to\)/.test(canvas))
    check("  and leaves them for any other link or page", /if \(accountRef\.current\) setAccountPath\(null\)/.test(canvas) && /useEffect\(\(\) => setAccountPath\(null\), \[pageKey, productId\]\)/.test(canvas))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor says so in its toast: Sign in works on your live site", /toast\("Sign in works on your live site"/.test(editor) && /what === "account" \? "account" : "checkout"/.test(canvas))
  }

  console.log("\nDownloads from the website's own account\n")
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`),
      "sections/hdr.storelib": section("hdr", `<header class="hdr">Shop</header>`),
    }
    const site: SiteData = { creatorId: "c", theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }), pages: { home: [{ id: "h", type: "hdr", group: "header" }] }, products: [], collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "shop.test" }
    const OID = "40000000-0000-4000-8000-000000000001"
    const customer = { name: "Ana Pop", first_name: "Ana", email: "ana@mail.test", orders: [{ id: OID, number: "40000000", date: "Sep 20, 2026", status: "Complete", state: "open", total: "$12.00", items: [{ title: "Apron pattern", image: "", url: "", variant: "" }], item_count: 1, action_label: "Download", action_url: `/account/orders/${OID}` }], orders_count: 1 }
    const order = { id: OID, number: "40000000", date: "Sep 20, 2026", total: "$12.00", lines: [{ orderId: OID, title: "Apron pattern", variant: "", image: "", url: "/products/apron", files: [{ id: "f1", name: "apron.pdf", size: "2.3 MB", url: `/api/site-account/download?order=${OID}&file=f1` }], note: "" }] }
    const get = (path: string, account: unknown, q = "") => answer(site, { method: "GET", path, query: new URLSearchParams(q), body: null, cart: [], account: account as never })
    const page = await get(`/account/orders/${OID}`, { customer, order })
    const html = String(page.body)
    check("an order's page draws on the website, in the theme, with each file and a Download on this host", page.status === 200 && /class="hdr"/.test(html) && /apron\.pdf/.test(html) && html.includes(`href="/api/site-account/download?order=${OID}&amp;file=f1" download`) && !/storelib\.com/.test(html), html.slice(0, 400))
    const refused = String((await get(`/account/orders/${OID}`, { customer, order }, "download=refunded")).body)
    check("  why a download went back to it, as a fixed sentence", /This order was refunded, so its files are closed\./.test(refused))
    check("  an address that is not a reason prints nothing", !/role="alert"/.test(String((await get(`/account/orders/${OID}`, { customer, order }, "download=<b>x</b>")).body)))
    const notTheirs = await get(`/account/orders/${OID}`, { customer, order: null })
    check("an order that is not theirs goes back to the account", notTheirs.status === 303 && notTheirs.headers?.Location === "/account")
    const guest = await get(`/account/orders/${OID}`, { customer: null })
    check("a guest signs in first, and comes back to the order", guest.status === 303 && guest.headers?.Location === `/account/login?return=${encodeURIComponent(`/account/orders/${OID}`)}`)
    const drop = themeCustomer(customer as never) as { orders: { customer_url: string }[] }
    check("a theme's own account template links the order to that page (customer_url)", drop.orders[0].customer_url === `/account/orders/${OID}`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
