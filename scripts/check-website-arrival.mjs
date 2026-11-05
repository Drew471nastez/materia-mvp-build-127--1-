/**
 * ===========================================================================
 *  THE WEBSITE PAGE ARRIVING, EVERY FRAME, ON A SLOW PHONE AND A COMPUTER
 * ===========================================================================
 * "When I click on Website, it shows the iOS loading spinner, then that
 * loading freezes, makes the entire page white, blank, empty, and then takes
 * me to the website builder page."
 *
 * "When I go back from the editor to the website page, the cover is gray,
 * and then it shows the cover, but it takes so long and glitches."
 *
 * Three ways the page arrives, each recorded twice: the compositor's own
 * frames (a screencast, decoded by a canvas and read pixel by pixel) and one
 * DOM reading per animation frame. The CPU is slowed 4x, a phone's.
 *
 *   1. FROM ANOTHER PAGE, THE SERVER SLOW (1600ms)
 *      the page you were on stays until the Website page commits, the
 *      spinner comes up at 500ms on a phone and 1000ms on a computer and
 *      turns on every frame while it is up, no task longer than 100ms from
 *      the press until 600ms after the landing, and no frame where the
 *      content area is empty
 *   2. BACK FROM THE EDITOR
 *      the live website's cover is drawn whole on the page's first frame,
 *      never the frame's grey; and when the editor took a new picture while
 *      the page was away, the last one stays until the new one has been
 *      fetched and decoded, then one crossfade
 *   3. AS A DOCUMENT (a reload, a new deployment, a navigation the router
 *      hands to the browser)
 *      from the spinner of the page you were on to the shell's frame and the
 *      same spinner, then the page: no white frame, no empty one. And the
 *      wrapper as it was, for the record: the white page
 *
 * The real AppStage, NavigationLoadingBar and WebsiteBuilderClient
 * (scripts/render-website-arrival.tsx), and for 3 the real /app wrapper
 * rendered on the server and hydrated in the browser
 * (scripts/render-app-document-tree.tsx). The covers are 1440x900 WebP
 * pictures made by a canvas, answered by the probe's server after a delay.
 *
 *   node scripts/check-website-arrival.mjs
 *   WIDTHS=360,390,430,1280,1440,1920   the widths (390 and 1280 by default)
 *   SHOTS=<dir>                         pictures of the frames that matter
 *   BEFORE_REV=<rev>                    the Website page as it was at <rev>, back from the editor, beside it
 *   CPU=4                               the slowdown
 *   PARTS=1                             only the arrival from another page (12: and back from the editor)
 *   TRACE=1                             each long task of the arrival, by what the browser did in it
 *   PROFILE=1                           where the main thread's time went, by function and by component
 *   KEEP=1                              keep the bundles (.arrival-probe) to read a profile's line numbers against
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const WIDTHS = (process.env.WIDTHS || "390,1280").split(",").map(Number)
const CPU = Number(process.env.CPU || 4)
const SHOTS = process.env.SHOTS || ""
const BEFORE_REV = process.env.BEFORE_REV || ""
/** How long the server takes to answer the Website page, and its document. */
const SERVER_MS = 1600
/** The page's script arriving after its HTML, on a phone's connection. */
const DOC_JS_MS = 1500
/** A cover the page has not fetched before; the one the editor has just taken, later still. */
const COVER_MS = 250
const COVER_NEW_MS = 700
const LONG_TASK_LIMIT = 100
/** PARTS=1: only the arrival from another page; 12, 123 (all, the default). */
const PARTS = process.env.PARTS || "123"
/** PROFILE=1: where the main thread's time went during the arrival, by function. */
const PROFILE = !!process.env.PROFILE
/** TRACE=1: each long task of the arrival, broken down by what the browser was doing in it. */
const TRACE = !!process.env.TRACE

