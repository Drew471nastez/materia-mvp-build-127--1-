/**
 * Round 56 (r56-d): what scripts/check-ai-site-chrome-r56.mjs still found
 * after r56-a, all in the six newer starting templates and the sites built
 * from them, and a call to action the system did not catch.
 *
 *   1. Every link and button in their header and footer takes a finger
 *      (44 x 44): the wordmark, the menu links, the footer columns, the line
 *      above the header (course-coach, salon-chair). Measured before: 9 sites
 *      with 2 to 8 small targets each at every width.
 *   2. Their drawers sit on the dynamic viewport and clear of the notch and
 *      the home bar (env(safe-area-inset-*)); photo-trail's top sheet is the
 *      whole screen and scrolls, so nothing shows under it and a long menu is
 *      reachable.
 *   3. A press outside a popover drawer only closes it. saas-orbit's bottom
 *      sheet leaves its header in view, and the tap that closed the menu also
 *      opened the search window over the page (the cart then "did not open"
 *      at 360 to 414).
 *   4. salon-chair's fixed Book button (and its other filled buttons) use the
 *      scheme's button colours: the repaired palette's dark gold under dark
 *      words read 3.05:1.
 *   5. The built-in header's button sizes to its words up to 30vw (320px):
 *      "COMMISSION A STORY" in an uppercase, wide-tracked theme was cut at
 *      200px.
 *   6. A booking, enquiry or contact call to action that goes into the shop
 *      is caught: the agent's render check reports it to the repair turn
 *      (render.action_mismatch); the native engine sends it to the site's
 *      contact or booking page, or leaves it out and says so. No shipped
 *      template trips it. The scripted model's repair turn follows it.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SITE_TEMPLATES } from "../lib/storelib-ai/templates"
import { asksToTalk, intoShop, requestPage } from "../lib/website-builder/action-words"
import { actionMismatch, renderCheck } from "../lib/ai-builder/render-check"
import { nativeRegistry } from "../lib/website-builder/ai-site/native/registry"
import { validateNativeSite } from "../lib/website-builder/ai-site/native/validate"
import type { NativeContext } from "../lib/website-builder/ai-site/native/types"
import type { SectionInstance } from "../lib/website-builder/types"
import { actionRepairs } from "./_eval/action-repairs"
import { CAPS, PRODUCTS, dataFor, templateFor, themeOf } from "./ai-templates-p2b-kit"
import { SCENARIOS, CALL_FORM, sec, site } from "./native-engine-r2-fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const SIX = ["saas-orbit", "estate-cinema", "studio-kinetic", "course-coach", "photo-trail", "salon-chair"]
const PREFIX: Record<string, { header: string; drawer: string }> = {
  "saas-orbit": { header: "swn", drawer: "swn__sheet" },
  "estate-cinema": { header: "esn", drawer: "esn__drawer" },
  "studio-kinetic": { header: "agn", drawer: "agn__drawer" },
  "course-coach": { header: "ccn", drawer: "ccn__sheet" },
  "photo-trail": { header: "pfn", drawer: "pfn__sheet" },
  "salon-chair": { header: "sbn", drawer: "sbn__sheet" },
}
const rule = (css: string, sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[1] ?? ""

async function main() {
  /* ── 1, 2 ── */
  console.log("\n1-2. the six templates' header, footer and drawer")
  for (const id of SIX) {
    const src = read(`lib/storelib-ai/templates/${id}/sections.ts`)
    const p = PREFIX[id]
    const logo = rule(src, `.${p.header}__logo`)
    check(`${id}: the wordmark is at least 44 x 44`, /min-width: 44px/.test(logo) && /min-height: 44px/.test(logo), logo)
    const small = [...src.matchAll(/min-height: (\d+)px/g)].map((m) => Number(m[1])).filter((n) => n < 44)
    check(`${id}: no link or button under 44px tall anywhere in its sections`, small.length === 0, small)
    const drawer = rule(src, `.${p.drawer}`)
    check(`${id}: its drawer on the dynamic viewport (dvh)`, /\d+dvh/.test(drawer) && !/svh/.test(drawer), drawer)
    check(`${id}: its drawer clear of the notch and the home bar`, /env\(safe-area-inset-(top|bottom)\)/.test(drawer), drawer)
  }
  const pf = rule(read("lib/storelib-ai/templates/photo-trail/sections.ts"), ".pfn__sheet")
  check("photo-trail: the top sheet is the whole screen and scrolls", /inset: 0;/.test(pf) && /height: 100dvh/.test(pf) && /overflow-y: auto/.test(pf), pf)
  const cc = read("lib/storelib-ai/templates/course-coach/sections.ts")
  check("course-coach: the line above the header is a 44px link", /\.ccn__notice a \{ display: inline-flex; min-height: 44px;/.test(cc))
  const sb = read("lib/storelib-ai/templates/salon-chair/sections.ts")
  check("salon-chair: the line above the header's links are 44px", /\.sbn__util a \{ display: inline-flex; min-height: 44px;/.test(sb))

  /* ── 3 ── */
  console.log("\n3. a press outside a popover drawer only closes it")
  const hooks = read("components/website-builder/sections/site-chrome-hooks.tsx")
  check("armed on a press on the website outside the open drawer", /armed = !!d && d\.matches\(":popover-open"\) && e\.target instanceof Element && !d\.contains\(e\.target\) && !!e\.target\.closest\("\[data-storelib-theme\]"\)/.test(hooks))
  check("the click that follows is stopped", /if \(!armed\) return\s*\n\s*armed = false\s*\n\s*e\.preventDefault\(\)\s*\n\s*e\.stopPropagation\(\)/.test(hooks))

  /* ── 4 ── */
  console.log("\n4. salon-chair's buttons read on their fill")
  const book = /\n\.sbn__book \{([^\n]*)\}\n/.exec(sb)?.[1] ?? ""
  /* After ${D}, which sets the heading colour: written before it, the label stayed dark on the dark gold (3.05:1). */
  check("the fixed Book button uses the scheme's button colours, its label set after the display face", /background: var\(--s-btn\); \$\{D\} color: var\(--s-btn-text\);/.test(book), book)
  check("no filled button sets the scheme's text on its accent", !/background: var\(--s-accent\); color: var\(--s-text\)/.test(sb))

  /* ── 5 ── */
  console.log("\n5. the built-in header's button is read whole")
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("its ceiling is a share of the screen, not 200px", /"ml-1 min-w-0 max-w-\[min\(320px,30vw\)\] truncate font-semibold px-3 py-3 text-\[13px\] leading-5"/.test(header) && !/max-w-\[200px\] truncate font-semibold px-3 py-3/.test(header))

  /* ── 6 ── */
  console.log("\n6. a booking action into the shop is caught")
  check("words that ask to get in touch", ["Book an intro call", "Get in touch", "Contact us", "Request a quote", "Enquire", "Book a free consultation", "Talk to the team", "Book a discovery call"].every((w) => asksToTalk(w)))
  check("words that buy, or book a paid service, are not (a salon sells its chairs as products)", ["Shop now", "Enrol", "Buy the book", "Shop the drop", "Get the app", "See the plans", "Book a chair", "Book online", "Book a consultation"].every((w) => !asksToTalk(w)))
  check("the shop's addresses", intoShop("/products") && intoShop("/products/linen-shirt") && intoShop("/collections/all") && intoShop("/fr/products") && !intoShop("/contact") && !intoShop("/productsx"))
  check("the request page, in order", requestPage(["about", "book", "contact"]) === "contact" && requestPage(["work", "booking"]) === "booking" && requestPage(["about"]) === undefined)
  const known = (pages: string[], products: string[]) => ({ pages: new Set(pages), products: new Set(products), productSlugs: new Set<string>() })
  check("render check: a booking call to action to /products, with the contact page named", /asks the visitor to get in touch, and it goes to \/products, the shop\. Point it at the site's \/contact page/.test(actionMismatch("Book an intro call", "/products", known(["contact"], ["p1"]), "cta") ?? ""))
  check("render check: the same in a menu", !!actionMismatch("Get in touch", "/products", known(["contact"], ["p1"]), "nav"))
  check("render check: running text is left alone", actionMismatch("Book an intro call", "/products", known(["contact"], ["p1"]), "text") === null)
  check("render check: Shop now to /products on a store that sells", actionMismatch("Shop now", "/products", known([], ["p1"]), "cta") === null)
  check("render check: Shop now to /products on a store with nothing for sale", /nothing for sale/.test(actionMismatch("Shop now", "/products", known(["contact"], []), "cta") ?? ""))
  check("render check: the right page passes", actionMismatch("Book an intro call", "/contact", known(["contact"], ["p1"]), "cta") === null)

  const theme = themeOf(SITE_TEMPLATES[0])
  const src = (href: string, words: string) => `<template>\n<section class="x"><h1>Arden</h1><a class="x__cta" href="${href}">${words}</a></section>\n</template>\n\n<style>\n.x { padding: 20px; }\n</style>\n\n<schema>\n{ "type": "ai_x", "name": "X", "settings": [] }\n</schema>\n`
  const caps = CAPS
  const rc = await renderCheck({ page: "home", sections: [{ id: "x1", type: "ai_x", settings: {}, blocks: [] } as unknown as SectionInstance], sources: { "sections/ai_x.storelib": src("/products", "Book an intro call") }, theme, template: "index", capabilities: caps })
  const issue = rc.issues.find((i) => i.code === "render.action_mismatch")
  check("renderCheck: render.action_mismatch, an error, on the section", issue?.severity === "error" && issue.sectionId === "x1" && rc.ok === false, rc.issues.map((i) => `${i.code} ${i.message.slice(0, 120)}`))
  const rc2 = await renderCheck({ page: "home", sections: [{ id: "x1", type: "ai_x", settings: {}, blocks: [] } as unknown as SectionInstance], sources: { "sections/ai_x.storelib": src("/contact", "Book an intro call") }, theme, template: "index", capabilities: caps })
  check("renderCheck: pointed at /contact, it passes", !rc2.issues.some((i) => i.code === "render.action_mismatch"), rc2.issues.map((i) => i.code))
  check("the render check documents render.action_mismatch", /render\.action_mismatch a call to action that asks to get in touch/.test(read("lib/ai-builder/render-check.ts")))

  /* No shipped template trips it: every page of every template, drawn with a store that sells. */
  const tripped: string[] = []
  for (const t of SITE_TEMPLATES) {
    const tTheme = themeOf(t)
    const data = dataFor(t)
    for (const p of t.pages) {
      const r = await renderCheck({ page: p.key, sections: p.sections, sources: t.files, theme: tTheme, template: templateFor(p.key), products: PRODUCTS as never, data, capabilities: CAPS, extraRoutes: ["/about", "/contact"] })
      for (const i of r.issues) if (i.code === "render.action_mismatch") tripped.push(`${t.id} ${p.key}: ${i.message.slice(0, 120)}`)
    }
  }
  check(`no shipped template trips it (${SITE_TEMPLATES.length} templates, every page)`, tripped.length === 0, tripped.slice(0, 4))

  /* The native engine. */
  const reg = nativeRegistry()
  const ctxFor = (c: NativeContext["caps"]): NativeContext => ({ registry: reg, caps: c, images: [], forms: [{ url: CALL_FORM, id: CALL_FORM, name: "First call" }], prompt: "", seed: "r56seed1" })
  for (const s of SCENARIOS) {
    const v = validateNativeSite(s.answer, { ...ctxFor(s.caps), prompt: s.prompt })
    check(`native ${s.id}: the scripted answer still raises no issue`, v.issues.length === 0, v.issues.slice(0, 3))
  }
  const fit = SCENARIOS[0]
  const answer = (withContact: boolean) =>
    site({
      name: "Arden Partners",
      tagline: "",
      preset: String((fit.answer as { theme: { preset: string } }).theme.preset),
      heading: "",
      body: "",
      pages: [
        { key: "home", title: "Home", sections: [sec("hero_centered", "dark", { heading: "Operations for manufacturers", button_text: "Book an intro call", button_url: "/products" })] },
        ...(withContact ? [{ key: "contact", title: "Book a call", sections: [sec("cta_simple", "light", { heading: "Book a call", button_text: "Email us", button_url: "/contact" })] }] : []),
      ],
    })
  const withPage = validateNativeSite(answer(true), ctxFor(fit.caps))
  const hero = withPage.site.pages[0].sections.find((s) => s.type === "hero_centered")
  check("native: a booking button to /products goes to the contact page", hero?.settings.button_url === "/contact" && hero.settings.button_text === "Book an intro call", hero?.settings)
  check("native: said in the notes, not an issue (nothing is left to repair)", withPage.notes.some((n) => /asks to get in touch; it goes to \/contact/.test(n)) && !withPage.issues.some((i) => /get in touch/.test(i.message)), withPage.notes)
  const without = validateNativeSite(answer(false), ctxFor(fit.caps))
  const hero2 = without.site.pages[0].sections.find((s) => s.type === "hero_centered")
  check("native: with no page to take it, the button is not drawn and the generator is told", hero2?.settings.button_text === "" && without.issues.some((i) => /button_url$/.test(i.path) && /get in touch/.test(i.message)), { s: hero2?.settings, i: without.issues })

  /* The scripted model's repair turn follows the finding. */
  const said = `Not finished: 1 problem to fix first. 1. sections/ai_ardenp_header.storelib: home: The call to action "Book an intro call": "Book an intro call" asks the visitor to get in touch, and it goes to /products, the shop. Point it at the site's /contact page.`
  const pages = [{ key: "home", sections: [{ id: "h1", type: "ai_ardenp_header", settings: { cta_label: "Book an intro call", cta_url: "/products", notice_url: "/products", notice: "Next cohort" }, blocks: [] } as unknown as SectionInstance] }]
  const calls = actionRepairs(said, pages)
  check("scripted repair: the button's address, and only that, to /contact", JSON.stringify(calls) === JSON.stringify([["set_section_settings", { page: "home", sectionId: "h1", settings: { cta_url: "/contact" } }]]), calls)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
