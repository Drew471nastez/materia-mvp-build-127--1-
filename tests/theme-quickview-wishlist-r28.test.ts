/**
 * Materia's quick view, wishlist and popup motion (round 28).
 *
 *   QUICK VIEW  every control comes from Theme settings: Add to cart and Buy
 *               it now are the theme's primary and secondary buttons (the
 *               button contract, so hover colours, font, size and corners
 *               follow Buttons; Buy it now was the platform's unbranded
 *               button and went fully white on hover in some themes); the
 *               option pills, quantity and heart take the product page's
 *               field, quantity and button tokens; no corner is hard coded
 *               to a pill. Several pictures have dots and arrows; the
 *               details column has a thin drawn scrollbar.
 *   OPENING     the dialog opens without writing on <html> or <body> (each
 *               such write restyles the whole page: 25 to 100ms measured),
 *               the content is read on hover and copied on click, its script
 *               runs after it is in the dialog, focus goes to the dialog
 *               box, and the phone sheet rises in 280ms.
 *   WISHLIST    the preview keeps its storage in the frame's window.name, so
 *               a heart lasts from page to page; a signed in visitor's
 *               hearts are the account's (tests/compat-cart-canvas.test.ts
 *               runs that shim).
 *
 * Measured in Chromium by scripts/check-modal-motion-r28.ts (frame timing
 * and long tasks of the quick view and every drawer in every template,
 * button legibility at rest and on hover, the wishlist on a live render and
 * in a static preview).
 *
 *   npx tsx tests/theme-quickview-wishlist-r28.test.ts
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const ROOT = process.cwd()
const BASE = join(ROOT, "theme-packages", "materia", "base")
const read = (p: string) => readFileSync(join(BASE, p), "utf8")
const qv = read("sections/product-quickview.liquid")
const card = read("assets/product-card.css")
const theme = read("assets/theme.js")
const globalJs = read("assets/global.js")
const tingle = read("assets/tingle.min.js")
const utils = read("assets/utils.js")

console.log("\nQUICK VIEW: everything from Theme settings")
check("Add to cart is the theme's primary button", /class="[^"]*qv__atc[^"]*"[^>]*data-theme-button="primary"/.test(qv))
check("Buy it now is the theme's secondary button, sent to checkout by the website", /data-storelib-buy-now[^>]*data-theme-button="secondary"/.test(qv) && /qv__buy-now/.test(qv))
check("  not the platform's unbranded button (it went white on hover)", !/\|\s*payment_button/.test(qv))
const qvCss = card.slice(card.indexOf("QUICK VIEW DIALOG")).replace(/\/\*[\s\S]*?\*\//g, "")
const qvRules = [...qvCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const)
const pillCorners = qvRules.filter(([sel, body]) => /\.qv(__| |\b)/.test(sel) && !/qv__swatch|qv__dot|qv__dots|qv__thumb|qv-sheet__handle|qv__count/.test(sel) && /border-radius:\s*(999px|50%)/.test(body))
check("no quick view control has a corner hard coded to a pill or a circle", pillCorners.length === 0, pillCorners.map(([s]) => s))
check("Add to cart sets no corner or padding of its own", !qvRules.some(([sel, body]) => /\.qv__atc/.test(sel) && /border-radius|padding|--mb-radius/.test(body)))
const rule = (re: RegExp) => qvRules.find(([sel]) => re.test(sel))?.[1] ?? ""
check("option pills: the product page's field tokens (corners, border, colours, body font)", /--input-border-radius/.test(rule(/^\.qv__value$/)) && /--inputs-border-width/.test(rule(/^\.qv__value$/)) && /--body-font/.test(rule(/^\.qv__value$/)))
check("quantity: the theme's quantity tokens", /--quantity-radius/.test(rule(/^\.qv__qty$/)) && /--quantity-border/.test(rule(/^\.qv__qty$/)))
check("heart: the buttons' corners and a border of at least 1px", /--btn-radius/.test(rule(/^\.qv__wish$/)) && /max\(1px, var\(--btn-border-width/.test(rule(/^\.qv__wish$/)))
check("title: the heading font, weight and case", ["--heading-font", "--heading-weight", "--heading-text-transform"].every((v) => rule(/^\.qv__title$/).includes(v)))
check("dialog corners follow Rounded corners", /border-radius: min\(var\(--rounded-radius, 0px\), 24px\)/.test(qvCss))
check("several pictures: dots and arrows", /data-qv-dot=/.test(qv) && /data-qv-prev/.test(qv) && /data-qv-next/.test(qv) && /\.qv__dot\[aria-current="true"\]/.test(card))
check("details column: no native scrollbar, a thin drawn one", /\.qv__info \{[^}]*scrollbar-width: none/.test(card) && /data-qv-thumb/.test(qv) && /ResizeObserver/.test(qv))
check("its script reads no layout as the dialog opens (arrows set from the count)", /if \(prev\) prev\.disabled = true;/.test(qv) && !/paintNav\(\); \}/.test(qv))

console.log("\nOPENING: one style pass, nothing written on <html> or <body>")
check("the quick view opens light", /class QuickView extends PopupBase[\s\S]{0,200}this\.lightOpen = true/.test(theme))
check("tingle's light open writes nothing on <body> and reads no layout", /var light = !!this\.opts\.lightOpen;[\s\S]{0,200}if \(!light\) \{[\s\S]{0,120}pageYOffset[\s\S]{0,120}tingle-enabled/.test(tingle) && /if \(!light\) this\.checkOverflow\(\)/.test(tingle))
check("  nor on close (no scrollTo, no body class)", /var light = !!this\.opts\.lightOpen;\s*if \(!light\) \{\s*document\.body\.classList\.remove\("tingle-enabled"\)/.test(tingle))
check("  and a popup that is not light opens as before", /if \(!light\) \{\s*\/\/ prevent double scroll/.test(tingle))
check("PopupBase passes it on and holds the scroll on the backdrop itself", /lightOpen: light/.test(globalJs) && /addEventListener\("wheel", hold, \{ passive: false \}\)/.test(globalJs) && /addEventListener\("touchmove", hold, \{ passive: false \}\)/.test(globalJs))
check("content is read on hover and copied on click", /static parsed\(url, text\)/.test(theme) && /node\.cloneNode\(true\)/.test(theme))
check("its script runs once the content is in the dialog", /this\.openDialog\(this\.html\);\s*\}\s*\/\/ The content's script runs once the content is in the dialog\.\s*this\.loadScripts\(this\.html\);/.test(theme))
check("focus goes to the dialog box at once (no ring on a pill nobody chose, no extra frame)", /box\.focus\(\{ preventScroll: true \}\)/.test(theme) && !/requestAnimationFrame\(\(\) => \{\s*const start = dialog\.querySelector\('\.qv__value/.test(theme))
check("the phone sheet rises in 280ms", /set\(0, 280, OPEN_EASE\)/.test(theme))
check("the scrollbar width is measured once, not in every opening frame", /var known = null;/.test(utils) && /if \(known === null\) known = measure\(\);/.test(utils))
/* A `*` under a [class*=…] test: Chrome then restyles everything below any element whose class changes, so a class on <html> (every drawer's scroll lock) restyled the whole page in the frame its panel was to move. */
const UNIVERSAL_UNDER_CLASS_TEST = /\[class[*^$|~]?=[^\]]*\]\)?[^\s,{()]*\s+\*/
const offenders = readdirSync(join(BASE, "assets")).filter((f) => f.endsWith(".css")).flatMap((f) => {
  const css = readFileSync(join(BASE, "assets", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  return [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((sel) => UNIVERSAL_UNDER_CLASS_TEST.test(sel)).map((sel) => `${f}: ${sel.slice(0, 120)}`)
})
check("no theme stylesheet puts a * under a [class*=] test", offenders.length === 0, offenders)
const busy = readFileSync(join(ROOT, "lib", "storelib-theme", "compat", "busy-buttons.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
check("  nor the engine's busy Add to cart rule, which every live page carries (same icons matched)", !/:is\(\$\{SPINNER\}\) \*/.test(busy) && /:is\(\$\{SPINNER\}\) :is\(\$\{ICON\}\)/.test(busy))
const bundle = (() => { try { execFileSync("node", ["scripts/build-materia-base-css.mjs", "--check"], { cwd: ROOT, stdio: "pipe" }); return true } catch { return false } })()
check("base.css is built from these sources", bundle)

console.log("\nWISHLIST in the preview: kept from page to page")
const previews = join(ROOT, "public", "theme-previews")
const slug = existsSync(previews) ? readdirSync(previews).find((d) => d !== "_base" && existsSync(join(previews, d, "index.html"))) : undefined
if (!slug) check("a built preview is there", false)
else {
  const html = readFileSync(join(previews, slug, "index.html"), "utf8")
  const shim = /<script data-template-preview>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ""
  check(`the preview's shim keeps storage in window.name (${slug})`, /slls/.test(shim))
  const start = shim.indexOf("function wn(")
  const end = [shim.indexOf("try{D.cookie}"), shim.indexOf('var jar=""')].filter((i) => i > 0).sort((a, b) => a - b)[0] ?? -1
  const piece = start > 0 && end > start ? shim.slice(start, end) : ""
  const run = (name: string) => {
    const W: Record<string, unknown> = { name }
    Object.defineProperty(W, "localStorage", { configurable: true, get() { throw new Error("SecurityError") } })
    Object.defineProperty(W, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError") } })
    vm.runInNewContext(`(function(){var W=window;${piece}})()`, { window: W, JSON, Object, String })
    return W as { name: string; localStorage: Storage }
  }
  if (!piece) check("the storage part of the shim is found", false)
  else {
    const one = run("")
    one.localStorage.setItem("materia__wishlist-items", JSON.stringify(["a"]))
    const two = run(one.name)
    check("a heart saved on one page is there on the next", two.localStorage.getItem("materia__wishlist-items") === JSON.stringify(["a"]), one.name)
    const cart = JSON.stringify({ slpv: { x: "1~0.1" } })
    const three = run(cart)
    three.localStorage.setItem("k", "v")
    check("  beside the preview's cart, which is kept", (JSON.parse(three.name) as { slpv: Record<string, string> }).slpv.x === "1~0.1")
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