function printTrace(trace) {
  const events = trace.traceEvents || trace
  const names = events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => e.tid)
  const count = (tid) => events.filter((e) => e.tid === tid).length
  const tid = names.sort((a, b) => count(b) - count(a))[0]
  const mine = events.filter((e) => e.tid === tid && e.ph === "X")
  const tasks = mine.filter((e) => e.name === "RunTask" && e.dur > 40_000)
  console.log(`\nthe arrival's long tasks on the main thread, by what was done in them (self time)`)
  for (const task of tasks) {
    const inside = mine.filter((e) => e !== task && e.ts >= task.ts && e.ts + (e.dur || 0) <= task.ts + task.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur)
    /* Self time: each event's own duration less what ran inside it. */
    const self = new Map()
    const stack = []
    for (const e of inside) {
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop()
      if (stack.length) self.set(stack[stack.length - 1], (self.get(stack[stack.length - 1]) ?? stack[stack.length - 1].dur) - e.dur)
      stack.push(e)
      if (!self.has(e)) self.set(e, e.dur)
    }
    const by = {}
    for (const [e, d] of self) by[e.name] = (by[e.name] || 0) + d
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`)
    console.log(`  ${(task.dur / 1000).toFixed(1)}ms: ${top.join(", ")}`)
    const origin = (st) => (st && st[0] ? `${st[0].functionName || "(anonymous)"}:${st[0].lineNumber}` : "the frame")
    for (const e of inside.filter((e) => e.name === "UpdateLayoutTree" || e.name === "Layout").slice(0, 6)) console.log(`      ${e.name} ${(e.dur / 1000).toFixed(1)}ms ${JSON.stringify(e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? "")} from ${origin(e.args?.beginData?.stackTrace)}`)
    for (const e of inside.filter((e) => ["FunctionCall", "TimerFire", "FireAnimationFrame", "EventDispatch", "RunMicrotasks"].includes(e.name) && e.dur > 3000).slice(0, 8)) console.log(`      ${e.name} ${(e.dur / 1000).toFixed(1)}ms ${JSON.stringify(e.args?.data ?? {}).slice(0, 140)}`)
  }
}

function printProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const deltas = profile.timeDeltas
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i])
    const f = n.callFrame
    const key = `${f.functionName || "(anonymous)"} ${f.url ? f.url.split("/").pop() : ""}:${f.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + (deltas[i + 1] ?? 0) / 1000)
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  console.log(`\nthe main thread during the arrival, by function (self time, ${Math.round(total)}ms sampled)`)
  for (const [k, v] of [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${v.toFixed(1).padStart(7)}ms  ${k}`)
  for (const k of ["(program)", "(garbage collector)"]) for (const [kk, v] of self) if (kk.startsWith(k)) console.log(`  ${v.toFixed(1).padStart(7)}ms  ${kk}`)
  /* And by component: time inside each capitalised function, whatever it called. */
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const inside = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set()
    for (let id = profile.samples[i]; id != null; id = parent.get(id)) {
      const f = byId.get(id).callFrame
      if (!/^[A-Z]/.test(f.functionName)) continue
      const key = `${f.functionName} :${f.lineNumber + 1}`
      if (seen.has(key)) continue
      seen.add(key)
      inside.set(key, (inside.get(key) ?? 0) + (deltas[i + 1] ?? 0) / 1000)
    }
  }
  console.log("by component (time inside, whatever it called)")
  for (const [k, v] of [...inside.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${v.toFixed(1).padStart(7)}ms  ${k}`)
}

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const note = (what) => console.log(`        ${what}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const ms = (n) => `${Math.round(n)}ms`

// ─────────────────────────────────────────────────────────────────────────
//  THE PAGES
// ─────────────────────────────────────────────────────────────────────────

const dir = join(root, ".arrival-probe")
const beforeClient = join(root, "app/(storelib)/app/website-builder/__probe-before-client.tsx")
process.on("exit", () => {
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
  rmSync(beforeClient, { force: true })
})
mkdirSync(dir, { recursive: true })
/* The router, as far as these components can see one: an address that
   changes when the new page commits (render-website-arrival __navigate),
   IN A TRANSITION, as Next's does (app-router-instance dispatchAction:
   startTransition around the router's setState). So the new page renders
   the way it does in the app, in slices the browser can paint between, and
   what is left in one piece is the commit. */
writeFileSync(join(dir, "navigation.js"), `import { createContext, createElement, startTransition, useContext, useState } from "react"
const Where = createContext(null)
let href = typeof location === "undefined" ? "/app" : location.pathname + location.search
let set = null
globalThis.__commit = (next) => { href = next; if (set) startTransition(() => set(next)) }
globalThis.__ProbeRouter = function ProbeRouter({ children }) {
  const [now, setNow] = useState(href)
  set = setNow
  return createElement(Where.Provider, { value: now }, children)
}
const read = () => useContext(Where) ?? href
const router = { push(h) { globalThis.__navigate && globalThis.__navigate(h) }, replace() {}, prefetch() {}, refresh() {}, back() { history.back() }, forward() {} }
export const usePathname = () => read().split("?")[0]
export const useSearchParams = () => new URLSearchParams(read().split("?")[1] || "")
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.js"), `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href: String(href), ...rest }) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "toast.js"), `const toast = () => {}
export const useToast = () => ({ toast })
`)
const ALIASES = [
  `--alias:next/navigation=${join(dir, "navigation.js")}`,
  `--alias:next/link=${join(dir, "link.js")}`,
  `--alias:@/hooks/use-toast=${join(dir, "toast.js")}`,
  `--alias:@=${root}`,
  "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
]
const BROWSER = [
  "--format=iife", "--platform=browser", '--define:process.env.NODE_ENV="production"',
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
]
const bundle = (entry, out, extra) => {
  try {
    execFileSync("npx", ["--no-install", "esbuild", entry, "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${out}`, ...ALIASES, ...extra], { stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    fail(`${entry} did not bundle. The error above is esbuild's.`)
  }
  return readFileSync(out)
}
const files = {
  "/arrival.js": bundle(join(root, "scripts/render-website-arrival.tsx"), join(dir, "arrival.js"), BROWSER),
  "/doc.js": bundle(join(root, "scripts/render-app-document.tsx"), join(dir, "doc.js"), BROWSER),
}
if (BEFORE_REV) {
  /* The Website page as it was, beside the harness's own copy of itself. */
  writeFileSync(beforeClient, execFileSync("git", ["show", `${BEFORE_REV}:app/(storelib)/app/website-builder/website-builder-client.tsx`], { encoding: "utf8" }))
  const harness = readFileSync(join(root, "scripts/render-website-arrival.tsx"), "utf8")
    .replace('"@/app/(storelib)/app/website-builder/website-builder-client"', '"@/app/(storelib)/app/website-builder/__probe-before-client"')
  writeFileSync(join(dir, "arrival-before.tsx"), harness)
  files["/arrival-before.js"] = bundle(join(dir, "arrival-before.tsx"), join(dir, "arrival-before.js"), BROWSER)
  rmSync(beforeClient, { force: true })
}
/* The server's HTML for an /app page, with the wrapper as it is and as it was. */
bundle(join(root, "scripts/render-app-document-ssr.tsx"), join(dir, "ssr.cjs"), ["--format=cjs", "--platform=node", '--define:process.env.NODE_ENV="production"'])
const ssr = JSON.parse(execFileSync("node", [join(dir, "ssr.cjs")], { encoding: "utf8", maxBuffer: 64 << 20 }))

