/**
 * ===========================================================================
 *  THE SECTION MENUS AND ADD SECTION'S APPS, MEASURED
 * ===========================================================================
 * The real sidebar rows, an open section's title row and Add section
 * (scripts/render-section-menus.tsx), driven with a real mouse, keyboard and
 * finger at 1280 × 800 and 390 × 844:
 *
 *   RIGHT CLICK   on a row opens its menu at the pointer: the menu's corner
 *                 is where the pointer was, the row's actions are in it
 *   DOTS          the row's "..." opens the same menu under it, right edges
 *                 together; Shift+F10 opens it from the keyboard
 *   LONG PRESS    a finger held on a row opens the action sheet; the lift
 *                 does not open the section; a finger that moves opens none
 *   TITLE ROW     the open section's three dots: its right edge on the row's
 *                 padding, centred on the row, the Back tile's size; its
 *                 menu's rows 32px, a row with a reason under it taller
 *   APPS          Add section's Apps heading right after All, each app's
 *                 category under it on screen without scrolling, showing
 *                 only that app's sections, and saying when it is off
 *
 *   node scripts/check-section-menus.mjs      (SHOTS_DIR=dir for pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { probeCss } from "./probe-css.mjs"
import { reporter, sleep } from "./anchor-motion-probe.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
/* Headless Chromium has no hover-capable pointer: the hover styles are taken as they are on a computer. */
const css = (await probeCss(root)).replace(/@media \(hover: ?hover\)/g, "@media all")
const out = mkdtempSync(join(tmpdir(), "storelib-sectionmenus-"))
/* Add section draws real sections, whose compiler reaches for node's crypto and a router: small browser stand ins, as scripts/editor-probe-harness.mjs has. */
const STUBS = {
  "navigation.js": `export const usePathname = () => "/website-builder/editor/probe"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe" })
export const redirect = () => {}
export const notFound = () => {}
`,
  "link.jsx": `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`,
  "image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`,
  "node-crypto.js": `export function createHash() {
  let acc = ""
  return { update(s) { acc += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < acc.length; i++) { h ^= acc.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } }
}
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomUUID }
`,
  "node-empty.js": `export const readFileSync = () => "", existsSync = () => false, readdirSync = () => []
export const join = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop()
export default {}
`,
}
for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(out, name), body)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-section-menus.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:node:crypto=${join(out, "node-crypto.js")}`, `--alias:crypto=${join(out, "node-crypto.js")}`,
  `--alias:node:fs=${join(out, "node-empty.js")}`, `--alias:fs=${join(out, "node-empty.js")}`, `--alias:node:path=${join(out, "node-empty.js")}`, `--alias:path=${join(out, "node-empty.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(join(out, "probe.js"))
if (process.env.BUNDLE_ONLY) { console.log(`bundled, ${js.length} bytes`); process.exit(0) }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const { check, finish } = reporter()
const shots = process.env.SHOTS_DIR
const r1 = (n) => Math.round(n * 10) / 10

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const open = async (width, height, phone, query = "") => {
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 })
  await page.goto(`${origin}/${query}`, { waitUntil: "load" })
  await page.waitForSelector('[data-section-row="hero-1"]')
  await sleep(150)
  return page
}
const rect = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } })
const menuState = (page) => page.evaluate(() => {
  const list = document.querySelector("[data-action-list]")
  const sheet = document.querySelector("[data-action-sheet]")
  const rows = (root) => [...(root?.querySelectorAll("[data-action-item]") ?? [])].map((el) => ({ id: el.getAttribute("data-action-item"), h: el.getBoundingClientRect().height, disabled: el.hasAttribute("data-disabled") || el.hasAttribute("disabled") }))
  const box = list?.getBoundingClientRect()
  return {
    list: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null,
    listRows: rows(list),
    sheetRows: sheet && sheet.getBoundingClientRect().height > 0 ? rows(sheet) : [],
    log: window.__log.slice(),
  }
})

