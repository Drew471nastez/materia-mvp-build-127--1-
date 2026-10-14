/**
 * ===========================================================================
 *  AN IMPORTED THEME MOVES IN THE CANVAS AS IT DOES ON THE WEBSITE
 * ===========================================================================
 *   npx tsx tests/canvas-scroll-motion.test.ts
 *
 * The owner: on the website a Shopify theme's sections rise and fade in as
 * they are scrolled to; in the builder's canvas they stood still, already
 * shown. Measured (scripts/check-canvas-scroll-motion.ts, the real editor on
 * tests/fixtures/shopify-posture with tests/fixtures/shopify-reveal laid
 * over it): a reveal turned off by `Shopify.designMode` and one left out of
 * the markup under `request.design_mode` were shown still in the canvas and
 * played on the website. The canvas told the theme it was in Shopify's
 * theme editor, where themes turn their motion off.
 *
 * Held here:
 *   the canvas tells the theme the website's value, in its Liquid and its
 *   scripts, while Storelib's own builder behaviour still knows it is the
 *   builder (theme.ts themeDesignMode, shims.ts EDITING);
 *   a section's still preview keeps design mode;
 *   in a browser, a section drawn again in place keeps what the theme's
 *   scripts did to it (canvas-bridge.ts): on screen it stays shown and
 *   plays nothing again, below the screen the theme's own observer brings
 *   it in when it is scrolled to, a section added is watched like its
 *   look-alikes, one slide among others is not forced into view, and a
 *   selected block in a row that scrolls sideways is brought into it;
 *   the canvas keeps cookies for the visit (a pop-up closed stays closed).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import vm from "node:vm"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, themeOfInstall } from "../lib/storelib-theme/compat/page"
import type { CompatPage } from "../lib/storelib-theme/compat/theme"
import { shopifyBootstrap } from "../lib/storelib-theme/compat/shims"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* The Posturex-shaped fixture with the reveal bands laid over it, as scripts/check-canvas-scroll-motion.ts builds it. */
async function revealTheme() {
  const zip = new JSZip()
  const add = (dir: string) => {
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (!n.endsWith(".txt")) zip.file(relative(dir, p), readFileSync(p))
      }
    }
    walk(dir)
  }
  add(join(process.cwd(), "tests", "fixtures", "shopify-posture"))
  add(join(process.cwd(), "tests", "fixtures", "shopify-reveal"))
  const layout = (await zip.file("layout/theme.liquid")!.async("string")).replace("{{ 'base.css' | asset_url | stylesheet_tag }}", "{{ 'base.css' | asset_url | stylesheet_tag }}\n{{ 'reveal.css' | asset_url | stylesheet_tag }}")
  zip.file("layout/theme.liquid", layout)
  const index = JSON.parse(await zip.file("templates/index.json")!.async("string")) as { sections: Record<string, unknown>; order: string[] }
  index.sections.liquid = { type: "liquid-band" }
  index.order.push("liquid")
  zip.file("templates/index.json", JSON.stringify(index))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme
}

