/**
 * ===========================================================================
 *  A TAP ON THE PILL, WITH THE PRODUCT EDITOR OPEN, ALWAYS NAVIGATES
 * ===========================================================================
 * "Sometimes when I'm on the add new product page, or on the edit product
 * page, the mobile bottom navigation pill, when I click it, doesn't work
 * sometimes to navigate."
 *
 * Intermittent, so this probe taps MANY times, at several moments of the
 * editor's rise, and counts the taps that went nowhere.
 *
 * scripts/render-pill-editor.tsx draws the Products list, the editor as a
 * layer and the real pill over both, on the React the app router runs, so
 * the layer's rise is a real view transition at a real commit. For every
 * tap the probe records:
 *
 *   what document.elementFromPoint says is under the tab's centre,
 *   whether onNavigate ran (the pill's own answer), whether the router was
 *   pushed, and where the page ended up a second later.
 *
 * Run:
 *   node scripts/check-pill-nav-from-editor.mjs
 *   RUNS=20 node scripts/check-pill-nav-from-editor.mjs
 *   THROTTLE=4 node scripts/check-pill-nav-from-editor.mjs
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const RUNS = Number(process.env.RUNS ?? 20)
/** A piece of a condition's name, to run one of them while working on it. */
const ONLY = process.env.ONLY || ""
const THROTTLES = (process.env.THROTTLE ?? "1,4").split(",").map(Number)
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-pill-editor-"))

writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export const __RouteContext = React.createContext({ path: "/app/products", search: "" })
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.__navigate(h, "push") },
  replace: (h) => { log("replace", h); window.__navigate(h, "replace") },
  prefetch: (h, o) => log("prefetch", h + (o && o.kind ? " " + o.kind : "")),
  back: () => { log("back"); window.__back() },
  refresh: () => log("refresh"),
}
export const useRouter = () => router
export const usePathname = () => React.useContext(__RouteContext).path
export const useSearchParams = () => { const r = React.useContext(__RouteContext); return React.useMemo(() => new URLSearchParams(r.search), [r.search]) }
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__navigate(href, "push") } } }, children)
})
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
writeFileSync(join(stubs, "supabase-client.js"), `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
function from(table) {
  const q = { select() { return q }, eq() { return q }, order() { return q }, limit() { return q }, in() { return q }, is() { return q }, neq() { return q },
    single() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) } }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }), getSession: async () => ({ data: { session: null } }) }, from, storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }
`)
writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-pill-editor.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(stubs, "navigation.js"),
    "@/lib/supabase/client": join(stubs, "supabase-client.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [{ name: "server-action-stub", setup(b) { b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") })) } }],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
<script>
  window.__moves = []
  const start = document.startViewTransition && document.startViewTransition.bind(document)
  if (start) document.startViewTransition = function (arg) {
    const t = start(arg)
    const m = { at: performance.now() }
    window.__moves.push(m)
    t.ready.then(() => { m.ready = performance.now() }, () => { m.skipped = true })
    t.finished.then(() => { m.done = performance.now() }, () => { m.done = performance.now() })
    return t
  }
</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
writeFileSync(join(stubs, "index.html"), html)
if (process.env.BUILD_ONLY) { console.log(join(stubs, "index.html")); process.exit(0) }

const TABS = [
  { i: 0, label: "Home", href: "/app" },
  { i: 1, label: "Orders", href: "/app/orders" },
  { i: 2, label: "Products", href: "/app/products" },
  { i: 3, label: "Analytics", href: "/app/analytics" },
]

