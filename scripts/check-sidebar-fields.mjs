/**
 * ===========================================================================
 *  THE SIDEBAR'S TEXT FIELDS NEVER SCROLL SIDEWAYS
 * ===========================================================================
 * The owner: the heading and rich text editors in the builder's sidebar, and
 * the textareas, must not need horizontal scrolling, in the sidebar or in the
 * phone's sheet.
 *
 * Two passes, each with a long unbroken word and a long web address in every
 * field:
 *
 *   the controls    the richtext field, the one line inline_richtext control
 *                   (an imported theme's headings) and the textarea
 *                   (scripts/render-sidebar-fields-probe.tsx) in a panel 240,
 *                   280, 320 and 360 wide with the sidebar's 16px gutters, and
 *                   at a 390 phone
 *   the editor      the real editor (editor-probe-harness.mjs), a Rich text
 *                   section selected and its Text written into, with the
 *                   sidebar dragged to 240, 280, 320 and 360, and on a 390
 *                   phone in the sheet
 *
 * For each: every field's scrollWidth against its clientWidth, the panel's
 * own, and the furthest right any of the field's parts reaches against the
 * panel's inner edge. The toolbar's controls must all be inside the field.
 *
 *   node scripts/check-sidebar-fields.mjs        (SKIP_EDITOR=1 for the first pass only)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const WIDTHS = [240, 280, 320, 360]
const LONG_URL = "https://www.example-store-with-a-very-long-name.com/collections/limited-edition-hand-thrown-ceramics?utm_source=newsletter&utm_campaign=autumn"
const LONG_WORD = "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenhersteller"

/** In the page: how far each field and the panel it is in reach sideways. */
const MEASURE = (panelSelector) => {
  const panel = document.querySelector(panelSelector)
  const pr = panel.getBoundingClientRect()
  const inner = pr.right - (panel.offsetWidth - panel.clientWidth)
  const fields = [...panel.querySelectorAll('[data-builder-rich-text], [data-inline-richtext], textarea, [role="textbox"]')]
  const out = fields.map((el) => {
    const r = el.getBoundingClientRect()
    let reach = r.right
    for (const d of el.querySelectorAll("*")) {
      const cs = getComputedStyle(d)
      if (cs.display === "none" || cs.visibility === "hidden" || d.closest("[data-scroll-arrow]")) continue
      const dr = d.getBoundingClientRect()
      if (dr.width) reach = Math.max(reach, dr.right)
    }
    const kind = el.matches("[data-builder-rich-text]") ? "richtext" : el.matches("[data-inline-richtext]") ? "inline_richtext" : el.tagName === "TEXTAREA" ? "textarea" : "textbox"
    /* The toolbar's own buttons, which must all be inside the field, not a swipe away. */
    const buttons = el.matches("[data-builder-rich-text]") ? [...el.querySelectorAll("[data-rich-text-bar] button:not([data-scroll-arrow]), [data-rich-text-bar] select")] : []
    const outside = buttons.filter((b) => { const br = b.getBoundingClientRect(); return br.right > r.right + 0.5 || br.left < r.left - 0.5 }).length
    return { kind, scrollW: el.scrollWidth, clientW: el.clientWidth, sideways: el.scrollWidth - el.clientWidth, reachPast: Math.round((reach - inner) * 10) / 10, toolbarOutside: outside }
  })
  return { panel: { scrollW: panel.scrollWidth, clientW: panel.clientWidth }, fields: out }
}

function judge(label, m) {
  const worst = m.fields.reduce((w, f) => Math.max(w, f.sideways), 0)
  const reach = m.fields.reduce((w, f) => Math.max(w, f.reachPast), -Infinity)
  const outside = m.fields.reduce((n, f) => n + f.toolbarOutside, 0)
  expect(m.fields.length > 0 && worst <= 1, `${label}: no field is wider inside than out (scrollWidth = clientWidth)`, m.fields.map((f) => `${f.kind} ${f.scrollW}/${f.clientW}`).join(", "))
  expect(m.panel.scrollW <= m.panel.clientW, `${label}: the panel does not scroll sideways`, m.panel)
  expect(reach <= 0.5, `${label}: nothing in a field reaches past the panel's edge`, reach)
  expect(outside === 0, `${label}: every toolbar control is inside the field`, outside)
  return { worstSideways: worst, reachPast: reach, toolbarOutside: outside, panel: m.panel }
}