async function told() {
  console.log("\nWhat the theme is told\n")
  const t = await revealTheme()
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${n}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const sections = t.pages.find((p) => p.page_key === "home")!.sections as never
  const base: CompatPage = { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "Posturex" } } as unknown as CompatPage
  const draw = (page: Partial<CompatPage>) => drawPage(theme, { ...base, ...page }, sections, { scripts: true }).html
  const bootOf = (html: string) => /<script data-storelib-head>[\s\S]*?<\/script>/.exec(html)?.[0] ?? ""
  const live = draw({ designMode: false })
  const canvas = draw({ designMode: true, themeDesignMode: false })
  const preview = draw({ designMode: true })
  const reveal = (html: string) => (html.match(/class="band__card js-reveal"/g) ?? []).length
  check("the website: the section draws its reveal (request.design_mode false)", reveal(live) === 3, reveal(live))
  check("the canvas: the same markup as the website, reveal and all", reveal(canvas) === 3, reveal(canvas))
  check("a section's still preview: still the theme editor's markup, no reveal", reveal(preview) === 0, reveal(preview))
  check("the canvas tells the theme's scripts Shopify.designMode false", /"designMode":false/.test(bootOf(canvas)) && /"designMode":true/.test(bootOf(preview)), { canvas: /"designMode":(true|false)/.exec(bootOf(canvas))?.[1] })
  check("  while Storelib's own scripts still know it is the builder (Buy it now, forms, the wishlist, prefetch stay off)", /var EDITING=true;/.test(bootOf(canvas)) && /var EDITING=false;/.test(bootOf(live)) && /if\(!EDITING\)document\.addEventListener\("submit"/.test(bootOf(canvas)) && /if\(!EDITING&&SID\)/.test(bootOf(canvas)) && !/S\.designMode\)/.test(bootOf(canvas)))
  const boot = shopifyBootstrap({ shopName: "S", currency: "USD", designMode: true })
  check("  inBuilder left out: the same as designMode, as every caller had it", /var EDITING=true;/.test(boot) && /"designMode":true/.test(boot))

  const canvasSrc = read("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas draws every page, section and answer with themeDesignMode false", (canvasSrc.match(/^\s*themeDesignMode: false,$|designMode: true, themeDesignMode: false, i18n \}/gm) ?? []).length === 3)
  const themeSrc = read("lib/storelib-theme/compat/theme.ts")
  check("request.design_mode and Shopify.designMode both read it", /requestObject\(page\.template, page\.path, page\.themeDesignMode \?\? page\.designMode/.test(themeSrc) && /designMode: page\.themeDesignMode \?\? page\.designMode, inBuilder: page\.designMode/.test(themeSrc))
  check("  and Storelib's own sample reviews go by being drawn for the builder, not by what the theme is told", /storelib_reviews: page\.reviews \?\? \(page\.designMode \?/.test(themeSrc) && !/request\.design_mode/.test(read("lib/storelib-theme/compat/storelib-reviews.ts")))
  check("the section preview keeps design mode (no themeDesignMode)", !/themeDesignMode/.test(read("components/website-builder/compat/compat-section-preview.tsx")))
}

function cookies() {
  console.log("\nCookies in the canvas\n")
  const posted: { area?: string; items?: Record<string, string> }[] = []
  const doc: Record<string, unknown> = {}
  Object.defineProperty(doc, "cookie", { get() { throw new Error("SecurityError") }, set() { throw new Error("SecurityError") }, configurable: true })
  const ctx: Record<string, unknown> = { document: doc, history: { pushState() {}, replaceState() {} }, setTimeout: (f: () => void) => { f(); return 0 }, parent: { postMessage: (m: { type?: string; area?: string; items?: Record<string, string> }) => { if (m.type === "storage") posted.push(m) } }, __slSeed: { cookie: { closed: "1" } } }
  ctx.window = ctx
  for (const body of [...CANVAS_HEAD.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).slice(0, 1)) vm.runInNewContext(body, ctx)
  const d = ctx.document as { cookie: string }
  check("a cookie the last page set is there on the next (the visit's jar, window.__slSeed)", d.cookie === "closed=1", d.cookie)
  d.cookie = "popup_seen=true; path=/; max-age=86400"
  check("one set is read back", /popup_seen=true/.test(d.cookie) && /closed=1/.test(d.cookie), d.cookie)
  check("  and sent to the builder to hand to the next page", posted.some((m) => m.area === "cookie" && m.items?.popup_seen === "true"), posted.slice(-1))
  d.cookie = "closed=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
  check("one expired is gone", !/closed=/.test(d.cookie), d.cookie)
  check("the canvas keeps the jar with the visit's storage", /st\.area === "cookie"/.test(read("components/website-builder/compat/compat-canvas.tsx")))
}

async function swapsInBrowser() {
  console.log("\nA section drawn again in place, in Chromium\n")
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: held to its source only")
    check("the bridge reads the theme's observers and keeps what was shown", /var rewatch = function/.test(CANVAS_BRIDGE) && /var keepShown = function/.test(CANVAS_BRIDGE) && /rewatch\(pairs, next\);\s*keepShown\(pairs\);/.test(CANVAS_BRIDGE))
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600 })
    const section = (id: string, inner: string) => `<div class="shopify-section" id="shopify-section-${id}" data-section-id="${id}">${inner}</div>`
    /* As the theme's Liquid draws them: the markup the canvas holds for each section (its `prev`). */
    const drawn = {
      top: section("top", `<div class="rise reveal" style="height:300px;background:#cde">Top</div>`),
      slides: section("slides", `<div class="slider"><div class="slide is-active" style="height:80px">One</div><div class="slide" style="height:80px">Two</div></div>`),
      far: section("far", `<div class="rise reveal" style="height:300px;background:#dec">Far</div>`),
      row: section("row", `<div class="row" style="display:flex;overflow-x:auto;width:400px">${[1, 2, 3].map((i) => `<div class="cell" data-block-id="cell-${i}" style="flex:0 0 400px;height:60px">Cell ${i}</div>`).join("")}</div>`),
    }
    await page.setContent(`<!doctype html><html><head>${CANVAS_HEAD}<style>
        .reveal{opacity:0;transform:translateY(40px);transition:opacity .8s,transform .8s}.reveal.is-in{opacity:1;transform:none}
        .slide{opacity:0}.slide.is-active{opacity:1}
      </style></head><body style="margin:0">
      ${drawn.top}${drawn.slides}${drawn.row}<div style="height:1600px"></div>${drawn.far}<div style="height:1200px"></div>
      <script>
        window.__name = function (f) { return f };
        /* The theme: one observer made as the page opens, a class when each arrives; a slider that moved to its second slide. */
        var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }); });
        document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
        var s = document.querySelectorAll(".slide"); s[0].classList.remove("is-active"); s[1].classList.add("is-active");
        window.__slInspect = true;
        ${CANVAS_BRIDGE}
      </script></body></html>`)
    await wait(1200)
    const send = (m: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ storelib: 1, ...m }, "*"), m)
    /* A block added: the shape changed, so the section is swapped, not changed value by value. */
    const grown = (html: string) => html.replace(/<\/div>$/, `<i hidden></i></div>`)
    const opacity = (sel: string) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? Number(parseFloat(getComputedStyle(el).opacity).toFixed(2)) : -1 }, sel)

    check("as the page opens: the section on screen has arrived, the one far below waits", (await opacity("#shopify-section-top .reveal")) === 1 && (await opacity("#shopify-section-far .reveal")) === 0)
    await page.evaluate(() => { (document.querySelector("#shopify-section-top .reveal") as HTMLElement & { __old?: boolean }).__old = true })
    await send({ type: "section", id: "top", html: grown(drawn.top), prev: drawn.top })
    await wait(60)
    const top = await page.evaluate(() => { const el = document.querySelector("#shopify-section-top .reveal") as HTMLElement & { __old?: boolean }; return { swapped: !el.__old, cls: el.className, opacity: getComputedStyle(el).opacity, moving: el.getAnimations().length } })
    check("a section on screen swapped: the new element keeps the class the theme gave the old one, shown, nothing playing", top.swapped && /is-in/.test(top.cls) && top.opacity === "1" && top.moving === 0, top)

    await send({ type: "section", id: "slides", html: grown(drawn.slides), prev: drawn.slides })
    await wait(60)
    const slides = await page.evaluate(() => [...document.querySelectorAll("#shopify-section-slides .slide")].map((el) => getComputedStyle(el).opacity))
    check("one slide among others, hidden on purpose, is not forced into view: one slide shows", slides.filter((o) => o === "1").length === 1, slides)

    await send({ type: "section", id: "far", html: grown(drawn.far), prev: drawn.far })
    await wait(60)
    check("a section far below swapped still waits", (await opacity("#shopify-section-far .reveal")) === 0)
    await page.evaluate(() => document.getElementById("shopify-section-far")!.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }))
    await wait(150)
    const far = await page.evaluate(() => { const el = document.querySelector("#shopify-section-far .reveal")!; return { cls: el.className, moving: el.getAnimations().length } })
    await wait(1000)
    check("  and the theme's own observer brings it in when it is scrolled to, playing as on the website", /is-in/.test(far.cls) && far.moving > 0 && (await opacity("#shopify-section-far .reveal")) === 1, far)

    await page.evaluate(() => window.scrollTo(0, 0))
    await wait(100)
    const added = section("added", `<div class="rise reveal" style="height:300px">Added</div>`)
    await send({ type: "patch", order: [{ id: "top", group: "" }, { id: "slides", group: "" }, { id: "row", group: "" }, { id: "far", group: "" }, { id: "added", group: "", html: added }] })
    await wait(100)
    check("a section added below the screen waits", (await opacity("#shopify-section-added .reveal")) === 0)
    await page.evaluate(() => document.getElementById("shopify-section-added")!.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }))
    await wait(1100)
    check("  and arrives when scrolled to, watched by what watches its look-alikes", (await opacity("#shopify-section-added .reveal")) === 1)

    await page.evaluate(() => window.scrollTo(0, 0))
    await send({ type: "select", sectionId: "row", blockId: "cell-3", inspect: true, scroll: false })
    await wait(900)
    const row = await page.evaluate(() => (document.querySelector("#shopify-section-row .row") as HTMLElement).scrollLeft)
    check("a selected block in a row that scrolls sideways is brought into the row", row >= 790, row)
  } finally {
    await browser.close()
  }
}

async function main() {
  await told()
  cookies()
  await swapsInBrowser()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

void main()
