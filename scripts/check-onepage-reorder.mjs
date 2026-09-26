/**
 * ===========================================================================
 *  DRAGGING A LINK CARD, MEASURED
 * ===========================================================================
 * "There's no real time tracking with my touch." This mounts the real
 * OnePage editor (scripts/render-onepage-editor.tsx) with ten cards and
 * drives a drag the way a person does: a mouse at 1440, and at 390 a finger
 * through Chromium's own input pipeline (Input.dispatchTouchEvent), so
 * touch-action and the browser's scroll decision are part of what is tested.
 *
 *   follow     after every move, where the lifted card is drawn against how
 *              far the pointer went. 1:1 is a gap under 1.5px.
 *   renders    React commits while the pointer is down (counted through the
 *              devtools hook). The card must move without React: 0.
 *   make way   the card it passes has slid one slot the other way.
 *   lifted     scale and shadow, and no purple anywhere on it.
 *   order      the list, and the phone preview beside it, in the new order
 *              once it has settled.
 *   swipe      on a phone, a quick swipe over a card scrolls the page and
 *              lifts nothing.
 *   keys       an arrow on the grip moves the card one place and keeps focus.
 *
 *   node scripts/check-onepage-reorder.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-reorder.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-reorder-"))
mkdirSync(shots, { recursive: true })

const dir = join(root, ".onepage-reorder-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
writeFileSync(join(dir, "supabase.js"), `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const LABELS = ["Shop the prints", "Late night mix", "Newsletter", "Studio tour", "Poster sale", "Commissions", "Zine archive", "Radio show", "Workshop", "Contact"]
const blocks = LABELS.map((label, i) => ({ id: `b${i + 1}`, type: "link_button", enabled: true, sort_order: i, data: { label, url: `https://example.com/${i + 1}` } }))
/* React calls this hook on every commit, production build or not: the renders during a drag are counted here. */
const devtoolsHook = `window.__commits=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={isDisabled:false,supportsFiber:true,renderers:new Map(),inject(){return 1},onCommitFiberRoot(){window.__commits++},onCommitFiberUnmount(){},onPostCommitFiberRoot(){},onScheduleFiberRoot(){},checkDCE(){}};`
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>${devtoolsHook}window.process={env:{NODE_ENV:"production"}};window.PROBE_BLOCKS=${JSON.stringify(blocks)}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
  if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ total_clicks: 0, total_views: 0, chart_data: [] }))
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function open(vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()) })
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-reorder-item]")
  await sleep(900)
  return { p, errors }
}
const order = (p) => p.$$eval("[data-reorder-list] > [data-reorder-item]", (els) => els.map((e) => e.getAttribute("data-block-id")))
const card = (p, id) => p.$eval(`[data-reorder-item][data-block-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
const titleOf = (p, id) => p.$eval(`[data-reorder-item][data-block-id="${id}"] [data-reorder-zone] p`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 } })
const gripOf = (p, id) => p.$eval(`[data-reorder-grip="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
const ty = (p, id) => p.$eval(`[data-reorder-item][data-block-id="${id}"]`, (e) => { const t = getComputedStyle(e).transform; return t === "none" ? 0 : new DOMMatrixReadOnly(t).m42 })
/* Purple is a hue between 250 and 300 degrees with some colour in it. */
const purpleOn = (p, id) => p.$eval(`[data-reorder-item][data-block-id="${id}"]`, (root) => {
  const found = []
  const hue = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx - mn < 30) return null
    let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn)
    h *= 60
    return h < 0 ? h + 360 : h
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const cs = getComputedStyle(el)
    for (const prop of ["borderTopColor", "backgroundColor", "boxShadow", "outlineColor", "color"]) {
      for (const m of cs[prop].matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g)) {
        if (m[4] !== undefined && Number(m[4]) < 0.05) continue
        const h = hue(+m[1], +m[2], +m[3])
        if (h !== null && h >= 250 && h <= 300) found.push(`${prop} ${m[0]}`)
      }
    }
  }
  return found
})
const previewLabels = (p) => p.evaluate((labels) => {
  /* The phone beside the editor: the one panel from 768px up that holds the links. */
  const phone = [...document.querySelectorAll(".hidden.md\\:block")].find((e) => labels.some((l) => e.innerText.includes(l)))
  if (!phone) return []
  const text = phone.innerText
  return labels.map((l) => [l, text.indexOf(l)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([l]) => l)
}, LABELS)

/* ── A MOUSE, AT 1440 ── */
{
  console.log("\ndesktop-1440, a mouse")
  const { p, errors } = await open({ width: 1440, height: 900 })
  await p.screenshot({ path: join(shots, "desktop-1440-before.png") })
  const before = await order(p)
  const t = await titleOf(p, "b2")
  const second = await card(p, "b3")
  await p.mouse.move(t.x, t.y)
  await p.mouse.down()
  await p.mouse.move(t.x, t.y + 6, { steps: 2 })
  await frames(p, 2)
  const startY = t.y + 6
  const commitsAtLift = await p.evaluate(() => window.__commits)
  const gaps = []
  for (let k = 1; k <= 24; k++) {
    const y = startY + k * 7
    await p.mouse.move(t.x, y)
    await frames(p, 2)
    gaps.push(Math.abs((await ty(p, "b2")) - (y - startY)))
  }
  const worst = Math.max(...gaps)
  expect(worst < 1.5, "the lifted card is drawn where the pointer is, every move", { worstGapPx: Number(worst.toFixed(2)) })
  const commits = (await p.evaluate(() => window.__commits)) - commitsAtLift
  expect(commits === 0, "React does not render while the card moves", { commits })
  const passed = await ty(p, "b3")
  expect(Math.abs(passed + (second.h + 16)) < 2, "the card it passed slid up one slot out of the way", { b3: passed })
  const lifted = await p.$eval('[data-reorder-item][data-block-id="b2"]', (e) => ({ transform: e.style.transform, shadow: getComputedStyle(e.querySelector("[data-lift-shadow]")).opacity }))
  expect(/scale\(1\.01[0-9]*\)/.test(lifted.transform) && Number(lifted.shadow) > 0.9, "lifted: a touch bigger, with its shadow", lifted)
  const purple = await purpleOn(p, "b2")
  expect(purple.length === 0, "and no purple anywhere on it", purple.slice(0, 3))
  await p.screenshot({ path: join(shots, "desktop-1440-dragging.png") })
  await p.mouse.up()
  await sleep(700)
  const after = await order(p)
  expect(after.indexOf("b2") > before.indexOf("b2") + 1, "dropped lower down, the order is written", after)
  expect(await p.$$eval("[data-reorder-item]", (els) => els.every((e) => !e.style.transform && !e.style.transition)), "and every card is back to no transform of its own")
  const preview = await previewLabels(p)
  expect(preview.indexOf("Late night mix") === after.indexOf("b2"), "the phone preview shows the new order", preview.slice(0, 5))
  const selected = await p.$$eval("[data-reorder-item] .ring-1", (els) => els.length)
  expect(selected === 0, "the release was not taken as a click on the card", { opened: selected })
  await p.screenshot({ path: join(shots, "desktop-1440-dropped.png") })

  /* The keyboard: the grip takes the arrows. */
  await p.focus('[data-reorder-grip="b1"]')
  await p.keyboard.press("ArrowDown")
  await sleep(200)
  const k = await order(p)
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("data-reorder-grip"))
  expect(k.indexOf("b1") === 1 && focused === "b1", "ArrowDown on a grip moves its card one place and keeps focus", { order: k.slice(0, 3), focused })
  const said = await p.$eval("[data-reorder-list] [aria-live]", (e) => e.textContent)
  expect(/position 2 of 10/.test(said), "and a screen reader hears where it went", said)

  /* Escape puts it back. */
  const t2 = await titleOf(p, "b5")
  const o2 = await order(p)
  await p.mouse.move(t2.x, t2.y)
  await p.mouse.down()
  await p.mouse.move(t2.x, t2.y + 90, { steps: 8 })
  await frames(p, 2)
  await p.keyboard.press("Escape")
  await p.mouse.up()
  await sleep(700)
  expect(JSON.stringify(await order(p)) === JSON.stringify(o2), "Escape during a drag puts the card back and writes nothing")
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── A FINGER, AT 390 ── */
{
  console.log("\nphone-390, a finger")
  const { p, errors } = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cdp = await p.target().createCDPSession()
  /* A phone has no hover, and app/globals.css strips every transform inside a .group under (hover: none). */
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }] }).catch(() => {})
  const noHover = await p.evaluate(() => matchMedia("(hover: none)").matches)
  const inGroup = await p.$eval("[data-reorder-list]", (e) => !!e.closest(".group"))
  expect(noHover && !inGroup, "measured as a phone (no hover), with no .group above the list to strip its transforms", { noHover, inGroup })
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  await p.screenshot({ path: join(shots, "phone-390-before.png") })
  const scroller = "[data-scroll-container]"

  /* A quick swipe over a card scrolls; it does not lift the card. */
  const s0 = await p.$eval(scroller, (e) => e.scrollTop)
  const sw = await titleOf(p, "b4")
  await touch("touchStart", sw.x, sw.y)
  for (let k = 1; k <= 10; k++) await touch("touchMove", sw.x, sw.y - k * 22)
  const lifting = await p.$eval("[data-reorder-list]", (e) => e.hasAttribute("data-reordering"))
  await touch("touchEnd")
  await sleep(500)
  const s1 = await p.$eval(scroller, (e) => e.scrollTop)
  expect(!lifting && s1 > s0 + 40, "a quick swipe over a card scrolls the page and lifts nothing", { scrolled: s1 - s0, lifted: lifting })
  await p.$eval(scroller, (e) => { e.scrollTop = 0 })
  await sleep(300)

  /* Held, then moved: the card lifts and follows the finger. */
  const before = await order(p)
  const t = await titleOf(p, "b1")
  await touch("touchStart", t.x, t.y)
  await sleep(420)
  const liftedNow = await p.$eval("[data-reorder-list]", (e) => e.hasAttribute("data-reordering"))
  expect(liftedNow, "a finger held on a card for a moment lifts it")
  const commitsAtLift = await p.evaluate(() => window.__commits)
  const gaps = []
  for (let k = 1; k <= 20; k++) {
    const y = t.y + k * 9
    await touch("touchMove", t.x, y)
    await frames(p, 2)
    gaps.push(Math.abs((await ty(p, "b1")) - k * 9))
  }
  const worst = Math.max(...gaps)
  expect(worst < 1.5, "the card stays under the finger, every move", { worstGapPx: Number(worst.toFixed(2)) })
  const commits = (await p.evaluate(() => window.__commits)) - commitsAtLift
  expect(commits === 0, "React does not render while the finger moves", { commits })
  const purple = await purpleOn(p, "b1")
  expect(purple.length === 0, "no purple on the lifted card", purple.slice(0, 3))
  const pageMoved = await p.$eval(scroller, (e) => e.scrollTop)
  expect(pageMoved === 0, "and the page under it did not scroll", { scrollTop: pageMoved })
  await p.screenshot({ path: join(shots, "phone-390-dragging.png") })
  await touch("touchEnd")
  await sleep(700)
  const after = await order(p)
  expect(after.indexOf("b1") >= 2 && after.indexOf("b1") !== before.indexOf("b1"), "let go further down, the card is in its new place", after.slice(0, 4))
  await p.screenshot({ path: join(shots, "phone-390-dropped.png") })

  /* The grip lifts at once. */
  const g = await gripOf(p, "b6")
  const o2 = await order(p)
  await touch("touchStart", g.x, g.y)
  for (let k = 1; k <= 12; k++) { await touch("touchMove", g.x, g.y - k * 10); await frames(p, 1) }
  await frames(p, 2)
  const gy = await ty(p, "b6")
  expect(Math.abs(gy + 120) < 1.5, "a finger on the grip drags straight away", { translateY: gy })
  await touch("touchEnd")
  await sleep(700)
  const o3 = await order(p)
  expect(o3.indexOf("b6") < o2.indexOf("b6"), "and it lands higher up", o3)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
