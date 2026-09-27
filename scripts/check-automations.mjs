/**
 * ===========================================================================
 *  THE AUTOMATION PAGES, MEASURED AT 360, 390, 430, 1440 AND 1920
 * ===========================================================================
 * Mounts the real chooser, builder and Subscribers view
 * (scripts/render-automations-probe.tsx) and checks what they claim:
 *
 *   frame        the product editor's: on a phone a layer over the whole
 *                screen, over the app's black bar, with its own bar stuck to
 *                the top; from 768px a page under the black bar with its
 *                header 24px below it, the 1200px container from lg, and
 *                the app's back button (an arrow, no border)
 *   chooser      one list of starting points in the order a person meets a
 *                creator, each a drawing made for it on a white tile, a name,
 *                one line and its steps in words; no violet anywhere, no
 *                gradient; full width inside a 16px gutter on a phone and the
 *                page's width on a computer; one you have opens yours; Start
 *                from scratch asks what starts it
 *   builder      a bar with Back, the name, Draft or Live, one primary action
 *                in near black and a menu; the header, the state line, every
 *                step node and the activity on one left edge and one width;
 *                every + on the column's centre line; no layout shift while it
 *                loads or when a step is opened; the panel beside it on a
 *                desktop, the sheet on a phone; Save in the bar on a phone and
 *                in a foot bar from 768px; Back goes to the list
 *   subscribers  a Source column that names the website, a filter that
 *                narrows to one source, and a contact's detail with where
 *                they came from
 *
 *   node scripts/check-automations.mjs            (SHOTS_DIR=... keeps screenshots)
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".automations-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-automations-")), "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `
const nav = () => (globalThis.__nav = globalThis.__nav || [])
const router = { replace: (u) => nav().push(["replace", String(u)]), push: (u) => nav().push(["push", String(u)]), refresh: () => nav().push(["refresh"]), back: () => nav().push(["back"]), forward() {}, prefetch: (u) => nav().push(["prefetch", String(u)]) }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)
/* The contact detail reads its runs through the browser client. */
writeFileSync(join(dir, "supabase-client.js"), `
const runs = [
  { id: "r1", status: "completed", exit_reason: null, started_at: "2026-09-01T10:00:00Z", flow_id: "f1", email_flows: { name: "Welcome series" } },
  { id: "r2", status: "active", exit_reason: null, started_at: "2026-09-20T10:00:00Z", flow_id: "f2", email_flows: { name: "Bring buyers back" } },
]
function chain() { const c = { select: () => c, eq: () => c, order: () => c, limit: () => Promise.resolve({ data: runs, error: null }) }; return c }
export function createClient() { return { from: () => chain() } }
`)