const report = {}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"] })
let server
try {
  console.log("\nthe controls")
  const css = await appCss(root)
  const fontDir = /url\(file:\/\/([^)]*\/media)\//.exec(interFaces(root))?.[1] ?? null
  const faces = fontDir ? interFaces(root).split(`file://${fontDir}/`).join("/__font/") : ""
  const bundle = join(mkdtempSync(join(tmpdir(), "storelib-sidebar-fields-")), "probe.js")
  execFileSync(join(root, "node_modules/.bin/esbuild"), [
    join(root, "scripts/render-sidebar-fields-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (fontDir && req.url.startsWith("/__font/")) {
      const file = join(fontDir, req.url.slice(8).replace(/[^\w.-]/g, ""))
      if (existsSync(file)) { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(file)) }
    }
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${server.address().port}/`
  for (const w of [...WIDTHS, "phone"]) {
    const page = await browser.newPage()
    if (w === "phone") await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    else await page.setViewport({ width: 1280, height: 900 })
    await page.goto(`${base}?w=${w === "phone" ? 390 : w}`, { waitUntil: "load" })
    await page.waitForSelector("[data-builder-rich-text]")
    await sleep(300)
    const m = await page.evaluate(MEASURE, "[data-probe-panel]")
    report[`controls ${w}`] = judge(`controls at ${w}`, m)

    /*
      TALLER, NOT WIDER. Every box typed into at its end with a long word and
      an address: its height goes up (or it was already at its ceiling and
      scrolls up and down), and it is still no wider inside than out.
    */
    const boxSel = (f) => `[data-probe-field="${f}"] [role="textbox"], [data-probe-field="${f}"] textarea`
    const grows = []
    for (const f of ["richtext", "inline_richtext", "textarea", "text", "chips"]) {
      const sel = boxSel(f)
      const h0 = await page.$eval(sel, (el) => el.getBoundingClientRect().height)
      await page.$eval(sel, (el) => {
        el.scrollIntoView({ block: "center" })
        el.focus()
        if (el.tagName === "TEXTAREA") return el.setSelectionRange(el.value.length, el.value.length)
        const r = document.createRange()
        r.selectNodeContents(el)
        r.collapse(false)
        getSelection().removeAllRanges()
        getSelection().addRange(r)
      })
      await page.keyboard.type(` ${LONG_WORD} ${LONG_URL}`, { delay: 0 })
      await sleep(150)
      const after = await page.$eval(sel, (el) => ({ h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY, ox: getComputedStyle(el).overflowX }))
      const capped = after.sh > after.ch + 1 && /auto|scroll/.test(after.oy)
      grows.push({ f, from: Math.round(h0), to: Math.round(after.h), sideways: after.sw - after.cw, capped, ox: after.ox })
    }
    expect(grows.every((g) => g.sideways <= 0 && g.ox !== "auto" && g.ox !== "scroll"), `controls at ${w}: typed long, no box scrolls sideways`, grows.map((g) => `${g.f} ${g.sideways}px ${g.ox}`).join(", "))
    expect(grows.every((g) => g.to > g.from || g.capped), `controls at ${w}: each box grew taller, or is at its ceiling and scrolls up and down`, grows.map((g) => `${g.f} ${g.from}->${g.to}${g.capped ? " capped" : ""}`).join(", "))
    report[`controls ${w}`].grows = grows
    await page.close()
  }

  if (process.env.SKIP_EDITOR !== "1") {
    console.log("\nthe editor")
    const { bundle: editorBundle, css: editorCss } = await import("./editor-probe-harness.mjs")
    const ejs = readFileSync(editorBundle)
    const ehtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${editorCss}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script></body></html>`
    const eserver = createServer((req, res) => {
      if (req.url.startsWith("/editor-probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(ejs) }
      if (/\.(png|jpe?g|webp|gif)/.test(req.url)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { "content-type": "text/html" })
      res.end(ehtml)
    })
    await new Promise((r) => eserver.listen(0, "127.0.0.1", r))
    const origin = `http://127.0.0.1:${eserver.address().port}/website-builder/editor/probe-install`
    try {
      for (const w of [...WIDTHS, "phone"]) {
        const page = await browser.newPage()
        const phone = w === "phone"
        await page.evaluateOnNewDocument((width) => { try { if (width) localStorage.setItem("wb:sidebar-width", String(width)) } catch {} }, phone ? 0 : w)
        if (phone) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
        else await page.setViewport({ width: 1440, height: 900 })
        await page.goto(origin, { waitUntil: "load" })
        await page.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
        await sleep(800)
        /* Select the Rich text section: its Text setting is the richtext field. */
        await page.evaluate(() => {
          const box = document.querySelector('#wb-preview-root [data-section-type="text_rich"]')
          const target = box?.querySelector("h1, h2, h3, p") ?? box
          target?.click()
        })
        const found = await page.waitForSelector("[data-builder-rich-text] [role=textbox]", { timeout: 15_000 }).then(() => true, () => false)
        expect(found, `editor at ${w}: the Rich text section's Text field is open`)
        if (!found) { await page.close(); continue }
        await page.evaluate((html) => {
          const box = document.querySelector("[data-builder-rich-text] [role=textbox]")
          box.focus()
          box.innerHTML = html
          box.dispatchEvent(new Event("input", { bubbles: true }))
          box.blur()
        }, `<h2>${LONG_WORD}</h2><p>${LONG_URL}</p>`)
        await sleep(500)
        const m = await page.evaluate(() => {
          const field = document.querySelector("[data-builder-rich-text]")
          /* The panel the field is in: the nearest box that scrolls up and down. */
          let p = field.parentElement
          while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement
          p.setAttribute("data-probe-panel", "")
          return true
        })
        void m
        report[`editor ${w}`] = judge(`editor at ${w}`, await page.evaluate(MEASURE, "[data-probe-panel]"))
        await page.close()
      }
    } finally {
      eserver.close()
    }
  }
} finally {
  await browser.close()
  server?.close()
}
console.log("\nsummary")
for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(18)} widest sideways scroll ${v.worstSideways}px  reach past the panel ${v.reachPast}px  toolbar controls outside ${v.toolbarOutside}  panel ${v.panel.scrollW}/${v.panel.clientW}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
