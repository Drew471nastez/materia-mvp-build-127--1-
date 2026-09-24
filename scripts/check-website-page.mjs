/**
 * ===========================================================================
 *  THE WEBSITE PAGE, AT A PHONE'S WIDTH AND A LAPTOP'S
 * ===========================================================================
 * The page was redrawn after a review that called its layout and alignment
 * wrong, and again when the owner asked for one button beside the title, a
 * full library that is a sheet on a phone, and an import you can watch.
 * Every one of those is a claim about pixels or motion, so each is measured
 * here rather than asserted, at 390 and at 1280 wide:
 *
 *   THE STATIC PAGE (rendered on the server, measured in Chromium)
 *   • nothing runs off the right-hand gutter; "Add theme" once did
 *   • every action is a real touch target, 44px or more, on a phone
 *   • both gutters are the same, and at least 16px
 *
 *   THE LIVE PAGE (mounted in a browser, driven like a person would)
 *   • the title row has exactly one control, Settings, on the heading's line
 *   • with the library full, Import opens the full library surface and never
 *     a file picker: a sheet on the bottom edge on a phone, a centred modal
 *     on a laptop, nothing wider than the screen, every control 44px on a
 *     phone
 *   • an import: the button counts the upload and then says Importing, a
 *     placeholder row is drawn after the library's rows and moves on
 *     opacity and transform only, the real row replaces it in one frame at
 *     the same place, the page scrolls it to the middle of its own scroller,
 *     and a ring fades on it once for 1.2s
 *   • it lands on the right row with a library of one website and when it
 *     makes the fifth
 *   • a failed import keeps its row, says why, offers Try again, and toasts
 *   • with nothing live, the website taken offline says so, on its row and
 *     in the card, with Publish again
 *
 *   node scripts/check-website-page.mjs            both widths
 *   WIDTH=390 node scripts/check-website-page.mjs  one
 *   KEEP_SHOT=/tmp/wb.png ...                      also a screenshot of the static page
 *
 * Runs without a build: the stylesheet is the built one when there is one,
 * else app/globals.css through the build's own Tailwind (scripts/probe-css.mjs).
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
const out = mkdtempSync(join(tmpdir(), "storelib-wb-page-"))
const KEEP = process.env.KEEP_SHOT
const WIDTHS = process.env.WIDTH ? [Number(process.env.WIDTH)] : [390, 1280]

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const css = (await appCss(root)) + "\n" + interFaces(root)

/** Stubs live inside the project so esbuild can resolve `react` from them. */
const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) {
  return React.createElement("a", { href: String(href), ...rest }, children)
}

export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/website-builder"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams()
`)
/* In the browser, a refresh is the render file adding the website the fake server made. */
writeFileSync(join(stubs, "navigation-live.js"), `export const usePathname = () => "/app/website-builder"
const router = { push() {}, replace() {}, prefetch() {}, refresh() { globalThis.__probe && globalThis.__probe.refresh() } }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "toast.js"), `const toast = (t) => { (globalThis.__toasts = globalThis.__toasts || []).push(t && t.title) }
export const useToast = () => ({ toast })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)

const aliases = (nav) => [
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, nav)}`,
  `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
  `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
  `--alias:@=${root}`,
]

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}

// ─────────────────────────────────────────────────────────────────────────
//  1. THE STATIC PAGE
// ─────────────────────────────────────────────────────────────────────────

