/**
 * ===========================================================================
 *  NO FLASH WHEN A PAGE LANDS, MEASURED EVERY FRAME, AT 390 AND 1280
 * ===========================================================================
 * "There should be no flash when I land on a page when switching in the app,
 * no flash in the buttons and the page overall; smooth, clean, standard."
 *
 * A flash is something that changes twice: a button drawn disabled and then
 * enabled, a zero that becomes a dash that becomes a number, a badge that
 * says "No activity yet" until the answer says otherwise, a box that fades
 * in and then dips. So this lands on each main page (scripts/render-page-
 * flash.tsx: the real client components, the stage's own landing, fixture
 * data arriving 160ms after the commit) and reads, on every animation frame
 * for 1.6 seconds, every element on screen:
 *
 *   its background colour, its text colour, its opacity, its size, its own
 *   text, and whether it shows a focus ring
 *
 * An element whose value for one of those changes in two separate runs of
 * frames (a pause of three frames or more between them), or comes back to a
 * value it had left, changed twice: that is reported, with what it was and
 * when. One change is allowed: the landing fading a page in, a skeleton
 * giving way to what it stood for, a figure arriving.
 *
 *   node scripts/check-page-flash.mjs
 *   FLASH_PAGES=home,emails node scripts/check-page-flash.mjs
 *   FLASH_SHOTS=<dir> node scripts/check-page-flash.mjs   (a picture of each page mid load: loading-<page>-<width>.png)
 *
 * Then, on Home and Analytics, THE FIGURE TABS WHILE THEY WAIT, with the data
 * held back 1.5s: "I don't like the skeleton structure in the chart tabs;
 * before it was the blur thing, I liked those, revert it." Each tab's figure
 * is drawn and blurred while it waits (2px, its foot 1px), no gray bar
 * stands in any tab, and once the answer lands every figure is sharp.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const PAGES = (process.env.FLASH_PAGES || "home,orders,products,analytics,emails,customers,payouts,website,settings").split(",")

const dir = join(root, ".flash-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/" + (new URLSearchParams(location.search).get("page") || "")
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
export const useSelectedLayoutSegment = () => null
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }) })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, placeholder, blurDataURL, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
/* Supabase, answering every read after the delay, from window.__tables. */
writeFileSync(join(dir, "supabase.js"), `function answer(table, one) {
  return new Promise((r) => setTimeout(() => {
    const rows = (window.__tables && window.__tables[table]) || []
    r({ data: one ? rows[0] ?? null : rows, error: null, count: rows.length })
  }, window.__dataDelay ?? 160))
}
function chain(table) {
  let one = false
  const p = new Proxy(function () {}, {
    get(_, key) {
      if (key === "then") { const pr = answer(table, one); return pr.then.bind(pr) }
      if (key === "single" || key === "maybeSingle") return () => { one = true; return p }
      return () => p
    },
    apply() { return p },
  })
  return p
}
export function createClient() {
  return {
    from: (t) => chain(t),
    rpc: (t) => chain(t),
    channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe: () => {} }; return c },
    removeChannel: () => {},
    storage: { from: () => chain("storage") },
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "ana@example.com" } } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
  }
}
export function isNativePlatform() { return false }
`)
writeFileSync(join(dir, "request-scope.js"), `export const currentUserForRequest = async () => ({ user: { id: "u1", email: "ana@example.com" } })
export const creatorForRequest = async () => ({ id: "c1", user_id: "u1", slug: "ana" })
export const profileForRequest = async () => null
`)
writeFileSync(join(dir, "admin.js"), `const rows = {
  customers: Array.from({ length: 6 }, (_, i) => ({ id: "cu" + i, email: "buyer" + i + "@example.com", name: "Buyer " + i, created_at: new Date(Date.now() - i * 86400000).toISOString() })),
  products: [{ id: "p1" }],
  orders: Array.from({ length: 6 }, (_, i) => ({ id: "o" + i, buyer_email: "buyer" + i + "@example.com", amount_cents: 1200, status: "completed", created_at: new Date().toISOString(), product: { id: "p1", title: "Preset pack", type: "digital" } })),
}
function chain(table) {
  const p = new Proxy(function () {}, {
    get(_, key) {
      if (key === "then") { const pr = Promise.resolve({ data: rows[table] || [], error: null }); return pr.then.bind(pr) }
      return () => p
    },
    apply() { return p },
  })
  return p
}
export function createAdminClient() { return { from: (t) => chain(t) } }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-page-flash.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@/lib/supabase/admin=${join(dir, "admin.js")}`,
    `--alias:@/lib/auth/request-scope=${join(dir, "request-scope.js")}`,
    `--alias:server-only=${join(dir, "admin.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }

/*
 * THE RECORDER, running from before the page's script: one reading per
 * animation frame of every element on screen, kept as runs of change per
 * element and property rather than as frames, so a page of a thousand
 * elements can be read for a hundred frames.
 *
 * What counts as twice:
 *
 *   two runs of change in one property, three frames or more apart
 *   an opacity that dips part of the way and comes back (a fade in from
 *     nothing is the entrance of new content, and is one change)
 *   a colour or a size that comes back to a value it had left
 *   text that is replaced by other text: a zero or a dash drawn and then
 *     turned into the figure is a figure that changed twice, the second
 *     time in front of you (text arriving where there was none is fine).
 *     One exception, the owner's: a figure tab's number drawn blurred while
 *     it waits and clearing to the real one ("before it was the blur thing,
 *     I liked those"). Text inside a [data-tab] that is still blurred when
 *     it is replaced is that, and is one change.
 *
 * Sizes are read to the whole pixel, so an animation's last half pixel is
 * not a second change; an element that is animating for ever (a pulse, a
 * ring) is left out, since its changes are its purpose.
 */
const RECORDER = `(() => {
  const ids = new WeakMap(); let next = 1
  const state = new Map()
  window.__flash = { state, frames: 0, commitFrame: null, focusRings: 0, shift: 0, shifts: [] }
  /* Layout shift after the commit: content arriving in a room of the wrong
     size pushes what is below it, which is the jump a skeleton is for. */
  new PerformanceObserver((l) => { const f = window.__flash; if (f.commitFrame == null) return; for (const e of l.getEntries()) { if (e.hadRecentInput) continue; f.shift += e.value; f.shifts.push({ v: Math.round(e.value * 10000) / 10000, who: (e.sources || []).slice(0, 2).map((x) => x.node && x.node.nodeType === 1 ? x.node.tagName.toLowerCase() + "." + String(x.node.className || "").split(/\\s+/).slice(0, 3).join(".") : "?") }) } }).observe({ type: "layout-shift", buffered: false })
  const PROPS = ["bg", "color", "opacity", "w", "h", "text"]
  const read = (el, cs, r) => {
    let text = ""
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.nodeValue
    text = text.trim().slice(0, 40)
    return [cs.backgroundColor, cs.color, (Math.round(Number(cs.opacity) * 50) / 50).toString(), r.width, r.height, text]
  }
  /* A size has changed when it has moved a whole pixel from the last size
     that counted: a box whose edge sits on a half pixel reads 19.5 one frame
     and 19.52 the next as the page rises past it, which is not a change. And
     the inside of a drawing (an SVG's paths and groups) is drawn to animate,
     so only its box is read. */
  const same = (k, a, b, el) => (k === 3 || k === 4) ? (el.ownerSVGElement != null || Math.abs(a - b) < 1) : a === b
  /* A figure tab's number or foot, blurred while it waits (components/app/metric-tab). */
  const waitingBlurred = (el) => {
    if (!el.closest("[data-tab]")) return false
    const f = getComputedStyle(el).filter
    return f !== "none" && f !== "blur(0px)"
  }
  /* Changes this close together are one change (an animation, and its tail). */
  const RUN_GAP = 12
  const looping = (el) => {
    try { return el.getAnimations().some((a) => a.effect && a.effect.getComputedTiming().iterations === Infinity) } catch { return false }
  }
  const describe = (el) => {
    const cls = (typeof el.className === "string" ? el.className : el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 5).join(".")
    const own = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 36)
    return el.tagName.toLowerCase() + (cls ? "." + cls : "") + (own ? ' "' + own + '"' : "")
  }
  const tick = (t) => {
    const f = window.__flash
    const pageEl = document.querySelector("[data-flash-page]")
    if (pageEl && f.commitFrame == null) f.commitFrame = f.frames
    if (f.commitFrame != null && f.frames - f.commitFrame < ${Math.round(1600 / 16.7)}) {
      const vw = innerWidth, vh = innerHeight
      const all = document.querySelectorAll("#app *")
      let n = 0
      for (const el of all) {
        if (n > 1500) break
        const r = el.getBoundingClientRect()
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw || (r.width === 0 && r.height === 0)) continue
        n++
        let id = ids.get(el)
        if (!id) { id = next++; ids.set(el, id) }
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden") continue
        const vals = read(el, cs, r)
        let s = state.get(id)
        if (!s) vals[3] = Math.round(vals[3]), vals[4] = Math.round(vals[4])
        if (!s) { state.set(id, s = { el, first: f.frames, what: describe(el), last: vals, seen: PROPS.map((_, k) => [vals[k]]), runs: PROPS.map(() => []), lastChange: PROPS.map(() => -99), returned: PROPS.map(() => null), low: 1, loop: looping(el) }); continue }
        if (!s.loop && looping(el)) s.loop = true
        for (let k = 0; k < PROPS.length; k++) {
          if (same(k, vals[k], s.last[k], el)) continue
          if (k === 3 || k === 4) vals[k] = Math.round(vals[k])
          const fr = f.frames - f.commitFrame
          if (f.frames - s.lastChange[k] > RUN_GAP) s.runs[k].push({ at: Math.round(t), frame: fr, from: s.last[k], to: vals[k] })
          else { const run = s.runs[k][s.runs[k].length - 1]; if (run) run.to = vals[k] }
          s.lastChange[k] = f.frames
          const seen = s.seen[k]
          if (PROPS[k] === "opacity") {
            const v = Number(vals[k])
            /* Back up to where it started from, having dipped only part of the way. */
            if (v >= Number(seen[0]) - 0.001 && s.low > 0.1 && s.low < Number(seen[0]) - 0.03 && s.returned[k] == null) s.returned[k] = { frame: fr, value: vals[k], path: [seen[0], String(s.low), vals[k]] }
            s.low = Math.min(s.low, v)
          } else if (PROPS[k] === "text") {
            if (s.last[k] !== "" && vals[k] !== "" && s.returned[k] == null && !waitingBlurred(el)) s.returned[k] = { frame: fr, value: vals[k], path: [s.last[k], vals[k]], replaced: true }
          } else if (seen.length > 1 && seen.slice(0, -1).includes(vals[k]) && s.returned[k] == null) {
            s.returned[k] = { frame: fr, value: vals[k], path: seen.concat(vals[k]).slice(-4) }
          }
          if (seen[seen.length - 1] !== vals[k]) seen.push(vals[k])
          s.last[k] = vals[k]
        }
      }
      if (document.querySelector(":focus-visible")) f.focusRings++
    }
    f.frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const html = `<!doctype html><html class="app-layout light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `<script>${RECORDER}</script></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const PROPS = ["bg", "color", "opacity", "w", "h", "text"]
const report = {}
const problems = []
for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  for (const id of PAGES) {
    const page = await browser.newPage()
    await page.setViewport(viewport)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await page.goto(`${base}/?page=${id}`)
    if (process.env.FLASH_SHOTS) { await wait(300); await page.screenshot({ path: join(process.env.FLASH_SHOTS, `loading-${id}-${label}.png`) }) }
    await wait(1900)
    const r = await page.evaluate((PROPS) => {
      const f = window.__flash
      const twice = []
      for (const s of f.state.values()) {
        for (let k = 0; k < PROPS.length; k++) {
          const runs = s.runs[k]
          if (!s.loop && (runs.length >= 2 || s.returned[k])) twice.push({ what: s.what, prop: PROPS[k], runs: runs.map((x) => `f${x.frame}: ${x.from} -> ${x.to}`), returned: s.returned[k] })
        }
      }
      return {
        threw: window.__threw || null,
        committed: f.commitFrame != null,
        elements: f.state.size,
        focusRingFrames: f.focusRings,
        shift: Math.round(f.shift * 10000) / 10000,
        shifts: f.shifts.slice(0, 4),
        twice,
      }
    }, PROPS)
    await page.close()
    r.errors = errors
    report[`${id}@${label}`] = { elements: r.elements, changedTwice: r.twice.length, layoutShift: r.shift, shifts: r.shifts, focusRingFrames: r.focusRingFrames, threw: r.threw, errors: errors.slice(0, 2), twice: r.twice.slice(0, 12) }
    if (!r.committed || r.threw) problems.push(`${id} at ${label}: the page did not land (${r.threw ?? "never committed"})`)
    for (const t of r.twice) problems.push(`${id} at ${label}: ${t.what} ${t.returned?.replaced ? `showed "${t.returned.path[0]}" and then "${t.returned.path[1]}"` : `changed its ${t.prop} twice: ${t.runs.join("; ")}${t.returned ? ` (${t.returned.path.join(" -> ")})` : ""}`}`)
    if (r.shift > 0.005) problems.push(`${id} at ${label}: the page shifted ${r.shift} after it landed (${JSON.stringify(r.shifts)}): something arrived in a room of the wrong size`)
    if (r.focusRingFrames) problems.push(`${id} at ${label}: a focus ring showed on ${r.focusRingFrames} frames of the landing`)
  }
}
const tabsWait = {}
for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  for (const id of PAGES.filter((p) => p === "home" || p === "analytics")) {
    const page = await browser.newPage()
    await page.setViewport(viewport)
    await page.goto(`${base}/?page=${id}&delay=1500`)
    const read = () => page.evaluate(() => [...document.querySelectorAll("button[role=tab][data-tab]")].filter((t) => t.getBoundingClientRect().width > 0).map((t) => {
      const value = t.querySelector(".tabular-nums")
      const foot = t.querySelector(":scope > span:last-of-type")
      return {
        tab: t.getAttribute("data-tab"),
        text: value ? value.textContent.trim() : null,
        blur: value ? getComputedStyle(value).filter : null,
        footBlur: foot ? getComputedStyle(foot).filter : null,
        bars: t.querySelectorAll("[data-shimmer-block], [data-shimmer], .shimmer-block").length,
      }
    }))
    await wait(600)
    const during = await read()
    if (process.env.FLASH_SHOTS) await page.screenshot({ path: join(process.env.FLASH_SHOTS, `tabs-waiting-${id}-${label}.png`) })
    /* Home asks in a chain, each answer 1.5s late here. */
    await wait(5000)
    const after = await read()
    if (process.env.FLASH_SHOTS) await page.screenshot({ path: join(process.env.FLASH_SHOTS, `tabs-landed-${id}-${label}.png`) })
    await page.close()
    const sharp = (f) => f === "none" || f === "blur(0px)"
    tabsWait[`${id}@${label}`] = { during, after }
    const w = during.length > 0 && during.every((t) => t.text && t.blur === "blur(2px)" && t.footBlur === "blur(1px)" && t.bars === 0)
    const a = after.length === during.length && after.every((t) => t.text && sharp(t.blur) && sharp(t.footBlur) && t.bars === 0)
    const line = (ts) => ts.map((t) => `${t.tab} "${t.text}" ${t.blur}/${t.footBlur}${t.bars ? `, ${t.bars} bars` : ""}`).join("; ")
    console.log(`${w ? "ok  " : "FAIL"}  ${id} at ${label}: while the figures wait, each tab's figure is blurred, no bar: ${line(during)}`)
    console.log(`${a ? "ok  " : "FAIL"}  ${id} at ${label}: once they land, sharp: ${line(after)}`)
    if (!w) problems.push(`${id} at ${label}: the figure tabs do not wait blurred (${line(during)})`)
    if (!a) problems.push(`${id} at ${label}: the figure tabs are not sharp once the figures land (${line(after)})`)
  }
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(`${problems.length} flash(es):\n${problems.slice(0, 60).join("\n")}`)
console.log(`ok: ${PAGES.length} pages at 390 and 1280, every element on screen read every frame for 1.6s after the commit, nothing changed twice`)
