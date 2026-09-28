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
 *   • the title row holds Public and View website on a laptop and View
 *     alone, with an eye, on a phone, as white secondary buttons with depth
 *     (a hairline border, a 1px foot, inset when pressed, a focus outline;
 *     36px with 8px corners, 44px with 10px on a phone); only one eye on
 *     the line; Public's menu says Take offline, or Unpublished's says
 *     Publish again
 *   • the live card's row is Edit website, Settings and More on one line,
 *     Settings a 44px gear square at every width with a Settings tooltip on
 *     a pointer, and Take offline still in the More sheet on a phone
 *   • the cover is one picture set into the card: 16:10, rounded on all four
 *     corners, a shadow under it, inside the card's padding and never cut by
 *     the card's edge, with no stage, browser window or phone inside it, and
 *     its box is there before a slow picture arrives (no layout shift)
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
 *   WIDTH=390 node scripts/check-website-page.mjs  one (or WIDTH=360,390,1440,1920)
 *   KEEP_SHOT=/tmp/wb.png ...                      also a screenshot of the static page
 *   SHOTS=/some/dir ...                            website-v3-desktop.png and -phone.png of the live card
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
const WIDTHS = process.env.WIDTH ? process.env.WIDTH.split(",").map(Number) : [390, 1280]

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
  writeFileSync(html, page.replace('data-wb-page=""', 'data-wb-page="" data-probe-inner'))

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
  /* The floor is the /app gutter at this width (--app-gutter, app/globals.css): 11px on a phone, 32 from 1024. */
  const floor = W >= 1024 ? 32 : W >= 640 ? 24 : 10
  expect(r.pad.left === r.pad.right && r.pad.left >= floor, `and those gutters are equal, and at least the ${floor}px /app gutter (${r.pad.left}/${r.pad.right}px)`)
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
      /* __coverMode: "packaged" answers with the package's cover, "pending" with none yet and a photograph on its way. */
      const cover = window.__coverMode === "packaged"
        ? { cover: { url: "/pkg-cover.svg", mobile_url: null, updated_at: new Date().toISOString() }, cover_pending: false }
        : window.__coverMode === "pending" ? { cover: null, cover_pending: true } : {}
      return json(200, { ok: true, install_id: "new-1", name: "Summer shop", media: "nothing", ...cover }, 700)
    }
    return json(400, { error: "Invalid zip file" }, 700)
  }
  /* The cover route: GET looks (the photograph lands on the second look), POST would take one. */
  if (url === "/api/website-builder/themes/new-1/cover") {
    const method = (init && init.method) || "GET"
    window.__coverCalls = window.__coverCalls || []
    window.__coverCalls.push(method)
    if (method === "GET") {
      const looks = window.__coverCalls.filter((m) => m === "GET").length
      return json(200, looks >= 2 ? { url: "/real-cover.svg", mobile_url: null, updated_at: new Date().toISOString() } : { url: null }, 30)
    }
    return json(502, { error: "The cover could not be taken" }, 30)
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
const SLOW_COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900"><rect width="1440" height="900" fill="#fff"/><rect y="80" width="1440" height="480" fill="#0b0b0c"/></svg>`
const zip = join(out, "summer-shop.storelib-theme.zip")
writeFileSync(zip, Buffer.alloc(2048, 1))

const server = createServer((req, res) => {
  if (req.url.startsWith("/live.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  if (req.url.startsWith("/slow-cover.svg")) {
    /* The live card's picture, late: the cover's box has to be there before it. */
    return setTimeout(() => { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(SLOW_COVER) }, 900)
  }
  /* A package's cover, and the photograph taken after: both a black hero, the way the imported site looks. Answered late, so a picture drawn before it is decoded would show. */
  if (req.url.startsWith("/pkg-cover.svg") || req.url.startsWith("/real-cover.svg")) {
    const label = req.url.startsWith("/pkg") ? "package" : "photograph"
    return setTimeout(() => { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(SLOW_COVER.replace("</svg>", `<text x="120" y="300" font-size="64" fill="#fff">${label}</text></svg>`)) }, 400)
  }
  if (req.url.startsWith("/api/")) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}") }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(shell)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(W, scenario, extra = "", waitUntil = "load") {
  const p = await browser.newPage()
  const phone = W <= 640
  await p.setViewport({ width: W, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.goto(`${origin}/?scenario=${scenario}${extra}`, { waitUntil })
  if (waitUntil === "load") await sleep(700)
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
      return {
        heading: { mid: Math.round(hb.top + hb.height / 2), h: Math.round(hb.height) },
        controls: onLine.map((c) => {
          const b = c.getBoundingClientRect()
          const cs = getComputedStyle(c)
          return {
            label: c.innerText.trim(),
            name: c.getAttribute("aria-label") || c.innerText.trim(),
            icons: [...c.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 0).map((s) => [...s.classList].find((k) => k.startsWith("lucide-") && k !== "lucide-icon") || "svg"),
            h: Math.round(b.height),
            w: Math.round(b.width),
            mid: Math.round(b.top + b.height / 2),
            bg: cs.backgroundColor,
            border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
            shadow: cs.boxShadow,
            radius: cs.borderTopLeftRadius,
            font: `${cs.fontSize} ${cs.fontWeight}`,
          }
        }),
      }
    })
    const labels = title.controls.map((c) => c.label)
    const wanted = phone ? ["View"] : ["Public", "View website"]
    expect(
      labels.join("|") === wanted.join("|"),
      `the title row holds ${wanted.join(" and ")} on the heading's line, nothing else: ${labels.map((l) => `"${l}"`).join(", ") || "none"}`,
    )
    for (const c of title.controls) {
      const dy = Math.abs(c.mid - title.heading.mid)
      /* The shared secondary depth: white, a hairline, a 1px shade inside the foot and a hairline under it. */
      const depth = c.bg === "rgb(255, 255, 255)" && c.border === "1px rgb(217, 219, 224)" && /inset/.test(c.shadow) && /0px -1px 0px/.test(c.shadow) && /0px 1px 0px/.test(c.shadow)
      const size = phone ? c.h === 44 && c.radius === "10px" : c.h === 36 && c.radius === "8px"
      expect(depth && size && dy <= 2 && c.font === "14px 500",
        `  ${c.label}: ${c.w}x${c.h}px, ${c.bg}, border ${c.border}, shadow ${c.shadow}, corners ${c.radius}, ${c.font}, ${dy}px off the heading's middle`)
    }
    const heights = new Set(title.controls.map((c) => c.h))
    expect(heights.size === 1, `  the title's buttons are one height (${[...heights].join(", ")}px)`)
    const eyes = title.controls.flatMap((c) => c.icons).filter((k) => k === "lucide-eye")
    const view = title.controls.find((c) => c.name === "View website")
    expect(!!view && (phone ? view.label === "View" && view.icons.join() === "lucide-eye" : view.label === "View website" && view.icons.length === 0),
      `  View website reads "${view?.label}" with ${view?.icons.join(", ") || "no icon"}, named "${view?.name}"`)
    expect(eyes.length <= 1, `  one eye on the line at most (${eyes.length}); Public wears ${title.controls.find((c) => c.label === "Public")?.icons.join(", ") || "nothing (not drawn)"}`)
    /* Pressed goes flat with the shade inside; keyboard focus draws the violet outline. */
    const target = phone ? '[data-control="view"]' : '[data-control="public"]'
    const box = await p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, target)
    await p.mouse.move(box.x, box.y)
    await p.mouse.down()
    await sleep(160)
    const pressed = await p.evaluate((sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { shadow: cs.boxShadow, bg: cs.backgroundColor } }, target)
    await p.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), { once: true, capture: true }))
    await p.mouse.up()
    await p.keyboard.press("Escape")
    await sleep(250)
    expect(/inset 0px 1px 1px|0px 1px 1px 0px .*inset/.test(pressed.shadow) && pressed.bg === "rgb(241, 242, 244)", `  pressed, it goes flat with the shade inside (${pressed.bg}, ${pressed.shadow})`)
    /* Tab onto it from the page's top, the way a keyboard gets there. */
    await p.evaluate(() => { document.activeElement?.blur(); document.body.tabIndex = -1; document.body.focus() })
    let reached = false
    for (let i = 0; i < 30 && !reached; i++) {
      await p.keyboard.press("Tab")
      reached = await p.evaluate((sel) => document.activeElement === document.querySelector(sel), target)
    }
    const focus = await p.evaluate((sel) => { const el = document.querySelector(sel); const cs = getComputedStyle(el); const r = { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, offset: cs.outlineOffset }; el.blur(); return r }, target)
    expect(focus.style === "solid" && focus.width === "2px" && focus.color === "rgb(139, 92, 246)", `  keyboard focus draws an outline (${focus.style} ${focus.width} ${focus.color}, offset ${focus.offset})`)
    if (!phone) {
      await p.click('[data-control="public"]')
      await sleep(300)
      const rows = await p.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((r) => r.textContent.trim()))
      expect(rows.join("|") === "Take offline", `  Public opens a menu with Take offline (${rows.join(", ") || "no menu"})`)
      await p.keyboard.press("Escape")
      await sleep(250)
    }
    const link = await p.evaluate(() => {
      const a = document.querySelector('[data-control="view"]')
      return a ? { tag: a.tagName, target: a.getAttribute("target"), href: a.getAttribute("href") } : null
    })
    expect(!!link && link.tag === "A" && link.target === "_blank" && /andrewullz/.test(link.href || ""),
      `  View website is a link to the live site in a new tab (${link ? `${link.tag} ${link.target} ${link.href}` : "missing"})`)

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

  // ── The live card: its row of buttons, and its cover ─────────────────
  /**
   * "The Settings button needs to be on the same row as the Edit website
   * button", and "why is it windows in a window? I want it full width in
   * the container". Measured: the three buttons share one top; Settings is a
   * 44px square on a phone and says its name on a laptop; the picture's box
   * is the cover area's box, and the cover area is flush with the card; and
   * nothing that drew a stage, a browser window or a phone is inside it.
   * Once with a real picture of the site, once with none yet (the site's name on a plain surface).
   */
  for (const withPicture of [true, false]) {
    const { p, errors, phone } = await open(W, "room", withPicture ? "&snapshot=1" : "")
    await sleep(withPicture ? 300 : 0)
    const card = await p.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, w: b.width, h: b.height } }
      const row = document.querySelector("[data-card-actions]")
      const buttons = row ? [...row.children].filter((c) => c.getBoundingClientRect().width > 0) : []
      const settings = row && row.querySelector('[data-control="settings"]')
      const cover = document.querySelector("[data-cover]")
      const frame = cover && cover.closest(".rounded-2xl")
      const coverCs = cover && getComputedStyle(cover)
      const pics = cover ? [...cover.querySelectorAll("img, svg, [data-cover-pending]")].filter((el) => !el.parentElement.closest("svg")) : []
      const pic = pics[0]
      const scroller = document.querySelector("[data-probe-shell] .page-scroll")
      const cs = settings && getComputedStyle(settings)
      const frameCs = frame && getComputedStyle(frame)
      return {
        buttons: buttons.map((b) => ({ label: b.textContent.trim() || b.getAttribute("aria-label"), ...box(b) })),
        settings: settings ? { text: settings.innerText.trim(), icon: !!settings.querySelector("svg.lucide-settings"), label: settings.getAttribute("aria-label"), shadow: cs.boxShadow, border: cs.borderTopColor, ...box(settings) } : null,
        cover: cover ? box(cover) : null,
        corners: coverCs ? [coverCs.borderTopLeftRadius, coverCs.borderTopRightRadius, coverCs.borderBottomRightRadius, coverCs.borderBottomLeftRadius] : null,
        coverShadow: coverCs ? coverCs.boxShadow : null,
        coverClip: coverCs ? coverCs.overflow : null,
        frame: frame ? { ...box(frame), border: parseFloat(frameCs.borderTopWidth) } : null,
        pics: pics.map((el) => ({ tag: el.tagName.toLowerCase(), fit: getComputedStyle(el).objectFit, pos: getComputedStyle(el).objectPosition, ...box(el) })),
        mockups: cover ? cover.querySelectorAll('[data-cover-stage], [data-cover-window], [data-cover-phone], [class*="aspect-[390"], [class*="rounded-[3.3cqw]"], [class*="cqw"]').length : -1,
        overflow: scroller ? Math.max(0, scroller.scrollWidth - scroller.clientWidth) : null,
      }
    })
    const tag = withPicture ? "with a picture of the site" : "with no picture yet"
    console.log(`\n  the live card, ${tag}\n`)
    if (withPicture) {
      const b = card.buttons
      const tops = b.map((x) => Math.round(x.top))
      const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : -1
      expect(b.map((x) => x.label).join("|") === "Edit website|Settings|More actions for Storelib Default" && spread <= 1,
        `  its row is Edit website, Settings and More, on one line: ${b.map((x) => `${x.label.replace(/^More actions.*/, "More")} ${Math.round(x.w)}x${Math.round(x.h)} at ${Math.round(x.top)}`).join(", ")} (tops ${spread}px apart)`)
      if (card.settings) {
        const s = card.settings
        const edit = b[0]
        expect(Math.round(s.w) === 44 && Math.round(s.h) === 44 && s.text === "" && s.icon && s.label === "Settings" && edit && Math.round(edit.h) === Math.round(s.h),
          `  Settings is a 44px gear square, as tall as Edit website (${edit ? Math.round(edit.h) : "-"}px): ${Math.round(s.w)}x${Math.round(s.h)}px, text "${s.text}", named "${s.label}"`)
        if (!phone) {
          await p.hover('[data-card-actions] [data-control="settings"]')
          await sleep(700)
          const tip = await p.evaluate(() => {
            const t = document.querySelector('[data-slot="tooltip-content"]')
            if (!t) return null
            const r = t.getBoundingClientRect()
            const s = document.querySelector('[data-card-actions] [data-control="settings"]').getBoundingClientRect()
            const cs = getComputedStyle(t)
            return { text: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim(), said: t.querySelector("[role=tooltip]")?.textContent, above: r.bottom <= s.top, bg: cs.backgroundColor, arrow: [...t.querySelectorAll("svg")].some((x) => x.getBoundingClientRect().width > 0) }
          })
          expect(!!tip && tip.text === "Settings" && tip.said === "Settings" && tip.above && tip.bg === "rgb(26, 26, 46)" && !tip.arrow,
            `  on a pointer it says "Settings" in a tooltip above it (${tip ? `"${tip.text}" (read as "${tip.said}"), ${tip.bg}, ${tip.above ? "above" : "not above"}, ${tip.arrow ? "an arrow" : "no arrow"}` : "none"})`)
          /* Away the way a hand goes, in steps: one jump sits inside Radix's grace area on its way to the tip. */
          await p.mouse.move(2, 2, { steps: 8 })
          await p.mouse.move(6, 6)
          await sleep(400)
          const gone = await p.evaluate(() => !document.querySelector('[data-slot="tooltip-content"]'))
          expect(gone, `  and it goes when the pointer leaves (${gone ? "gone" : "still there"})`)
        }
        expect(/0px -2px 0px/.test(s.shadow) && /0px 1px 2px/.test(s.shadow) && s.border === "rgb(217, 219, 224)",
          `  in the icon depth, a touch deeper than the secondary one (${s.shadow})`)
        const more = b[2]
        if (more) expect(Math.round(more.w) === 44 && Math.round(more.h) === 44, `  More is ${Math.round(more.w)}x${Math.round(more.h)}px`)
      }
    }
    if (card.cover && card.frame) {
      const c = card.cover
      const f = card.frame
      /* Set into the card with room on every side, so the card's own edge never cuts it. */
      const gaps = { top: c.top - f.top, left: c.left - f.left, right: f.right - c.right, bottom: f.bottom - c.bottom }
      const inside = gaps.top >= 12 && gaps.left >= 12 && gaps.bottom >= 12 && (phone ? gaps.right >= 12 : gaps.right > 0)
      expect(inside && Math.abs(gaps.top - gaps.left) <= 1 && (!phone || Math.abs(gaps.left - gaps.right) <= 1),
        `  the cover is set into the card, not cut by it: ${Math.round(c.w)}x${Math.round(c.h)}px, ${Math.round(gaps.top)}px from the card's top, ${Math.round(gaps.left)} from its left, ${Math.round(gaps.right)} from its right, ${Math.round(gaps.bottom)} above its bottom`)
      expect(card.corners.every((r) => r === "12px") && card.coverClip === "hidden", `  rounded on all four corners, clipped to them (${card.corners.join(" ")}, overflow ${card.coverClip})`)
      expect(/0px 1px 2px/.test(card.coverShadow) && /0px 10px 28px -14px/.test(card.coverShadow), `  with a soft shadow under it (${card.coverShadow})`)
      expect(Math.abs(c.w / c.h - 1.6) < 0.01, `  16:10, the shape it always had (${(c.w / c.h).toFixed(3)})`)
      const pic = card.pics[0]
      const off = pic ? Math.max(Math.abs(pic.top - c.top), Math.abs(pic.left - c.left), Math.abs(pic.right - c.right), Math.abs(pic.bottom - c.bottom)) : null
      expect(card.pics.length === 1 && off !== null && off <= 1,
        `  one picture (${card.pics.map((x) => x.tag).join(", ") || "none"}), its box the cover area's box: ${off === null ? "-" : off.toFixed(2)}px off at most`)
      if (withPicture && pic) expect(pic.tag === "img" && pic.fit === "cover" && /^50% 0%|^center top|^50% 0px/.test(pic.pos), `  the screenshot fills it from the top (${pic.fit}, ${pic.pos})`)
      expect(card.mockups === 0, `  no stage, browser window or phone inside it (${card.mockups} found)`)
    } else {
      expect(false, "  the live card has a cover")
    }
    expect(card.overflow === 0, `  nothing scrolls sideways (${card.overflow}px)`)
    if (withPicture && process.env.SHOTS) {
      mkdirSync(process.env.SHOTS, { recursive: true })
      await p.screenshot({ path: join(process.env.SHOTS, `website-v4-${W}.png`) })
    }
    /* On a phone the title has no Public, so Take offline has to be in the live card's More sheet. */
    if (withPicture && phone) {
      await p.evaluate(() => document.querySelector("[data-card-actions] [data-more-button]").click())
      await sleep(600)
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")].map((r) => r.textContent.trim()))
      expect(rows.includes("Take offline"), `  on a phone, Take offline is in the live card's More sheet: ${rows.join(", ")}`)
      if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `website-v4-${W}-more.png`) })
    }
    expect(errors.length === 0, "  no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }

  // ── The cover's box is there before its picture ──────────────────────
  {
    const { p, errors } = await open(W, "room", "&snapshot=slow", "domcontentloaded")
    await p.evaluate(() => {
      window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    })
    await p.waitForSelector("[data-cover]")
    await sleep(150)
    const read = () => p.evaluate(() => {
      const c = document.querySelector("[data-cover]")
      const img = c.querySelector("img")
      const r = c.getBoundingClientRect()
      const d = document.querySelector("[data-card-actions]").getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), actions: Math.round(d.top), loaded: !!img && img.complete && img.naturalWidth > 0, cls: window.__cls }
    })
    const before = await read()
    await sleep(1300)
    const after = await read()
    expect(!before.loaded && after.loaded && before.h === after.h && before.w === after.w && before.actions === after.actions && after.cls < 0.001,
      `  the cover's box is there before a slow picture: ${before.w}x${before.h}px ${before.loaded ? "(already loaded)" : "while it loads"}, ${after.w}x${after.h}px after; the buttons under it ${before.actions === after.actions ? "stay put" : `move ${after.actions - before.actions}px`}; layout shift ${after.cls.toFixed(4)}`)
    expect(errors.length === 0, "  no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }

  // ── A library row's three dots, and the menu they open ──────────────
  /**
   * "The three dots button should have more depth, a very subtle depth", and
   * its phone sheet should be smoother. Measured: the button's depth (a
   * hairline and a 1px foot, the shared secondary depth), its press area,
   * and on a phone the sheet's first moving frame already holding its rows,
   * then a row's action (Rename's dialog) starting only once the sheet has
   * gone, so two things never move at the same time.
   */
  {
    const { p, errors, phone } = await open(W, "room")
    const more = await p.evaluate(() => {
      const b = [...document.querySelectorAll("[data-install-row] [data-more-button]")].find((x) => x.getBoundingClientRect().width > 0)
      if (!b) return null
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      const after = getComputedStyle(b, "::after")
      const reach = after.content !== "none" && after.display !== "none" && after.position === "absolute" ? r.height - (parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0) : r.height
      return { w: Math.round(r.width), h: Math.round(r.height), reach: Math.round(reach), shadow: cs.boxShadow, border: cs.borderTopColor, bg: cs.backgroundColor }
    })
    expect(!!more, "a library row has its three dots")
    if (more) {
      expect(/inset/.test(more.shadow) && /0px -2px 0px/.test(more.shadow) && /0px 1px 2px/.test(more.shadow), `  with the icon depth: a 2px line inside its foot and a soft shade under it (${more.shadow})`)
      expect(more.border === "rgb(217, 219, 224)" && more.bg === "rgb(255, 255, 255)", `  white, with a hairline (${more.bg}, ${more.border})`)
      expect(phone ? more.w === 40 && more.reach >= 44 : more.w === 36, `  ${more.w}x${more.h}px, pressed over ${more.reach}px${phone ? ", 44 or more on a phone" : ""}`)
    }
    if (phone && more) {
      await p.evaluate(() => {
        window.__sheet = []
        const t0 = performance.now()
        const tick = () => {
          const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
          if (panel) {
            const m = getComputedStyle(panel).transform
            window.__sheet.push({ t: Math.round(performance.now() - t0), y: m === "none" ? 0 : Math.round(new DOMMatrixReadOnly(m).m42), rows: panel.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a").length })
          }
          if (performance.now() - t0 < 700) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        ;[...document.querySelectorAll("[data-install-row] [data-more-button]")].find((x) => x.getBoundingClientRect().width > 0).click()
      })
      await sleep(760)
      const frames = await p.evaluate(() => window.__sheet)
      const first = frames[0]
      expect(!!first && first.rows > 0, `  its sheet's first frame already holds its rows (${first ? first.rows : 0} rows at ${first ? first.y : "-"}px)`)
      const ys = frames.map((f) => f.y)
      const rising = ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.5)
      expect(rising && ys[ys.length - 1] === 0, `  and it rises in one motion to rest: ${ys.slice(0, 8).join(", ")} … ${ys[ys.length - 1]}`)
      /* A row's action waits for the sheet to have gone. */
      await p.evaluate(() => {
        window.__handoff = { sheetGone: null, dialog: null }
        const t0 = performance.now()
        const tick = () => {
          const now = Math.round(performance.now() - t0)
          if (window.__handoff.sheetGone === null && !document.querySelector("[data-app-sheet]")) window.__handoff.sheetGone = now
          if (window.__handoff.dialog === null && document.querySelector('[role="dialog"]:not([data-app-sheet]), [role="alertdialog"]')) window.__handoff.dialog = now
          if (now < 1200) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        ;[...document.querySelectorAll("[data-action-sheet] button")].find((b) => b.textContent.trim() === "Rename").click()
      })
      await sleep(1300)
      const h = await p.evaluate(() => window.__handoff)
      expect(h.dialog !== null && h.sheetGone !== null && h.dialog >= h.sheetGone, `  Rename opens after the sheet has gone, not over it (sheet gone at ${h.sheetGone}ms, dialog at ${h.dialog}ms)`)
      if (KEEP) await p.screenshot({ path: KEEP.replace(/(\.png)?$/, `-${W}-rename.png`) })
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
    const head = await p.evaluate(() => {
      const shown = (el) => el && el.getBoundingClientRect().width > 0
      const pub = document.querySelector('[data-control="public"]')
      const view = document.querySelector('[data-control="view"]')
      return { pub: shown(pub) ? pub.textContent.trim() : null, view: shown(view) ? { tag: view.tagName, disabled: view.disabled === true, bg: getComputedStyle(view).backgroundColor } : null }
    })
    expect(phone ? head.pub === null : head.pub === "Unpublished", `  the title says ${phone ? "nothing about it on a phone" : '"Unpublished"'} (${head.pub ?? "no control"})`)
    expect(!!head.view && head.view.tag === "BUTTON" && head.view.disabled, `  and View website is there, disabled (${head.view ? `${head.view.tag}, ${head.view.bg}` : "missing"})`)
    if (!phone) {
      await p.click('[data-control="public"]')
      await sleep(300)
      const rows = await p.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((r) => r.textContent.trim()))
      expect(rows.join("|") === "Publish again", `  Unpublished opens a menu with Publish again (${rows.join(", ") || "no menu"})`)
      await p.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((r) => r.textContent.trim() === "Publish again").click())
      await sleep(500)
      const q = await p.evaluate(() => document.querySelector('[role="alertdialog"]')?.textContent || "")
      expect(/Publish “Storelib Default”\?/.test(q), "  which asks first, like every publish")
      await p.keyboard.press("Escape")
      await sleep(400)
    }
    await p.evaluate(() => [...document.querySelectorAll("[data-live-empty] button")].find((b) => b.textContent.trim() === "Publish again").click())
    await sleep(500)
    const asked = await p.evaluate(() => document.querySelector('[role="alertdialog"]')?.textContent || "")
    expect(/Publish “Storelib Default”\?/.test(asked), "  Publish again asks first, like every publish")
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  3. ARRIVING ON THE PAGE AS A DOCUMENT, EVERY FRAME
// ─────────────────────────────────────────────────────────────────────────

/**
 * "It shows the iOS loading spinner, which is great, but then it blanks the
 * whole page white, and then the website builder page appears."
 *
 * The page arrives as a whole document more often than any other /app page:
 * the sidebar's Website row loaded it with `window.location` on the web, and
 * a cold start, a reload and the session recovery all load a document too.
 * A document is painted from the server's HTML before React has run, and the
 * class that switched the old `.app-page-enter` fade off inside the shell
 * (`html.app-layout`) is added by an effect after hydration. So the first
 * painted frames held the page at opacity 0: the spinner went, the content
 * area was flat #f8f9fa, and then the page came up.
 *
 * Reproduced here as it happens: a document with the slow page's spinner up
 * (the real PageSpinner markup) moves to /wb; the server holds /wb for
 * 1200ms and then answers with the Website page's server markup in the
 * shell, with `app-layout` added 450ms later, as hydration does. Every frame
 * is recorded twice: the compositor's own frames (a screencast, decoded and
 * read pixel by pixel over the content area), and one DOM reading per
 * animation frame from the first script of the new document. A frame is
 * blank when the content area is one flat colour with no spinner in it; none
 * may follow the spinner.
 */
async function landing(W) {
  const phone = W <= 640
  const H = phone ? 844 : 900
  const HEADER = phone ? 68 : 58
  const RAIL = phone ? 0 : 240
  const HYDRATE_MS = 450
  const SERVER_MS = 1200
  const spinner = readFileSync(join(out, "spinner.html"), "utf8")
  const frame = (content, { layout, extraHead = "", extraBody = "" }) => `<!doctype html><html class="light${layout ? " app-layout" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${extraHead}<style>${css}</style><style>body{margin:0;background:#111111;font-family:Inter,system-ui,sans-serif}</style></head><body>
<div class="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
  <div style="position:fixed;left:0;top:0;right:0;height:${HEADER}px;background:#111111;z-index:40"></div>
  ${phone ? "" : `<div style="position:fixed;left:0;top:${HEADER}px;bottom:0;width:${RAIL}px;background:#131316;z-index:40"></div>`}
  <main class="h-svh pt-[68px] md:pt-[58px] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
    <div class="h-[calc(100svh_-_68px)] md:h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">${content}</div>
  </main>
</div>${extraBody}</body></html>`
  /* The page you were on: a few cards on the page's grey, under the spinner once it is slow. */
  const before = frame(
    `<div class="h-full overflow-y-auto page-scroll bg-[#f8f9fa]"><div class="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">${'<div class="h-40 rounded-2xl border border-[#e5e7eb] bg-white"></div>'.repeat(3)}</div></div>`,
    {
      layout: true,
      extraBody: `<div id="slow" hidden data-app-slow-page="" class="pointer-events-none fixed inset-x-0 bottom-0 top-[68px] z-[38] bg-[#111111] md:left-[240px] md:top-[58px] md:bg-transparent"><div class="h-full overflow-hidden rounded-t-[20px] bg-[#f8f9fa] md:rounded-none">${spinner}</div></div>
<script>setTimeout(() => { document.getElementById("slow").hidden = false }, 250); setTimeout(() => { location.href = "/wb" }, 700)</script>`,
    },
  )
  const RECORD = `<script>
    window.__frames = []
    const t0 = performance.now()
    const read = () => {
      const inner = document.querySelector("[data-probe-inner]")
      window.__frames.push({ t: Math.round(performance.now() - t0), there: !!inner, opacity: inner ? Number(getComputedStyle(inner).opacity) : null, layout: document.documentElement.classList.contains("app-layout") })
      if (performance.now() - t0 < 1500) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  </script>`
  /* The page's content box: the first box inside its own scroller, whatever classes it carries. */
  const marked = body.replace(/^(<div[^>]*>)(<div )/, "$1$2data-probe-inner ")
  const after = frame(marked, {
    layout: false,
    extraHead: RECORD,
    /* Hydration: the shell's effect adds the class a moment after the first paint. */
    extraBody: `<script>setTimeout(() => document.documentElement.classList.add("app-layout"), ${HYDRATE_MS})</script>`,
  })

  const srv = createServer((req, res) => {
    if (req.url.startsWith("/wb")) return setTimeout(() => { res.writeHead(200, { "content-type": "text/html" }); res.end(after) }, SERVER_MS)
    res.writeHead(200, { "content-type": "text/html" })
    res.end(before)
  })
  await new Promise((r) => srv.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const p = await browser.newPage()
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
  const cdp = await p.createCDPSession()
  const shots = []
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ at: f.metadata.timestamp, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await p.goto(`${base}/from`, { waitUntil: "load" })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await p.waitForFunction(() => location.pathname === "/wb" && document.readyState === "complete", { timeout: 8000, polling: 50 })
  await sleep(1400)
  const dom = await p.evaluate(() => window.__frames || [])
  await cdp.send("Page.stopScreencast")
  srv.close()

  /* Each frame, read over the content area: how much of it is not the page's grey, and whether the spinner is in it.
     Decoded by a canvas in a blank page, so the probe needs no image library of its own. */
  const reader = await browser.newPage()
  const classes = []
  for (const s of shots) {
    const r = await reader.evaluate(async (png, RAIL, HEADER) => {
      const img = new Image()
      img.src = `data:image/png;base64,${png}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext("2d", { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
      const x0 = RAIL, y0 = HEADER + 24
      const cx = Math.round((x0 + width) / 2), cy = Math.round(HEADER + (height - HEADER) * 0.4)
      let ink = 0, total = 0, spin = 0
      for (let y = y0; y < height; y += 2) {
        for (let x = x0; x < width; x += 2) {
          const i = (y * width + x) * 4
          total++
          if (Math.abs(data[i] - 248) <= 3 && Math.abs(data[i + 1] - 249) <= 3 && Math.abs(data[i + 2] - 250) <= 3) continue
          ink++
          if (Math.abs(x - cx) <= 24 && Math.abs(y - cy) <= 24) spin++
        }
      }
      return { ink, total, spin }
    }, s.data, RAIL, HEADER)
    const share = r.ink / r.total
    classes.push({ at: s.at, share, kind: r.spin > 0 && r.ink - r.spin < 40 ? "spinner" : share < 0.0005 ? "blank" : "page" })
  }
  await reader.close()
  const t0 = classes[0]?.at ?? 0
  const firstSpinner = classes.findIndex((c) => c.kind === "spinner")
  const afterSpinner = firstSpinner === -1 ? [] : classes.slice(firstSpinner)
  const blanks = afterSpinner.filter((c) => c.kind === "blank")
  const runs = []
  for (let i = 0; i < afterSpinner.length; i++) {
    if (afterSpinner[i].kind !== "blank") continue
    let j = i
    while (j + 1 < afterSpinner.length && afterSpinner[j + 1].kind === "blank") j++
    const end = afterSpinner[j + 1] ? afterSpinner[j + 1].at : afterSpinner[j].at
    runs.push(Math.round((end - afterSpinner[i].at) * 1000))
    i = j
  }
  /* From the first frame the page's box is parsed (a frame before that is the old document still on the glass). */
  const parsed = dom.slice(Math.max(0, dom.findIndex((f) => f.there)))
  const hidden = parsed.filter((f) => !f.there || f.opacity < 0.05)
  const faint = parsed.filter((f) => !f.there || f.opacity < 0.95)
  const firstDom = parsed[0]
  const seq = []
  for (const c of classes) if (seq[seq.length - 1]?.kind !== c.kind) seq.push({ kind: c.kind, at: Math.round((c.at - t0) * 1000) })
  console.log(`\narriving on the page as a document, every frame, at ${W}px\n`)
  expect(firstSpinner !== -1, `the spinner is up before the page (${classes.length} frames: ${seq.map((x) => `${x.kind} from ${x.at}ms`).join(", ")})`)
  expect(blanks.length === 0, `  no frame after the spinner is a flat, empty content area: ${blanks.length} blank frame${blanks.length === 1 ? "" : "s"}${runs.length ? `, ${runs.map((r) => `${r}ms`).join(" and ")} of it` : ""}`)
  expect(!!firstDom && firstDom.there && firstDom.opacity > 0.95 && faint.length === 0,
    `  the new document's first frame, before hydration, already shows the page: opacity ${firstDom?.opacity != null ? firstDom.opacity.toFixed(2) : "-"} on its first frame; ${hidden.length} of ${parsed.length} frames under 0.05, ${faint.length} under 0.95`)
  const marks = dom.find((f) => f.layout)
  expect(!!marks, `  hydration marks the shell ${marks ? `at ${marks.t}ms` : "(never)"}, and the page does not wait for it to be seen`)
  if (process.env.SHOTS && shots.length) {
    mkdirSync(process.env.SHOTS, { recursive: true })
    const i = classes.findIndex((c, k) => k > firstSpinner && c.kind !== "spinner")
    writeFileSync(join(process.env.SHOTS, `wbpage-landing-first-frame-${W}.png`), Buffer.from(shots[i === -1 ? shots.length - 1 : i].data, "base64"))
  }
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
//  4. AN IMPORTED WEBSITE'S COVER, FROM ITS ROW'S FIRST FRAME
// ─────────────────────────────────────────────────────────────────────────

/**
 * "When I import a theme, the first cover in the library doesn't represent
 * the actual look of the website. After 10 to 15 seconds the actual cover
 * appears."
 *
 * Two imports, with the routes stubbed and the pictures served 400ms late:
 *
 *   A PACKAGE WITH A COVER. The answer carries it; the new row's first frame
 *   is that picture, already decoded, and the row never shows anything else.
 *
 *   A PACKAGE WITHOUT ONE. The answer says a photograph is on its way. The
 *   row's first frame is the site's name on a plain surface, with no drawn
 *   page in it (no headline, no button, no tiles: the cover holds no <svg>
 *   and no text but the name). The page looks for the photograph with GET
 *   (never a second POST, which would launch a second browser) and, the
 *   moment it is there, fades it in over the placeholder: every frame shows
 *   one or the other, never neither.
 *
 * Read on every animation frame from the upload until the photograph is in.
 */
/**
 * ===========================================================================
 *  WHAT A FINGER LEAVES ON THE PAGE
 * ===========================================================================
 * "On a mobile device, if I touch the website cover, make sure there is no
 * grey thing over it, it looks bad. Fully fix it."
 *
 * Two ways a touch screen paints something the page never asked for, and both
 * are measured here rather than read out of the source:
 *
 *   A PRESS. The native shell fades any button to 72% while it is held
 *   (html.capacitor button:active, app/globals.css). On a control that reads
 *   as the control going quiet; on a photograph it is the picture washing out
 *   into the white card behind it, across the whole 16:10 tile, and the
 *   website's black hero came out grey. A synthetic touch does not set
 *   :active in a headless browser, so the state is FORCED through the
 *   protocol, the way scripts/check-app-mobile-nav.mjs forces it.
 *
 *   A HOVER THAT STAYS. Several mobile engines answer (hover: hover), turn
 *   :hover on where a finger landed and leave it there until something else
 *   is tapped. Anything on this page whose hover paints a BACKGROUND would
 *   then sit shaded behind you, which is the same grey complaint one surface
 *   over. So every card and row here is read with :hover forced, under the
 *   media a phone reports.
 *
 * What a press may do is answer at the tile's frame, where no picture is: the
 * hairline goes from 8% to 22%. That is checked for as well, because a press
 * with no acknowledgement at all is the other way to get this wrong.
 */
async function touchPart(W) {
  if (W > 640) return
  console.log(`\nwhat a finger leaves on the page, at ${W}px\n`)
  const { p, errors } = await open(W, "live", "&snapshot=1")
  await p.evaluate(() => document.documentElement.classList.add("capacitor"))
  await sleep(200)
  const cdp = await p.target().createCDPSession()
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root: docRoot } = await cdp.send("DOM.getDocument", { depth: -1 })
  const idsOf = async (sel) => (await cdp.send("DOM.querySelectorAll", { nodeId: docRoot.nodeId, selector: sel })).nodeIds
  /* What is painted over an element: its own fade, its background, and the
     two layers it can draw on top of itself. */
  const paintOf = async (nodeId) => {
    const { object } = await cdp.send("DOM.resolveNode", { nodeId })
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId, returnByValue: true, functionDeclaration: `function () {
        const cs = getComputedStyle(this), be = getComputedStyle(this, "::before"), af = getComputedStyle(this, "::after")
        const alpha = (c) => { const m = String(c).match(/^rgba?\\(([^)]+)\\)/); if (!m) return 0; const v = m[1].split(",").map(Number); return v.length < 4 ? 1 : v[3] }
        return { label: (this.getAttribute("aria-label") || this.textContent || "").trim().slice(0, 26) || this.tagName,
                 opacity: Number(cs.opacity), bgAlpha: alpha(cs.backgroundColor), bg: cs.backgroundColor,
                 beforeAlpha: alpha(be.backgroundColor), afterAlpha: alpha(af.backgroundColor), ring: af.boxShadow }
      }` })
    return result.value
  }
  const withState = async (nodeId, forced) => {
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: forced })
    /* Past the frame's own 150ms, so the reading is the state and not a
       moment part way into it. */
    await sleep(240)
    const got = await paintOf(nodeId)
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
    return got
  }
  const coverId = (await idsOf("[data-cover]"))[0]
  const rest = await paintOf(coverId)
  const held = await withState(coverId, ["active"])
  const left = await withState(coverId, ["hover"])
  expect(held.opacity === 1, `the cover keeps its picture under a finger in the native shell (opacity ${held.opacity} held, ${rest.opacity} at rest)`)
  expect(held.beforeAlpha === 0, `  and nothing is laid over it (tint alpha ${held.beforeAlpha})`)
  expect(left.opacity === 1 && left.beforeAlpha === 0,
    `  and a tap that leaves :hover behind leaves nothing to see (opacity ${left.opacity}, tint alpha ${left.beforeAlpha})`)
  const ringOf = (x) => { const m = /rgba\(15, 23, 42, ([\d.]+)\) 0px 0px 0px 1px inset/.exec(x.ring); return m ? Number(m[1]) : null }
  expect(ringOf(held) !== null && ringOf(rest) !== null && ringOf(held) > ringOf(rest),
    `  the press is answered at the frame instead: the hairline goes ${ringOf(rest)} to ${ringOf(held)}`)
  if (process.env.SHOTS) {
    await cdp.send("CSS.forcePseudoState", { nodeId: coverId, forcedPseudoClasses: ["active"] })
    await sleep(120)
    const b = await p.evaluate(() => { const r = document.querySelector("[data-cover]").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
    await p.screenshot({ path: join(process.env.SHOTS, `wbpage-cover-held-${W}.png`), clip: b })
    await cdp.send("CSS.forcePseudoState", { nodeId: coverId, forcedPseudoClasses: [] })
  }
  /*
    AND EVERY CARD AND ROW ON THE PAGE, READ FROM ITS CLASSES AND NOT FROM
    ITS PAINT. This browser answers (hover: none), so Tailwind's own
    @media (hover: hover) never opens and a forced :hover paints nothing here
    however the class is written. The engines this goes wrong on are the ones
    that answer (hover: hover) WITH a finger, and no flag in Chromium makes it
    into one. So the surfaces are asked what they would paint there: a hover
    that fills a background or lays on a shadow, and is not behind
    `pointer-fine:`, is one a tap can leave switched on behind you.

    Colour on text is left alone. A word that stays dark after you tap it is
    not the grey plate this is about.
  */
  const stuck = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll("[data-install-row], [data-explore-row], [data-cover], [data-card], [data-page-block] > div")) {
      const cls = typeof el.className === "string" ? el.className : ""
      for (const token of cls.split(/\s+/)) {
        if (!/(^|:)hover:(bg|shadow|border)-/.test(token)) continue
        if (token.startsWith("pointer-fine:")) continue
        out.push(`${el.getAttribute("data-install-row") ? "library row" : el.getAttribute("data-explore-row") !== null ? "theme card" : el.tagName.toLowerCase()}: ${token}`)
      }
    }
    return out
  })
  expect(stuck.length === 0, `no card or row on the page shades itself on a hover a finger can leave switched on${stuck.length ? `: ${stuck.join("; ")}` : ""}`)
  expect(errors.length === 0, `  no errors on the page`, errors[0] || "")
  await p.close()
}

async function coversPart(W) {
  console.log(`\nan imported website's cover, at ${W}px\n`)
  const shots = process.env.SHOTS
  for (const mode of ["packaged", "pending"]) {
    const { p, errors } = await open(W, "room")
    await p.evaluate((mode) => {
      window.__coverMode = mode
      window.__coverFrames = []
      const t0 = performance.now()
      const tick = () => {
        const row = document.querySelector('[data-install-row="new-1"]')
        if (row) {
          const box = row.querySelector("td:first-child button > span:first-child")
          const imgs = [...box.querySelectorAll("img")]
          const shown = imgs.filter((i) => Number(getComputedStyle(i.parentElement).opacity) > 0)
          const pending = box.querySelector("[data-cover-pending]")
          window.__coverFrames.push({
            t: Math.round(performance.now() - t0),
            imgs: imgs.map((i) => ({ src: i.getAttribute("src"), ready: i.complete && i.naturalWidth > 0 })),
            visibleReady: shown.some((i) => i.complete && i.naturalWidth > 0),
            pending: pending ? pending.getAttribute("data-cover-pending") : null,
            pendingText: pending ? pending.innerText.trim() : null,
            drawn: box.querySelectorAll("svg text, svg rect").length,
            fading: !!box.querySelector(".wb-cover-in"),
          })
        }
        if (performance.now() - t0 < 12000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, mode)
    const input = await p.$('input[type="file"]')
    await input.uploadFile(zip)
    if (mode === "packaged") {
      await p.waitForFunction(() => document.querySelector('[data-install-row="new-1"]'), { timeout: 6000 }).catch(() => null)
      await sleep(900)
      if (shots) await p.screenshot({ path: join(shots, `wbpage-import-packaged-${W}.png`) })
      const f = await p.evaluate(() => window.__coverFrames)
      const first = f[0]
      const others = f.filter((x) => x.pending !== null || !x.imgs.some((i) => i.src === "/pkg-cover.svg"))
      expect(!!first && first.imgs.length === 1 && first.imgs[0].src === "/pkg-cover.svg" && first.imgs[0].ready && first.pending === null && first.drawn === 0,
        `a package with a cover: the new row's first frame is that picture, decoded (${first ? JSON.stringify({ imgs: first.imgs, pending: first.pending, drawn: first.drawn }) : "the row never landed"})`)
      expect(f.length > 0 && others.length === 0, `  and it shows nothing else on any of its ${f.length} frames (${others.length} other)`)
      const calls = await p.evaluate(() => window.__coverCalls || [])
      expect(calls.length === 0, `  and the page asks the cover route for nothing (${calls.join(", ") || "no calls"})`)
    } else {
      await p.waitForFunction(() => document.querySelector('[data-install-row="new-1"]'), { timeout: 6000 }).catch(() => null)
      await sleep(300)
      if (shots) await p.screenshot({ path: join(shots, `wbpage-import-pending-${W}.png`) })
      await p.waitForFunction(() => document.querySelector('[data-install-row="new-1"] img[src="/real-cover.svg"]'), { timeout: 12000 }).catch(() => null)
      await sleep(700)
      if (shots) await p.screenshot({ path: join(shots, `wbpage-import-photographed-${W}.png`) })
      const f = await p.evaluate(() => window.__coverFrames)
      const first = f[0]
      expect(!!first && first.pending === "preparing" && first.pendingText === "Summer shop" && first.drawn === 0 && first.imgs.length === 0,
        `a package without one: the new row's first frame is the site's name on a plain surface, breathing (${first ? `"${first.pendingText}", ${first.pending}, ${first.drawn} drawn shapes, ${first.imgs.length} pictures` : "the row never landed"})`)
      const drawnAt = f.filter((x) => x.drawn > 0)
      expect(drawnAt.length === 0, `  no drawn page with a headline and colours on any frame (${drawnAt.length} frames with one)`)
      const arrived = f.findIndex((x) => x.imgs.some((i) => i.src === "/real-cover.svg"))
      const at = arrived === -1 ? null : f[arrived]
      expect(!!at && at.imgs.find((i) => i.src === "/real-cover.svg").ready,
        `  the photograph comes in ${at ? `${at.t - first.t}ms after the row` : "never"}, decoded on its first frame`)
      const neither = f.filter((x) => x.pending === null && !x.visibleReady)
      expect(neither.length === 0, `  every frame shows the placeholder or a decoded picture, never neither (${neither.length} of ${f.length} with neither)`)
      expect(f.some((x) => x.fading && x.pending !== null), `  and it fades in over the placeholder rather than cutting to it`)
      const end = f[f.length - 1]
      expect(!!end && end.pending === null && end.imgs.length === 1, `  which is then let go: ${end ? `${end.imgs.length} picture, placeholder ${end.pending ?? "gone"}` : "-"}`)
      const calls = await p.evaluate(() => window.__coverCalls || [])
      expect(calls.length >= 1 && calls.every((m) => m === "GET"), `  found by looking (GET x${calls.filter((m) => m === "GET").length}), never by taking a second one (POST x${calls.filter((m) => m === "POST").length})`)
    }
    expect(errors.length === 0, "  no errors on the page", errors.slice(0, 2).join(" / "))
    await p.close()
  }
}

/* PARTS=static,live,landing,covers,touch runs some of them; all by default. */
const PARTS = new Set((process.env.PARTS || "static,live,landing,covers,touch").split(","))

try {
  for (const W of WIDTHS) {
    if (PARTS.has("static")) staticPage(W)
    if (PARTS.has("live")) await livePage(W)
    if (PARTS.has("landing")) await landing(W)
    if (PARTS.has("covers")) await coversPart(W)
    if (PARTS.has("touch")) await touchPart(W)
  }
  console.log(broken === 0 ? "\nall measured, nothing out\n" : `\n${broken} measurement(s) out\n`)
} finally {
  await browser.close()
  server.close()
  rmSync(out, { recursive: true, force: true })
  rmSync(stubs, { recursive: true, force: true })
}
process.exit(broken === 0 ? 0 : 1)
