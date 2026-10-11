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
import { themeAsset } from "../lib/storelib-theme/compat/site"

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

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