async function newPage(browser, { width = 390, viewTransitions = true } = {}) {
  const p = await browser.newPage()
  const errors = []
  /*
    "AbortError: Transition was skipped" IS THE API SAYING SO. A pick ends a
    running view transition (components/app/page-layer.tsx endLayerMove), and
    skipping one rejects every promise it handed out. The app marks that one
    handled (expectSkipRejections) so it never reaches the console or the
    error report, but the rejection itself still happens and the browser
    still tells a debugger about it, which is what this listener is. Anything
    else is a page that threw.
  */
  p.on("pageerror", (e) => { if (!/transition was skipped/i.test(e.message)) errors.push(e.message) })
  p.on("dialog", (d) => d.accept().catch(() => {}))
  if (!viewTransitions) await p.evaluateOnNewDocument(() => { delete Document.prototype.startViewTransition })
  /*
    A DOCUMENT LOAD IS A FAILURE HERE, NOT A CRASH. Every trip this probe
    makes is a push inside one document; if the browser loads an address
    instead, the tab's page is replaced, every handle this script holds goes
    with it, and the next evaluate dies with "Attempted to use detached
    Frame" — which says nothing about what did it. So a load is recorded
    with what caused it (a script that called location.assign, reload or
    replace, and the last press before it), and reported as the tap going
    wrong.

    HOW A LOAD IS TOLD FROM A PUSH: every document gets a number of its own
    the moment it starts, and a tap compares the number before with the
    number after. Puppeteer's own "framenavigated" cannot be used for this —
    it fires for a client side push as well, which is the very thing that is
    supposed to happen here, so it would call every correct tap a failure.
  */
  await p.evaluateOnNewDocument(() => {
    const w = window
    w.__docId = `${Date.now()}.${Math.random()}`
    w.__loadCause = null
    const note = (how, arg) => { w.__loadCause = { how, arg: String(arg ?? ""), stack: String(new Error().stack ?? "").split("\n").slice(1, 6).join(" | ") } }
    for (const name of ["assign", "replace", "reload"]) {
      const original = location[name].bind(location)
      try {
        Object.defineProperty(location, name, { configurable: true, value: (...args) => { note("location." + name, args[0]); return original(...args) } })
      } catch { /* a location a page cannot patch says nothing, and the frame event still records the load */ }
    }
    w.addEventListener("click", (e) => {
      const t = e.target
      w.__lastClick = { tag: t?.tagName ?? null, href: t?.closest?.("a[href]")?.getAttribute("href") ?? null, prevented: false }
      /* Read after the page's own handlers: an anchor nobody prevented is a document load waiting to happen. */
      setTimeout(() => { if (w.__lastClick) w.__lastClick.prevented = e.defaultPrevented }, 0)
    }, true)
  })
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("data:")) return r.continue()
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
    if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("file:")) return r.continue()
    r.abort()
  })
  await p.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cdp = await p.createCDPSession()
  await p.goto("http://probe.test/app/products")
  await sleep(1200)
  if (errors.length) fail(`The page threw: ${errors[0]}`)
  return { p, cdp, errors }
}

/** The centre of tab `i`, in screen pixels, read off the drawn bar. */
async function tabCentre(p, i) {
  return p.evaluate((i) => {
    const link = document.querySelectorAll("[data-app-nav-pill] nav a")[i]
    if (!link) return null
    const b = link.getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  }, i)
}

/** Reads the page, and says so plainly when the document was replaced under it. */
async function read(p, fn, arg) {
  try {
    return await p.evaluate(fn, arg)
  } catch (e) {
    if (/detached Frame|Execution context was destroyed|Target closed/i.test(String(e?.message))) return null
    throw e
  }
}

/** Waits for something to be true in the page, up to `ms`. */
async function until(p, fn, ms = 3000) {
  for (let waited = 0; waited < ms; waited += 50) {
    if (await p.evaluate(fn)) return true
    await sleep(50)
  }
  return false
}