const css = (await appCss(root)) + "\n" + interFaces(root)
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style>`
/* The root layout's body (app/(storelib)/layout.tsx): the theme's background, white. */
const BODY = `class="font-sans antialiased bg-background text-foreground"`
const arrivalHtml = (js) => `<!doctype html><html class="light"><head>${HEAD}</head><body ${BODY}><div id="app"></div><script src="${js}"></script></body></html>`
/* One reading per frame from the new document's first script, before anything of it is drawn. */
const RECORD = `window.__frames = []; window.__long = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: performance.timeOrigin + e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true }) } catch {}
(function read() {
  window.__frames.push({ t: performance.timeOrigin + performance.now(), parsed: !!document.getElementById("app"), cold: !!document.querySelector("[data-app-cold-start]"), page: !!document.querySelector('[data-page="website"]') })
  if (!window.__stop) requestAnimationFrame(read)
})()`
const docHtml = (markup) => `<!doctype html><html class="light"><head>${HEAD}<script>${RECORD}</script></head><body ${BODY}><div id="app">${markup}</div><script src="/doc.js" defer></script></body></html>`

// ─────────────────────────────────────────────────────────────────────────
//  THE BROWSER, THE COVERS, THE SERVER
// ─────────────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

/** Website covers as the server takes them: 1440x900 WebP, a white page with a coloured hero, textured like a photograph. */
async function makeCovers() {
  const p = await browser.newPage()
  const specs = [
    ["live-1-v1", "#0b6e4f", "Northwind"],
    ["live-1-v2", "#b5452a", "Northwind"],
    ["lib-0-v1", "#27496d", "Studio"],
    ["lib-1-v1", "#6d4c27", "Atelier"],
    ["lib-2-v1", "#3d2f6b", "Coach"],
  ]
  const made = await p.evaluate(async (specs) => {
    const out = {}
    for (const [key, hero, name] of specs) {
      const c = document.createElement("canvas")
      c.width = 1440
      c.height = 900
      const g = c.getContext("2d")
      g.fillStyle = "#ffffff"
      g.fillRect(0, 0, 1440, 900)
      g.fillStyle = "#1b1b1f"
      g.font = "600 30px sans-serif"
      g.fillText(name, 64, 58)
      for (let i = 0; i < 4; i++) g.fillRect(880 + i * 130, 40, 84, 12)
      g.fillStyle = hero
      g.fillRect(0, 96, 1440, 520)
      let seed = 7919 * key.length + key.charCodeAt(0)
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      for (let i = 0; i < 12000; i++) {
        g.fillStyle = `rgba(255,255,255,${(rnd() * 0.09).toFixed(3)})`
        g.fillRect(rnd() * 1440, 96 + rnd() * 510, 2 + rnd() * 10, 2 + rnd() * 10)
      }
      g.fillStyle = "#ffffff"
      g.font = "700 76px sans-serif"
      g.fillText(name, 96, 330)
      g.font = "400 30px sans-serif"
      g.fillText("New pieces every week", 96, 390)
      g.fillRect(96, 440, 220, 64)
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "#e9dfd0"
        g.fillRect(64 + i * 336, 660, 304, 220)
      }
      out[key] = c.toDataURL("image/webp", 0.9)
    }
    return out
  }, specs)
  await p.close()
  return new Map(Object.entries(made).map(([k, v]) => [k, Buffer.from(v.split(",")[1], "base64")]))
}
const covers = await makeCovers()

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://probe")
  const p = url.pathname
  const send = (type, body, headers = {}) => {
    res.writeHead(200, { "content-type": type, ...headers })
    res.end(body)
  }
  if (files[p]) return setTimeout(() => send("text/javascript", files[p]), p === "/doc.js" ? DOC_JS_MS : 0)
  const cover = p.match(/^\/covers\/(.+)\.webp$/)
  if (cover) {
    const body = covers.get(cover[1])
    if (!body) { res.writeHead(404); return res.end() }
    return setTimeout(() => send("image/webp", body, { "cache-control": "public, max-age=3600" }), cover[1].endsWith("-v2") ? COVER_NEW_MS : COVER_MS)
  }
  if (p.startsWith("/api/")) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}") }
  const doc = url.searchParams.get("doc")
  if (doc && ssr[doc] != null) return setTimeout(() => send("text/html", docHtml(ssr[doc])), SERVER_MS)
  send("text/html", arrivalHtml(url.searchParams.get("before") ? "/arrival-before.js" : "/arrival.js"))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

// ─────────────────────────────────────────────────────────────────────────
//  READING FRAMES
// ─────────────────────────────────────────────────────────────────────────

/* The compositor's frames, as they were shown, with their time (epoch ms). */
async function screencast(page) {
  const cdp = await page.createCDPSession()
  const shots = []
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ at: f.metadata.timestamp ? f.metadata.timestamp * 1000 : Date.now(), data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  return {
    shots,
    stop: async () => {
      await cdp.send("Page.stopScreencast").catch(() => {})
      await cdp.detach().catch(() => {})
    },
  }
}

/* A blank page whose canvas reads a frame: decoded here, so the probe needs no image library. */
const reader = await browser.newPage()
await reader.evaluate(() => {
  window.readFrame = async (png, o) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    const k = width / o.W
    const px = (x, y) => (Math.round(y * k) * width + Math.round(x * k)) * 4
    /* White: the whole screen, sampled. */
    let white = 0, all = 0
    for (let y = 0; y < o.H; y += 6) for (let x = 0; x < o.W; x += 6) {
      const i = px(x, y)
      all++
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) white++
    }
    /* The content area: what is not its own grey (#f8f9fa) or white, and where it is. */
    let ink = 0, total = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
    for (let y = o.HEADER + 24; y < o.H - 2; y += 2) for (let x = o.RAIL + 2; x < o.W - 2; x += 2) {
      const i = px(x, y)
      total++
      const r = data[i], gg = data[i + 1], b = data[i + 2]
      if ((Math.abs(r - 248) <= 3 && Math.abs(gg - 249) <= 3 && Math.abs(b - 250) <= 3) || (r >= 252 && gg >= 252 && b >= 252)) continue
      ink++
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
    const small = ink > 0 && x1 - x0 <= 64 && y1 - y0 <= 64
    let hash = 0
    if (small) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = px(x, y)
        hash = (Math.imul(hash ^ data[i], 16777619) ^ data[i + 1]) >>> 0
      }
    }
    /* The live website's cover: its frame's grey, the first picture's green, the new one's rust. */
    let cover = null
    if (o.cover) {
      let grey = 0, green = 0, rust = 0, n = 0
      const { x, y, w, h } = o.cover
      for (let yy = y + 4; yy < y + h - 4; yy += 2) for (let xx = x + 4; xx < x + w - 4; xx += 2) {
        if (yy < 0 || yy >= o.H || xx < 0 || xx >= o.W) continue
        const i = px(xx, yy)
        const r = data[i], gg = data[i + 1], b = data[i + 2]
        n++
        if (Math.abs(r - 238) <= 2 && Math.abs(gg - 240) <= 2 && Math.abs(b - 243) <= 2) grey++
        else if (gg > r + 40 && gg > b + 10) green++
        else if (r > gg + 40 && r > b + 50) rust++
      }
      cover = { grey: grey / n, green: green / n, rust: rust / n }
    }
    return { white: white / all, ink, share: ink / total, small, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hash, cover }
  }
})
async function readAll(shots, o) {
  const out = []
  for (const s of shots) out.push({ at: s.at, ...(await reader.evaluate((png, o) => window.readFrame(png, o), s.data, o)) })
  return out
}
/** What a frame shows: the whole screen white, the content area empty, the spinner alone on it, or a page. */
const kindOf = (f) => (f.white > 0.95 ? "white" : f.small ? "spinner" : f.share < 0.0005 ? "blank" : "page")
const coverKind = (c) => (!c ? "none" : c.grey > 0.3 ? "grey" : c.green > 0.15 && c.rust < 0.02 ? "first" : c.rust > 0.15 && c.green < 0.02 ? "new" : c.green + c.rust > 0.05 ? "both" : "none")
const runsOf = (list, key, t0) => {
  const seq = []
  for (const f of list) if (seq[seq.length - 1]?.kind !== key(f)) seq.push({ kind: key(f), at: Math.round(f.at - t0), f })
  return seq
}
const save = (name, shot) => {
  if (!SHOTS || !shot) return
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(shot.data, "base64"))
}

/** One reading per animation frame on the harness page (epoch ms), and the long tasks. */
const RECORDER = () => {
  window.__rec = []
  window.__long = []
  window.__stopRec = false
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: performance.timeOrigin + e.startTime, d: e.duration }) }).observe({ type: "longtask" })
  const tick = () => {
    const p = document.querySelector("[data-page]")
    const slow = document.querySelector("[data-app-slow-page]")
    const slowOpacity = slow ? Number(getComputedStyle(slow).opacity) : 0
    const cover = document.querySelector('[data-page="website"] [data-cover]')
    window.__rec.push({
      t: performance.timeOrigin + performance.now(),
      page: p?.getAttribute("data-page") ?? null,
      opacity: p ? Number(getComputedStyle(p).opacity) : null,
      slow: slowOpacity,
      spinner: !!slow?.querySelector("[data-activity-spinner]") && slowOpacity > 0.01,
      layers: cover ? [...cover.querySelectorAll("img[data-cover-picture]")].map((img) => ({ src: img.getAttribute("src"), whole: img.complete && img.naturalWidth > 0, fadingIn: !!img.closest(".wb-cover-in") })) : null,
    })
    if (!window.__stopRec) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const VIEW = (W) => {
  const phone = W < 768
  return { width: W, height: phone ? 844 : W >= 1900 ? 1080 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone }
}
const frameOf = (W) => {
  const phone = W < 768
  return { W, H: VIEW(W).height, HEADER: phone ? 68 : 58, RAIL: phone ? 0 : 240 }
}

async function openHarness(W, query = "") {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(VIEW(W))
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/products${query}`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  await wait(300)
  const cdp = await page.createCDPSession()
  return { ctx, page, cdp, errors }
}
const throttle = (cdp, rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate })
const nav = async (page, to, delay) => {
  await page.evaluate((d) => { window.__delay = d }, delay)
  return page.evaluate((to) => {
    const t = performance.timeOrigin + performance.now()
    /* The press, in a trace: where the arrival's tasks are counted from. */
    console.timeStamp("arrival-press")
    document.querySelector(`a[data-to="${to}"]`).click()
    return t
  }, to)
}
const coverRect = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-page="website"] [data-cover]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  })
const coverWhole = (page, src) =>
  page.waitForFunction((src) => {
    const img = [...document.querySelectorAll('[data-page="website"] [data-cover] img[data-cover-picture]')].find((i) => !src || i.getAttribute("src") === src)
    return !!img && img.complete && img.naturalWidth > 0
  }, { timeout: 20000, polling: 50 }, src)

