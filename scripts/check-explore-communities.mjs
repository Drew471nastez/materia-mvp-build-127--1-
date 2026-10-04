/**
 * ===========================================================================
 *  EXPLORE ROUND 4, MEASURED
 * ===========================================================================
 * Renders the real Explore (scripts/render-explore-communities.tsx) against
 * the app's stylesheet at 1440x900 and 390x844 and checks the owner's asks
 * as numbers:
 *
 *   PRODUCT CARDS   a title too long for its card stops at two lines with an
 *                   ellipsis; the cards in a row are one height.
 *   COMMUNITIES     /explore?type=communities draws real community cards in
 *                   the products' grid (3 across, 1 on a phone), one height a
 *                   row, each with its foot row (round 6: the price first, a
 *                   hairline, members, views, the stars only with reviews,
 *                   no Launched); a pill asks the server for that category
 *                   and the grid follows; Show more appends.
 *   ROUND 8         communities mode has the products' pill row pill for
 *                   pill (the Communities pill pressed in its place, and
 *                   pressing it goes back) and the products' More picker,
 *                   whole tree; a subcategory asks for c=<parent>&sub=<id>,
 *                   narrows to the communities that mention it, and when
 *                   none do shows the whole category with a line saying so.
 *   CATEGORIES      an icon alone (round 6) inside the hero's search field at
 *                   its right end, named Categories, with a tooltip on a
 *                   computer, at least 40px on a phone, clear of the typed
 *                   text; it opens the category browser (a panel under it on
 *                   a computer, the sheet on a phone) and a pick filters.
 *   FOOTER          on a computer Explore ends with the creator page footer
 *                   (Powered by Storelib, Privacy Policy, Terms & Conditions,
 *                   Cookie preferences); on a phone it is not drawn.
 *   NOTHING SIDEWAYS, no errors, at both sizes.
 *
 *   PROBE_CSS=source node scripts/check-explore-communities.mjs
 *
 * Screenshots go to SHOTS_DIR (a temporary folder by default).
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".explore-communities-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-communities-")), "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`)

execFileSync("npx", [
  "esbuild", "scripts/render-explore-communities.tsx", "--bundle", "--format=iife", "--jsx=automatic",
  '--define:process.env.NODE_ENV="production"', "--alias:@=.",
  "--banner:js=var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;",
  "--alias:next/navigation=./.explore-communities-probe/navigation.js",
  "--alias:next/link=./.explore-communities-probe/link.jsx",
  "--alias:next/image=./.explore-communities-probe/image.jsx",
  "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })

async function open(vp, mode) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}#${mode}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(700)
  return { p, errors }
}

const sideways = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }))

/* The first row of a grid's children: their tops, heights and how many. */
const ROW = (selector) => `(() => {
  const cells = [...document.querySelectorAll(${JSON.stringify(selector)})].map((c) => c.getBoundingClientRect())
  if (!cells.length) return { n: 0 }
  const first = cells.filter((r) => Math.abs(r.top - cells[0].top) < 2)
  return { n: cells.length, perRow: first.length, heights: [...new Set(first.map((r) => Math.round(r.height)))] }
})()`

/* The pill row as it reads: every pill's text, the More pill last. */
const PILLS = `[...document.querySelectorAll("[data-category-pills-row] > button, [data-category-pills-row] > a")].map((b) => b.textContent.trim())`
/* The More picker's first level, as a list of names. */
const PICKER_ROWS = `(() => { const host = document.querySelector("[data-category-panel]") || document.querySelector("[data-app-sheet]"); return host ? [...host.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean) : [] })()`
const productPills = {}
const productPicker = {}

