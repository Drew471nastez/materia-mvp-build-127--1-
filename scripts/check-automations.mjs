/**
 * ===========================================================================
 *  THE AUTOMATION PAGES, MEASURED AT 390 AND 1440
 * ===========================================================================
 * Mounts the real chooser, builder and Subscribers view
 * (scripts/render-automations-probe.tsx) and checks what they claim:
 *
 *   chooser      every starting point drawn with its whole flow, nothing
 *                spilling out of its card; two columns on a desktop, one on
 *                a phone; a card lifts under the pointer; one you have
 *                opens yours rather than making a copy
 *   builder      the steps in one centred column with the panel beside it on
 *                a desktop, and the sheet on a phone; opening a step opens
 *                its editor; the page never scrolls sideways; a flow that is
 *                not complete is not turned on and says why
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
const router = { replace: (u) => nav().push(["replace", String(u)]), push: (u) => nav().push(["push", String(u)]), refresh: () => nav().push(["refresh"]), back() {}, forward() {}, prefetch() {} }
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
    await p.goto(`${origin}/?view=${view}`)
    await p.waitForSelector(".orders-pane")
    await sleep(250)
    return p
  }
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

  const viewports = [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]

  for (const [label, vp] of viewports) {
    console.log(`\nChooser, ${label}`)
    const p = await open(vp, "chooser")
    const cards = await p.$$eval("[aria-label='Starting points'] > li > button", (b) => b.map((x) => { const r = x.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), steps: x.querySelectorAll("ol[aria-label=Steps] > li").length } }))
    expect(cards.length === 4, "four starting points, each one the platform can start", cards.length)
    expect(cards.every((c) => c.steps >= 2), "each drawn with its trigger and every step", cards.map((c) => c.steps))
    const columns = new Set(cards.map((c) => c.x)).size
    expect(label === "desktop" ? columns === 2 : columns === 1, `${label === "desktop" ? "two columns" : "one column"} of cards`, columns)
    if (label === "phone") expect(cards.every((c) => c.w === 390 - 32), "full width inside a 16px gutter", cards.map((c) => c.w))
    const rows = {}
    for (const c of cards) (rows[c.y] ??= []).push(c.h)
    expect(Object.values(rows).every((hs) => new Set(hs).size === 1), "cards side by side are the same height", rows)
    expect((await spills(p, "[aria-label='Starting points'] > li > button")).length === 0, "nothing spills out of a card", await spills(p, "[aria-label='Starting points'] > li > button"))
    expect((await sideways(p)) === 0, "the page never scrolls sideways", await sideways(p))
    const minText = await p.evaluate(() => Math.min(...[...document.querySelectorAll(".orders-pane *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))))
    expect(minText >= 12, "no text under 12px", minText)
    if (label === "desktop") {
      /* Headless Chromium reports no pointer that can hover, and Tailwind puts
         hover: behind (hover: hover), so the lift cannot be seen here. What
         can be checked is that the rule is in the stylesheet and on the card. */
      const lift = await p.evaluate(() => {
        const card = document.querySelector("[aria-label='Starting points'] > li > button")
        const rules = [...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText)
        return { onCard: /hover:-translate-y-0\.5/.test(card.className) && /hover:shadow-/.test(card.className), inSheet: rules.some((t) => t.includes("hover\\:-translate-y-0\\.5") && t.includes("hover: hover")) }
      })
      expect(lift.onCard && lift.inSheet, "a card lifts 2px with a deeper shadow under a mouse (rule present; headless has no mouse to show it)", lift)
    }
    const mine = await p.$$eval("[aria-label='Starting points'] > li > button", (b) => b.map((x) => x.textContent))
    expect(mine.some((t) => /You have this/.test(t) && /Open yours/.test(t)), "one you already have says so, and opens yours")
    await p.screenshot({ path: join(shots, `chooser-${label}.png`), fullPage: true })
    await p.evaluate(() => [...document.querySelectorAll("[aria-label='Starting points'] > li > button")].find((b) => /You have this/.test(b.textContent)).click())
    await sleep(100)
    expect((await p.evaluate(() => (window.__nav || []).at(-1)))?.[1] === "/app/emails/flow/f9" && (await p.evaluate(() => window.__calls.length)) === 0, "without creating a second one")
    await p.evaluate(() => [...document.querySelectorAll("[aria-label='Starting points'] > li > button")].find((b) => /Welcome series/.test(b.textContent)).click())
    await sleep(200)
    expect((await p.evaluate(() => (window.__nav || []).at(-1)))?.[1] === "/app/emails/flow/new-flow", "a new one is created and opened")
    await p.close()

    console.log(`\nBuilder, ${label}`)
    const b = await open(vp, "builder")
    const col = await b.$eval("ol[aria-label=Steps]", (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width) } })
    const nodes = await b.$$eval("ol[aria-label=Steps] > li > button:not([aria-label='Add a step here'])", (n) => n.length)
    expect(nodes === 6, "the trigger and five steps, in order", nodes)
    expect(col.w <= 560, "the steps are one column no wider than 560px", col)
    const aside = await b.evaluate(() => { const a = document.querySelector("aside"); if (!a) return null; const r = a.getBoundingClientRect(); return r.width ? { x: Math.round(r.left), w: Math.round(r.width) } : null })
    if (label === "desktop") expect(aside && aside.w === 420 && aside.x > col.x + col.w, "with the panel beside it, 420px", aside)
    else expect(aside === null, "no side panel on a phone", aside)
    expect((await sideways(b)) === 0, "the page never scrolls sideways", await sideways(b))
    expect((await spills(b, "ol[aria-label=Steps] > li > button:not([aria-label='Add a step here'])")).length === 0, "a long subject is cut inside its node", await spills(b, "ol[aria-label=Steps] > li > button:not([aria-label='Add a step here'])"))
    const stats = await b.$eval("ol[aria-label=Steps] > li:nth-child(3) button", (n) => n.textContent)
    expect(/412 sent/.test(stats) && /61% opened/.test(stats) && /2 failed/.test(stats), "an email shows what it has done, from its records", stats.slice(0, 120))
    const badge = await b.evaluate(() => {
      const input = document.querySelector("input[aria-label=Name]").getBoundingClientRect()
      const badge = [...document.querySelectorAll("[data-orders-bar] span")].find((x) => x.textContent.trim() === "On")
      return badge && getComputedStyle(badge).display !== "none" ? Math.round(badge.getBoundingClientRect().left - input.right) : null
    })
    if (label === "desktop") expect(badge !== null && badge >= 0 && badge <= 12, "the On badge sits right after the name", badge)
    const banner = await b.$eval("[aria-label='Whether this automation is sending']", (s) => s.textContent)
    expect(/On and sending/.test(banner) && /14 people are partway through/.test(banner), "the banner says it is on and who is in it", banner.slice(0, 90))
    const adds = await b.$$eval("ol[aria-label=Steps] button[aria-label='Add a step here']", (a) => a.map((x) => Math.round(x.getBoundingClientRect().width)))
    expect(adds.length === 6 && adds.every((w) => w >= 32), "a + between every two steps and at the end, 32px or more", adds)
    await b.screenshot({ path: join(shots, `builder-${label}.png`), fullPage: true })

    await b.click("ol[aria-label=Steps] > li:nth-child(3) button")
    await sleep(500)
    const editor = await b.evaluate(() => {
      const s = document.querySelector("input[id^='subject-']")
      if (!s) return null
      const r = s.getBoundingClientRect()
      const sheet = s.closest("[role=dialog]")
      return { inSheet: !!sheet, inAside: !!s.closest("aside"), value: s.value, right: Math.round(r.right), body: !!document.querySelector("[role=textbox][contenteditable]") }
    })
    expect(editor && editor.value === "Welcome, {{first_name}}" && editor.body, "opening an email opens its subject and body", editor)
    expect(label === "desktop" ? editor?.inAside : editor?.inSheet, `in the ${label === "desktop" ? "side panel" : "bottom sheet"}`, editor)
    if (label === "phone") expect(editor && editor.right <= 390, "inside the screen", editor?.right)
    await b.screenshot({ path: join(shots, `builder-${label}-email.png`) })
    await b.type("input[id^='subject-']", " and welcome")
    await sleep(100)
    const saveOn = await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save")?.disabled === false)
    expect(saveOn, "an edit makes Save available")
    await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save").click())
    await sleep(300)
    const patched = await b.evaluate(() => window.__calls.filter(([m, u]) => m === "PATCH" && u === "/api/automations/flows/f1").length)
    expect(patched === 1, "and Save sends it once", patched)

    await b.keyboard.press("Escape")
    await sleep(400)
    await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Turn off").click())
    await sleep(300)
    const confirm = await b.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((d) => d.textContent).find((t) => /partway through/.test(t)) ?? null)
    expect(confirm && /14 people are partway through/.test(confirm), "turning off says who it stops, before it does", confirm?.slice(0, 80))
    await b.close()

    console.log(`\nA flow that is not finished, ${label}`)
    const x = await open(vp, "broken")
    const listed = await x.$eval("[aria-label='Whether this automation is sending']", (s) => s.textContent)
    expect(/3 things to finish/.test(listed) && /needs a subject/.test(listed) && /is empty/.test(listed), "the banner lists what is missing", listed.slice(0, 160))
    await x.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Turn on").click())
    await sleep(400)
    const statusCalls = await x.evaluate(() => window.__calls.filter(([, u]) => u.endsWith("/status")).length)
    expect(statusCalls === 0, "Turn on does not reach the server while it is not complete", statusCalls)
    const flagged = await x.$eval("ol[aria-label=Steps]", (o) => o.textContent)
    expect(/needs a subject/.test(flagged), "and the step that needs work says so", flagged.slice(0, 120))
    expect((await sideways(x)) === 0, "the page never scrolls sideways", await sideways(x))
    await x.screenshot({ path: join(shots, `builder-${label}-broken.png`), fullPage: true })
    await x.close()

    console.log(`\nSubscribers, ${label}`)
    const s = await open(vp, "subscribers")
    const heads = await s.$$eval("section[aria-label=Emails] thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
    expect(heads.includes("Source"), "a Source column", heads)
    const firstRow = await s.$eval("section[aria-label=Emails] tbody tr td:nth-child(3)", (td) => td.textContent)
    expect(/andrewrullz\.storelib\.com/.test(firstRow) && /from Instagram/.test(firstRow), "that names the website and where the visit came from", firstRow)
    const cells = await s.$$eval("section[aria-label=Emails] tbody tr td:nth-child(3)", (tds) => tds.map((x) => x.textContent))
    expect(cells.some((c) => c === "Not recorded") && cells.some((c) => c.startsWith("OnePage")), "an old contact with no source says Not recorded; an old OnePage one says OnePage")
    const rowH = await s.$$eval("section[aria-label=Emails] tbody tr", (r) => [...new Set(r.map((x) => Math.round(x.getBoundingClientRect().height)))])
    expect(rowH.length === 1 && rowH[0] === 48, "rows stay 48px with the source in them", rowH)
    await s.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Source").click())
    await sleep(300)
    const options = await s.$$eval("[role=menu][aria-label=Source] [role=menuitemradio]", (o) => o.map((x) => x.textContent.trim()))
    expect(options.length >= 5 && /andrewrullz\.storelib\.com/.test(options[1]) && /Not recorded/.test(options.at(-1)), "the filter lists each website first, Not recorded last", options)
    await s.evaluate(() => [...document.querySelectorAll("[role=menu][aria-label=Source] [role=menuitemradio]")].find((o) => /andrewrullz/.test(o.textContent)).click())
    await sleep(200)
    const filtered = await s.$$eval("section[aria-label=Emails] tbody tr td:nth-child(3)", (tds) => [...new Set(tds.map((x) => x.textContent.split("Footer")[0]))])
    expect(filtered.length === 1 && /andrewrullz/.test(filtered[0]), "choosing one shows only that source", filtered)
    expect((await sideways(s)) === 0, "the page never scrolls sideways", await sideways(s))
    await s.screenshot({ path: join(shots, `subscribers-${label}.png`) })
    await s.click("section[aria-label=Emails] tbody tr td:nth-child(2)")
    await sleep(600)
    const detail = await s.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((d) => d.textContent).find((t) => /Source/.test(t)) ?? null)
    expect(detail && /andrewrullz\.storelib\.com/.test(detail) && /Welcome series/.test(detail), "a contact's detail says where they came from and what they are in", detail?.slice(0, 140))
    await s.screenshot({ path: join(shots, `subscribers-${label}-detail.png`) })
    await s.close()
  }
  console.log(`\nScreenshots: ${shots}`)
} finally {
  await browser?.close()
  server?.close()
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
