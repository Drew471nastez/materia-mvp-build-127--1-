/**
 * ===========================================================================
 *  THE U ROUND'S CONTROLS, AT THE SIDEBAR'S WIDTH, AND WHAT THE NEW THEME
 *  SETTINGS DO TO REAL MARKUP
 * ===========================================================================
 * Every control the round added, drawn by its real component in a 320px
 * sidebar, read back out of Chromium:
 *
 *   each field's own width     the column's, left edge on the label's, no
 *                              horizontal overflow
 *   each row's height          32px for a one line field, as every sidebar
 *                              field is; buttons 44px under a thumb; the picker
 *                              rows with a 36px picture; the type 13px, and
 *                              16px on a phone so iOS does not zoom into it
 *                              (app/globals.css)
 *   the number's unit          inside the field's right edge, centred on it
 *   the CSS box                says which line it left out, in the sidebar's red
 *   a themed product card      Card style, radius, border, image padding, centred
 *                              words, the Sale badge's colour and corner, the
 *                              input's radius and border, as computed styles
 *   the new sections           Collection list, Featured collection and Page
 *                              content drawn by the engine (render-new-sections.ts)
 *                              at 1280 and 390: cards per row, nothing wider
 *                              than the page, Collection cards and Badges applied
 *
 *   node scripts/check-new-controls.mjs          (SHOTS=dir keeps pictures)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-new-controls-"))
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-new-controls.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty",
], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
/* The new sections, drawn by the engine in Node, as the live site draws them. */
const drawn = JSON.parse(execFileSync("npx", ["--no-install", "tsx", join(root, "scripts/render-new-sections.ts")], { cwd: root, encoding: "utf8" }))
const sectionsFile = join(out, "sections.html")
writeFileSync(sectionsFile,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body>${drawn.html}` +
  `<script>window.__ready=true;window.__err=[]</script></body></html>`)
const pageFile = join(out, "index.html")
writeFileSync(pageFile,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── The browser ─────────────────────────────────────────────────────── */
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) => new Promise((resolve, reject) => {
  const n = ++id
  pending.set(n, { resolve, reject })
  ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
})

async function open({ width, height, phone, file = pageFile }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: phone })
  await call("Page.navigate", { url: `file://${file}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw (${width}): ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
    return r.result.value
  }
  for (let i = 0; i < 80; i++) {
    if (await js("!!window.__ready")) break
    await sleep(50)
  }
  await sleep(100)
  const errors = await js("window.__err")
  if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  return { js, shot }
}

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

/* One field, measured: the column, the label, and every visible child's box. */
const FIELD = (wrap) => `(() => {
  const w = document.getElementById(${JSON.stringify(wrap)})
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
  const font = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : null
  const pick = (sel) => w.querySelector(sel)
  const kids = [...w.querySelectorAll("*")].filter((el) => el.getClientRects().length)
  const box = r(w)
  return {
    box,
    label: r(pick("[data-label]")),
    overflow: kids.filter((el) => { const b = el.getBoundingClientRect(); return b.right > box.r + 0.5 || b.left < box.l - 0.5 }).map((el) => el.tagName + "." + (el.className || "").toString().slice(0, 40)),
    input: r(pick("input:not([type=search])")), inputFont: font(pick("input:not([type=search])")),
    select: r(pick("select")), selectFont: font(pick("select")),
    selectFamily: pick("select") ? getComputedStyle(pick("select")).fontFamily : null,
    unit: r(pick("[data-number-unit]")),
    add: r(pick("button[aria-expanded]")), addText: pick("button[aria-expanded]")?.textContent?.trim() ?? null,
    rows: [...w.querySelectorAll("li, [data-collection-picker] > div.flex")].filter((el) => el.querySelector("img, span[aria-hidden]")).map((el) => ({ box: r(el), thumb: r(el.querySelector("img, span[aria-hidden]")), name: el.querySelector(".truncate")?.textContent ?? "", nameRight: r(el.querySelector(".truncate"))?.r ?? 0, buttons: [...el.querySelectorAll("button")].map((b) => r(b)) })),
    textarea: r(pick("textarea")), textareaFont: font(pick("textarea")), textareaFamily: pick("textarea") ? getComputedStyle(pick("textarea")).fontFamily : null,
    problem: pick("ul[aria-live]")?.textContent ?? null, problemColor: pick("ul[aria-live]") ? getComputedStyle(pick("ul[aria-live]")).color : null,
    note: pick("p")?.textContent ?? null,
    value: w.querySelector("[data-value]")?.getAttribute("data-value") ?? null,
  }
})()`