const SIZES = [
  ["desktop", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

for (const [label, vp] of SIZES) {
  const phone = label === "phone"
  console.log(`\n${label}: products`)
  {
    const { p, errors } = await open(vp, "products")
    await p.screenshot({ path: join(shots, `${label}-products-top.png`) })
    const title = await p.evaluate(() => {
      const h = [...document.querySelectorAll("[data-product-title]")].find((x) => x.textContent.startsWith("CineTone"))
      if (!h) return null
      const cs = getComputedStyle(h)
      const lh = parseFloat(cs.lineHeight)
      h.scrollIntoView({ block: "center" })
      return { lines: Math.round(h.getBoundingClientRect().height / lh), clipped: h.scrollHeight > h.clientHeight + 1, clamp: cs.webkitLineClamp, overflow: cs.overflow, ellipsis: cs.textOverflow }
    })
    expect(!!title && title.lines === 2 && title.clipped && title.clamp === "2", "the long title stops at two lines, the rest cut with an ellipsis", title)
    productPills[label] = await p.evaluate(PILLS)
    const row = await p.evaluate(ROW("[data-product-card]"))
    expect(row.perRow === (phone ? 1 : 3) && row.heights.length === 1, `products: ${phone ? "one" : "three"} across, one height a row`, row)
    const rows = await p.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-product-card]")].map((c) => c.getBoundingClientRect())
      const byTop = new Map()
      for (const r of cards) { const k = Math.round(r.top); byTop.set(k, [...(byTop.get(k) ?? []), Math.round(r.height)]) }
      return [...byTop.values()].map((hs) => [...new Set(hs)].length)
    })
    expect(rows.every((n) => n === 1), "every row of products is one height", rows)
    await sleep(200)
    await p.evaluate(() => [...document.querySelectorAll("[data-product-title]")].find((x) => x.textContent.startsWith("CineTone"))?.closest("[data-product-card]")?.scrollIntoView({ block: "center" }))
    await sleep(300)
    await p.screenshot({ path: join(shots, `${label}-products-long-title.png`) })

    /* The More pill's picker, for communities mode to match, before anything is picked. */
    await p.evaluate(() => { document.querySelector("[data-more-pill]").scrollIntoView({ block: "center", inline: "end" }) })
    await sleep(300)
    await p.click("[data-more-pill]")
    await sleep(600)
    productPicker[label] = await p.evaluate(PICKER_ROWS)
    if (phone) await p.evaluate(() => document.querySelector("[data-sheet-close]")?.click())
    else await p.keyboard.press("Escape")
    await sleep(500)

    /* The Categories control in the hero's field. */
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(200)
    const field = await p.evaluate(() => {
      const input = document.querySelector("main form[role=search] input")
      const ctl = document.querySelector("[data-search-categories]")
      if (!input || !ctl) return null
      const f = input.getBoundingClientRect()
      const c = ctl.getBoundingClientRect()
      return { fieldRight: f.right, fieldTop: f.top, fieldH: f.height, ctlLeft: c.left, ctlRight: c.right, ctlTop: c.top, ctlH: c.height, ctlW: c.width, padRight: parseFloat(getComputedStyle(input).paddingRight), text: ctl.textContent.trim(), label: ctl.getAttribute("aria-label"), icon: !!ctl.querySelector("svg") }
    })
    expect(!!field && field.text === "" && field.icon && field.label === "Categories", "the hero's search field carries the categories icon alone, named Categories", field && { text: field.text, icon: field.icon, label: field.label })
    expect(!!field && Math.abs(field.ctlW - field.ctlH) <= 1, "a square, not a word", field && { w: field.ctlW, h: field.ctlH })
    expect(!!field && field.fieldRight - field.ctlRight >= 4 && field.fieldRight - field.ctlRight <= 12, "at the field's right end", field && { gap: Math.round(field.fieldRight - field.ctlRight) })
    expect(!!field && Math.abs(field.ctlTop + field.ctlH / 2 - (field.fieldTop + field.fieldH / 2)) <= 1, "centred in the field's height", field && { ctlMid: field.ctlTop + field.ctlH / 2, fieldMid: field.fieldTop + field.fieldH / 2 })
    expect(!!field && field.ctlH >= (phone ? 40 : 44), `sized for touch: ${phone ? 40 : 44}px or more`, field?.ctlH)
    expect(!!field && field.padRight >= field.fieldRight - field.ctlLeft + 8, "the typed text stops before it (the field's right padding covers the control and its hairline)", field && { padRight: field.padRight, needs: Math.round(field.fieldRight - field.ctlLeft + 8) })
    if (!phone) {
      await p.hover("[data-search-categories]")
      await sleep(700)
      const tip = await p.evaluate(() => document.querySelector("[data-categories-tooltip]") ? document.querySelector("[role=tooltip]")?.textContent.trim() ?? null : null)
      expect(tip === "Categories", "hovering it shows Categories", tip)
    }
    await p.screenshot({ path: join(shots, `${label}-hero-field.png`), clip: { x: 0, y: Math.max(0, field.fieldTop - 160), width: vp.width, height: 260 } })
    await p.click("[data-search-categories]")
    await sleep(500)
    const panel = await p.evaluate(() => {
      const desk = document.querySelector("[data-category-panel]")
      const sheet = document.querySelector("[data-category-sheet]")
      const ctl = document.querySelector("[data-search-categories]").getBoundingClientRect()
      const box = (desk || sheet?.closest("[data-sheet-panel]") || sheet)?.getBoundingClientRect()
      return { desk: !!desk, sheet: !!sheet, right: box && Math.round(box.right), top: box && Math.round(box.top), ctlRight: Math.round(ctl.right), ctlBottom: Math.round(ctl.bottom), rows: [...document.querySelectorAll("[data-category-panel] button, [data-app-sheet] button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 8) }
    })
    if (phone) expect(panel.sheet && !panel.desk, "on a phone it opens the sheet", panel)
    else expect(panel.desk && Math.abs(panel.right - panel.ctlRight) <= 2 && panel.top >= panel.ctlBottom, "on a computer a panel hangs from it, lined up with its right edge", panel)
    await p.screenshot({ path: join(shots, `${label}-categories-open.png`) })
    const picked = await p.evaluate(async () => {
      const host = document.querySelector("[data-category-panel]") || document.querySelector("[data-app-sheet]")
      /* Business has subcategories: the row opens its level, and a subcategory in it is the pick. */
      const row = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Business")
      row?.click()
      await new Promise((r) => setTimeout(r, 600))
      const sub = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Spreadsheets")
      sub?.click()
      await new Promise((r) => setTimeout(r, 800))
      const on = document.querySelector('[data-category-pills-row] [aria-pressed="true"]')
      return { clicked: !!row && !!sub, pressed: on?.textContent.trim() ?? null, chip: document.querySelector("[data-subcategory-chip]")?.textContent.trim() ?? null }
    })
    expect(picked.clicked && /Business/.test(picked.pressed ?? "") && picked.chip === "Spreadsheets", "a pick filters the list: Business pressed, its Spreadsheets chip shown", picked)

    /* The footer. */
    const foot = await p.evaluate(() => {
      const wrap = document.querySelector("[data-explore-desktop-footer]")
      const seller = wrap?.querySelector("[data-seller-footer]")
      const shown = !!seller && getComputedStyle(wrap).display !== "none" && seller.getBoundingClientRect().height > 0
      const others = [...document.querySelectorAll("footer")].filter((f) => !f.hasAttribute("data-seller-footer") && f.getBoundingClientRect().height > 0).length
      return { shown, text: seller?.innerText.replace(/\s+/g, " ").trim() ?? null, others, h: seller ? Math.round(seller.getBoundingClientRect().height) : 0 }
    })
    if (phone) expect(!foot.shown, "on a phone the creator page footer is not drawn", foot)
    else expect(foot.shown && foot.text === "Powered by Storelib Privacy Policy Terms & Conditions Cookie preferences" && foot.others === 0, "on a computer Explore ends with the creator page footer, and only that", foot)
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(300)
    await p.screenshot({ path: join(shots, `${label}-products-footer.png`) })
    const side = await sideways(p)
    expect(side.doc <= side.win && errors.length === 0, "products: nothing sideways, no errors", { side, errors })
    await p.close()
  }

  console.log(`\n${label}: communities`)
  {
    const { p, errors } = await open(vp, "communities")
    await p.screenshot({ path: join(shots, `${label}-communities-top.png`) })
    const grid = await p.evaluate(ROW("[data-explore-community]"))
    expect(grid.n === 7 && grid.perRow === (phone ? 1 : 3) && grid.heights.length === 1, `seven cards from the first page, ${phone ? "one" : "three"} across, one height a row`, grid)
    expect(await p.evaluate(() => window.__fetches.length === 0), "the first page came with the page: nothing fetched")
    const stats = await p.evaluate(() => [...document.querySelectorAll("[data-explore-community]")].slice(0, 3).map((c) => ({
      title: c.querySelector("[data-community-title]")?.textContent,
      stats: [...c.querySelectorAll("[data-stat]")].map((s) => `${s.getAttribute("data-stat")}=${s.textContent.trim()}`),
      creator: c.querySelector("[data-community-creator]")?.textContent.trim(),
      price: c.querySelector("[data-community-price]")?.textContent.trim(),
    })))
    expect(stats[0]?.stats.join("|") === "members=1.7k|views=31.7k|rating=4.9", "the facts: 1.7k members, 31.7k views, ★ 4.9, and no Launched", stats[0])
    expect(stats[1]?.stats.join("|") === "members=12|views=40", "no reviews, no stars", stats[1])
    expect(stats[0]?.creator === "by Mara Lindqvist" && stats[0]?.price === "$9/month", "by its creator, and its price at the foot", stats[0])
    const row = await p.evaluate(() => {
      const c = document.querySelector("[data-explore-community]")
      const s = c.querySelector("[data-community-stats]")
      const first = s.firstElementChild
      const d = s.querySelector("[data-community-divider]")?.getBoundingClientRect()
      return { oneLine: s.getBoundingClientRect().height <= 22, priceFirst: first?.hasAttribute("data-community-price"), divider: d ? { w: d.width, h: d.height } : null, launched: /Launched/.test(document.body.innerText) }
    })
    expect(row.oneLine && row.priceFirst && row.divider && row.divider.w <= 1 && !row.launched, "one line: the price first, then a 1px hairline; no Launched on the page", row)
    const long = await p.evaluate(() => { const t = [...document.querySelectorAll("[data-community-title]")].find((x) => x.textContent.startsWith("Night Runners")); return { lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), clipped: t.scrollHeight > t.clientHeight + 1 } })
    expect(long.lines === 2 && long.clipped, "a long community name stops at two lines too", long)
    await p.evaluate(() => document.querySelector("[data-explore-community]").scrollIntoView({ block: "start" }))
    await p.evaluate(() => window.scrollBy(0, -120))
    await sleep(300)
    await p.screenshot({ path: join(shots, `${label}-communities-grid.png`) })

    /* A pill asks the server for that category. */
    const pills = await p.evaluate(PILLS)
    expect(JSON.stringify(pills) === JSON.stringify(productPills[label]), "the same pill row as products mode, pill for pill", { communities: pills, products: productPills[label] })
    const on = await p.evaluate(() => { const c = document.querySelector("[data-communities-pill]"); return c ? { on: c.hasAttribute("data-on"), bg: getComputedStyle(c).backgroundColor, cross: !!c.querySelector("svg") } : null })
    expect(!!on && on.on && on.bg === "rgb(226, 228, 232)" && on.cross, "the Communities pill stays in its place, pressed, with a cross to go back", on)
    await p.evaluate(() => [...document.querySelectorAll("[data-category-pills-row] > button")].find((b) => b.textContent.includes("Design")).click())
    await sleep(700)
    const after = await p.evaluate(() => ({ fetched: window.__fetches.slice(-1)[0], n: document.querySelectorAll("[data-explore-community]").length, names: [...document.querySelectorAll("[data-community-title]")].map((t) => t.textContent) }))
    expect(after.fetched === "/api/explore/communities?c=design&limit=24" && after.n === 2, "the Design pill asks for c=design and the grid shows what came back", after)
    await p.evaluate(() => [...document.querySelectorAll("[data-category-pills-row] > button")][0].click())
    await sleep(700)
    const back = await p.evaluate(() => ({ n: document.querySelectorAll("[data-explore-community]").length, more: !!document.querySelector("[data-show-more]") }))
    expect(back.n === 7 && back.more, "All again is the first page, from memory", back)
    await p.evaluate(() => document.querySelector("[data-show-more]").click())
    await sleep(700)
    const more = await p.evaluate(() => ({ n: document.querySelectorAll("[data-explore-community]").length, fetched: window.__fetches.slice(-1)[0], more: !!document.querySelector("[data-show-more]") }))
    expect(more.n === 9 && /cursor=cursor-1/.test(more.fetched) && !more.more, "Show more appends the next page by its cursor", more)
    /* More: the same tree as products, and a subcategory narrows the category, or shows all of it and says so. */
    const pickSub = async (group, item) => {
      await p.evaluate(() => { document.querySelector("[data-more-pill]").scrollIntoView({ block: "center", inline: "end" }) })
      await sleep(300)
      await p.click("[data-more-pill]")
      await sleep(600)
      const rows = await p.evaluate(PICKER_ROWS)
      const done = await p.evaluate(async (group, item) => {
        const host = document.querySelector("[data-category-panel]") || document.querySelector("[data-app-sheet]")
        const row = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === group)
        row?.click()
        await new Promise((r) => setTimeout(r, 600))
        const sub = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === item)
        sub?.click()
        return !!row && !!sub
      }, group, item)
      await sleep(900)
      const state = await p.evaluate(() => ({
        fetched: window.__fetches.slice(-1)[0],
        names: [...document.querySelectorAll("[data-community-title]")].map((t) => t.textContent.slice(0, 16)),
        chip: document.querySelector("[data-subcategory-chip]")?.textContent.trim() ?? null,
        note: document.querySelector("[data-communities-broadened]")?.textContent.trim() ?? null,
        pressed: document.querySelector('[data-category-pills-row] [aria-pressed="true"]')?.textContent.trim() ?? null,
      }))
      return { rows, done, ...state }
    }
    const uiux = await pickSub("Design", "UI/UX Templates")
    expect(JSON.stringify(uiux.rows) === JSON.stringify(productPicker[label]) && uiux.rows.includes("Freebies"), "More opens the products' picker, the whole tree", { communities: uiux.rows.slice(0, 16), products: (productPicker[label] || []).slice(0, 16) })
    expect(uiux.done && uiux.fetched === "/api/explore/communities?c=design&sub=ui-ux&limit=24" && uiux.names.join() === "Design Systems G" && uiux.chip === "UI/UX Templates" && /Design/.test(uiux.pressed ?? "") && !uiux.note, "Design > UI/UX Templates asks for c=design&sub=ui-ux and shows the community about it, with its chip", uiux)
    await p.screenshot({ path: join(shots, `${label}-communities-sub.png`) })
    const sheets = await pickSub("Business", "Spreadsheets")
    expect(sheets.done && sheets.fetched === "/api/explore/communities?c=business&sub=spreadsheets&limit=24" && sheets.names.join() === "Founders Weekly" && sheets.note === "No communities about Spreadsheets yet, so here is everything in Business.", "a subcategory nothing mentions: the whole category, and a line that says so", sheets)
    await p.screenshot({ path: join(shots, `${label}-communities-sub-broadened.png`) })
    await p.evaluate(() => [...document.querySelectorAll("[data-category-pills-row] > button")][0].click())
    await sleep(700)

    if (phone) {
      const small = await p.evaluate(() => [...document.querySelectorAll("[data-category-pills-row] > button, [data-filters-button], [data-search-categories]")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 14), h: Math.round(r.height) } }).filter((x) => x.h < 36))
      expect(small.length === 0, "the row's controls are a thumb's size", small)
    }
    /* Filters: the communities' orders and prices. */
    await p.click("[data-filters-button]")
    await sleep(600)
    const choices = await p.evaluate(() => ({ sorts: [...document.querySelectorAll("[data-filter-sort]")].map((b) => b.textContent.trim()), prices: [...document.querySelectorAll("[data-filter-price]")].map((b) => b.textContent.trim()) }))
    expect(choices.sorts.join() === "Trending,Most members,Newest" && choices.prices.join() === "Any price,Free,Paid", "Filters offers the communities' orders and prices", choices)
    await p.screenshot({ path: join(shots, `${label}-communities-filters.png`) })
    await p.evaluate(() => document.querySelector('[data-filter-price="free"]').click())
    await sleep(700)
    const free = await p.evaluate(() => ({ fetched: window.__fetches.slice(-1)[0], prices: [...document.querySelectorAll("[data-community-price]")].map((x) => x.textContent) }))
    expect(/price=free/.test(free.fetched) && free.prices.length > 0 && free.prices.every((x) => x === "Free"), "Free asks for price=free and lists free communities", free)
    /* The hero's search, in this mode, is the communities' search. */
    if (phone) await p.evaluate(() => document.querySelector("[data-sheet-close], [data-filters-done]")?.click())
    else await p.keyboard.press("Escape")
    await sleep(600)
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.click("main form[role=search] input")
    await p.keyboard.type("night")
    await p.keyboard.press("Enter")
    await sleep(700)
    const searched = await p.evaluate(() => ({ fetched: window.__fetches.slice(-1)[0], names: [...document.querySelectorAll("[data-community-title]")].map((t) => t.textContent.slice(0, 12)) }))
    expect(searched.fetched === "/api/explore/communities?q=night&price=free&limit=24" && searched.names.join() === "Night Runner", "the search field asks for the word, with the price still on", searched)
    const side = await sideways(p)
    expect(side.doc <= side.win && errors.length === 0, "communities: nothing sideways, no errors", { side, errors })
    await p.evaluate(() => document.querySelector("[data-communities-pill]").click())
    await sleep(700)
    const leave = await p.evaluate(() => ({ mode: document.querySelector("[data-discover-mode]")?.getAttribute("data-discover-mode") ?? null, products: document.querySelectorAll("[data-product-card]").length, pillOn: document.querySelector("[data-communities-pill]")?.hasAttribute("data-on") }))
    expect(leave.mode === "products" && leave.pillOn === false, "pressing it again goes back to the products", leave)
    await p.close()
  }

  console.log(`\n${label}: switched off`)
  {
    const { p, errors } = await open(vp, "off")
    const off = await p.evaluate(() => ({ pill: !!document.querySelector("[data-communities-pill]"), chip: !!document.querySelector('[aria-label="Choose what to discover"]') }))
    expect(!off.pill && !off.chip && errors.length === 0, "communities off: no Communities pill and no switcher on the chip", { off, errors })
    await p.close()
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
if (broken) { console.log(`\n${broken} check(s) failed`); process.exit(1) }
console.log("\nall checks passed")
