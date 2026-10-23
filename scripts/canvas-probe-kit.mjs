/**
 * The real editor with an imported theme or a Storelib theme in it, for the
 * canvas probes (scripts/check-canvas-freeze.mjs, check-canvas-toolbar.mjs):
 * the editor bundle from scripts/editor-probe-harness.mjs, served with the
 * theme's own files, in a headless Chromium at 1440x900 with a mouse.
 */
import { createServer } from "node:http"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"

const root = process.cwd()
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The imported theme: Materia, with the scroll locks store themes take ── */

export async function importedTheme() {
  const dir = join(root, "tests/fixtures/shopify-materia")
  const zip = new JSZip()
  const walk = (d, rel) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
      else zip.file(`${rel}${n}`, readFileSync(p))
    }
  }
  walk(dir, "")
  /*
    A MENU DRAWER IN THE HEADER, as Dawn's: opening it puts a class on <body>
    that holds the page (overflow: hidden), closing it takes the class off.
    The drawer is the header section's own markup.
  */
  let header = await zip.file("sections/header.liquid").async("string")
  header = header.replace("</header>", `</header>
<div class="md" data-md aria-hidden="true">
  <div class="md__bg" data-md-close></div>
  <div class="md__panel" role="dialog" aria-label="Menu"><button type="button" class="md__close" data-md-close>Chiudi</button><a href="/pages/about">Chi siamo</a><a href="/collections/all">Negozio</a></div>
</div>`)
  zip.file("sections/header.liquid", header)
  /* A POP-UP, as a newsletter's: it holds the page with an inline style on <html>, opened by a button in the page. */
  let rich = await zip.file("sections/rich-text.liquid").async("string")
  rich = rich.replace('<div class="rt reveal">', '<div class="rt reveal"><button type="button" class="rt__pop" data-pop-open>Iscriviti</button><a class="rt__go" href="/pages/about" data-transition>Scopri di piu</a>')
  zip.file("sections/rich-text.liquid", rich)
  zip.file("sections/newsletter-popup.liquid", `<div class="np" data-np aria-hidden="true"><div class="np__bg" data-np-close></div><div class="np__box" role="dialog" aria-modal="true"><p>Newsletter</p><button type="button" data-np-close>Chiudi</button></div></div>
{% schema %}
{ "name": "Newsletter popup", "settings": [ { "type": "text", "id": "title", "label": "Title", "default": "Newsletter" } ], "presets": [ { "name": "Newsletter popup" } ] }
{% endschema %}`)
  const overlay = JSON.parse(await zip.file("sections/overlay-group.json").async("string"))
  overlay.sections.popup = { type: "newsletter-popup", settings: {} }
  overlay.order.push("popup")
  zip.file("sections/overlay-group.json", JSON.stringify(overlay))
  /* A PAGE TRANSITION, as theme packs ship: the page is held and faded while an overlay plays, and the next page is opened when the overlay's animation ends. */
  let layout = await zip.file("layout/theme.liquid").async("string")
  layout = layout.replace("<main ", '<div class="page-loading-overlay" aria-hidden="true"></div>\n    <main ')
  zip.file("layout/theme.liquid", layout)
  const css = await zip.file("assets/materia.css").async("string")
  zip.file("assets/materia.css", `${css}
body.overflow-hidden { overflow: hidden; }
.md { position: fixed; inset: 0; z-index: 50; visibility: hidden; }
.md.is-open { visibility: visible; }
.md__bg { position: absolute; inset: 0; background: rgba(0,0,0,.4); }
.md__panel { position: absolute; left: 0; top: 0; bottom: 0; width: 320px; background: #fff; display: flex; flex-direction: column; gap: 12px; padding: 24px; }
.np { position: fixed; inset: 0; z-index: 60; display: none; }
.np.is-open { display: block; }
.np__bg { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
.np__box { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); background: #fff; padding: 40px; }
.page-loading-overlay { position: fixed; inset: 0; z-index: 70; background: #fff; opacity: 0; pointer-events: none; }
body.is-leaving { overflow: hidden; }
body.is-leaving .page-loading-overlay { animation: plo .4s forwards; }
@keyframes plo { to { opacity: 1; } }
`)
  const js = await zip.file("assets/materia.js").async("string")
  zip.file("assets/materia.js", `${js}
;(function () {
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest(".hd__burger")) { var d = document.querySelector("[data-md]"); d.classList.add("is-open"); document.body.classList.add("overflow-hidden"); return; }
    if (t.closest("[data-md-close]")) { var d2 = document.querySelector("[data-md]"); if (d2) d2.classList.remove("is-open"); document.body.classList.remove("overflow-hidden"); return; }
    if (t.closest("[data-pop-open]")) { document.querySelector("[data-np]").classList.add("is-open"); document.documentElement.style.overflow = "hidden"; return; }
    if (t.closest("[data-np-close]")) { var p = document.querySelector("[data-np]"); if (p) p.classList.remove("is-open"); document.documentElement.style.overflow = ""; return; }
    var a = t.closest("a[data-transition]");
    if (a) {
      e.preventDefault();
      document.body.classList.add("is-leaving");
      var o = document.querySelector(".page-loading-overlay");
      o.addEventListener("animationend", function () { location.href = a.getAttribute("href"); }, { once: true });
    }
  });
})();
`)
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  /* A second page, for going between two pages and back. */
  if (!pages.page && pages.home) pages.page = pages.home.filter((s) => s.type !== "rich-text")
  return { settings: t.settings, pages, sources, files, all: t.files }
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c636060606000000005000146a53e1a0000000049454e44ae426082", "hex")