const THEMED = `(() => {
  const s = (id) => getComputedStyle(document.getElementById(id))
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
  return {
    card: { radius: s("card").borderTopLeftRadius, border: s("card").borderTopWidth, padTop: s("card").paddingTop, padBottom: s("card").paddingBottom, bg: s("card").backgroundColor, align: s("card").textAlign, overflow: s("card").overflow },
    media: { radius: s("media").borderTopLeftRadius, box: r("media") }, cardBox: r("card"),
    title: { align: s("title").textAlign, padLeft: s("title").paddingLeft },
    price: { justify: s("price").justifyContent },
    badges: { top: s("badges").top, right: s("badges").right, left: s("badges").left, box: r("badges") },
    sale: { bg: s("sale").backgroundColor, color: s("sale").color, radius: s("sale").borderTopLeftRadius },
    field: { radius: s("field").borderTopLeftRadius, border: s("field").borderTopWidth },
  }
})()`

for (const vp of [{ name: "computer", width: 1280, height: 1100, phone: false }, { name: "phone", width: 390, height: 1400, phone: true }]) {
  console.log(`\nOn a ${vp.name}, ${vp.width} wide, the sidebar 320px`)
  const p = await open(vp)
  /* A one line field is 32px on both, as scripts/check-image-setting.mjs measures every sidebar field; the phone raises its type, not its height. */
  const tall = 32
  const type = vp.phone ? 16 : 13

  for (const f of ["collection-empty", "collection-set", "collections", "number", "font", "css", "collection-off"]) {
    const m = await p.js(FIELD(f))
    check(`${f}: inside the 296px column, nothing past either edge`, m.box.w === 296 && m.overflow.length === 0, { w: m.box.w, overflow: m.overflow })
    if (m.label) check(`${f}: the control starts on the label's left edge`, [m.input, m.select, m.add, m.textarea, m.rows[0]?.box].filter(Boolean).every((b) => b.l === m.label.l), { label: m.label.l })
    if (f === "number") {
      console.log(`        number: field ${m.input.w}x${m.input.h}, ${m.inputFont}px, unit at ${m.unit.l} to ${m.unit.r} (field ends ${m.input.r})`)
      check("number: a sidebar field, full width, 32px tall", m.input.w === 296 && m.input.h === tall, m.input)
      check(`number: ${type}px type`, m.inputFont === type, m.inputFont)
      check("number: the unit sits inside the field, 8 to 14px from its right edge", m.unit.r < m.input.r && m.input.r - m.unit.r >= 8 && m.input.r - m.unit.r <= 14, { unit: m.unit, input: m.input })
      check("number: and centred on it, within a pixel", Math.abs((m.unit.t + m.unit.b) / 2 - (m.input.t + m.input.b) / 2) <= 1, { unit: m.unit, input: m.input })
    }
    if (f === "font") {
      console.log(`        font: select ${m.select.w}x${m.select.h}, ${m.selectFont}px, drawn in ${m.selectFamily}`)
      check("font: a sidebar select, full width", m.select.w === 296 && m.select.h === tall, m.select)
      check("font: the chosen family is the field's face", /Lora/.test(m.selectFamily), m.selectFamily)
    }
    if (f === "collection-empty") {
      console.log(`        collection-empty: Choose collection ${m.add.w}x${m.add.h}`)
      check("collection-empty: one full-width Choose collection button", m.add.w === 296 && m.addText === "Choose collection" && m.add.h >= (vp.phone ? 44 : 30), m.add)
    }
    if (f === "collection-set") {
      const row = m.rows[0]
      console.log(`        collection-set: row ${row?.box.w}x${row?.box.h}, picture ${row?.thumb.w}x${row?.thumb.h}, then Change ${m.add?.w}x${m.add?.h}`)
      check("collection-set: the chosen collection as a row, picture and name", !!row && row.name === "Kitchen" && row.thumb.w === 36 && row.thumb.h === 36, row)
      check("collection-set: the row is the column's width", row.box.w === 296, row.box)
      check("collection-set: the picture is centred in the row", Math.abs((row.thumb.t + row.thumb.b) / 2 - (row.box.t + row.box.b) / 2) <= 1, row)
      check(`collection-set: the remove button is ${vp.phone ? "44" : "24"}px square, on the row's right`, row.buttons.length === 1 && row.buttons[0].w === (vp.phone ? 44 : 24) && row.box.r - row.buttons[0].r <= 6, row.buttons)
      check("collection-set: Change under it, full width", m.add.w === 296 && m.addText === "Change" && m.add.t > row.box.b, m.add)
    }
    if (f === "collections") {
      console.log(`        collections: ${m.rows.length} rows, ${m.rows.map((r) => `${r.box.w}x${r.box.h}`).join(", ")}, gap ${m.rows[1] ? m.rows[1].box.t - m.rows[0].box.b : "?"}px`)
      check("collections: one row per chosen collection, in order", m.rows.length === 2 && m.rows[0].name === "Kitchen" && m.rows[1].name.startsWith("Under forty"), m.rows.map((r) => r.name))
      check("collections: rows the same height, 6px apart", m.rows[0].box.h === m.rows[1].box.h && m.rows[1].box.t - m.rows[0].box.b === 6, m.rows.map((r) => r.box))
      check("collections: a long name is cut, never pushes the buttons out", m.rows[1].nameRight <= m.rows[1].buttons[0].l, m.rows[1])
      check("collections: up, down and remove on every row", m.rows.every((r) => r.buttons.length === 3))
      check("collections: Add collection under the list", m.addText === "Add collection" && m.add.t > m.rows[1].box.b, m.add)
    }
    if (f === "css") {
      console.log(`        css: box ${m.textarea.w}x${m.textarea.h}, ${m.textareaFont}px ${m.textareaFamily.split(",")[0]}, says "${m.problem}"`)
      check("css: a code box the column's width, at least 160px tall", m.textarea.w === 296 && m.textarea.h >= 160, m.textarea)
      check("css: in a monospaced face", /mono|Menlo|Consolas|Courier/i.test(m.textareaFamily), m.textareaFamily)
      check(`css: ${vp.phone ? 16 : 12}px type`, m.textareaFont === (vp.phone ? 16 : 12), m.textareaFont)
      check("css: it says what it left out, in the sidebar's red", /Left out: @import/.test(m.problem ?? "") && m.problemColor === "rgb(185, 28, 28)", { text: m.problem, color: m.problemColor })
    }
    if (f === "collection-off") check("collection-off: says why it shows nothing", /switched off/.test(m.note ?? ""), m.note)
  }
  await p.shot(`${vp.name}-sidebar`)

  if (!vp.phone) {
    console.log("\nA product card under Card style, 16px radius, 1px border, 8px image padding, centred; Sale in #dc2626, top right, 4px; inputs 4px, 2px")
    const t = await p.js(THEMED)
    console.log(`        card ${t.cardBox.w}x${t.cardBox.h}, radius ${t.card.radius}, border ${t.card.border}, padding ${t.card.padTop}/${t.card.padBottom}, picture ${t.media.box.w}x${t.media.box.h} radius ${t.media.radius}`)
    console.log(`        badge at top ${t.badges.top} right ${t.badges.right}, ${t.sale.bg} on ${t.sale.color}, radius ${t.sale.radius}; input radius ${t.field.radius}, border ${t.field.border}`)
    check("the card is the frame: 16px corners, 1px border, a fill of its own", t.card.radius === "16px" && t.card.border === "1px" && t.card.bg !== "rgba(0, 0, 0, 0)" && t.card.overflow === "hidden", t.card)
    check("the picture inset 8px, its corners 16 - 8 = 8px", t.card.padTop === "8px" && t.media.box.l - t.cardBox.l === 9 && t.media.radius === "8px", { pad: t.card.padTop, inset: t.media.box.l - t.cardBox.l, radius: t.media.radius })
    check("the words centred and inset from the card's edge", t.card.align === "center" && t.title.align === "center" && t.title.padLeft === "12px" && t.price.justify === "center", { title: t.title, price: t.price })
    check("Sale in its own colours, 4px corners, over the section's own", t.sale.bg === "rgb(220, 38, 38)" && t.sale.color === "rgb(255, 255, 255)" && t.sale.radius === "4px", t.sale)
    check("in the top right corner, 10px in from the picture's edges", t.media.box.r - t.badges.box.r === 10 && t.badges.box.t - t.media.box.t === 10, { badges: t.badges.box, media: t.media.box })
    check("the input takes the Inputs settings over the section's", t.field.radius === "4px" && t.field.border === "2px", t.field)
    await p.shot("themed-card")
  }
}