/* ── A computer ─────────────────────────────────────────────────────────── */
console.log("\nA computer, 1280 × 800")
{
  const page = await open(1280, 800, false)
  const row = await rect(page, '[data-section-row="hero-1"]')
  const x = Math.round(row.left + 70)
  const y = Math.round(row.top + row.height / 2)
  await page.mouse.click(x, y, { button: "right" })
  await page.waitForSelector("[data-action-list]")
  await sleep(250)
  let m = await menuState(page)
  const dx = m.list.left - x
  const dy = m.list.top - y
  check("a right click opens the row's menu at the pointer", Math.abs(dx) <= 1 && dy >= 0 && dy <= 4, `menu corner ${r1(dx)}px across and ${r1(dy)}px down from the pointer`)
  check("with the row's actions, Edit code among them", m.listRows.map((r) => r.id).join(",") === "duplicate,move-down,toggle-hidden,edit-code,delete", m.listRows.map((r) => r.id).join(","))
  check("every row of it 32px", m.listRows.every((r) => r.h === 32), m.listRows.map((r) => r.h).join(","))
  check("the right click did not open the section", !m.log.includes("select:hero-1"), m.log)
  if (shots) await page.screenshot({ path: join(shots, "menus-right-click-1280.png") })
  await page.keyboard.press("Escape")
  await sleep(200)

  /* FAQ: Edit code shown disabled, with its reason. */
  const faq = await rect(page, '[data-section-row="faq-1"]')
  await page.mouse.click(Math.round(faq.left + 60), Math.round(faq.top + faq.height / 2), { button: "right" })
  await page.waitForSelector("[data-action-list]")
  await sleep(200)
  m = await menuState(page)
  const code = m.listRows.find((r) => r.id === "edit-code")
  check("a section with no code shows Edit code disabled, its reason under it", !!code && code.disabled && code.h > 32 && code.h <= 48, code ? `${code.h}px, disabled` : "missing")
  const codeText = await page.$eval('[data-action-item="edit-code"]', (el) => el.textContent)
  check("and the reason is in words", /Drawn by Storelib, no code to edit/.test(codeText), codeText)
  await page.keyboard.press("Escape")
  await sleep(200)

  /* The dots: on the open row they always show. */
  await page.mouse.click(x, y)
  await sleep(150)
  const dots = await rect(page, '[data-section-more="hero-1"]')
  console.log(`        dots at ${r1(dots.left)},${r1(dots.top)} ${dots.width}×${dots.height}`)
  await page.mouse.click(dots.left + dots.width / 2, dots.top + dots.height / 2)
  await page.waitForSelector("[data-action-list]", { timeout: 5000 }).catch(() => {})
  await sleep(250)
  m = await menuState(page)
  check("the row's dots open the same menu, under them, right edges together", !!m.list && Math.abs(m.list.right - dots.right) <= 1 && m.list.top >= dots.bottom && m.list.top - dots.bottom <= 6 && m.listRows.length === 5, m.list ? `right edges ${r1(m.list.right - dots.right)}px apart, ${r1(m.list.top - dots.bottom)}px below` : "no menu")
  if (!m.list) { await page.screenshot({ path: join(out, "dots.png") }); console.log(`        state: ${JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 160), open: document.querySelector("[data-section-menu-open]")?.getAttribute("data-section-row"), log: window.__log })))}`) }
  await page.click('[data-action-item="duplicate"]').catch(() => {})
  await sleep(150)
  m = await menuState(page)
  check("a row of it runs its action and closes it", m.log.includes("dup:hero-1") && m.list === null, m.log)

  /* The keyboard. */
  await page.focus('[data-section-row="hero-1"]')
  await page.keyboard.down("Shift")
  await page.keyboard.press("F10")
  await page.keyboard.up("Shift")
  await sleep(250)
  m = await menuState(page)
  check("Shift+F10 on a focused row opens it", m.list !== null && m.listRows.length === 5)
  await page.keyboard.press("Escape")
  await sleep(200)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-section-row"))
  check("and Escape puts the focus back on the row", focused === "hero-1", focused)

  /* The open section's title row. */
  const bar = await page.$eval("[data-panel-back]", (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { right: r.right, top: r.top, height: r.height, pad: parseFloat(cs.paddingRight) } })
  const btn = await rect(page, "[data-section-panel-menu]")
  const back = await rect(page, "[data-panel-back] button[aria-label='Back'] > span")
  const gap = bar.right - bar.pad - btn.right
  const mid = (btn.top + btn.height / 2) - (bar.top + bar.height / 2)
  check("the title row's dots: right edge on the row's padding", Math.abs(gap) <= 0.5, `${r1(gap)}px from the ${bar.pad}px padding`)
  check("centred on the row, the Back tile's size", Math.abs(mid) <= 0.5 && btn.width === back.width && btn.height === back.height, `${btn.width}×${btn.height} beside a ${back.width}×${back.height} tile, ${r1(mid)}px off centre`)
  await page.click("[data-section-panel-menu]")
  await page.waitForSelector("[data-action-list]")
  await sleep(250)
  m = await menuState(page)
  const plain = m.listRows.filter((r) => !r.disabled)
  const hinted = m.listRows.filter((r) => r.disabled)
  check("its menu under it, right edges together", Math.abs(m.list.right - btn.right) <= 1 && m.list.top >= btn.bottom, `${r1(m.list.right - btn.right)}px`)
  check("its rows 32px; a row with a reason under it taller, and not pressable", plain.every((r) => r.h === 32) && hinted.length === 2 && hinted.every((r) => r.h > 32 && r.h <= 48), m.listRows.map((r) => `${r.id} ${r.h}`).join(", "))
  if (shots) await page.screenshot({ path: join(shots, "menus-title-row-1280.png") })
  await page.click('[data-action-item="paste-section"]').catch(() => {})
  await sleep(150)
  m = await menuState(page)
  check("a disabled row does nothing", !m.log.includes("paste-section"))
  await page.keyboard.press("Escape")
  await sleep(200)

  /* Add section: Apps. */
  await page.click('[data-section-group="template"] [data-add-section]')
  await page.waitForSelector('[data-section-library="desktop"]', { visible: true })
  await sleep(500)
  const nav = await page.evaluate(() => {
    const nav = document.querySelector('[data-section-library="desktop"] nav')
    const kids = [...nav.children].map((d) => {
      const head = d.querySelector("[data-library-group]")
      const b = d.querySelector("button")
      return { head: head?.getAttribute("data-library-group") ?? null, label: b?.querySelector("span")?.textContent ?? null, count: b?.querySelector("[data-category-count]")?.textContent ?? null }
    })
    const heading = nav.querySelector('[data-library-group="apps"]')?.getBoundingClientRect()
    const reviews = [...nav.querySelectorAll("button")].find((b) => b.querySelector("span")?.textContent === "Reviews")?.getBoundingClientRect()
    return { kids, heading: heading ? { top: heading.top, bottom: heading.bottom } : null, reviews: reviews ? { top: reviews.top, bottom: reviews.bottom, left: reviews.left, right: reviews.right } : null }
  })
  const order = nav.kids.map((k) => (k.head ? `[${k.head}] ` : "") + k.label)
  /* Changed on purpose (round Z1, the owner: "I don't like how it shows ... apps reviews email. I want to be just the button there, app embeds, next to the search input"). */
  check("Add section: All first, and no Apps group in the list", nav.kids[0].label === "All" && !nav.kids.some((k) => k.head) && !nav.kids.some((k) => k.label === "Reviews"), order.slice(0, 5))
  const embeds = await page.evaluate(() => {
    const b = document.querySelector('[data-section-library="desktop"] [data-app-embeds-toggle]')
    const s = document.querySelector('[data-section-library="desktop"] input[type="search"]')
    const r = b?.getBoundingClientRect()
    const q = s?.getBoundingClientRect()
    return b && r && q ? { text: b.textContent, right: r.right, top: r.top, bottom: r.bottom, searchLeft: q.left, searchTop: q.top } : null
  })
  check("App embeds is one button beside the search", !!embeds && /App embeds/.test(embeds.text) && embeds.right <= embeds.searchLeft && embeds.searchLeft - embeds.right <= 12 && Math.abs(embeds.top - embeds.searchTop) <= 2, embeds)
  await page.click('[data-section-library="desktop"] [data-app-embeds-toggle]')
  await sleep(400)
  const apps = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-section-library="desktop"] [data-library-card]:not([hidden])')].map((c) => c.getAttribute("data-library-card")),
    named: [...document.querySelectorAll('[data-section-library="desktop"] [data-library-card]:not([hidden]) [data-card-app]')].map((n) => n.textContent),
    off: [...document.querySelectorAll('[data-section-library="desktop"] [data-app-off]')].map((n) => ({ id: n.getAttribute("data-app-off"), text: n.textContent, href: n.querySelector("a")?.getAttribute("href"), h: n.getBoundingClientRect().height })),
  }))
  check("pressed, it shows the apps' sections and only those, each with its app's name", apps.cards.length >= 4 && apps.cards.some((t) => /^reviews_/.test(t)) && apps.named.length === apps.cards.length, `${apps.cards.length} cards: ${[...new Set(apps.cards)].join(", ")}`)
  const reviewsOff = apps.off.find((o) => o.id === "reviews")
  check("and says Reviews is off, with the way to turn it on", !!reviewsOff && /Storelib Reviews is off/.test(reviewsOff.text) && reviewsOff.href === "/app/integrations?integration=storelib-reviews", apps.off)
  if (shots) await page.screenshot({ path: join(shots, "apps-1280.png") })
  await page.close()
}

