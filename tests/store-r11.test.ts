/**
 * Round 11, STORE: two of the owner's asks, pinned.
 *
 *   ADD TO CART   "If the icon is there in such a button, it should not show that icon when it's in the loading
 *                 state." Every page of an imported theme (live and in the builder's canvas) carries one rule: a busy
 *                 Add to cart hides its icons, keeps their room (no size change), and never hides the spinner.
 *   CHECKOUT      "In all checkouts across Storelib, don't make the Buy button sticky at the bottom of the page."
 *                 Pay's box is a plain block at the end of the form; no checkout pins anything to the foot of the
 *                 screen; each checkout's page keeps the home indicator's room itself.
 *
 * scripts/check-store-r11.mjs presses the buttons and opens every checkout in a browser.
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ADD_TO_CART_BUTTONS, BUSY_BUTTON_CSS, BUSY_BUTTON_FIX, BUSY_MARKS } from "@/lib/storelib-theme/compat/busy-buttons"
import { CompatTheme, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "@/lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const src = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []
  })

async function main() {
  console.log("\nAdd to cart while it works: the spinner, never the icon")
  {
    check("the busy marks themes use are all read", [".loading", ".is-loading", ".btn--loading", ".button--loading", '[aria-busy="true"]'].every((m) => BUSY_MARKS.includes(m)))
    check("Dawn's button, a theme's add-to-cart class, any submit of a /cart/add form and a quick add are all Add to cart", ['form[action*="/cart/add"] button', ".product-form__submit", ".quick-add__submit", '[class*="add-to-cart" i]', '[name="add"]'].every((s) => ADD_TO_CART_BUTTONS.includes(s)))
    check("a busy button's icons are hidden with their room kept (visibility, never display or a width)", /\{visibility:hidden!important\}/.test(BUSY_BUTTON_CSS) && !/display\s*:\s*none/.test(BUSY_BUTTON_CSS) && !/width|height/.test(BUSY_BUTTON_CSS))
    check("icons are drawings, pictures and icon fonts", /:is\(svg,img,i,\.icon\)/.test(BUSY_BUTTON_CSS))
    check("the spinner and what is inside it are never hidden", /:not\(:is\(\[class\*="spin" i\],\[class\*="loader" i\]/.test(BUSY_BUTTON_CSS) && /* Changed on purpose (round 28): inside the spinner is named as its icons, not `*` (a `*` under [class*=…] restyled the whole page on any class change); it matches the same icons. */ /:is\(\[class\*="spin" i\][^)]*\) :is\(svg,img,i,\.icon\)\)/.test(BUSY_BUTTON_CSS))
    check("busy on the form (a card's quick add) counts too", /* Changed on purpose (round 28): each mark is written out (form[action*="/cart/add"].loading …), not :is(marks), so a class change elsewhere no longer restyles every icon. */ /form\[action\*="\/cart\/add"\]\.loading :is\(button/.test(BUSY_BUTTON_CSS) && /form\[action\*="\/cart\/add"\]\[aria-busy="true"\]/.test(BUSY_BUTTON_CSS))
    check("no transition: the icon is gone the frame the spinner comes, and back the frame it goes", !/transition|animation/.test(BUSY_BUTTON_CSS))
    check("the style cannot close itself early", !BUSY_BUTTON_CSS.includes("<"))
    const theme = src("lib/storelib-theme/compat/theme.ts")
    check("every document an imported theme draws carries it, live and in the canvas", /replace\(\/<\\\/head>\/i, `\$\{BUSY_BUTTON_FIX\}<\/head>`\)/.test(theme))
    check("a layout with no <html> tree too", /\$\{MISSING_IMAGE_HEAD\}\$\{BUSY_BUTTON_FIX\}/.test(theme))

    /* A real page, from the live site's own handler. */
    const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    const files: Record<string, string> = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}<style>.button.loading{color:transparent}</style></head><body><main>{{ content_for_layout }}</main></body></html>`),
      "sections/main-product.storelib": section("main-product", `<form action="/cart/add" method="post"><button type="submit" name="add" class="product-form__submit button"><svg class="icon icon-cart"></svg><span>Add to cart</span><div class="loading__spinner hidden"><svg class="spinner"></svg></div></button></form>`),
      "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product" } }, order: ["main"] }),
    }
    const site: SiteData = {
      creatorId: "s1",
      theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }),
      pages: { product: [{ id: "main", type: "main-product" }] } as never,
      products: [{ id: "p1", settings: { title: "Mug", price: "$24.00", image: "", url: "/products/mug", slug: "mug", kind: "physical", available: true, variants: [{ id: "v1", name: "Sand", price: "$24.00", available: true }], options: [] } }] as never,
      collections: [],
      menus: {},
      shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } as never,
      host: "shop.example",
    }
    const out = await answer(site, { method: "GET", path: "/products/mug", query: new URLSearchParams(), body: null, cart: [], note: "", attributes: {}, discountCode: null, ajax: false, referer: null } as never)
    const page = typeof out.body === "string" ? out.body : new TextDecoder().decode(out.body)
    const head = page.split(/<\/head>/i)[0] ?? ""
    check("the live product page has the rule in its head", out.status === 200 && head.includes(BUSY_BUTTON_FIX), { status: out.status })
    check("after the theme's own stylesheet, so it wins a tie", head.indexOf(BUSY_BUTTON_FIX) > head.indexOf(".button.loading{color:transparent}"))
    check("once", page.split("data-sl-busy-buttons").length === 2)
  }

  console.log("\nNo checkout pins Buy to the foot of the screen")
  {
    /* Changed on purpose (round 51): the checkout's shared ui, words and Stripe loader moved to components/checkout/parts, so a website's stylesheet is built from website code only (tests/site-root-r52). */
    const ui = code("components/checkout/parts/ui.tsx")
    const dock = ui.slice(ui.indexOf("export function PayDock"), ui.indexOf("export function PayButton"))
    check("Pay's box is a plain block at the end of the form", dock.length > 0 && !/\bsticky\b|\bfixed\b|bottom-0|safe-area/.test(dock) && /data-pay-dock=""/.test(dock) && /"mt-5"/.test(dock))
    const files = [
      ...walk("app/(storelib)/checkout"),
      ...walk("components/checkout"),
      "components/community/public/join-flow.tsx",
      "components/community/public/compact-pay.tsx",
    ]
    const pinnedBottom = /(?:\b(?:sticky|fixed)\b[^"'`\n]*\bbottom-(?:0|\d|\[|\()|\bbottom-(?:0|\d|\[)[^"'`\n]*\b(?:sticky|fixed)\b)/
    const offenders = files.filter((f) => pinnedBottom.test(code(f)))
    check("no checkout page or checkout window has a fixed or sticky bar at the bottom", offenders.length === 0, offenders)
    check("and no inline style pins one either", files.filter((f) => /position:\s*["']?(?:fixed|sticky)["']?[^}]*bottom:/.test(code(f))).length === 0)
    for (const f of ["app/(storelib)/checkout/checkout-client.tsx", "app/(storelib)/checkout/site/site-checkout.tsx", "app/(storelib)/checkout/membership-checkout.tsx", "app/(storelib)/checkout/physical/physical-checkout.tsx"]) {
      check(`${f}: the page keeps the home indicator's room itself`, /pb-\[max\([^)]*env\(safe-area-inset-bottom\)\)\]/.test(code(f)))
    }
    for (const f of ["app/(storelib)/checkout/checkout-client.tsx", "app/(storelib)/checkout/site/site-checkout.tsx", "app/(storelib)/checkout/membership-checkout.tsx", "app/(storelib)/checkout/parts/stripe-pay.tsx"]) {
      check(`${f}: Pay goes through the one shared box`, /<PayDock\b/.test(code(f)))
    }
    check("the round 21 probe now asks for Pay in place, not pinned", /IN PLACE: Pay is not pinned/.test(src("scripts/check-checkout-paydock.mjs")) && !/position === "sticky"/.test(src("scripts/check-checkout-paydock.mjs")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