/** Reset to the products list, then open the editor and tap the pill `after` ms later. */
async function oneTap(p, { tab, after, isNew, type, focus, answer }) {
  await p.evaluate(() => {
    window.__navigate("/app/products", "push")
  })
  await sleep(600)
  await p.evaluate(() => { window.__picks = []; window.__pushes = [] })

  /* Open the editor the way the list opens it, with a real tap on the row. */
  const openSel = isNew ? "[data-new-product]" : "a[data-row-link]"
  const box = await p.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => {
      const b = e.getBoundingClientRect()
      return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 140
    })
    const el = els[0] ?? document.querySelector(sel)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.left + Math.min(b.width / 2, 60)), y: Math.round(b.top + b.height / 2) }
  }, openSel)
  if (!box) return { skipped: true }
  await p.touchscreen.tap(box.x, box.y)

  /*
    NEW PRODUCT ASKS WHAT YOU ARE SELLING FIRST. The button opens a sheet
    (app/app/products/new/kind-chooser), and only the answer opens the
    editor — so a probe that tapped the button and then the pill was tapping
    over a sheet, not over the editor the reader is talking about. "Digital"
    needs nothing from the server, so it is the one this picks.

    While that sheet is up there is nothing here to measure: it is a bottom
    sheet, it covers the whole width at the foot of the screen, and the pill
    is under it. A tap where the pill would be lands on one of the sheet's
    own rows, which is the sheet working, not the pill failing.
  */
  if (isNew) {
    if (!(await until(p, () => !!document.querySelector("[data-new-product-chooser] [data-kind='digital']")))) return { skipped: true }
    await p.evaluate(() => document.querySelector("[data-new-product-chooser] [data-kind='digital']").click())
    /* The sheet leaves before the editor is asked for (onClosed: go), so wait for the layer, not for the sheet. */
    if (!(await until(p, () => !!document.querySelector("[data-page-layer]")))) return { skipped: true }
  }

  if (after > 0) await sleep(after)

  if (focus) {
    await p.evaluate(() => {
      const el = document.querySelector("[data-page-layer] input, [data-page-layer] textarea")
      if (el) el.focus()
    })
  }
  if (type) {
    /* The form is drawn before it is typed into: on a slowed CPU the editor's
       first render lands after the wait above. */
    for (let i = 0; i < 60; i++) {
      if (await p.evaluate(() => !!document.querySelector("[data-page-layer] #title"))) break
      await sleep(50)
    }
    await p.evaluate((text) => {
      /* The product's own name, by its id, not "the first text field". */
      const el = document.querySelector("[data-page-layer] #title")
      if (!el) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(el, text)
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }, type)
    /*
      AND WAITED FOR, NOT SLEPT THROUGH. The editor works out whether there
      is anything to lose in an effect, which on a slowed CPU lands several
      frames after the keystroke: the bar's first button says Cancel rather
      than Back once it has. Without this the probe tapped a tab over an
      editor that did not know yet, and the question it was asking about
      was never going to be asked.
    */
    let dirty = false
    for (let i = 0; i < 60 && !dirty; i++) {
      dirty = await p.evaluate(() => !!document.querySelector('[data-leave-button][data-mode="cancel"]'))
      if (!dirty) await sleep(50)
    }
    /* Never counted as a tap over an editor with something to lose if it has nothing to lose. */
    if (!dirty) return { skipped: true }
  }

  const centre = await tabCentre(p, tab.i)
  if (!centre) return { skipped: true }
  const before = await read(p, (c) => {
    const el = document.elementFromPoint(c.x, c.y)
    return {
      docId: window.__docId ?? null,
      path: window.__path,
      sheet: document.querySelector("[data-sheet-root]")?.getAttribute("data-app-sheet") ?? null,
      motion: document.documentElement.dataset.layerMotion ?? null,
      hand: document.documentElement.dataset.layerHand ?? null,
      layer: !!document.querySelector("[data-page-layer]"),
      under: el ? (el.closest("[data-app-nav-pill]") ? "pill" : (el.tagName + "." + (el.className || "").toString().slice(0, 40))) : "nothing",
      stills: document.querySelectorAll("[data-layer-still]").length,
    }
  }, centre)

  await p.touchscreen.tap(centre.x, centre.y)

  /*
    THE QUESTION, WHEN THERE IS SOMETHING TO LOSE. A tab over an editor with
    unsaved changes asks before it goes, the same question Cancel asks
    (lib/ui/leave-guard). `answer` says which button the probe presses.

    Waited for rather than read once: the question is put up in the task
    after the gesture and then rises as a sheet, which on a slowed CPU is
    several frames. A tap that has plainly gone somewhere needs no waiting,
    so the wait ends the moment the page changes.
  */
  let asked = null
  for (let i = 0; i < 24 && !asked; i++) {
    await sleep(80)
    asked = await p.evaluate(() => {
      const sheet = document.querySelector("[data-confirm-sheet]")
      if (!sheet) return null
      const box = sheet.getBoundingClientRect()
      if (box.height <= 0 || getComputedStyle(sheet).visibility === "hidden") return null
      return { title: sheet.closest("[data-sheet-root],[role=alertdialog]")?.querySelector("h2")?.textContent ?? null }
    })
    if (!asked && i >= 6 && (await p.evaluate(() => window.__picks.length > 0))) break
  }
  if (asked && answer) {
    await p.evaluate((yes) => {
      const sheet = document.querySelector("[data-confirm-sheet]")
      const button = yes ? sheet?.querySelector("[data-confirm]") : sheet?.querySelector("button:not([data-confirm])")
      button?.click()
    }, answer === "discard")
    await sleep(700)
  }
  await sleep(700)

  const after_ = (await read(p, () => ({
    path: window.__path,
    picks: window.__picks.slice(),
    pushes: window.__pushes.slice(),
    layer: !!document.querySelector("[data-page-layer]"),
    location: location.pathname,
    docId: window.__docId ?? null,
    sheet: document.querySelector("[data-sheet-root]")?.getAttribute("data-app-sheet") ?? null,
    loadCause: window.__loadCause ?? null,
    lastClick: window.__lastClick ?? null,
  }))) ?? { path: null, picks: [], pushes: [], layer: false, location: null, docId: null, sheet: null, loadCause: null, lastClick: null, gone: true }
  /* A different document than the tap began in: the trip left the app rather than moving inside it. */
  const loaded = !!after_.gone || (!!before?.docId && after_.docId !== before.docId)
  if (loaded) {
    /* Back to a page this script can drive, whatever the load left behind. */
    await p.goto("http://probe.test/app/products").catch(() => {})
    await sleep(900)
  }
  const went = !loaded && after_.path === tab.href && !after_.layer
  return { before, after: after_, asked: !!asked, askedTitle: asked?.title ?? null, went, loaded }
}