const summary = []

// ─────────────────────────────────────────────────────────────────────────
//  1. FROM ANOTHER PAGE, THE SERVER SLOW
// ─────────────────────────────────────────────────────────────────────────

/*
  THE TASKS, BY THEIR OWN CPU TIME. The same arrival again, not slowed,
  traced: each main thread task's CPU time (the trace's thread duration)
  times the slowdown is that task on the phone, alone. Wall time on this
  machine also holds whatever else it is running (other browsers, a test
  run), and under the slowdown the pause the browser inserts is counted as
  the thread's own time, so neither can say how long a task is.
*/
async function tasksAlone(W, windowMs) {
  const { ctx, page } = await openHarness(W)
  await page.tracing.start({ categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline"] })
  await nav(page, "/app/website-builder", SERVER_MS)
  await page.waitForFunction(() => !!document.querySelector('[data-page="website"]'), { timeout: 20000, polling: 50 })
  await wait(1000)
  const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"))
  await ctx.close()
  const events = trace.traceEvents || trace
  const press = events.find((e) => e.name === "TimeStamp" && e.args?.data?.message === "arrival-press")
  if (!press) return []
  /* A task is one of these, whichever this browser writes (newer ones write both, one inside the other). */
  const onMain = events.filter((e) => e.tid === press.tid && e.pid === press.pid && e.ph === "X" && e.ts >= press.ts - 2000 && e.ts <= press.ts + windowMs * 1000)
  const outer = onMain.some((e) => e.name === "ThreadControllerImpl::RunTask") ? "ThreadControllerImpl::RunTask" : "RunTask"
  return onMain.filter((e) => e.name === outer).map((e) => ({ at: (e.ts - press.ts) / 1000, alone: ((e.tdur ?? e.dur) / 1000) * CPU }))
}

async function fromAnotherPage(W) {
  const phone = W < 768
  const o = frameOf(W)
  const { ctx, page, cdp, errors } = await openHarness(W)
  await throttle(cdp, CPU)
  await page.evaluate(RECORDER)
  const cast = await screencast(page)
  await wait(150)
  if (TRACE) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute"] })
  if (PROFILE) {
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 })
    await cdp.send("Profiler.start")
  }
  const t0 = await nav(page, "/app/website-builder", SERVER_MS)
  await page.waitForFunction(() => !!document.querySelector('[data-page="website"]'), { timeout: 20000, polling: 50 })
  await wait(1400)
  await cast.stop()
  if (PROFILE) printProfile((await cdp.send("Profiler.stop")).profile)
  if (TRACE) printTrace(JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")))
  const { rec, long, commitAt } = await page.evaluate(() => {
    window.__stopRec = true
    return { rec: window.__rec, long: window.__long, commitAt: window.__commitAt }
  })
  await throttle(cdp, 1)
  const frames = await readAll(cast.shots.filter((s) => s.at >= t0 - 50), o)

  console.log(`\n1. from another page to Website, the server ${SERVER_MS}ms, the CPU ${CPU}x, at ${W}px\n`)
  const before = rec.filter((r) => r.t >= t0 && r.t < commitAt)
  const after = rec.filter((r) => r.t >= commitAt)
  const firstWebsite = after.find((r) => r.page === "website")
  expect(before.length > 0 && before.every((r) => r.page === "products"),
    "the page you were on stays in the DOM until the Website page commits",
    `${before.filter((r) => r.page === "products").length} of ${before.length} frames before the commit at ${ms(commitAt - t0)}`)
  const spinnerFrom = before.find((r) => r.spinner)
  const wantFrom = phone ? 500 : 1000
  expect(!!spinnerFrom && spinnerFrom.t - t0 >= wantFrom - 40 && spinnerFrom.t - t0 <= wantFrom + 200,
    `the spinner comes up at ${wantFrom}ms on ${phone ? "a phone" : "a computer"}`, spinnerFrom ? `at ${ms(spinnerFrom.t - t0)}` : "never")
  /* The router commits in a transition: the page is rendered in slices from there, and is on screen on its first frame. */
  expect(!!firstWebsite && firstWebsite.t - commitAt <= 300, "the Website page is on screen within 300ms of the router's commit, at 4x", firstWebsite ? `its first frame ${ms(firstWebsite.t - commitAt)} after it` : "never")
  /* Its fade out is 120ms from that frame; at 4x the frames that take it away come later. */
  const gone = after.find((r) => r.t >= (firstWebsite?.t ?? commitAt) && !r.spinner && r.slow < 0.01)
  expect(!!gone && !!firstWebsite && gone.t - firstWebsite.t <= 400, "and the spinner does not outstay it: gone within 400ms of the page's first frame, at 4x", gone && firstWebsite ? `${ms(gone.t - firstWebsite.t)} after` : "still up")

  const windowEnd = (firstWebsite?.t ?? commitAt) + 600
  const tasks = long.filter((l) => l.t + l.d >= t0 && l.t <= windowEnd)
  const worst = tasks.reduce((m, l) => Math.max(m, l.d), 0)
  const alone = await tasksAlone(W, firstWebsite ? firstWebsite.t - t0 + 600 : 3000)
  const worstAlone = alone.reduce((m, x) => Math.max(m, x.alone), 0)
  expect(alone.length > 0 && worstAlone <= LONG_TASK_LIMIT, `no task longer than ${LONG_TASK_LIMIT}ms at ${CPU}x from the press to 600ms after the landing, by each task's own CPU time`,
    alone.filter((x) => x.alone >= 50).map((x) => `${ms(x.alone)} at ${ms(x.at)}`).join(", ") || `none of 50ms or more (the longest ${ms(worstAlone)})`)
  note(`and on this machine's clock at ${CPU}x, with whatever else it was running: ${tasks.length ? tasks.map((l) => `${ms(l.d)} at ${ms(l.t - t0)}`).join(", ") : "no long task"}`)

  const kinds = frames.map((f) => ({ ...f, kind: kindOf(f) }))
  const seq = runsOf(kinds, (f) => f.kind, t0)
  const empty = kinds.filter((f) => f.kind === "blank" || f.kind === "white")
  expect(empty.length === 0, "no frame where the content area is empty, and no white frame", `${frames.length} frames: ${seq.map((s) => `${s.kind} from ${s.at}ms`).join(", ")}`)
  /* Turning on every frame: a spinner frame the same as the one before is one the compositor did not move. */
  const spins = kinds.filter((f) => f.kind === "spinner")
  let still = 0, longestStill = 0, gap = 0
  for (let i = 1; i < spins.length; i++) {
    gap = Math.max(gap, spins[i].at - spins[i - 1].at)
    if (spins[i].hash === spins[i - 1].hash) { still += spins[i].at - spins[i - 1].at; longestStill = Math.max(longestStill, still) } else still = 0
  }
  expect(spins.length > 5 && longestStill < 100 && gap < 120, "the spinner turns on every frame it is up: no frame held",
    `${spins.length} spinner frames over ${ms(spins.length ? spins[spins.length - 1].at - spins[0].at : 0)}, the longest still ${ms(longestStill)}, the longest gap between frames ${ms(gap)}`)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
  for (const [i, s] of seq.entries()) save(`arrival-${W}-${i}-${s.kind}-${s.at}ms`, cast.shots.find((c) => c.at === s.f.at))
  const settled = cast.shots[cast.shots.length - 1]
  save(`arrival-${W}-landed`, settled)
  summary.push({ W, what: "from Products", spinnerAt: spinnerFrom ? Math.round(spinnerFrom.t - t0) : null, worstAlone: Math.round(worstAlone), worstOnTheClock: Math.round(worst), empty: empty.length, frames: frames.length })
  return { ctx, page, cdp, errors }
}

// ─────────────────────────────────────────────────────────────────────────
//  2. BACK FROM THE EDITOR
// ─────────────────────────────────────────────────────────────────────────

async function backFromEditor(W, h, label) {
  const o = frameOf(W)
  const { page, cdp, errors } = h
  await throttle(cdp, 1)
  await coverWhole(page, "/covers/live-1-v1.webp")
  await wait(600)
  const rect = await coverRect(page)
  await throttle(cdp, CPU)

  /** Out to the editor, a new picture taken there or not, and back: every frame of the way back. */
  async function roundTrip(newPicture) {
    await nav(page, "/editor", 80)
    await page.waitForFunction(() => !!document.querySelector('[data-page="editor"]'), { timeout: 20000, polling: 50 })
    await wait(400)
    if (newPicture) await page.evaluate(() => window.__newCover("live-1", "/covers/live-1-v2.webp"))
    await page.evaluate(RECORDER)
    const cast = await screencast(page)
    await wait(120)
    const t0 = await nav(page, "/app/website-builder", 150)
    await page.waitForFunction(() => !!document.querySelector('[data-page="website"]'), { timeout: 20000, polling: 50 })
    await wait(newPicture ? COVER_NEW_MS + 1600 : 1200)
    await cast.stop()
    const { rec, commitAt } = await page.evaluate(() => {
      window.__stopRec = true
      return { rec: window.__rec, commitAt: window.__commitAt }
    })
    await throttle(cdp, 1)
    const frames = (await readAll(cast.shots.filter((s) => s.at >= commitAt - 30), { ...o, cover: rect })).map((f) => ({ ...f, cover: coverKind(f.cover) }))
    await throttle(cdp, CPU)
    return { rec, commitAt, frames, shots: cast.shots, t0 }
  }

  console.log(`\n2. back from the editor${label ? ` (${label})` : ""}, the CPU ${CPU}x, at ${W}px\n`)
  const same = await roundTrip(false)
  {
    const seen = same.frames.filter((f) => f.cover !== "none")
    const seq = runsOf(same.frames, (f) => f.cover, same.commitAt)
    const grey = same.frames.filter((f) => f.cover === "grey")
    const firstDom = same.rec.find((r) => r.t >= same.commitAt && r.page === "website" && r.layers)
    expect(!!firstDom && firstDom.layers.length > 0 && firstDom.layers.every((l) => l.whole),
      "the same cover: the page's first frame has the picture whole in the DOM",
      firstDom ? firstDom.layers.map((l) => `${l.src.split("/").pop()} ${l.whole ? "whole" : "loading"}`).join(", ") : "no page")
    expect(grey.length === 0 && seen.length > 0 && seen[0].cover === "first",
      "  and on the glass: the first frame the cover can be seen is the picture, never the frame's grey",
      `${same.frames.length} frames: ${seq.map((s) => `${s.kind} from ${s.at}ms`).join(", ")}`)
    const firstSeen = seen[0]
    save(`back-${label || "now"}-${W}-same-first-frame`, same.shots.find((c) => c.at === firstSeen?.at))
    summary.push({ W, what: `back, same cover${label ? ` (${label})` : ""}`, grey: grey.length, frames: same.frames.length })
  }
  const fresh = await roundTrip(true)
  {
    const seq = runsOf(fresh.frames, (f) => f.cover, fresh.commitAt)
    const grey = fresh.frames.filter((f) => f.cover === "grey")
    const seen = fresh.frames.filter((f) => f.cover !== "none")
    const firstNew = seen.findIndex((f) => f.cover === "new")
    const backToFirst = firstNew === -1 ? [] : seen.slice(firstNew).filter((f) => f.cover === "first")
    const fades = new Set()
    for (const r of fresh.rec) for (const l of r.layers ?? []) if (l.fadingIn) fades.add(l.src)
    const firstDom = fresh.rec.find((r) => r.t >= fresh.commitAt && r.page === "website" && r.layers)
    expect(!!firstDom && firstDom.layers.length > 0 && firstDom.layers.every((l) => l.whole),
      "a new picture taken in the editor: the page's first frame draws the last one, whole",
      firstDom ? firstDom.layers.map((l) => `${l.src.split("/").pop()} ${l.whole ? "whole" : "loading"}`).join(", ") : "no page")
    expect(grey.length === 0 && seen.length > 0 && seen[0].cover === "first",
      "  never the frame's grey on the glass, from the first frame the cover can be seen",
      `${fresh.frames.length} frames: ${seq.map((s) => `${s.kind} from ${s.at}ms`).join(", ")}`)
    const newAt = firstNew === -1 ? null : seen[firstNew].at - fresh.commitAt
    expect(firstNew !== -1 && backToFirst.length === 0, "  the new one comes in once it has been fetched and decoded, and stays",
      firstNew === -1 ? "never" : `whole from ${ms(newAt)} after the commit (its file answered in ${COVER_NEW_MS}ms), ${backToFirst.length} frames back on the old one after`)
    expect(fades.size <= 1, "  one crossfade, not two", `${fades.size} picture${fades.size === 1 ? "" : "s"} faded in: ${[...fades].map((s) => s.split("/").pop()).join(", ") || "none"}`)
    const both = seen.find((f) => f.cover === "both")
    save(`back-${label || "now"}-${W}-new-first-frame`, fresh.shots.find((c) => c.at === seen[0]?.at))
    save(`back-${label || "now"}-${W}-new-crossfade`, fresh.shots.find((c) => c.at === both?.at))
    save(`back-${label || "now"}-${W}-new-settled`, fresh.shots[fresh.shots.length - 1])
    summary.push({ W, what: `back, new cover${label ? ` (${label})` : ""}`, grey: grey.length, fades: fades.size, newAt: newAt == null ? null : Math.round(newAt), frames: fresh.frames.length })
  }
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
}

// ─────────────────────────────────────────────────────────────────────────
//  3. AS A DOCUMENT
// ─────────────────────────────────────────────────────────────────────────

async function asDocument(W, variant) {
  const phone = W < 768
  const o = frameOf(W)
  const { ctx, page, cdp } = await openHarness(W)
  await throttle(cdp, CPU)
  const cast = await screencast(page)
  await wait(150)
  /* A press on Website whose answer the router cannot use (a new deployment, a failed fetch): the spinner, then the browser loads the page as a document. */
  const t0 = await nav(page, "/app/website-builder", 60_000)
  await wait(phone ? 900 : 1400)
  const leftAt = await page.evaluate((u) => {
    const t = performance.timeOrigin + performance.now()
    location.href = u
    return t
  }, `/app/website-builder?doc=${variant}`)
  let dom = null
  for (let i = 0; i < 200 && !dom; i++) {
    await wait(100)
    dom = await page.evaluate(() => (location.search.includes("doc=") && document.querySelector('[data-page="website"]') ? true : null)).catch(() => null)
  }
  await wait(900)
  const got = await page.evaluate(() => {
    window.__stop = true
    return { frames: window.__frames || [], long: window.__long || [], hydrateAt: window.__hydrateAt ? performance.timeOrigin + window.__hydrateAt : null }
  }).catch(() => ({ frames: [], long: [], hydrateAt: null }))
  await cast.stop()
  await throttle(cdp, 1).catch(() => {})
  const frames = (await readAll(cast.shots.filter((s) => s.at >= t0), o)).map((f) => ({ ...f, kind: kindOf(f) }))
  const seq = runsOf(frames, (f) => f.kind, t0)
  const firstSpinner = frames.findIndex((f) => f.kind === "spinner")
  const later = firstSpinner === -1 ? [] : frames.slice(firstSpinner)
  const white = later.filter((f) => f.kind === "white")
  const blank = later.filter((f) => f.kind === "blank")
  const run = (list) => {
    let longest = 0
    for (let i = 0; i < later.length; i++) {
      if (!list.includes(later[i])) continue
      let j = i
      while (j + 1 < later.length && list.includes(later[j + 1])) j++
      longest = Math.max(longest, (later[j + 1] ?? later[j]).at - later[i].at)
      i = j
    }
    return longest
  }
  const landed = got.frames.find((f) => f.page)
  /* From the first frame its body has been parsed: a frame before that is the page you were on, still on the glass. */
  const firstNewFrame = got.frames.find((f) => f.parsed)
  const cold = got.frames.filter((f) => f.cold)
  const neither = got.frames.filter((f) => f.parsed && !f.cold && !f.page)
  const spinners = later.filter((f) => f.kind === "spinner")
  const oldSpin = spinners.filter((f) => f.at < leftAt + 200)
  const newSpin = spinners.filter((f) => f.at > (firstNewFrame?.t ?? Infinity))
  const where = (list) => (list.length ? `${Math.round(list[list.length - 1].cx)},${Math.round(list[list.length - 1].cy)}` : "-")
  console.log(`\n3. arriving as a document, the wrapper ${variant === "before" ? "as it was" : "as it is"}, the CPU ${CPU}x, at ${W}px\n`)
  note(`${frames.length} frames: ${seq.map((s) => `${s.kind} from ${s.at}ms`).join(", ")}`)
  note(`the browser left at ${ms(leftAt - t0)}; the new document's first frame at ${firstNewFrame ? ms(firstNewFrame.t - t0) : "-"}, hydrated at ${got.hydrateAt ? ms(got.hydrateAt - t0) : "-"}, the page at ${landed ? ms(landed.t - t0) : "-"}`)
  if (variant === "before") {
    note(`as it was: ${white.length} white frames (${ms(run(white))} in a row at the longest), ${blank.length} empty ones`)
  } else {
    expect(firstSpinner !== -1, "the spinner is up before the browser leaves", firstSpinner === -1 ? "never" : `from ${ms(frames[firstSpinner].at - t0)}`)
    expect(white.length === 0, "no white frame from then until the page", `${white.length} white frames${white.length ? `, ${ms(run(white))} at the longest` : ""}`)
    expect(blank.length === 0, "no frame with the content area empty", `${blank.length} empty frames${blank.length ? `, ${ms(run(blank))} at the longest` : ""}`)
    expect(!!firstNewFrame && firstNewFrame.cold && neither.length === 0, "the new document's first frame, before its script, is the shell's frame with the spinner, and every frame after it that or the page",
      firstNewFrame ? `${cold.length} frames on the frame before the page, ${neither.length} on neither` : "no frame recorded")
    expect(newSpin.length > 0 && oldSpin.length > 0 && Math.abs(newSpin[0].cx - oldSpin[oldSpin.length - 1].cx) <= 4 && Math.abs(newSpin[0].cy - oldSpin[oldSpin.length - 1].cy) <= 4,
      "  and its spinner is where the one before it was", `before ${where(oldSpin)}, after ${newSpin.length ? `${Math.round(newSpin[0].cx)},${Math.round(newSpin[0].cy)}` : "-"}`)
    expect(!!landed, "then the page", landed ? `at ${ms(landed.t - t0)}` : "never")
  }
  for (const [i, s] of seq.entries()) save(`document-${variant}-${W}-${i}-${s.kind}-${s.at}ms`, cast.shots.find((c) => c.at === s.f.at))
  /* The new document on the glass, a moment after its first frame: what its HTML draws before its script. */
  if (firstNewFrame) save(`document-${variant}-${W}-new-document-first-frames`, cast.shots.find((c) => c.at >= firstNewFrame.t + 150))
  summary.push({ W, what: `document, ${variant}`, white: white.length, whiteMs: Math.round(run(white)), blank: blank.length, frames: frames.length })
  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────

for (const W of WIDTHS) {
  const h = await fromAnotherPage(W)
  if (PARTS.includes("2")) await backFromEditor(W, h, "")
  await h.ctx.close()
  if (!PARTS.includes("3")) continue
  if (BEFORE_REV) {
    const b = await openHarness(W, "?before=1")
    await nav(b.page, "/app/website-builder", 80)
    await b.page.waitForFunction(() => !!document.querySelector('[data-page="website"]'), { timeout: 20000, polling: 50 })
    await backFromEditor(W, b, `as it was at ${BEFORE_REV}`)
    await b.ctx.close()
  }
  await asDocument(W, "after")
  await asDocument(W, "before")
}

console.log("\nsummary")
for (const s of summary) console.log(`  ${JSON.stringify(s)}`)
await browser.close()
server.close()
console.log(broken ? `\n${broken} check${broken === 1 ? "" : "s"} failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
