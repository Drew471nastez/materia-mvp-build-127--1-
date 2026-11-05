/**
 * ===========================================================================
 *  THE COUPONS PAGES, MEASURED
 * ===========================================================================
 * The list on a page of its own (its title, one card, views with counts, no
 * tabs shared with Products, a table from 768px and a list of whole-row
 * presses under it), and the coupon editor framed as the product editor is,
 * through its real layouts in a shell shaped like app/(storelib)/app/layout.tsx
 * (scripts/render-coupons-probe.tsx):
 *
 *   A PHONE (390, and 360)   a layer over the whole window: no point of the
 *                            top 120px lands in the shell's header; its own
 *                            bar starts under the status bar (a 47px inset,
 *                            Chromium's override) with Cancel and Save
 *                            reachable; the nav pill over it; fields of 16px
 *                            text in 44px boxes; nothing sideways
 *
 *   A COMPUTER (1280, 1440)  a page in the shell: the black header and the
 *                            rail painted and reached; no top bar; the page
 *                            header 24px under the shell's; the 1200px
 *                            container; two columns, the main one about twice
 *                            the side; Cancel and Save in a sticky bar along
 *                            the foot of the content area
 *
 *   A TABLET (900)           the bar at the top, under the header, to the pixel
 *
 * And what the editor does: Generate makes a code, Save waits for something
 * to save, a missing value is said under its field (not in a box at the
 * top), the body sent to the API is the one the routes read, a saved code
 * goes back to the list, and Back (nothing to lose) turns into Cancel on the
 * first change.
 *
 *   node scripts/check-coupons-page.mjs          (SHOTS_DIR=... to keep the pictures)
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const INSET = { top: 47, bottom: 34 }
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-coupons-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = join(root, ".coupons-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const page = new URLSearchParams(location.search).get("page") || "list"
export const usePathname = () => page === "list" ? "/app/coupons" : page === "new" ? "/app/coupons/new" : "/app/coupons/a1"
const go = (to) => setTimeout(() => window.dispatchEvent(new CustomEvent("probe-nav", { detail: to })), 0)
export const useRouter = () => ({ push: (h) => log("push", h), replace: (h) => { log("replace", h); go(h) }, prefetch: (h) => log("prefetch", h), back: () => { log("back"); go("back") }, refresh: () => log("refresh") })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, onClick, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { onClick && onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children)
})
`)
writeFileSync(join(dir, "server-only.js"), "export {}\n")
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-coupons-probe.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    outfile: join(dir, "probe.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'}};" },
    alias: { "next/navigation": join(dir, "navigation.js"), "next/link": join(dir, "link.jsx"), "server-only": join(dir, "server-only.js"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })

const css = await appCss(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js}</script></body></html>`
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

async function open(vp, page, inset = null) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  if (inset) {
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: inset })
  }
  await p.goto(`${base}?page=${page}`)
  await sleep(400)
  if (errors.length) fail(`${page} at ${vp.width} threw: ${errors[0]}`)
  return p
}

const saveButtons = (p) => p.$$eval("[data-save-button]", (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({ disabled: b.disabled, text: b.textContent.trim() })))

try {
  /* ── The list ─────────────────────────────────────────────────────── */
  for (const [label, vp] of [["phone-390", phone(390)], ["phone-360", phone(360)], ["desktop-1280", { width: 1280, height: 800 }], ["desktop-1440", { width: 1440, height: 900 }]]) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}: the list`)
    const p = await open(vp, "list")
    const views = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
    expect(views.join("|") === "All6|Active2|Scheduled1|Ended3", "views with counts: all, active, scheduled, ended", views)
    const own = await p.evaluate(() => ({ title: document.querySelector("[data-orders-bar] h1")?.textContent.trim(), subnav: document.querySelectorAll("nav[aria-label='Products area']").length }))
    expect(own.title === "Coupons" && own.subnav === 0, "a page of its own: titled Coupons, no Products and Coupons tabs", own)
    const sideways = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
    expect(sideways === 0, "nothing scrolls sideways", sideways)
    const states = await p.evaluate(() => [...document.querySelectorAll(window.innerWidth < 768 ? "section ul > li" : "section tbody tr")].map((r) => r.querySelector("span.inline-flex, td:nth-child(2) span")?.textContent.trim()))
    expect(states.join(",") === "Active,Active,Scheduled,Expired,Used up,Off", "each code says where it stands", states)
    const newButton = await p.$eval("[data-new-coupon]", (a) => getComputedStyle(a).backgroundColor)
    expect(newButton === "rgb(17, 17, 19)", "New coupon is near black, not violet", newButton)
    if (isPhone) {
      const rows = await p.$$eval("section ul > li", (r) => r.map((li) => ({ h: Math.round(li.getBoundingClientRect().height), link: Math.round(li.querySelector("a").getBoundingClientRect().width) === Math.round(li.getBoundingClientRect().width), menu: Math.round(li.querySelector("button").getBoundingClientRect().height) })))
      expect(rows.every((r) => r.h >= 76 && r.link && r.menu >= 44), "rows of at least 76px, the whole row a press, a 44px menu", rows[0])
      const line = await p.$eval("section ul > li:nth-child(1)", (li) => li.innerText.replace(/\s+/g, " "))
      expect(/20% off · 14 of 100 used · Ends/.test(line), "the discount, the uses and the end date under the code", line)
      await p.click("section ul > li:nth-child(2) a")
    } else {
      const heads = await p.$$eval("section thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
      expect(heads.join("|") === "Code|Status|Discount|Applies to|Used|Dates", "the table's columns", heads)
      const used = await p.$eval("section tbody tr:nth-child(1) td:nth-child(5)", (td) => td.textContent.trim())
      expect(used === "14 / 100", "uses against the limit", used)
      /* A press on the row itself, not on its code or its buttons. */
      await p.click("section tbody tr:nth-child(2) td:nth-child(4)")
    }
    await sleep(600)
    const nav = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "push" || k === "link"))
    expect(nav.length === 1 && nav[0][0] === "push" && nav[0][1] === "/app/coupons/a2", "a press on a row opens that coupon, through the router (the layer's move)", nav)
    await p.screenshot({ path: join(shots, `${label}-coupons.png`) })
    await p.close()
  }

  /* ── The editor on a phone: a layer over the whole window ─────────── */
  for (const [label, vp] of [["phone-390", phone(390)], ["phone-360", phone(360)]]) {
    for (const page of ["new", "edit"]) {
      console.log(`\n${label}: the ${page === "new" ? "new" : "saved"} coupon, a layer`)
      const p = await open(vp, page, INSET)
      const m = await p.evaluate(() => {
        const W = innerWidth, H = innerHeight
        const layer = document.querySelector("[data-page-layer]")
        const lr = layer.getBoundingClientRect()
        let chrome = 0, outside = 0, points = 0
        for (let y = 0; y <= 120; y += 4) {
          for (let x = 10; x < W; x += 20) {
            points++
            const el = document.elementFromPoint(x, y)
            if (el?.closest("[data-shell-chrome]")) chrome++
            if (!el || !layer.contains(el)) outside++
          }
        }
        const bar = document.querySelector("[data-editor-bar]")
        const controls = [...bar.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0)
        const cr = controls.map((c) => c.getBoundingClientRect())
        const reached = controls.every((c, i) => c.contains(document.elementFromPoint(cr[i].x + cr[i].width / 2, cr[i].y + cr[i].height / 2)))
        const pill = document.querySelector("[data-pill-tab]").getBoundingClientRect()
        const pillHit = document.elementFromPoint(pill.x + pill.width / 2, pill.y + pill.height / 2)
        const scroller = document.querySelector("[data-coupon-editor]")
        return {
          layer: { x: lr.x, y: lr.y, w: lr.width, h: lr.height, W, H },
          points, chrome, outside,
          controls: controls.map((c) => c.textContent.trim()),
          controlsTop: Math.round(Math.min(...cr.map((r) => r.top))),
          reached,
          foot: getComputedStyle(document.querySelector("[data-editor-foot]")).display,
          head: getComputedStyle(document.querySelector("[data-editor-head]")).display,
          pillReached: !!pillHit?.closest("[data-pill-tab]"),
          sideways: scroller.scrollWidth - scroller.clientWidth,
        }
      })
      expect(m.layer.x === 0 && m.layer.y === 0 && m.layer.w === m.layer.W && m.layer.h === m.layer.H, "the layer is the whole window", m.layer)
      expect(m.chrome === 0 && m.outside === 0, "no point of the top 120px is the app's black header", { points: m.points, chrome: m.chrome, outside: m.outside })
      expect(m.controlsTop >= INSET.top, "the bar starts under the status bar", m.controlsTop)
      expect(m.controls.length === 2 && m.controls[1] === "Save" && m.reached, "its own bar: the way out and Save, both reachable", m.controls)
      expect(m.foot === "none" && m.head === "none", "no page header and no foot bar on a phone", { foot: m.foot, head: m.head })
      expect(m.pillReached, "the nav pill stays over it, as over the product editor", m.pillReached)
      expect(m.sideways === 0, "nothing scrolls sideways", m.sideways)
      const fields = await p.$$eval("[data-coupon-editor] input", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ id: e.id, size: getComputedStyle(e).fontSize, h: Math.round(e.getBoundingClientRect().height) })))
      expect(fields.every((x) => x.size === "16px" && x.h >= 44), "fields are 16px text in 44px boxes", fields)
      const segmented = await p.$$eval("[role=radiogroup] [role=radio]", (r) => r.map((x) => [x.textContent.trim(), x.getAttribute("aria-checked"), Math.round(x.getBoundingClientRect().height)]))
      expect(segmented.length === 4 && segmented.every((s) => s[2] >= 40), "percentage or fixed, all or selected products, as segmented controls", segmented)
      await p.screenshot({ path: join(shots, `${label}-coupon-${page}.png`) })
      await p.evaluate(() => document.querySelector("[data-coupon-editor]").scrollTo(0, 99999))
      await sleep(150)
      const clear = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-coupon-editor] section, [data-delete-coupon]")].filter((c) => c.getBoundingClientRect().height > 0)
        const last = cards[cards.length - 1].getBoundingClientRect()
        const pill = document.querySelector("[data-pill-tab]").getBoundingClientRect()
        return { lastBottom: Math.round(last.bottom), pillTop: Math.round(pill.top) }
      })
      expect(clear.lastBottom <= clear.pillTop, "the last card scrolls clear of the pill", clear)
      await p.screenshot({ path: join(shots, `${label}-coupon-${page}-end.png`) })
      await p.close()
    }
  }

  /* ── The editor from md: a page in the shell ──────────────────────── */
  for (const [label, vp] of [["tablet-900", { width: 900, height: 900 }], ["desktop-1280", { width: 1280, height: 800 }], ["desktop-1440", { width: 1440, height: 900 }]]) {
    for (const page of ["new", "edit"]) {
      console.log(`\n${label}: the ${page === "new" ? "new" : "saved"} coupon, in the shell`)
      const p = await open(vp, page)
      const m = await p.evaluate(() => {
        const r1 = (n) => Math.round(n * 10) / 10
        const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none"
        const header = document.querySelector("[data-desktop-header]")
        const rail = document.querySelector("[data-rail]")
        const hr = header.getBoundingClientRect()
        const rr = rail.getBoundingClientRect()
        const scroller = document.querySelector("[data-coupon-editor]")
        const sr = scroller.getBoundingClientRect()
        const bar = document.querySelector("[data-editor-bar]")
        const head = document.querySelector("[data-editor-head]")
        const foot = document.querySelector("[data-editor-foot]")
        const pageBox = document.querySelector("[data-editor-page]").getBoundingClientRect()
        const main = document.querySelector("[data-editor-main]").getBoundingClientRect()
        const side = document.querySelector("[data-editor-side]").getBoundingClientRect()
        const save = [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0)
        const sb = save.getBoundingClientRect()
        return {
          headerHit: !!document.elementFromPoint(innerWidth / 2, hr.bottom / 2)?.closest("[data-desktop-header]"),
          headerBottom: r1(hr.bottom),
          railHit: !!document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2)?.closest("[data-rail]"),
          layerPosition: getComputedStyle(document.querySelector("[data-page-layer]")).position,
          area: { left: r1(sr.left), width: r1(scroller.clientWidth), bottom: r1(sr.top + scroller.clientHeight) },
          bar: shown(bar) ? { top: r1(bar.getBoundingClientRect().top), paddingTop: getComputedStyle(bar).paddingTop } : null,
          head: shown(head) ? { top: r1(head.getBoundingClientRect().top), title: head.querySelector("h1").textContent } : null,
          foot: shown(foot) ? { left: r1(foot.getBoundingClientRect().left), width: r1(foot.getBoundingClientRect().width), bottom: r1(foot.getBoundingClientRect().bottom), position: getComputedStyle(foot).position } : null,
          page: { width: r1(pageBox.width), left: r1(pageBox.left) },
          columns: { main: r1(main.width), side: r1(side.width), sideBySide: Math.abs(main.top - side.top) < 1 && side.left > main.right },
          saveReached: save.contains(document.elementFromPoint(sb.x + sb.width / 2, sb.y + sb.height / 2)),
          saveColour: getComputedStyle(save).backgroundColor,
          sideways: scroller.scrollWidth - scroller.clientWidth,
        }
      })
      expect(m.headerHit && m.railHit, "the black header and the rail are there and reached", { header: m.headerHit, rail: m.railHit })
      expect(m.layerPosition !== "fixed", "a page in the shell, not a layer over it", m.layerPosition)
      expect(m.sideways === 0 && m.saveReached, "nothing sideways, Save reachable", { sideways: m.sideways, save: m.saveReached })
      if (vp.width < 1024) {
        expect(m.bar && m.bar.top === m.headerBottom && m.bar.paddingTop === "0px", "the bar at the top of the content area, right under the header", { bar: m.bar, header: m.headerBottom })
        expect(!m.head && !m.foot, "no page header and no foot bar below lg", { head: m.head, foot: m.foot })
      } else {
        expect(!m.bar, "no top bar from lg", m.bar)
        expect(m.head && Math.abs(m.head.top - (m.headerBottom + 24)) <= 1, "the page header 24px under the shell's, not against it", { head: m.head, header: m.headerBottom })
        expect(m.head?.title === (page === "new" ? "New coupon" : "SUMMER20"), "titled with the code, or New coupon", m.head?.title)
        const inner = Math.min(m.area.width, 1200)
        expect(Math.abs(m.page.width - inner) <= 1, "the 1200px page container, as every /app page", { page: m.page.width, area: m.area.width })
        expect(m.columns.sideBySide && m.columns.main > m.columns.side * 1.6, "two columns, the coupon two thirds, its status one third", m.columns)
        expect(m.foot && m.foot.position === "sticky" && Math.abs(m.foot.bottom - m.area.bottom) <= 1 && Math.abs(m.foot.left - m.area.left) <= 1 && Math.abs(m.foot.width - m.area.width) <= 1, "Cancel and Save in a bar along the foot of the content area", { foot: m.foot, area: m.area })
        expect(m.saveColour === "rgb(17, 17, 19)" || m.saveColour === "rgb(235, 235, 239)", "Save near black (grey while there is nothing to save), never violet", m.saveColour)
      }
      await p.screenshot({ path: join(shots, `${label}-coupon-${page}.png`) })
      await p.close()
    }
  }

  /* ── What the editor does ─────────────────────────────────────────── */
  for (const [label, vp] of [["phone-390", phone(390)], ["desktop-1280", { width: 1280, height: 800 }]]) {
    console.log(`\n${label}: filling in a new coupon`)
    const f = await open(vp, "new")
    expect((await saveButtons(f)).every((b) => b.disabled), "Save waits for something to save", await saveButtons(f))
    await f.click("[data-generate-code]")
    const made = await f.$eval("#coupon-code", (i) => i.value)
    expect(/^[A-HJ-NP-Z2-9]{8}$/.test(made), "Generate makes an eight character code with nothing that reads as something else", made)
    await f.evaluate(() => { const i = document.querySelector("#coupon-code"); i.select() })
    await f.type("#coupon-code", "spring 25!")
    const code = await f.$eval("#coupon-code", (i) => i.value)
    expect(code === "SPRING25", "a code is typed in capitals, without spaces or symbols", code)
    expect((await saveButtons(f)).every((b) => !b.disabled), "and Save lights up", await saveButtons(f))
    await f.keyboard.down("Control")
    await f.keyboard.press("s")
    await f.keyboard.up("Control")
    await sleep(250)
    const err = await f.evaluate(() => {
      const e = document.querySelector("[data-field-error]")
      const input = document.querySelector("#coupon-value")
      return { text: e?.textContent, id: e?.id, invalid: input.getAttribute("aria-invalid"), focused: document.activeElement === input, alert: !!document.querySelector("[role=alert]") }
    })
    expect(err.text === "Enter how much it takes off." && err.id === "coupon-value-error" && err.invalid === "true" && err.focused && !err.alert, "Ctrl and S checks first, and says what is missing under its own field", err)
    expect((await f.evaluate(() => window.__sent.length)) === 0, "nothing is sent while the form is not complete", await f.evaluate(() => window.__sent.length))
    await f.type("#coupon-value", "150")
    await f.click("[data-save-button]:not([disabled])").catch(() => {})
    await f.evaluate(() => [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0).click())
    await sleep(200)
    const over = await f.$eval("[data-field-error]", (e) => e.textContent).catch(() => null)
    expect(over === "A percentage is at most 100.", "a percentage over 100 is refused before the server", over)
    await f.evaluate(() => { const i = document.querySelector("#coupon-value"); i.select() })
    await f.type("#coupon-value", "25")
    await f.click("[data-value=specific]")
    await sleep(120)
    const picks = await f.$$eval("#coupon-products [role=checkbox]", (c) => c.length)
    expect(picks === 8, "Selected products lists the products to pick, with a search over eight", picks)
    await f.click("#coupon-products li:nth-child(2) [role=checkbox]")
    await sleep(200)
    const ticked = await f.$eval("#coupon-products li:nth-child(2) [role=checkbox]", (b) => ({ checked: b.getAttribute("aria-checked"), colour: getComputedStyle(b.querySelector("span")).backgroundColor }))
    expect(ticked.checked === "true" && ticked.colour === "rgb(17, 17, 19)", "a picked product is ticked in near black", ticked)
    /* The use limit, and an end date that fills itself in when switched on. */
    await f.evaluate(() => [...document.querySelectorAll("[role=switch]")].find((s) => s.getAttribute("aria-label") === "Limit total uses").click())
    await sleep(80)
    await f.type("#coupon-uses", "100")
    await f.evaluate(() => [...document.querySelectorAll("[role=switch]")].find((s) => s.getAttribute("aria-label") === "End date").click())
    await sleep(80)
    const end = await f.$eval("#coupon-end", (i) => i.value)
    expect(/^\d{4}-\d\d-\d\dT\d\d:00$/.test(end), "an end date starts filled in, a week out on the hour", end)
    if (vp.width >= 1024) {
      const summary = await f.$$eval("[data-coupon-summary] li", (l) => l.map((x) => x.textContent))
      expect(summary[0] === "25% off The complete portrait retouching course, with every raw file" && summary.includes("Can be used 100 times") && summary.some((s) => s.startsWith("Ends ")), "the summary says it in words", summary)
      const state = await f.$eval("[data-editor-state]", (e) => e.textContent.trim())
      expect(state === "Unsaved changes", "the foot bar says there are changes", state)
    }
    await f.screenshot({ path: join(shots, `${label}-coupon-filled.png`) })
    await f.evaluate(() => [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0).click())
    await sleep(700)
    const sent = await f.evaluate(() => window.__sent)
    const body = sent[0]?.body
    expect(sent.length === 1 && sent[0].url === "/api/coupons" && sent[0].method === "POST", "Save posts the new code once", sent.map((s) => `${s.method} ${s.url}`))
    expect(body && body.code === "SPRING25" && body.discount_type === "percentage" && body.discount_value === 25 && body.product_ids?.length === 1 && body.usage_limit === 100 && typeof body.expires_at === "string" && body.starts_at === null && body.min_purchase_cents === null && body.is_active === true, "with the body the route reads", body)
    const after = await f.evaluate(() => (window.__router || []).filter(([k]) => k === "replace" || k === "back"))
    expect(after.length === 1 && after[0][0] === "replace" && after[0][1] === "/app/coupons", "and goes back to the list (a replace: nothing opened it from the list here)", after)
    await sleep(300)
    const first = await f.evaluate(() => [...document.querySelectorAll(innerWidth < 768 ? "section ul > li" : "section tbody tr")].filter((r) => r.getClientRects().length > 0)[0]?.innerText.replace(/\s+/g, " "))
    expect(/^SPRING25/.test(first || ""), "the new code is first on the list it goes back to", first)
    await f.close()

    console.log(`${label}: a saved coupon`)
    const e = await open(vp, "edit")
    const leave = await e.$$eval("[data-leave-button]", (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.mode))
    expect(leave.length === 1 && leave[0] === "back", "nothing changed: the way out is Back", leave)
    expect((await saveButtons(e)).every((b) => b.disabled), "and Save is grey", await saveButtons(e))
    await e.evaluate(() => [...document.querySelectorAll("[role=switch]")].find((s) => s.getAttribute("aria-label") === "Active").click())
    await sleep(200)
    const changed = await e.$$eval("[data-leave-button]", (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.mode))
    expect(changed[0] === "cancel" && (await saveButtons(e)).every((b) => !b.disabled), "one change: Cancel, and Save lights up", changed)
    await e.evaluate(() => [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0).click())
    await sleep(700)
    const put = await e.evaluate(() => window.__sent[0])
    expect(put?.url === "/api/coupons/a1" && put.method === "PUT" && put.body.is_active === false && put.body.code === "SUMMER20" && put.body.product_ids.length === 2, "Save puts the whole code to its own address", put && { url: put.url, method: put.method, is_active: put.body.is_active })
    /* Back on the list, which the router kept from before the save. */
    await sleep(300)
    const back = await e.evaluate(() => {
      const row = [...document.querySelectorAll("[data-row='a1']")].find((r) => r.getClientRects().length > 0)
      const tinted = row && (row.tagName === "TR" ? [...row.children] : [row]).some((el) => el.getAnimations().length > 0)
      return {
        list: !!document.querySelector(".orders-pane"),
        status: row?.querySelector("span.inline-flex, td:nth-child(2) span")?.textContent.trim(),
        pill: document.querySelector("[data-coupon-pill]")?.textContent.trim(),
        tinted,
        refreshed: (window.__router || []).some(([k]) => k === "refresh"),
      }
    })
    expect(back.list && back.status === "Off", "back on the list, the row already says what was saved, on its first frame", back)
    expect(back.pill === "SUMMER20 saved" && back.tinted && back.refreshed, "it says so in the dark pill, tints the row, and refreshes the list", back)
    await e.screenshot({ path: join(shots, `${label}-back-on-list.png`) })
    await e.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