/**
 * One condition, `RUNS` taps spread over the four tabs. `wants` is what a
 * tap is supposed to do: "go" (the page changes and the layer is gone),
 * "ask-then-go" (the question comes up first), "ask-then-stay" (the question
 * comes up and Keep editing leaves the editor where it is).
 */
async function run(p, label, options) {
  const wants = options.wants ?? "go"
  const wrong = []
  let n = 0
  let asked = 0
  for (const tab of TABS) {
    for (let k = 0; k < Math.ceil(RUNS / TABS.length); k++) {
      const r = await oneTap(p, { ...options, tab })
      if (r.skipped) continue
      n++
      if (r.asked) asked++
      const ok = wants === "ask-then-stay"
        ? r.asked && !r.went && r.after.layer
        : wants === "ask-then-go"
          ? r.asked && r.went
          : r.went && !r.asked
      if (!ok) wrong.push({ tab: tab.label, ...r.before, ...r.after, asked: r.asked })
    }
  }
  console.log(`  ${label}: ${wrong.length} of ${n} taps did the wrong thing (${asked} asked first)`)
  if (wrong.length) console.log(`        ${JSON.stringify(wrong.slice(0, 3))}`)
  return { n, wrong, wants }
}

/* ── Run ─────────────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const summary = []
try {
  for (const vt of [true, false]) {
    const { p, cdp, errors } = await newPage(browser, { viewTransitions: vt })
    const engine = vt ? "view transitions" : "no view transitions"
    for (const throttle of THROTTLES) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
      for (const [name, options] of [
        ["as the editor rises (0ms)", { after: 0, isNew: false }],
        ["mid rise (120ms)", { after: 120, isNew: false }],
        ["just after the rise (400ms)", { after: 400, isNew: false }],
        ["settled (1200ms)", { after: 1200, isNew: false }],
        ["new product, as the editor rises", { after: 0, isNew: true }],
        ["new product, settled", { after: 1200, isNew: true }],
        ["settled, unsaved changes, Discard", { after: 1200, isNew: false, type: "An edited title", answer: "discard", wants: "ask-then-go" }],
        ["settled, unsaved changes, Keep editing", { after: 1200, isNew: false, type: "An edited title", answer: "keep", wants: "ask-then-stay" }],
        ["settled, a field focused", { after: 1200, isNew: false, focus: true }],
      ]) {
        const label = `${engine}, ${throttle}x, ${name}`
        if (ONLY && !label.includes(ONLY)) continue
        const r = await run(p, label, options)
        summary.push({ label, ...r })
      }
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    if (errors.length) expect(false, "nothing threw", errors.slice(0, 2))
    await p.close()
  }
} finally {
  await browser.close()
}

console.log("")
for (const s of summary) {
  const what = s.wants === "ask-then-stay"
    ? "every tap asked, and Keep editing stayed"
    : s.wants === "ask-then-go"
      ? "every tap asked, and Discard went"
      : "every tap navigated"
  expect(s.wrong.length === 0, `${s.label}: ${what}`, `${s.n - s.wrong.length}/${s.n}`)
}
if (broken) { console.error(`\n${broken} check(s) failed.\n`); process.exit(1) }
console.log("\nEvery tap on the pill did what it should.\n")