let server
let browser
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const css = await appCss(root)
  const bundle = join(dir, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-automations-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase-client.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  /* A fine pointer that can hover: headless has none, and Tailwind puts hover: behind (hover: hover). */
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"] })

  const open = async (vp, view) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    /* Every layout shift from the first paint on, the way CLS counts them. */
    await p.evaluateOnNewDocument(() => {
      window.__shifts = []
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, at: Math.round(e.startTime), nodes: (e.sources || []).map((s) => (s.node && s.node.textContent ? s.node.textContent.trim().slice(0, 40) : s.node?.nodeName || "")) }) }).observe({ type: "layout-shift", buffered: true })
    })
    await p.goto(`${origin}/?view=${view}`)
    await p.waitForSelector(".orders-pane")
    await sleep(400)
    return p
  }
  const cls = (p) => p.evaluate(() => ({ total: +window.__shifts.reduce((n, s) => n + s.value, 0).toFixed(4), shifts: window.__shifts }))
  const sideways = (p) => p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
  /** Anything whose box leaves the one it is in, sideways. */
  const spills = (p, sel) => p.evaluate((s) => {
    const out = []
    for (const card of document.querySelectorAll(s)) {
      const r = card.getBoundingClientRect()
      for (const el of card.querySelectorAll("*")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0) continue
        if (b.right > r.right + 0.5 || b.left < r.left - 0.5) out.push((el.textContent || el.tagName).trim().slice(0, 30))
      }
    }
    return out
  }, sel)
  /** Any element painted in the /app violet, or with a gradient, inside `sel`. */
  const violetOrGradient = (p, sel) => p.evaluate((s) => {
    const violet = /rgb\((139, 92, 246|124, 58, 237|109, 40, 217|91, 33, 182|239, 233, 254|247, 244, 255)\)/
    const out = []
    for (const el of document.querySelectorAll(`${s}, ${s} *`)) {
      const cs = getComputedStyle(el)
      const paints = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.fill, cs.stroke].join(" ")
      if (violet.test(paints) || /gradient/.test(cs.backgroundImage)) out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30))
    }
    return out
  }, sel)
  const minText = (p) => p.evaluate(() => Math.min(...[...document.querySelectorAll(".orders-pane *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))))
  const lastNav = (p) => p.evaluate(() => (window.__nav || []).filter((n) => n[0] !== "prefetch").at(-1) ?? null)

  /**
   * The product editor's frame. On a phone: the page is a layer over the
   * whole screen, the shell's black bar is neither painted nor under the
   * page's own bar, the bar starts at the top edge and stays there when the
   * page scrolls. From 768px: the black bar is there, and the page's header
   * (`title`) starts 24px or more under it, not stuck to it.
   */
  const frame = async (p, isPhone, title) => {
    const f = await p.evaluate((sel) => {
      const shell = document.querySelector("[data-probe-topbar]")
      const bar = document.querySelector("[data-flow-bar]")
      const t = document.querySelector(sel)
      const top = document.elementFromPoint(20, 20)
      return {
        shellShown: getComputedStyle(shell).visibility !== "hidden",
        shellBottom: Math.round(shell.getBoundingClientRect().bottom),
        barTop: Math.round(bar.getBoundingClientRect().top),
        titleTop: Math.round(t.getBoundingClientRect().top),
        topIsPage: !!top?.closest("[data-page-layer]"),
        pillShown: (() => {
          const pill = document.querySelector("[data-probe-pill]")
          const at = document.elementFromPoint(innerWidth / 2, innerHeight - 40)
          return !!pill && getComputedStyle(pill).visibility !== "hidden" && getComputedStyle(pill).display !== "none" && !!at?.closest("[data-probe-pill]")
        })(),
      }
    }, title)
    if (isPhone) {
      expect(!f.shellShown && f.topIsPage && f.barTop === 0, "a page of its own over the whole screen: no black bar, its own bar at the top", f)
      expect(!f.pillShown, "full screen: the nav pill is not over it either", f.pillShown)
      await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 600 })
      await sleep(250)
      const stuck = await p.evaluate(() => { const bar = document.querySelector("[data-flow-bar]"); return { top: Math.round(bar.getBoundingClientRect().top), shadow: getComputedStyle(bar).boxShadow !== "none" } })
      expect(stuck.top === 0 && stuck.shadow, "and the bar stays at the top as the page scrolls, with a shade under it", stuck)
      await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 0 })
      await sleep(200)
    } else {
      expect(f.shellShown && f.titleTop - f.shellBottom >= 24 && f.titleTop - f.shellBottom <= 32, "under the black bar, with the product editor's 24px of room above the header", f)
      const pane = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); el.scrollTop = 400; return el.scrollTop })
      await sleep(200)
      const moved = await p.evaluate(() => Math.round(document.querySelector("[data-flow-bar]").getBoundingClientRect().top))
      /* A page that fits the window has nothing to scroll: the header then stays by itself. */
      expect(pane === 0 || moved === f.barTop - pane, "the header is in the page and scrolls away with it, as the product editor's does", { before: f.barTop, after: moved, scrolled: pane })
      await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 0 })
      await sleep(200)
    }
  }

  const phone = (width, height) => ({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const viewports = [
    ["360", phone(360, 740)],
    ["390", phone(390, 844)],
    ["430", phone(430, 932)],
    ["1440", { width: 1440, height: 900 }],
    ["1920", { width: 1920, height: 1080 }],
  ]

  for (const [label, vp] of viewports) {
    const isPhone = vp.width < 640
    /* The app's gutter (app/globals.css --app-gutter): 10px on a phone since every /app card moved to 10px from the glass. */
    const gutter = vp.width < 640 ? 10 : vp.width < 1024 ? 24 : 32

    console.log(`\nChooser, ${label}`)
    const p = await open(vp, "chooser")
    const rows = await p.$$eval("[aria-label='Starting points'] > li > button", (b) => b.map((x) => {
      const r = x.getBoundingClientRect()
      const icon = x.querySelector("span[aria-hidden] svg")?.getBoundingClientRect()
      return { x: Math.round(r.left), w: Math.round(r.width), iconX: icon ? Math.round(icon.left) : null, text: x.textContent }
    }))
    expect(rows.length === 9, "eight starting points and Start from scratch", rows.length)
    const order = rows.map((r) => r.text.split(/You have this|Email|Wait|Choose/)[0].trim())
    expect(/^Welcome series/.test(order[0]) && /^Checkout reminder/.test(order[1]) && /^First order welcome/.test(order[2]) && /^Start from scratch/.test(order.at(-1)), "in the order a person meets a creator: joining, checkout, the orders, then your own", order)
    expect(rows.some((r) => /Welcome series.*Email, wait 3 days, email/.test(r.text)), "each says its steps in words", rows[0].text.slice(0, 120))
    expect(new Set(rows.map((r) => r.x)).size === 1 && new Set(rows.map((r) => r.w)).size === 1 && new Set(rows.map((r) => r.iconX)).size === 1, "every row and every icon on one left edge, one width", rows.map((r) => [r.x, r.w, r.iconX]))
    const listBox = await p.$eval("[aria-label='Starting points']", (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width) } })
    if (isPhone) expect(listBox.x === gutter + 1 && listBox.w === vp.width - 2 * gutter - 2, "full width inside the app's 10px phone gutter", listBox)
    else expect(listBox.w === 1200 - 64 - 2 && Math.abs(listBox.x + listBox.w / 2 - vp.width / 2) <= 1, "the page's 1200px container on a wide screen, centred, like the product editor", listBox)
    await frame(p, isPhone, "h1")
    const drawn = await p.$$eval("[aria-label='Starting points'] > li > button [data-list-icon] svg", (x) => x.map((e) => e.getAttribute("data-flow-icon")))
    expect(drawn.length === 9 && drawn.every(Boolean) && new Set(drawn.slice(0, 8)).size >= 7, "every icon is one of the drawings made for these pages, not an icon set's", drawn)
    const tile = await p.$eval("[aria-label='Starting points'] > li > button [data-list-icon]", (t) => { const cs = getComputedStyle(t); return { w: t.getBoundingClientRect().width, bg: cs.backgroundColor, shadow: cs.boxShadow } })
    expect(tile.w === 40 && tile.bg === "rgb(255, 255, 255)" && (tile.shadow.match(/rgba/g) ?? []).length >= 3, "on a 40px white tile with a hairline and layered shade", tile)
    expect((await violetOrGradient(p, "[aria-label='Starting points']")).length === 0, "no violet and no gradient anywhere in the list", await violetOrGradient(p, "[aria-label='Starting points']"))
    const iconColour = await p.$eval("[aria-label='Starting points'] li button span[aria-hidden] svg", (s) => getComputedStyle(s).color)
    expect(/rgb\((39, 39, 42|63, 63, 70|55, 65, 81|75, 85, 99)\)/.test(iconColour), "the icons are one neutral ink", iconColour)
    expect((await spills(p, "[aria-label='Starting points'] > li > button")).length === 0, "nothing spills out of a row", await spills(p, "[aria-label='Starting points'] > li > button"))
    expect((await sideways(p)) === 0, "the page never scrolls sideways", await sideways(p))
    expect((await minText(p)) >= 12, "no text under 12px", await minText(p))
    expect((await cls(p)).total === 0, "nothing moves while it loads", await cls(p))
    const mine = rows.find((r) => /You have this/.test(r.text))
    expect(Boolean(mine) && (isPhone || /Open yours/.test(mine.text)), "one you already have says so", mine?.text.slice(0, 80))
    await p.screenshot({ path: join(shots, `chooser-${label}.png`), fullPage: true })
    await p.evaluate(() => [...document.querySelectorAll("[aria-label='Starting points'] > li > button")].find((b) => /You have this/.test(b.textContent)).click())
    await sleep(100)
    expect((await lastNav(p))?.[1] === "/app/emails/flow/f9" && (await p.evaluate(() => window.__calls.length)) === 0, "and opens yours, without creating a second one")
    await p.evaluate(() => [...document.querySelectorAll("[aria-label='Starting points'] > li > button")].find((b) => /Welcome series/.test(b.textContent)).click())
    await sleep(200)
    expect(JSON.stringify(await lastNav(p)) === JSON.stringify(["replace", "/app/emails/flow/new-flow"]), "a new one is created and opened in place of this list", await lastNav(p))
    await p.close()

    const s = await open(vp, "chooser")
    await s.click("button[aria-label='Start from scratch']")
    await sleep(600)
    const triggers = await s.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-action-sheet] button")].map((b) => b.textContent.trim()))
    expect(triggers.length === 4 && triggers[0] === "Someone joins your email list", "Start from scratch asks what starts it: four triggers", triggers)
    if (label === "390" || label === "1440") await s.screenshot({ path: join(shots, `chooser-${label}-scratch.png`) })
    await s.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-action-sheet] button")].find((b) => /buys from you$/.test(b.textContent.trim())).click())
    await sleep(500)
    const made = await s.evaluate(() => window.__calls.find(([m, u]) => m === "POST" && u === "/api/automations/flows"))
    expect(Boolean(made), "and makes an empty one for it", made)
    await s.close()

    console.log(`\nBuilder, ${label}`)
    const b = await open(vp, "builder")
    const load = await cls(b)
    expect(load.total === 0, "nothing moves while it loads (CLS 0)", load)
    const bar = await b.evaluate(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right) } }
      const back = document.querySelector("button[aria-label='Back to automations']")
      const name = document.querySelector("input[aria-label=Name]")
      const primary = [...document.querySelectorAll("[data-flow-bar] button")].find((x) => ["Save", "Turn on"].includes(x.textContent.trim()) && getComputedStyle(x).display !== "none")
      const more = document.querySelector("[data-flow-bar] button[aria-label='More actions']")
      const badge = [...document.querySelectorAll("span")].find((x) => ["Live", "Draft", "Paused"].includes(x.textContent.trim()) && getComputedStyle(x).display !== "none" && x.getBoundingClientRect().width > 0)
      return { back: box(back), backBorder: back ? getComputedStyle(back).borderTopWidth : null, name: box(name), primary: primary ? primary.textContent.trim() : null, more: box(more), badge: badge ? { text: badge.textContent.trim(), ...box(badge) } : null }
    })
    expect(bar.back && bar.back.w === (isPhone ? 40 : 36) && bar.back.h === bar.back.w && bar.backBorder === "0px", "Back is the app's back button: an arrow on a quiet square, no border, 40px on a phone and 36px from 768px", { ...bar.back, border: bar.backBorder })
    await frame(b, isPhone, "input[aria-label=Name]")
    if (isPhone) expect(bar.more && bar.more.r <= vp.width && bar.more.r >= vp.width - gutter, "the menu sits at the bar's right edge, on the gutter", { more: bar.more, gutter })
    expect(bar.badge?.text === "Live", "the state says Live", bar.badge)
    expect(bar.primary === null, "a live flow with nothing to save shows no primary action, only the menu", bar.primary)
    expect(bar.name && bar.name.w >= 80, "the name has room to be read", bar.name)
    const axis = await b.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), w: Math.round(r.width), cx: Math.round(r.left + r.width / 2) } }
      const nodes = [...document.querySelectorAll("ol[aria-label=Steps] > li > button:not([aria-label^='Add'])")].map(box)
      const adds = [...document.querySelectorAll("ol[aria-label=Steps] button[aria-label='Add a step here'], ol[aria-label=Steps] button[aria-label='Add the first step']")].map(box)
      const back = box(document.querySelector("button[aria-label='Back to automations'] svg"))
      const state = box(document.querySelector("[aria-label='Whether this automation is sending']"))
      const activity = box(document.querySelector("section[aria-label=Activity]"))
      const aside = document.querySelector("aside")
      const asideBox = aside && aside.getBoundingClientRect().width ? box(aside) : null
      const more = box(document.querySelector("button[aria-label='More actions']"))
      return { nodes, adds, back, state, activity, aside: asideBox, more }
    })
    expect(axis.nodes.length === 6, "the trigger and five steps", axis.nodes.length)
    expect(new Set(axis.nodes.map((n) => n.x)).size === 1 && new Set(axis.nodes.map((n) => n.w)).size === 1, "every step node on one left edge, one width", axis.nodes.map((n) => [n.x, n.w]))
    expect(axis.adds.length === 6 && axis.adds.every((a) => Math.abs(a.cx - axis.nodes[0].cx) <= 1), "every + on the column's centre line", axis.adds.map((a) => a.cx))
    expect(axis.state.x === axis.nodes[0].x && axis.state.w === axis.nodes[0].w && axis.activity.x === axis.nodes[0].x && axis.activity.w === axis.nodes[0].w, "the state line, the steps and the activity share one edge and one width", { state: axis.state, node: axis.nodes[0], activity: axis.activity })
    expect(Math.abs(axis.back.x - axis.nodes[0].x) <= 3, "the Back arrow lines up with the column below it", { back: axis.back.x, column: axis.nodes[0].x })
    if (isPhone) {
      expect(axis.nodes[0].x === gutter && axis.nodes[0].r === vp.width - gutter, "the app's 10px gutters on a phone", axis.nodes[0])
      expect(axis.aside === null, "no side panel on a phone", axis.aside)
    } else {
      expect(axis.aside && axis.aside.w === 420 && axis.aside.x > axis.nodes[0].r && Math.abs(axis.aside.r - axis.more.r) <= 2, "the panel beside the column, 420px, its right edge under the menu", { aside: axis.aside, more: axis.more })
      expect(Math.abs((axis.nodes[0].x + axis.aside.r) / 2 - vp.width / 2) <= 2 && axis.aside.r - axis.nodes[0].x === 1200 - 64, "the whole page centred, in the 1200px container", { left: axis.nodes[0].x, right: axis.aside.r })
      expect(axis.aside.y === axis.state.y, "the panel's top lines up with the column's", { aside: axis.aside.y, column: axis.state.y })
      expect(bar.badge && bar.name && bar.badge.x - bar.name.r >= 0 && bar.badge.x - bar.name.r <= 12, "the state badge sits right after the name", { name: bar.name, badge: bar.badge })
    }
    expect((await sideways(b)) === 0, "the page never scrolls sideways", await sideways(b))
    expect((await spills(b, "ol[aria-label=Steps] > li > button")).length === 0, "a long subject is cut inside its node", await spills(b, "ol[aria-label=Steps] > li > button"))
    expect((await violetOrGradient(b, "ol[aria-label=Steps]")).length === 0, "no violet in the steps, and no gradient", await violetOrGradient(b, "ol[aria-label=Steps]"))
    expect((await minText(b)) >= 11, "no text under 11px", await minText(b))
    const stats = await b.$eval("ol[aria-label=Steps] > li:nth-child(3) button", (n) => n.textContent)
    expect(/412 sent/.test(stats) && /61% opened/.test(stats) && /2 failed/.test(stats), "an email shows what it has done, from its records", stats.slice(0, 120))
    const stateLine = await b.$eval("[aria-label='Whether this automation is sending']", (s) => s.textContent)
    expect(/14 people are partway through/.test(stateLine), "the state line says who is in it", stateLine.slice(0, 90))
    await b.screenshot({ path: join(shots, `builder-${label}.png`), fullPage: !isPhone })
    if (isPhone) await b.screenshot({ path: join(shots, `builder-${label}-top.png`) })

    /* Opening a step: the column does not move, the editor appears where it belongs. */
    const before = await b.$$eval("ol[aria-label=Steps] > li > button:not([aria-label^='Add'])", (n) => n.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }))
    const shiftsBefore = (await cls(b)).shifts.length
    await b.click("ol[aria-label=Steps] > li:nth-child(3) button")
    await sleep(600)
    const after = await b.$$eval("ol[aria-label=Steps] > li > button:not([aria-label^='Add'])", (n) => n.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }))
    expect(JSON.stringify(before) === JSON.stringify(after), "selecting a step moves nothing in the column", { before: before.slice(0, 3), after: after.slice(0, 3) })
    const shiftsAfter = (await cls(b)).shifts.slice(shiftsBefore)
    expect(shiftsAfter.length === 0, "and no layout shift is recorded for it", shiftsAfter)
    const editor = await b.evaluate(() => {
      const s = document.querySelector("input[id^='subject-']")
      if (!s) return null
      const r = s.getBoundingClientRect()
      return { inSheet: !!s.closest("[role=dialog]"), inAside: !!s.closest("aside"), value: s.value, left: Math.round(r.left), right: Math.round(r.right), body: !!document.querySelector("[role=textbox][contenteditable]") }
    })
    expect(editor && editor.value === "Welcome, {{first_name}}" && editor.body, "opening an email opens its subject and body", editor)
    expect(isPhone ? editor?.inSheet : editor?.inAside, `in the ${isPhone ? "bottom sheet" : "side panel"}`, editor)
    if (isPhone) expect(editor && editor.left >= 16 && editor.right <= vp.width - 16, "inside the screen, with its gutters", editor)
    else {
      const rows = await b.$$eval("[role=toolbar] button", (x) => [...new Set(x.map((e) => Math.round(e.getBoundingClientRect().top)))])
      expect(rows.length === 1, "the email's toolbar is one row in the panel", rows)
    }
    await b.screenshot({ path: join(shots, `builder-${label}-email.png`) })
    if (isPhone) {
      /* The sheet's foot: Move, Remove and Done in reach without scrolling to the end of the email. */
      const foot = await b.evaluate(() => {
        const f = [...document.querySelectorAll("[data-panel-foot]")].find((x) => x.closest("[role=dialog]"))
        if (!f) return null
        const r = f.getBoundingClientRect()
        const done = f.querySelector("[data-panel-done]")?.getBoundingClientRect()
        const buttons = [...f.querySelectorAll("button")].map((x) => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), Math.round(q.right)] })
        return { bottom: Math.round(r.bottom), top: Math.round(r.top), vh: innerHeight, done: done ? Math.round(done.height) : 0, buttons, spill: f.scrollWidth - f.clientWidth }
      })
      expect(!!foot && foot.bottom <= foot.vh && foot.top < foot.vh - 40 && foot.done >= 40, "the step's actions and Done sit at the foot of the sheet, on screen", foot)
      expect(!!foot && foot.spill <= 0 && foot.buttons.every(([w, h, r]) => h >= 40 && w >= 40 && r <= vp.width), "on one row that fits, every button a 40px target", foot?.buttons)
    }
    /* Preview: the email as it goes out, in the composer's preview. */
    await b.evaluate(() => document.querySelector("[data-flow-preview]").scrollIntoView({ block: "center" }))
    await sleep(80)
    await b.click("[data-flow-preview]")
    await b.waitForSelector("[data-preview-layer]", { timeout: 3000 }).catch(() => null)
    await sleep(600)
    const pv = await b.evaluate(() => {
      const layer = document.querySelector("[data-preview-layer]")
      if (!layer) return null
      const r = layer.getBoundingClientRect()
      const f = layer.querySelector("iframe")
      const hit = document.elementFromPoint(innerWidth / 2, 30)
      return { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], words: /Hi Alex/.test(f?.contentDocument?.body?.textContent ?? ""), onTop: !!hit?.closest("[data-preview-layer]"), frame: f ? Math.round(f.getBoundingClientRect().width) : 0 }
    })
    expect(!!pv && pv.box[0] === 0 && pv.box[1] === 0 && pv.box[2] === vp.width && pv.box[3] === vp.height && pv.onTop && pv.words, "Preview shows the email as it goes out, over everything, full screen", pv)
    expect(!!pv && pv.frame > 0 && pv.frame <= vp.width, "and the email fits the screen", pv?.frame)
    const asked = await b.evaluate(() => window.__calls.filter(([m, u]) => m === "POST" && u.endsWith("/preview")).length)
    expect(asked === 0, "drawn in the browser from the creator's look the page brought, with no request", asked)
    await b.screenshot({ path: join(shots, `builder-${label}-preview.png`) })
    await b.click("[data-preview-done]")
    await sleep(500)
    expect(await b.evaluate(() => !document.querySelector("[data-preview-layer]")), "Done takes it away")
    await b.type("input[id^='subject-']", " and welcome")
    await sleep(150)
    /* A phone saves from its bar; from 768px the foot bar comes up with Discard and Save. */
    const saveSel = isPhone ? "[data-flow-bar] button" : "[data-flow-foot][data-shown] button"
    const saves = (sel) => b.evaluate((q) => [...document.querySelectorAll(q)].filter((x) => x.textContent.trim() === "Save" && getComputedStyle(x).display !== "none" && x.getBoundingClientRect().width > 0).map((x) => ({ disabled: x.disabled, bg: getComputedStyle(x).backgroundColor })), sel)
    await sleep(250)
    const saveNow = await saves(saveSel)
    expect(saveNow.length === 1 && !saveNow[0].disabled, isPhone ? "an edit brings Save into the bar as its one action" : "an edit brings up the foot bar with Save", saveNow)
    expect(saveNow[0]?.bg === "rgb(26, 26, 46)", "Save is near black, not violet", saveNow[0]?.bg)
    await b.screenshot({ path: join(shots, `builder-${label}-dirty.png`) })
    if (!isPhone) {
      expect((await saves("[data-flow-bar] button")).length === 0, "and only there: the header does not carry a second Save")
      const foot = await b.$eval("[data-flow-foot]", (f) => { const r = f.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height), words: f.textContent } })
      expect(foot.bottom === vp.height && foot.h >= 64 && /Unsaved changes/.test(foot.words) && /Discard/.test(foot.words), "the foot bar sits on the bottom edge and says what it is for", foot)
    }
    await b.evaluate((q) => [...document.querySelectorAll(q)].find((x) => x.textContent.trim() === "Save" && getComputedStyle(x).display !== "none").click(), saveSel)
    await sleep(300)
    const patched = await b.evaluate(() => window.__calls.filter(([m, u]) => m === "PATCH" && u === "/api/automations/flows/f1").length)
    expect(patched === 1, "and Save sends it once", patched)
    await sleep(250)
    const goneAgain = (await saves("[data-flow-bar] button")).length === 0 && (await b.evaluate(() => !document.querySelector("[data-flow-foot][data-shown]")))
    expect(goneAgain, "once saved, Save leaves the bar")
    await b.keyboard.press("Escape")
    await sleep(500)

    await b.click("button[aria-label='More actions']")
    await sleep(500)
    const actions = await b.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-action-sheet] button")].map((x) => x.textContent.trim()))
    expect(actions.join("|") === "Turn off|Duplicate|Delete automation", "the menu holds Turn off, Duplicate and Delete", actions)
    await b.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-action-sheet] button")].find((x) => x.textContent.trim() === "Turn off").click())
    await sleep(500)
    const confirm = await b.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((d) => d.textContent).find((t) => /partway through/.test(t)) ?? null)
    expect(confirm && /14 people are partway through/.test(confirm), "turning off says who it stops, before it does", confirm?.slice(0, 80))
    await b.keyboard.press("Escape")
    await sleep(300)
    await b.click("button[aria-label='Back to automations']")
    await sleep(200)
    expect(JSON.stringify(await lastNav(b)) === JSON.stringify(["push", "/app/emails?tab=flows"]), "Back with nothing behind goes to the automations list", await lastNav(b))
    expect(await b.evaluate(() => (window.__nav || []).some((n) => n[0] === "prefetch" && n[1] === "/app/emails?tab=flows")), "which was fetched ahead, so it is quick")
    await b.close()

    const d = await open(vp, "builder")
    await d.click("ol[aria-label=Steps] > li:nth-child(3) button")
    await sleep(500)
    await d.type("input[id^='subject-']", "!")
    await d.keyboard.press("Escape")
    await sleep(400)
    await d.click("button[aria-label='Back to automations']")
    await sleep(400)
    const leaving = await d.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((x) => x.textContent).find((t) => /Leave without saving/.test(t)) ?? null)
    expect(Boolean(leaving) && (await lastNav(d))?.[1] !== "/app/emails?tab=flows", "Back with unsaved changes asks first", leaving?.slice(0, 40))
    await d.close()

    console.log(`\nA flow that is not finished, ${label}`)
    const x = await open(vp, "broken")
    const listed = await x.$eval("[aria-label='Whether this automation is sending']", (s) => s.textContent)
    expect(/3 things to finish/.test(listed) && /needs a subject/.test(listed) && /is empty/.test(listed), "the state line lists what is missing", listed.slice(0, 160))
    const primary = await x.evaluate(() => [...document.querySelectorAll("[data-flow-bar] button")].map((b) => b.textContent.trim()).find((t) => ["Save", "Turn on"].includes(t)))
    const badge = await x.evaluate(() => [...document.querySelectorAll("span")].find((s) => ["Live", "Draft", "Paused"].includes(s.textContent.trim()) && getComputedStyle(s).display !== "none" && s.getBoundingClientRect().width > 0)?.textContent.trim())
    expect(primary === "Turn on" && badge === "Draft", "a draft says Draft, and its one action is Turn on", { primary, badge })
    await x.evaluate(() => [...document.querySelectorAll("[data-flow-bar] button")].find((b) => b.textContent.trim() === "Turn on").click())
    await sleep(400)
    const toastLook = await x.evaluate(() => {
      const t = document.querySelector("[data-toast]")
      if (!t) return null
      const icon = t.querySelector("[data-toast-icon]")
      const greens = [...t.querySelectorAll("*")].filter((e) => /rgb\((16, 185, 129|34, 197, 94|22, 163, 74)\)/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)).length
      return { bg: getComputedStyle(t).backgroundColor, icon: icon ? getComputedStyle(icon).color : null, title: getComputedStyle(t.querySelector("div > div, li > div") ?? t).color, greens }
    })
    expect(toastLook && toastLook.bg === "rgb(17, 17, 19)" && toastLook.icon === "rgb(255, 255, 255)" && toastLook.greens === 0, "its toast is the dark box with a white mark, not red, not green", toastLook)
    const statusCalls = await x.evaluate(() => window.__calls.filter(([, u]) => u.endsWith("/status")).length)
    expect(statusCalls === 0, "Turn on does not reach the server while it is not complete", statusCalls)
    const flagged = await x.$eval("ol[aria-label=Steps]", (o) => o.textContent)
    expect(/needs a subject/.test(flagged), "and the step that needs work says so", flagged.slice(0, 120))
    expect((await sideways(x)) === 0, "the page never scrolls sideways", await sideways(x))
    await x.screenshot({ path: join(shots, `builder-${label}-broken.png`), fullPage: !isPhone })
    await x.close()

    console.log(`\nFrom scratch, ${label}`)
    const z = await open(vp, "scratch")
    const firstAdd = await z.$$eval("ol[aria-label=Steps] button[aria-label='Add the first step']", (a) => a.map((x) => x.textContent.trim()))
    expect(firstAdd.length === 1 && firstAdd[0] === "Add the first step", "an empty flow says where to begin", firstAdd)
    const trig = await z.$eval("ol[aria-label=Steps] > li:first-child button", (n) => n.textContent)
    expect(/Someone buys from you/.test(trig), "with the trigger that was chosen", trig.slice(0, 60))
    await z.screenshot({ path: join(shots, `scratch-${label}.png`) })
    await z.close()

    if (label === "390" || label === "1440") {
      const r = await open(vp, "reminder")
      const text = await r.$eval("[aria-label='Whether this automation is sending']", (s) => s.textContent)
      expect(/not recorded on your account yet/.test(text) && /Only people who asked for your news/.test(text), "a checkout reminder says who gets it, and that it waits for the SQL", text.slice(0, 200))
      const trigger = await r.$eval("ol[aria-label=Steps] > li:first-child button", (n) => n.textContent)
      expect(/starts checkout and does not pay/.test(trigger), "its trigger in words", trigger.slice(0, 80))
      await r.screenshot({ path: join(shots, `reminder-${label}.png`), fullPage: !isPhone })
      await r.close()
    }

    if (label !== "390" && label !== "1440") continue
    console.log(`\nSubscribers, ${label}`)
    const sp = await open(vp, "subscribers")
    const heads = await sp.$$eval("section[aria-label=Subscribers] thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
    expect(heads.includes("Source"), "a Source column", heads)
    const firstRow = await sp.$eval("section[aria-label=Subscribers] tbody tr td:nth-child(3)", (td) => td.textContent)
    expect(/andrewrullz\.storelib\.com/.test(firstRow) && /from Instagram/.test(firstRow), "that names the website and where the visit came from", firstRow)
    const cells = await sp.$$eval("section[aria-label=Subscribers] tbody tr td:nth-child(3)", (tds) => tds.map((x) => x.textContent))
    expect(cells.some((c) => c === "Not recorded") && cells.some((c) => c.startsWith("OnePage")), "an old contact with no source says Not recorded; an old OnePage one says OnePage")
    const rowH = await sp.$$eval("section[aria-label=Subscribers] tbody tr", (r) => [...new Set(r.map((x) => Math.round(x.getBoundingClientRect().height)))])
    expect(rowH.length === 1 && rowH[0] === 48, "rows stay 48px with the source in them", rowH)
    await sp.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Source").click())
    await sleep(300)
    const options = await sp.$$eval("[role=menu][aria-label=Source] [role=menuitemradio]", (o) => o.map((x) => x.textContent.trim()))
    expect(options.length >= 5 && /andrewrullz\.storelib\.com/.test(options[1]) && /Not recorded/.test(options.at(-1)), "the filter lists each website first, Not recorded last", options)
    await sp.evaluate(() => [...document.querySelectorAll("[role=menu][aria-label=Source] [role=menuitemradio]")].find((o) => /andrewrullz/.test(o.textContent)).click())
    await sleep(200)
    const filtered = await sp.$$eval("section[aria-label=Subscribers] tbody tr td:nth-child(3)", (tds) => [...new Set(tds.map((x) => x.textContent.split("Footer")[0]))])
    expect(filtered.length === 1 && /andrewrullz/.test(filtered[0]), "choosing one shows only that source", filtered)
    expect((await sideways(sp)) === 0, "the page never scrolls sideways", await sideways(sp))
    await sp.screenshot({ path: join(shots, `subscribers-${label}.png`) })
    await sp.close()

    /* The Automations tab's switches: the one slim black switch of /app (components/ui/switch-style.ts), not blue. */
    const at = await open(vp, "subscribers")
    await at.evaluate(() => [...document.querySelectorAll("button, [role=tab]")].find((b) => b.textContent.trim() === "Automations").click())
    await sleep(500)
    const switches = await at.$$eval("[role=switch]", (x) => x.filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { on: e.getAttribute("aria-checked"), bg: getComputedStyle(e).backgroundColor, w: Math.round(r.width), h: Math.round(r.height) } }))
    const onSwitch = switches.find((x) => x.on === "true")
    const offSwitch = switches.find((x) => x.on === "false")
    expect(switches.length === 2 && onSwitch?.bg === "rgb(17, 17, 19)" && offSwitch?.bg === "rgb(228, 229, 233)" && switches.every((x) => x.w === 38 && x.h === 22),
      "the Automations list's switches are the slim black switch: near black on, quiet grey off, 38 by 22", switches)
    const list = await at.evaluate(() => {
      const ul = document.querySelector("[data-flow-list]")
      const table = document.querySelector("tr[data-flow-row]")?.closest("table")
      const shown = (el) => !!el && el.getBoundingClientRect().width > 0
      const rows = ul ? [...ul.querySelectorAll("[data-flow-row]")].map((li) => {
        const r = li.getBoundingClientRect()
        const name = li.querySelector("a")
        const menu = li.querySelector("button[aria-label^='Actions for']")?.getBoundingClientRect()
        return { h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), nameCut: name ? name.scrollWidth > name.clientWidth + 1 : true, name: name?.textContent, menu: menu ? [Math.round(menu.width), Math.round(menu.height), Math.round(menu.right)] : null }
      }) : []
      return { list: shown(ul), table: shown(table), rows }
    })
    if (isPhone) {
      expect(list.list && !list.table, "on a phone each automation is a row of its own, not a table to scroll sideways", list)
      expect(list.rows.length === 2 && list.rows.every((r) => !r.nameCut && r.right <= vp.width && r.h >= 64), "every name in full, every row inside the screen", list.rows)
      expect(list.rows.every((r) => r.menu && r.menu[0] >= 44 && r.menu[1] >= 44 && r.menu[2] <= vp.width), "its menu is a 44px target at the row's end", list.rows.map((r) => r.menu))
    } else expect(list.table && !list.list, "from 768px the table, one column per number", list)
    expect((await sideways(at)) === 0, "the Automations tab never scrolls sideways", await sideways(at))
    await at.screenshot({ path: join(shots, `automations-list-${label}.png`) })
    await at.close()
    const sp2 = await open(vp, "subscribers")
    await sp2.click("section[aria-label=Subscribers] tbody tr td:nth-child(2)")
    await sleep(600)
    /* A contact is a page of its own over the list now (app/app/emails/contact-detail.tsx, ContactPage), not a dialog. */
    const detail = await sp2.evaluate(() => document.querySelector("[data-contact-page]")?.textContent ?? null)
    expect(detail && /andrewrullz\.storelib\.com/.test(detail) && /Welcome series/.test(detail), "a contact's detail says where they came from and what they are in", detail?.slice(0, 140))
    await sp2.close()
  }
  /*
    768: A TABLET. No side panel yet (that is from 1024px), so a step opens
    in the sheet as on a phone, while the page is the shell's page with the
    black bar. Nothing may scroll sideways, the sheet and its foot must be
    on screen, and the list is the table.
  */
  for (const vp of [{ width: 768, height: 1024 }, { width: 820, height: 1180, isMobile: true, hasTouch: true }]) {
    const label = String(vp.width)
    console.log(`\nTablet, ${label}`)
    const c = await open(vp, "chooser")
    expect((await sideways(c)) === 0, "the chooser never scrolls sideways", await sideways(c))
    await c.screenshot({ path: join(shots, `chooser-${label}.png`) })
    await c.close()
    const b = await open(vp, "builder")
    expect((await sideways(b)) === 0, "the builder never scrolls sideways", await sideways(b))
    expect((await spills(b, "ol[aria-label=Steps] > li > button")).length === 0, "nothing spills out of a step", await spills(b, "ol[aria-label=Steps] > li > button"))
    await b.click("ol[aria-label=Steps] > li:nth-child(3) button")
    await sleep(700)
    const sheet = await b.evaluate(() => {
      const s = document.querySelector("input[id^='subject-']")
      const dlg = s?.closest("[role=dialog]")
      const foot = dlg?.querySelector("[data-panel-foot]")?.getBoundingClientRect()
      const r = dlg?.getBoundingClientRect()
      return s ? { inSheet: !!dlg, left: Math.round(r.left), right: Math.round(r.right), footBottom: foot ? Math.round(foot.bottom) : null, vh: innerHeight, done: !!dlg.querySelector("[data-panel-done]") } : null
    })
    expect(!!sheet && sheet.inSheet && sheet.left >= 0 && sheet.right <= vp.width && sheet.footBottom !== null && sheet.footBottom <= sheet.vh && sheet.done, "a step opens in the sheet, on screen, with its foot and Done", sheet)
    await b.screenshot({ path: join(shots, `builder-${label}-email.png`) })
    await b.type("input[id^='subject-']", " again")
    await b.click("[data-panel-done]")
    await sleep(600)
    const foot = await b.$eval("[data-flow-foot]", (f) => { const r = f.getBoundingClientRect(); return { shown: f.hasAttribute("data-shown"), bottom: Math.round(r.bottom), words: f.textContent } })
    expect(foot.shown && foot.bottom === vp.height && /Save/.test(foot.words), "Done keeps the edit, and Save is at the foot", foot)
    await b.screenshot({ path: join(shots, `builder-${label}.png`) })
    await b.close()
    /* A page that could not bring the creator's look: the server draws the preview instead. */
    const x = await open(vp, "broken")
    await x.click("ol[aria-label=Steps] > li:nth-child(3) button")
    await sleep(700)
    await x.evaluate(() => document.querySelector("[data-flow-preview]").scrollIntoView({ block: "center" }))
    await x.click("[data-flow-preview]")
    await x.waitForSelector("[data-preview-layer]", { timeout: 3000 }).catch(() => null)
    await sleep(500)
    const fallback = await x.evaluate(() => ({ layer: !!document.querySelector("[data-preview-layer]"), asked: window.__calls.filter(([m, u]) => m === "POST" && u.endsWith("/preview")).length }))
    expect(fallback.layer && fallback.asked === 1, "without the creator's look the server draws the preview, once", fallback)
    await x.close()
    const at = await open(vp, "subscribers")
    await at.evaluate(() => [...document.querySelectorAll("button, [role=tab]")].find((x) => x.textContent.trim() === "Automations").click())
    await sleep(500)
    const shown = await at.evaluate(() => ({ table: (document.querySelector("tr[data-flow-row]")?.getBoundingClientRect().width ?? 0) > 0, rows: (document.querySelector("[data-flow-list]")?.getBoundingClientRect().width ?? 0) > 0 }))
    expect(shown.table && !shown.rows && (await sideways(at)) === 0, "the Automations tab is the table, and the page does not scroll sideways", shown)
    await at.screenshot({ path: join(shots, `automations-list-${label}.png`) })
    await at.close()
  }

  console.log(`\nScreenshots: ${shots}`)
} finally {
  await browser?.close()
  server?.close()
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
if (broken) process.exit(1)