/* ── A phone ────────────────────────────────────────────────────────────── */
console.log("\nA phone, 390 × 844")
{
  const page = await open(390, 844, true)
  const row = await rect(page, '[data-section-row="hero-1"]')
  const x = Math.round(row.left + 80)
  const y = Math.round(row.top + row.height / 2)
  const cdp = await page.createCDPSession()
  const touch = (type, px, py) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py, id: 1 }] })

  /* A finger that moves is a scroll. */
  await touch("touchStart", x, y)
  await sleep(60)
  await touch("touchMove", x, y + 30)
  await sleep(650)
  await touch("touchEnd")
  await sleep(500)
  let m = await menuState(page)
  check("a finger that moves opens no menu", m.sheetRows.length === 0 && m.list === null)

  await touch("touchStart", x, y)
  await sleep(700)
  await touch("touchEnd")
  await sleep(700)
  m = await menuState(page)
  check("a finger held on a row opens the action sheet", m.sheetRows.length === 5, m.sheetRows.map((r) => r.id).join(","))
  if (m.sheetRows.length !== 5) {
    console.log(`        state: ${JSON.stringify(await page.evaluate(() => ({
      ev: window.__ev.slice(-12),
      open: document.querySelector("[data-section-menu-open]")?.getAttribute("data-section-row") ?? null,
      sheets: [...document.querySelectorAll("[data-action-sheet]")].map((s) => ({ h: s.getBoundingClientRect().height, rows: s.querySelectorAll("[data-action-item]").length })),
    })))}`)
  }
  check("its rows a thumb's height", m.sheetRows.every((r) => r.h >= 52), m.sheetRows.map((r) => r.h).join(","))
  check("and the lift did not open the section", !m.log.includes("select:hero-1"), m.log)
  if (shots) await page.screenshot({ path: join(shots, "menus-long-press-390.png") })
  await page.evaluate(() => document.querySelector('[data-action-sheet] [data-action-item="toggle-hidden"]')?.click())
  await sleep(800)
  m = await menuState(page)
  check("a row of the sheet runs once the sheet has gone", m.log.includes("hide:hero-1"), m.log)

  const bar = await page.$eval("[data-panel-back]", (el) => { const r = el.getBoundingClientRect(); return { right: r.right, top: r.top, height: r.height, pad: parseFloat(getComputedStyle(el).paddingRight) } })
  const btn = await rect(page, "[data-section-panel-menu]")
  const gap = bar.right - bar.pad - btn.right
  check("the title row's dots: right edge on the row's padding, 36px", Math.abs(gap) <= 0.5 && btn.width === 36 && btn.height === 36, `${r1(gap)}px from the ${bar.pad}px padding, ${btn.width}×${btn.height}`)

  await page.evaluate(() => document.querySelector('[data-section-group="template"] [data-add-section]')?.click())
  await page.waitForSelector('[data-section-library="phone"]', { visible: true })
  await sleep(900)
  const pills = await page.evaluate(() => {
    const row = document.querySelector('[data-section-library="phone"] [role="toolbar"]')
    const kids = [...row.firstElementChild.children]
    const b = document.querySelector('[data-section-library="phone"] [data-app-embeds-toggle]')
    const s = document.querySelector('[data-section-library="phone"] input[type="search"]')
    const r = b?.getBoundingClientRect()
    const q = s?.getBoundingClientRect()
    return {
      order: kids.map((c) => (c.getAttribute("data-library-group") ? `[${c.getAttribute("data-library-group")}]` : c.textContent)),
      apps: b && r && q ? { text: b.textContent, left: r.left, right: r.right, top: r.top, searchRight: q.right, searchTop: q.top } : null,
    }
  })
  /* Changed on purpose (round Z1): on a phone the same button, called Apps, beside the search; no Apps group of pills. */
  check("Add section on a phone: All first, no Apps group of pills", pills.order[0] === "All" && !pills.order.some((o) => /^\[/.test(o) || o === "Reviews"), pills.order.slice(0, 6))
  check("and Apps is a button beside the search, on screen", !!pills.apps && pills.apps.text.trim() === "Apps" && pills.apps.left >= pills.apps.searchRight && pills.apps.left - pills.apps.searchRight <= 12 && pills.apps.right <= 390 - 15, pills.apps)
  await page.evaluate(() => document.querySelector('[data-section-library="phone"] [data-app-embeds-toggle]')?.click())
  await sleep(400)
  const apps = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-section-library="phone"] [data-library-card]:not([hidden])')].map((c) => c.getAttribute("data-library-card")),
    off: [...document.querySelectorAll('[data-section-library="phone"] [data-app-off]')].map((n) => { const r = n.getBoundingClientRect(); return { id: n.getAttribute("data-app-off"), left: r.left, right: r.right, h: r.height } }),
  }))
  check("Apps on a phone shows the apps' sections only", apps.cards.length >= 4 && apps.cards.some((t) => /^reviews_/.test(t)), `${apps.cards.length} cards`)
  check("and the off lines fit the sheet", apps.off.length >= 1 && apps.off.every((o) => o.left >= 16 && o.right <= 390 - 16 + 1 && o.h >= 44), apps.off)
  if (shots) await page.screenshot({ path: join(shots, "apps-390.png") })
  await page.close()
}

await browser.close()
server.close()
finish()