/* The page the Storelib theme probes draw: a home page with a product grid and an FAQ, and an About page. */
export const STORELIB_GLOBALS = `window.PROBE_PAGES={home:["header","hero_centered","features_grid","product_grid","text_rich","faq_accordion","promo_newsletter","cta_simple","footer"],about:["header","text_rich","faq_accordion","cta_simple","footer"]};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_HEADER={links:3};`

/** The editor open on `kind`, drawn and quiet. */
/* `init`: a script run in the editor's document before anything else (a devtools hook, an observer). `width`/`height`: the window. */
export async function openEditor({ kind, bundle, css, compat, globals = kind === "imported" ? "" : STORELIB_GLOBALS, init = "", width = 1440, height = 900, cpu = 1, beforeOpen = null }) {
  const all = kind === "imported" ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};${globals}` : globals
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${all}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset && compat) {
      const name = decodeURIComponent(asset[1])
      const text = compat.all[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/plain", "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const errors = []
  try {
    const page = await browser.newPage()
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    if (process.env.DEBUG) page.on("console", (m) => { if (m.type() === "error" || /compat-canvas/.test(m.text())) console.log("           console:", m.text().slice(0, 300)) })
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    if (init) await page.evaluateOnNewDocument(init)
    if (cpu > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: cpu })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = r.url()
      if (/example\.invalid/.test(u) || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
      if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return r.continue()
      return r.respond({ status: 200, contentType: "text/plain", body: "" })
    })
    if (beforeOpen) await beforeOpen(page)
    await page.goto(base, { waitUntil: "domcontentloaded" })
    const front = async () => (await (await page.$("[data-compat-frame='front']"))?.contentFrame()) ?? null
    if (kind === "imported") {
      let f = null
      for (let i = 0; i < 160 && !f; i++) {
        await sleep(250)
        f = await front()
        if (f && !(await f.evaluate(() => document.querySelectorAll(".shopify-section").length).catch(() => 0))) f = null
      }
      if (!f) throw new Error("the canvas never drew the imported theme")
    } else {
      await page.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 7, { timeout: 120_000, polling: 200 })
    }
    await sleep(2500)
    return { page, browser, server, front, errors, js: (fn, ...a) => page.evaluate(fn, ...a), close: async () => { await browser.close(); server.close() } }
  } catch (e) {
    await browser.close()
    server.close()
    throw e
  }
}