/* The new sections, at a computer's width and a phone's. */
const SECTIONS = `(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
  const rows = (els) => { const tops = [...new Set(els.map((e) => r(e).t))]; return tops.length ? els.filter((e) => r(e).t === tops[0]).length : 0 }
  const cols = [...document.querySelectorAll('#box-list [data-card="collection"]')]
  const prods = [...document.querySelectorAll('#box-feat [data-card="product"]')]
  const media = document.querySelector('#box-list [data-card="collection"] [data-card-media]')
  const title = document.querySelector('#box-list [data-card="collection"] h3')
  const sale = document.querySelector('#box-feat [data-badge="sale"]')
  const fmedia = sale.closest("[data-card-media]")
  const badges = sale.closest("[data-badges]")
  return {
    pageWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    collections: cols.length, perRow: rows(cols), products: prods.length, productsPerRow: rows(prods),
    colRadius: getComputedStyle(media).borderTopLeftRadius, titleAlign: getComputedStyle(title).textAlign,
    count: document.querySelector('#box-list .col__count').textContent.trim(),
    sale: { bg: getComputedStyle(sale).backgroundColor, inset: r(fmedia).r - r(badges).r, top: r(badges).t - r(fmedia).t },
    soldout: !!document.querySelector('#box-feat [data-badge="soldout"]'),
    heading: document.querySelector('#box-feat .s__h').textContent,
    pageTitle: document.querySelector('#box-page h1').textContent,
    widest: Math.max(...[...document.querySelectorAll("#site *")].map((e) => e.getBoundingClientRect().right)),
  }
})()`
for (const vp of [{ name: "computer", width: 1280, height: 2400, phone: false, cols: 3, prods: 4 }, { name: "phone", width: 390, height: 3600, phone: true, cols: 1, prods: 2 }]) {
  console.log(`\nThe new sections on a ${vp.name}, ${vp.width} wide`)
  const p = await open({ ...vp, file: sectionsFile })
  const m = await p.js(SECTIONS)
  console.log(`        ${m.collections} collection cards, ${m.perRow} a row, radius ${m.colRadius}; Featured collection ${m.products} products, ${m.productsPerRow} a row; page ${m.pageWidth}, content ${m.scrollWidth}, widest edge ${Math.round(m.widest)}`)
  check(`${vp.name}: every collection is a card`, m.collections === 4, m.collections)
  check(`${vp.name}: ${vp.cols} a row`, m.perRow === vp.cols, m.perRow)
  check(`${vp.name}: Featured collection draws its first four, ${vp.prods} a row`, m.products === 4 && m.productsPerRow === vp.prods, { n: m.products, row: m.productsPerRow })
  check(`${vp.name}: nothing wider than the page`, m.scrollWidth <= m.pageWidth && m.widest <= m.pageWidth + 0.5, { scroll: m.scrollWidth, widest: m.widest })
  check(`${vp.name}: Collection cards' 12px corners and centred words`, m.colRadius === "12px" && m.titleAlign === "center", { radius: m.colRadius, align: m.titleAlign })
  check(`${vp.name}: the count reads as words`, m.count === "12 products", m.count)
  check(`${vp.name}: Sale in red, top right, 10px in; Sold out on the other`, m.sale.bg === "rgb(220, 38, 38)" && m.sale.inset === 10 && m.sale.top === 10 && m.soldout, m.sale)
  check(`${vp.name}: headed with the collection's name; Page content with the page's`, m.heading === "Kitchen" && m.pageTitle === "Size guide", { h: m.heading, page: m.pageTitle })
  await p.shot(`${vp.name}-sections`)
}

ws.close()
proc.kill()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