const bundle = join(out, "probe.js")
try {
  execFileSync(
    "npx",
    ["--no-install", "esbuild", join(root, "scripts/render-website-page-probe.tsx"),
     "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error",
     `--outfile=${bundle}`, ...aliases("navigation.js")],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  fail("The probe did not bundle. The error above is esbuild's.")
}
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const body = readFileSync(join(out, "page.html"), "utf8")

const PROBE = (W) => `<script>
  const r = (el) => el.getBoundingClientRect()
  const results = { overflow: 0, cards: [], short: [], pad: null }

  /**
   * The real "it runs off the screen" test: does the PAGE'S OWN SCROLLER
   * have more width than it can show.
   *
   * Two earlier versions measured the wrong box. The first walked every
   * element and compared it to the page, which flagged 219 things: the
   * themes row was deliberately full-bleed, with a scroller of its own, and
   * every drawing inside every cover sat under it. The second asked
   * document.documentElement, which is not 390px wide: headless Chromium
   * will not open a window narrower than about 500, so html stayed 500
   * however narrow the window was asked to be.
   *
   * The body is pinned to the width under test and the page's own root is
   * the thing that scrolls, so that is the element to ask.
   */
  const root =
    document.querySelector("[data-probe-shell] .page-scroll") ||
    document.querySelector("[data-probe-shell]")
  results.overflow = Math.max(0, root.scrollWidth - root.clientWidth)

  // The blocks that make up the page, and where their edges actually land.
  for (const el of document.querySelectorAll("[data-page-block]")) {
    const b = r(el)
    results.cards.push({ left: Math.round(b.left), right: Math.round(${W} - b.right) })
  }

  /**
   * Touch targets, counted only for things that LOOK like buttons: a border
   * or a fill of their own. The address line and "Browse" are links, not
   * controls of that kind, and are not meant to be 44px.
   */
  for (const el of document.querySelectorAll("button, a")) {
    const c = getComputedStyle(el)
    const filled = c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent"
    const bordered = parseFloat(c.borderTopWidth) > 0
    if (!filled && !bordered) continue
    const b = r(el)
    if (b.height === 0 || b.width < 56) continue
    if (Math.round(b.height) < 44) {
      results.short.push({
        text: (el.textContent || "").trim().slice(0, 22) || el.getAttribute("aria-label") || "?",
        h: Math.round(b.height),
      })
    }
  }

  const inner = document.querySelector("[data-probe-inner]")
  const ic = getComputedStyle(inner)
  results.pad = { left: parseInt(ic.paddingLeft), right: parseInt(ic.paddingRight) }

  document.title = JSON.stringify(results)
</script>`

function staticPage(W) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>` + css + `</style>
<style>*{box-sizing:border-box}body{margin:0;width:${W}px;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style>
</head><body><div data-probe-shell style="width:${W}px">${body}</div>${PROBE(W)}</body></html>`
  const html = join(out, `page-${W}.html`)
  writeFileSync(html, page.replace('class="app-page-enter', 'data-probe-inner class="app-page-enter'))

  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},900`,
     "--force-prefers-reduced-motion", "--virtual-time-budget=2500", "--dump-dom", `file://${html}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
  )
  const raw = /<title>([\s\S]*?)<\/title>/.exec(dom)?.[1]
  if (!raw) fail("The page did not render. Chromium produced no result.")
  const r = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

  if (KEEP) {
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},2400`,
       "--force-prefers-reduced-motion", "--virtual-time-budget=2500",
       `--screenshot=${KEEP.replace(/(\.png)?$/, `-${W}.png`)}`, `file://${html}`],
      { stdio: "ignore" },
    )
  }

  const lopsided = r.cards.filter((c) => c.left !== c.right)
  console.log(`\nthe website page, rendered on the server, at ${W}px\n`)
  expect(r.overflow === 0, "the page does not scroll sideways", `${r.overflow}px of it is off the screen`)
  expect(
    r.cards.length >= 3 && lopsided.length === 0,
    `every block sits on the same two gutters (${r.cards.length} measured)`,
    lopsided.length ? lopsided.map((c) => `${c.left}/${c.right}`).join(", ") : r.cards.length < 3 ? "fewer blocks than expected" : "",
  )
  expect(r.pad.left === r.pad.right && r.pad.left >= 16, `and those gutters are equal, and at least 16px (${r.pad.left}/${r.pad.right}px)`)
  /**
   * 44px is a TOUCH rule, so it is checked at touch widths. The library rows
   * carry 36px Publish and Edit buttons that only exist from `sm` up, which
   * is the right size for a row of actions under a pointer.
   */
  if (W <= 640) {
    expect(
      r.short.length === 0,
      "every button is 44px or taller, which is the size a thumb hits",
      r.short.length ? `${r.short.length} short: ` + r.short.slice(0, 6).map((x) => `"${x.text}" ${x.h}px`).join("; ") : "",
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  2. THE LIVE PAGE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Put in the page before it loads. The file picker is counted rather than
 * opened; XMLHttpRequest is a fake server that reports an upload in four
 * steps over 800ms, then answers 700ms later (a website, or an error); and
 * a timeline records every state the Import button and the placeholder row
 * pass through, and the frame the real row lands in.
 */
const INSTRUMENT = `
window.__fileChooser = 0
const nativeClick = HTMLInputElement.prototype.click
HTMLInputElement.prototype.click = function () {
  if (this.type === "file") { window.__fileChooser++; return }
  return nativeClick.call(this)
}
window.__xhrMode = "ok"
window.__xhrSent = 0
window.__requests = []
/* The file goes to storage by XMLHttpRequest: four progress steps over 800ms, then stored. */
window.XMLHttpRequest = class {
  constructor() { this.upload = {}; this.status = 0; this.responseText = "" }
  open(method, url) { this.method = method; this.url = url }
  setRequestHeader() {}
  abort() { this.onabort && this.onabort() }
  send() {
    window.__xhrSent++
    window.__requests.push(this.method + " " + this.url)
    const steps = [0.2, 0.45, 0.7, 1]
    steps.forEach((f, i) => setTimeout(() => this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: f * 1000, total: 1000 }), 200 * (i + 1)))
    setTimeout(() => this.upload.onload && this.upload.onload(), 200 * steps.length + 50)
    setTimeout(() => {
      this.status = 200
      this.responseText = JSON.stringify({ Key: "stored" })
      this.onload && this.onload()
    }, 200 * steps.length + 80)
  }
}
/* The place to put it, and the import that reads it: the import answers 700ms after the file is stored. */
const realFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const json = (status, body, ms) => new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })), ms))
  if (url === "/api/website-builder/themes/import/upload") {
    window.__requests.push("POST " + url)
    return json(200, { url: "/storage/upload/sign/x?token=t", path: "0f8fad5b-d9cb-469f-a165-70867728950e/theme-imports/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.zip" }, 40)
  }
  if (url === "/api/website-builder/themes/import") {
    window.__requests.push("POST " + url + " " + (init && init.body))
    if (window.__xhrMode === "ok") {
      window.__probeNext = { id: "new-1", name: "Summer shop" }
      return json(200, { ok: true, install_id: "new-1", name: "Summer shop", media: "nothing" }, 700)
    }
    return json(400, { error: "Invalid zip file" }, 700)
  }
  return realFetch(input, init)
}
window.__timeline = []
window.__landed = null
const tbodyTop = (el) => { const t = el.closest("tbody"); return t ? Math.round(el.getBoundingClientRect().top - t.getBoundingClientRect().top) : null }
new MutationObserver(() => {
  const b = document.querySelector("[data-import-button]")
  const row = document.querySelector("[data-incoming]")
  if (row) window.__placeholder = { top: tbodyTop(row), h: Math.round(row.getBoundingClientRect().height), last: row === row.parentElement.lastElementChild }
  const s = (b ? b.textContent.trim() : "") + " | " + (row ? row.getAttribute("data-incoming") : "none")
  if (window.__timeline[window.__timeline.length - 1] !== s) window.__timeline.push(s)
  const real = document.querySelector('[data-install-row="new-1"]')
  if (real && !window.__landed) {
    window.__landed = { withPlaceholder: !!row, top: tbodyTop(real), h: Math.round(real.getBoundingClientRect().height), last: real === real.parentElement.lastElementChild, at: performance.now() }
  }
}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
`

/** Every animated property under an element, pseudo elements included. */
const ANIMATED = `(sel) => {
  const box = document.querySelector(sel)
  if (!box) return null
  const props = new Set()
  const list = []
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target
    if (!t || !(t === box || box.contains(t))) continue
    for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "computedOffset", "easing", "composite"].includes(p)) props.add(p)
    list.push({ name: a.animationName || "transition", pseudo: a.effect.pseudoElement || null, duration: a.effect.getTiming().duration })
  }
  return { props: [...props], list }
}`

const liveJs = join(out, "live.js")
try {
  execFileSync(
    "npx",
    ["--no-install", "esbuild", join(root, "scripts/render-website-page-live.tsx"),
     "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
     '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
     '--define:process.env.NODE_ENV="production"',
     "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
     ...aliases("navigation-live.js")],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  fail("The live probe did not bundle. The error above is esbuild's.")
}
const js = readFileSync(liveJs)
const shell = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/live.js"></script></body></html>`
const zip = join(out, "summer-shop.storelib-theme.zip")
writeFileSync(zip, Buffer.alloc(2048, 1))

const server = createServer((req, res) => {
  if (req.url.startsWith("/live.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  if (req.url.startsWith("/api/")) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}") }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(shell)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(W, scenario, extra = "") {
  const p = await browser.newPage()
  const phone = W <= 640
  await p.setViewport({ width: W, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.goto(`${origin}/?scenario=${scenario}${extra}`, { waitUntil: "load" })
  await sleep(700)
  return { p, errors, phone }
}

async function livePage(W) {
  console.log(`\nthe website page, live in a browser, at ${W}px\n`)

  // ── The title row, and the full library ──────────────────────────────
  {
    const { p, errors, phone } = await open(W, "full")
    const title = await p.evaluate(() => {
      const h1 = document.querySelector("[data-title-row] h1")
      const hb = h1.getBoundingClientRect()
      /* Every control whose box shares the heading's line, anywhere on the page. */
      const onLine = [...document.querySelectorAll("button, a, [role=button]")].filter((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0 && b.top < hb.bottom && b.bottom > hb.top
      })
      const c = onLine[0]
      const cb = c ? c.getBoundingClientRect() : null
      return {
        count: onLine.length,
        label: c ? c.textContent.trim() : null,
        control: cb ? { h: Math.round(cb.height), mid: Math.round(cb.top + cb.height / 2) } : null,
        heading: { mid: Math.round(hb.top + hb.height / 2), h: Math.round(hb.height) },
      }
    })
    expect(
      title.count === 1 && title.label === "Settings",
      `the title row has one control on the heading's line: ${title.label} (${title.count} found)`,
    )
    if (title.control) {
      const dy = Math.abs(title.control.mid - title.heading.mid)
      expect(dy <= 2, `  centred on the heading's line (${dy}px apart)`)
      expect(!phone || title.control.h >= 44, `  ${title.control.h}px tall${phone ? ", 44px or more on a phone" : ""}`)
    }

    await p.click("[data-import-button]")
    await sleep(900)
    const s = await p.evaluate((W) => {
      const surface = document.querySelector("[data-library-full]")
      if (!surface) return null
      const kind = surface.getAttribute("data-surface")
      const box = (kind === "sheet" ? surface.closest("[data-sheet-panel]") : surface).getBoundingClientRect()
      const panel = kind === "sheet" ? surface.closest("[data-sheet-panel]") : surface
      const controls = [...panel.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) }))
      return {
        kind,
        box: { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right), w: Math.round(box.width), h: Math.round(box.height) },
        vw: window.innerWidth,
        vh: window.innerHeight,
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        panelOverflow: Math.max(0, panel.scrollWidth - panel.clientWidth),
        controls,
        removes: controls.filter((c) => c.t === "Remove").length,
        badges: [...panel.querySelectorAll("li span span:last-child, li > span > span")].map((b) => b.textContent.trim()).filter((t) => t === "Live" || t === "Draft").length,
      }
    }, W)
    if (KEEP) await p.screenshot({ path: KEEP.replace(/(\.png)?$/, `-${W}-full.png`) })
    const picked = await p.evaluate(() => window.__fileChooser)
    expect(!!s, "with the library full, Import opens the full library surface")
    expect(picked === 0, `  and never the file picker (${picked} opened)`)
    if (s) {
      if (phone) {
        expect(s.kind === "sheet", `  a bottom sheet on a phone (${s.kind})`)
        expect(Math.abs(s.box.bottom - s.vh) <= 1 && s.box.left === 0 && s.box.right === s.vw,
          `  anchored to the bottom edge, full width: ${s.box.left}..${s.box.right} of ${s.vw}, bottom ${s.box.bottom} of ${s.vh}, ${s.box.h}px tall`)
        const short = s.controls.filter((c) => c.h < 44)
        expect(short.length === 0, `  every control 44px or taller: ${s.controls.map((c) => `${c.t} ${c.h}px`).join(", ")}`)
      } else {
        expect(s.kind === "modal", `  a modal on a laptop (${s.kind})`)
        const dx = Math.abs(s.box.left - (s.vw - s.box.right))
        const dy = Math.abs(s.box.top - (s.vh - s.box.bottom))
        expect(dx <= 1 && dy <= 1, `  centred: ${s.box.w}x${s.box.h}px, ${dx}px off across, ${dy}px off down`)
        expect(s.box.w <= 440, `  compact, ${s.box.w}px wide`)
      }
      expect(s.overflow === 0 && s.panelOverflow === 0, `  nothing wider than the screen (page ${s.overflow}px, surface ${s.panelOverflow}px over)`)
      expect(s.removes === 4, `  a Remove on each of the 4 drafts and not on the live one (${s.removes})`)
    }
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }

  // ── An import, from file to arrival, into libraries of three sizes ────
  for (const drafts of [2, 0, 3]) {
    const websites = drafts + 1
    if (drafts !== 2) console.log(`\n  with ${websites} website${websites === 1 ? "" : "s"} before it, so it lands as number ${websites + 1}\n`)
    const { p, errors } = await open(W, "room", `&drafts=${drafts}`)
    const input = await p.$('input[type="file"]')
    await input.uploadFile(zip)
    await sleep(320)
    const early = await p.evaluate((animated) => {
      const row = document.querySelector("[data-incoming]")
      const bar = document.querySelector("[data-incoming-bar]")
      return {
        row: !!row,
        button: document.querySelector("[data-import-button]").textContent.trim(),
        bar: bar ? getComputedStyle(bar).transform : null,
        /* The rows around it keep their columns and their names. */
        columns: new Set([...document.querySelectorAll("tbody tr")].map((r) => [...r.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().right)).join(","))).size,
        names: [...document.querySelectorAll("[data-install-row] td:first-child button > span:last-child")].map((n) => Math.round(n.getBoundingClientRect().width)),
        anim: (0, eval)(animated)("[data-incoming]"),
      }
    }, ANIMATED)
    await sleep(900)
    if (KEEP) await p.screenshot({ path: KEEP.replace(/(\.png)?$/, `-${W}-importing.png`) })
    const mid = await p.evaluate((animated) => ({ anim: (0, eval)(animated)("[data-incoming]"), bar: document.querySelector("[data-incoming-bar]")?.getAttribute("data-incoming-bar") }), ANIMATED)
    /* It lands about 1.5s after the pick; the ring starts once the scroll has stopped. */
    await p.waitForFunction(() => document.querySelector("[data-arrival-ring]"), { timeout: 4000 }).catch(() => null)
    await sleep(260)
    if (KEEP) await p.screenshot({ path: KEEP.replace(/(\.png)?$/, `-${W}-arrived.png`) })
    const ring = await p.evaluate((animated) => {
      const row = document.querySelector('[data-install-row="new-1"]')
      const layer = document.querySelector("[data-arrival-ring]")
      const rb = row && row.getBoundingClientRect()
      const lb = layer && layer.getBoundingClientRect()
      /* Every cell of every row, to catch a ring that changes the table's columns. */
      const cols = [...document.querySelectorAll("[data-install-row]")].map((r) => [...r.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().right)).join(","))
      return {
        ringed: !!layer,
        off: rb && lb ? Math.max(Math.abs(rb.top - lb.top), Math.abs(rb.bottom - lb.bottom), Math.abs(rb.left - lb.left), Math.abs(rb.right - lb.right)) : null,
        sameColumns: new Set(cols).size === 1,
        anim: (0, eval)(animated)("[data-arrival-ring]"),
      }
    }, ANIMATED)
    await sleep(1600)
    const end = await p.evaluate(() => {
      const row = document.querySelector('[data-install-row="new-1"]')
      const sc = document.querySelector("[data-probe-shell] .page-scroll")
      const rb = row.getBoundingClientRect()
      const sb = sc.getBoundingClientRect()
      return {
        timeline: window.__timeline,
        placeholder: window.__placeholder,
        landed: window.__landed,
        toasts: window.__toasts || [],
        ringLeft: !!document.querySelector("[data-arrival-ring]"),
        rowMid: Math.round(rb.top + rb.height / 2 - sb.top),
        rowTop: Math.round(rb.top - sb.top),
        rowBottom: Math.round(rb.bottom - sb.top),
        scHeight: sc.clientHeight,
        scMid: Math.round(sc.clientHeight / 2),
        scrollTop: Math.round(sc.scrollTop),
        maxScroll: sc.scrollHeight - sc.clientHeight,
        windowScrolled: window.scrollY,
        overflow: Math.max(0, sc.scrollWidth - sc.clientWidth),
      }
    })

    const said = [...new Set(end.timeline.map((t) => t.split(" | ")[0]))]
    expect(early.row, "the placeholder row is up at once")
    expect(early.columns === 1 && early.names.every((w) => w > 60), `  the rows around it keep their columns and their names (${early.columns} column layout, names ${early.names.join(", ")}px wide)`)
    expect(/^Uploading \d+%$/.test(early.button), `  the button counts the upload ("${early.button}")`)
    expect(said.some((t) => /^Uploading 100%$/.test(t) || /^Uploading [1-9]\d%$/.test(t)) && said.includes("Importing"),
      `  then says Importing: ${said.join(" > ")}`)
    const allowed = (a) => !a || a.props.every((p) => p === "opacity" || p === "transform")
    expect(allowed(early.anim) && allowed(mid.anim) && early.anim.list.length > 0,
      `  it moves on opacity and transform only: ${[...new Set([...(early.anim?.props ?? []), ...(mid.anim?.props ?? [])])].join(", ")} (${[...new Set([...(early.anim?.list ?? []), ...(mid.anim?.list ?? [])].map((a) => a.name))].join(", ")})`)
    expect(mid.bar === "sweep", `  the bar sweeps while the server works (${mid.bar})`)
    expect(end.placeholder?.last, "  drawn after the library's rows, where the new website lands")
    expect(!!end.landed && end.landed.withPlaceholder === false, "the real row replaces it in the same frame", JSON.stringify(end.landed))
    if (end.landed && end.placeholder) {
      expect(end.landed.top === end.placeholder.top && Math.abs(end.landed.h - end.placeholder.h) <= 1 && end.landed.last,
        `  at the same place: placeholder at ${end.placeholder.top}px, ${end.placeholder.h}px tall; website at ${end.landed.top}px, ${end.landed.h}px tall`)
    }
    const clamped = end.scrollTop >= end.maxScroll - 1
    expect(Math.abs(end.rowMid - end.scMid) <= 2 || clamped,
      `the page scrolls it to the middle of its own scroller: row at ${end.rowMid}px, middle ${end.scMid}px, scrolled ${end.scrollTop} of ${end.maxScroll}px${clamped ? " (the end of the page)" : ""}`)
    expect(end.rowTop >= 0 && end.rowBottom <= end.scHeight, `  and the whole row is in view: ${end.rowTop}..${end.rowBottom}px of ${end.scHeight}px`)
    expect((end.maxScroll <= 0 ? end.scrollTop === 0 : end.scrollTop > 0 || Math.abs(end.rowMid - end.scMid) <= 2) && end.windowScrolled === 0,
      end.maxScroll <= 0
        ? `  nothing to scroll on a page this short (${end.maxScroll}px), and the window did not move (${end.windowScrolled}px)`
        : `  the page's scroller moved (${end.scrollTop}px), the window did not (${end.windowScrolled}px)`)
    const reqs = await p.evaluate(() => window.__requests)
    expect(reqs.length === 3 && /^POST \/api\/website-builder\/themes\/import\/upload$/.test(reqs[0]) && /^PUT \/storage\/upload\/sign\//.test(reqs[1]) && /^POST \/api\/website-builder\/themes\/import \{"path":"[^"]+\.zip"\}$/.test(reqs[2]),
      `  a place, the file straight to storage, then the import by its path: ${reqs.map((r) => r.split(" ").slice(0, 2).join(" ")).join(" > ")}`)
    const rows = await p.evaluate(() => document.querySelectorAll("[data-install-row]").length)
    expect(rows === drafts + 1, `  the library shows ${rows} row${rows === 1 ? "" : "s"}, the new one once, with no placeholder beside it`)
    const arrived = ring.anim?.list.find((a) => a.name === "wb-arrived")
    expect(ring.ringed && !!arrived && arrived.duration === 1200 && ring.anim.props.every((p) => p === "opacity"),
      `a ring fades on it once: ${arrived ? `${arrived.duration}ms, ${ring.anim.props.join(", ")}` : "none"}`)
    expect(ring.off !== null && ring.off <= 1, `  exactly over the row (${ring.off}px off at most)`)
    expect(ring.sameColumns, "  and every row keeps the same columns while it is on")
    expect(!end.ringLeft, "  and is gone after")
    expect(end.toasts.includes("Imported Summer shop"), `  with a toast: ${JSON.stringify(end.toasts)}`)
    expect(end.overflow === 0, `nothing scrolls sideways during it (${end.overflow}px)`)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }

  // ── An import that fails ─────────────────────────────────────────────
  {
    const { p, errors, phone } = await open(W, "room")
    await p.evaluate(() => { window.__xhrMode = "error" })
    const input = await p.$('input[type="file"]')
    await input.uploadFile(zip)
    await sleep(1800)
    const e = await p.evaluate(() => {
      const row = document.querySelector("[data-incoming]")
      const buttons = row ? [...row.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => ({ t: b.textContent.trim() || b.getAttribute("aria-label"), h: Math.round(b.getBoundingClientRect().height) })) : []
      return { state: row?.getAttribute("data-incoming"), text: row?.textContent, buttons, toasts: window.__toasts || [], button: document.querySelector("[data-import-button]").textContent.trim() }
    })
    if (KEEP) await p.screenshot({ path: KEEP.replace(/(\.png)?$/, `-${W}-failed.png`) })
    expect(e.state === "error" && /Invalid zip file/.test(e.text || ""), `a failed import keeps its row and says why (${e.state})`)
    expect(e.buttons.some((b) => b.t === "Try again") && e.toasts.includes("Invalid zip file"), `  with Try again, and a toast: ${e.buttons.map((b) => `${b.t} ${b.h}px`).join(", ")}; ${JSON.stringify(e.toasts)}`)
    if (phone) expect(e.buttons.every((b) => b.h >= 44), "  its buttons are 44px or taller on a phone")
    expect(e.button === "Import theme", `  and Import is ready again ("${e.button}")`)
    await p.evaluate(() => { window.__xhrMode = "ok" })
    await p.evaluate(() => [...document.querySelectorAll("[data-incoming] button")].find((b) => b.textContent.trim() === "Try again" && b.getBoundingClientRect().height > 0).click())
    await sleep(2800)
    const again = await p.evaluate(() => ({ sent: window.__xhrSent, landed: !!document.querySelector('[data-install-row="new-1"]'), placeholder: !!document.querySelector("[data-incoming]") }))
    expect(again.sent === 2 && again.landed && !again.placeholder, `  Try again uploads the same file again and lands (${again.sent} uploads)`)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }

  // ── Nothing live: the website taken offline says so ──────────────────
  {
    const { p, errors, phone } = await open(W, "offline")
    const o = await p.evaluate(() => {
      const card = document.querySelector("[data-live-empty]")
      const again = card ? [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Publish again") : null
      const row = document.querySelector('[data-install-row="live-1"]')
      const said = row ? [...row.querySelectorAll("span")].filter((s) => s.getBoundingClientRect().width > 0).map((s) => s.textContent.trim()) : []
      return {
        state: card?.getAttribute("data-live-empty") ?? null,
        heading: card?.querySelector("h2")?.textContent.trim() ?? null,
        again: again ? Math.round(again.getBoundingClientRect().height) : 0,
        offlineOnRow: said.some((t) => t === "Offline" || /^Offline · Edited/.test(t)),
        draftOnRow: said.some((t) => t === "Draft" || /^Draft · Edited/.test(t)),
      }
    })
    expect(o.state === "offline" && o.heading === "Your website is offline", `the card says the website is offline ("${o.heading}")`)
    expect(o.again >= (phone ? 44 : 40), `  with Publish again, ${o.again}px tall`)
    expect(o.offlineOnRow && !o.draftOnRow, "  and its row says Offline, not Draft")
    await p.evaluate(() => [...document.querySelectorAll("[data-live-empty] button")].find((b) => b.textContent.trim() === "Publish again").click())
    await sleep(500)
    const asked = await p.evaluate(() => document.querySelector('[role="alertdialog"]')?.textContent || "")
    expect(/Publish “Storelib Default”\?/.test(asked), "  Publish again asks first, like every publish")
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }
}

try {
  for (const W of WIDTHS) {
    staticPage(W)
    await livePage(W)
  }
  console.log(broken === 0 ? "\nall measured, nothing out\n" : `\n${broken} measurement(s) out\n`)
} finally {
  await browser.close()
  server.close()
  rmSync(out, { recursive: true, force: true })
  rmSync(stubs, { recursive: true, force: true })
}
process.exit(broken === 0 ? 0 : 1)
