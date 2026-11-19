/**
 * ===========================================================================
 *  VELVET AND BASALT, THE TWO DARK CLEAN THEMES, MEASURED ON A WHOLE PAGE
 * ===========================================================================
 * components/onepage/themes/dark-clean-themes. scripts/render-onepage-dark-themes.tsx draws the real
 * PublicOnePage with every part a creator puts on a page, with the theme picked as the Themes panel picks it.
 * For each theme at 390 and 1280 this:
 *
 *   - screenshots the whole page (SHOTS, default the scratch folder named below);
 *   - reads every visible word's colour and the pixels painted under it (one screenshot with every word made
 *     clear), and holds it to 4.5:1, or 3:1 for large words (24px, or 18.66px bold), against 80% of the pixels
 *     under it; reported by role: the name, body text, muted text, button words, field words and placeholders;
 *   - measures a field's edge against the page under it (3:1), and the focus ring a key press draws on a field
 *     and on a link button (3:1 against the page);
 *   - opens a product's sheet, the share sheet and the code's toast, screenshots each and holds their words to
 *     the same bar;
 *   - and screenshots the picker's Clean group in the real editor.
 *
 *   node scripts/check-onepage-dark-themes.mjs
 *   THEMES=velvet,basalt   WIDTHS=390,1280   SHOTS=<dir>
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const THEMES = (process.env.THEMES || "velvet,basalt").split(",")
const WIDTHS = (process.env.WIDTHS || "390,1280").split(",").map(Number)
const SHOTS = process.env.SHOTS || "/tmp/claude-0/-home-user/a146c18b-e910-5204-8185-1301fbb41271/scratchpad/themes"
mkdirSync(SHOTS, { recursive: true })
const findChrome = () => {
  if (process.env.CHROMIUM) return process.env.CHROMIUM
  for (const d of ["/opt/pw-browsers/chromium", ...readdirSync("/opt/pw-browsers").filter((n) => /^chromium-\d+$/.test(n)).map((n) => `/opt/pw-browsers/${n}`)]) {
    for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) if (existsSync(join(d, sub))) return join(d, sub)
  }
  return "/tmp/chromium"
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}

/* ── colour ─────────────────────────────────────────────────────────────── */
const lum = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const r2 = (n) => Math.round(n * 100) / 100

/* In the page: every visible word (and field value or placeholder) with its colour, its box and its role. */
const COLLECT = (scope) => {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const parse = (s) => {
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const theme = window.__probeTheme || {}
  const same = (a, b) => { if (!b) return false; const x = parse(a), y = parse(b); return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 6 }
  const out = []
  const skip = "script,style,noscript,template,svg,canvas,video,audio,iframe,[data-legible-skip],[data-skin-scene]"
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(skip)) continue
    if (scope && !el.closest(scope)) continue
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    if (field && el instanceof HTMLInputElement && /^(checkbox|radio|hidden|range|color|file|submit|button|image)$/.test(el.type)) continue
    const nodes = field ? [] : [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim())
    if (!field && !nodes.length) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none") continue
    let op = 1
    for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
    if (op < 0.05) continue
    const text = field ? el.value || el.placeholder : nodes.map((n) => n.textContent).join(" ").trim()
    if (!text) continue
    const color = field && !el.value ? getComputedStyle(el, "::placeholder").color : cs.color
    const c = parse(color)
    if (c.a * op < 0.05) continue
    let rects = []
    if (field) rects = [el.getBoundingClientRect()]
    else for (const n of nodes) { const range = document.createRange(); range.selectNodeContents(n); rects.push(...range.getClientRects()) }
    rects = rects.filter((r) => r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.left < innerWidth)
    /* A word an ancestor's overflow cuts (the next slide of a carousel), or under a rail's faded edge, is not one a reader is meant to read yet. */
    let cut = false
    for (let n = el.parentElement; n && !cut; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.overflowX === "visible" && s.overflowY === "visible") continue
      const b = n.getBoundingClientRect()
      const faded = (s.maskImage && s.maskImage !== "none") || (s.webkitMaskImage && s.webkitMaskImage !== "none")
      const pad = faded ? 48 : 0
      cut = rects.some((r) => r.left < b.left + pad - 1 || r.right > b.right - pad + 1)
    }
    if (cut) continue
    if (!rects.length) continue
    const size = parseFloat(cs.fontSize)
    const weight = Number(cs.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    let role = "other"
    if (field) role = el.value ? "field" : "placeholder"
    else if (el.closest(".op-btn")) role = "button"
    else if (el.closest("h1") || same(color, theme.title_color)) role = "name"
    else if (same(color, theme.secondary_text_color)) role = "muted"
    else if (same(color, theme.text_color)) role = "body"
    out.push({ text: text.slice(0, 40), role, color: c, op, large, rects: rects.map((r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height })) })
  }
  return out
}
const HIDE_WORDS = `*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}*::placeholder{color:transparent!important}`

async function measureWords(p, scope, label) {
  const words = await p.evaluate(COLLECT, scope)
  const style = await p.addStyleTag({ content: HIDE_WORDS })
  await sleep(120)
  const full = await p.screenshot({ fullPage: !scope, captureBeyondViewport: !scope })
  await style.evaluate((s) => s.remove())
  const dpr = await p.evaluate(() => devicePixelRatio)
  const sy = scope ? await p.evaluate(() => scrollY) : 0
  const sx = scope ? await p.evaluate(() => scrollX) : 0
  const { data, info } = await sharp(full).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => {
    const X = Math.min(info.width - 1, Math.max(0, Math.round(x * dpr)))
    const Y = Math.min(info.height - 1, Math.max(0, Math.round(y * dpr)))
    const i = (Y * info.width + X) * info.channels
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const roles = {}
  const fails = []
  for (const w of words) {
    const samples = []
    for (const r of w.rects) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) samples.push(px(r.x - sx + (r.w * (i + 0.5)) / 6, r.y - sy + (r.h * (j + 1)) / 4))
    const ink = (g) => ({ r: w.color.r * w.color.a * w.op + g.r * (1 - w.color.a * w.op), g: w.color.g * w.color.a * w.op + g.g * (1 - w.color.a * w.op), b: w.color.b * w.color.a * w.op + g.b * (1 - w.color.a * w.op) })
    const ratios = samples.map((g) => ratio(ink(g), g)).sort((a, b) => a - b)
    const at80 = ratios[Math.floor(ratios.length * 0.2)]
    const min = w.large ? 3 : 4.5
    const role = roles[w.role] || (roles[w.role] = { n: 0, min: Infinity, word: "" })
    role.n++
    if (at80 < role.min) { role.min = at80; role.word = w.text }
    if (at80 < min) fails.push(`${w.role} "${w.text}" ${r2(at80)}`)
  }
  console.log(`  ${label}: ` + Object.entries(roles).map(([k, v]) => `${k} ${r2(v.min)} (${v.n})`).join(", "))
  check(`${label}: every word reads (4.5:1, 3:1 large) on what is under it`, fails.length === 0, fails.slice(0, 8).join("; "))
  return roles
}

/* A field's edge, and a focus ring, against the page right outside the field. */
async function edges(p, label) {
  const info = await p.evaluate(() => {
    const field = [...document.querySelectorAll("input[type=email],input[type=text],textarea")].find((f) => f.getBoundingClientRect().width > 20 && f.tabIndex >= 0 && !f.closest("[aria-hidden=true]") && f.placeholder)
    if (!field) return null
    field.scrollIntoView({ block: "center" })
    /* The box that draws the field: the input, or the first wrapper with an edge or a fill. */
    let box = field
    for (let n = field; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n)
      if (parseFloat(c.borderTopWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || (c.boxShadow && c.boxShadow !== "none")) { box = n; break }
    }
    const r = box.getBoundingClientRect()
    const cs = getComputedStyle(box)
    return { name: field.placeholder || field.name || field.type, block: field.closest("[data-block-id]")?.getAttribute("data-block-id") || "", x: r.left, y: r.top, w: r.width, h: r.height, border: cs.borderTopColor, bw: cs.borderTopWidth, bg: cs.backgroundColor, shadow: cs.boxShadow }
  })
  if (!info) return check(`${label}: a field on the page`, false)
  await sleep(200)
  const shot = async () => {
    const png = await p.screenshot()
    const dpr = await p.evaluate(() => devicePixelRatio)
    return { img: await sharp(png).raw().toBuffer({ resolveWithObject: true }), dpr }
  }
  const pick = ({ img: { data, info: m }, dpr }, x, y) => { const i = (Math.round(y * dpr) * m.width + Math.round(x * dpr)) * m.channels; return { r: data[i], g: data[i + 1], b: data[i + 2] } }
  const a = await shot()
  const midY = info.y + info.h / 2
  const outside = pick(a, info.x - 6, midY)
  const edge = pick(a, info.x + 0.5, midY)
  const inside = pick(a, info.x + 10, midY)
  const edgeRatio = Math.max(ratio(edge, outside), ratio(inside, outside))
  console.log(`  ${label}: field edge ${r2(ratio(edge, outside))}, field fill ${r2(ratio(inside, outside))} against the page (${info.block} "${info.name}", ${info.border} ${info.bw}, fill ${info.bg})`)
  check(`${label}: a field can be seen (its edge or fill 3:1 on the page)`, edgeRatio >= 3, r2(edgeRatio))
  await p.keyboard.press("Tab")
  await p.evaluate(() => { const f = [...document.querySelectorAll("input[type=email],input[type=text],textarea")].find((f) => f.getBoundingClientRect().width > 20 && f.tabIndex >= 0 && !f.closest("[aria-hidden=true]") && f.placeholder); f.focus({ focusVisible: true }) })
  await sleep(250)
  const b = await shot()
  /* The ring: the pixel just outside the field that changed most from the unfocused page. */
  let best = 1
  for (let d = 1; d <= 5; d++) for (const [x, y] of [[info.x - d, midY], [info.x + info.w + d - 1, midY], [info.x + info.w / 2, info.y - d], [info.x + info.w / 2, info.y + info.h + d - 1], [info.x + 1, midY], [info.x + info.w / 2, info.y + 1]]) best = Math.max(best, ratio(pick(b, x, y), pick(a, info.x - 8, midY)))
  console.log(`  ${label}: focus ring on a field ${r2(best)} against the page`)
  check(`${label}: a focused field shows a ring (3:1)`, best >= 3, r2(best))
  await p.evaluate(() => document.activeElement?.blur())
}

async function linkRing(p, label) {
  const rect = await p.evaluate(() => {
    const a = [...document.querySelectorAll("a.op-btn, .op-btn")].map((e) => e.closest("a,button")).find((e) => e && e.getBoundingClientRect().width > 0)
    if (!a) return null
    a.scrollIntoView({ block: "center" })
    const r = a.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  if (!rect) return
  await sleep(150)
  const before = await sharp(await p.screenshot()).raw().toBuffer({ resolveWithObject: true })
  await p.evaluate(() => { const a = [...document.querySelectorAll(".op-btn")].map((e) => e.closest("a,button")).find((e) => e && e.getBoundingClientRect().width > 0); a.focus({ focusVisible: true }) })
  await sleep(250)
  const after = await sharp(await p.screenshot()).raw().toBuffer({ resolveWithObject: true })
  const dpr = await p.evaluate(() => devicePixelRatio)
  const at = (img, x, y) => { const i = (Math.round(y * dpr) * img.info.width + Math.round(x * dpr)) * img.info.channels; return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] } }
  let best = 1
  const midY = rect.y + rect.h / 2
  for (let d = 1; d <= 6; d++) for (const [x, y] of [[rect.x - d, midY], [rect.x + rect.w + d - 1, midY], [rect.x + rect.w / 2, rect.y - d], [rect.x + rect.w / 2, rect.y + rect.h + d - 1]]) best = Math.max(best, ratio(at(after, x, y), at(before, x, y)))
  console.log(`  ${label}: focus ring on a link button ${r2(best)} against the page`)
  check(`${label}: a focused link button shows a ring (3:1)`, best >= 3, r2(best))
  await p.evaluate(() => document.activeElement?.blur())
}

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
/* The pictures: muted photographs' stand ins, served as files (a link's picture must be an address). */
const files = join(process.cwd(), `.dark-themes-probe-${process.pid}`)
mkdirSync(files, { recursive: true })
const TONES = [["#5b4636", "#c49a6c"], ["#24384a", "#7aa0b8"], ["#3d3d38", "#a8a596"], ["#4a2b2b", "#b0705a"], ["#2f4036", "#8fae8a"]]
for (const [i, [a, b]] of TONES.entries()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1250"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="620" cy="520" r="250" fill="${b}" opacity="0.55"/><rect y="900" width="1000" height="350" fill="${a}" opacity="0.5"/></svg>`
  writeFileSync(join(files, `photo-${i}.jpg`), await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer())
}
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-dark-themes.tsx", statics: { "/__files/": files } })
const summary = {}
try {
  for (const t of THEMES) {
    for (const width of WIDTHS) {
      const phone = width < 600
      const label = `${t} ${width}`
      console.log(`\n${label}`)
      const p = await browser.newPage()
      await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
      p.on("pageerror", (e) => console.log("  pageerror", String(e).slice(0, 300)))
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
      await p.goto(`${base}/app/onepage?t=${t}`, { waitUntil: "networkidle0", timeout: 60000 })
      await p.waitForSelector(".op-btn", { timeout: 30000 })
      await p.evaluate(() => document.fonts.ready)
      /* Everything that waits for the scroll to show itself, shown. */
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } scrollTo(0, 0) })
      await sleep(900)
      const applied = await p.evaluate(() => window.__probeTheme?.template_id)
      check(`${label}: the page wears the theme`, applied === t, applied)
      await p.screenshot({ path: join(SHOTS, `${t}-${width}-page.png`), fullPage: true })
      await p.screenshot({ path: join(SHOTS, `${t}-${width}-top.png`) })
      summary[label] = await measureWords(p, null, `${label} page`)
      const noScroll = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      check(`${label}: no sideways scroll`, noScroll)
      await edges(p, label)
      await linkRing(p, label)

      /* The carousel of picture links: its arrows and edge fade (components/onepage/rail.ts). */
      const rail = await p.evaluate(() => { const r = document.querySelector("[data-group-carousel], .op-rail"); if (!r) return null; r.scrollIntoView({ block: "center" }); const b = r.getBoundingClientRect(); return { x: Math.max(0, b.left - 24), y: b.top - 60, width: Math.min(innerWidth, b.width + 48), height: b.height + 120 } })
      if (rail) { await sleep(300); await p.screenshot({ path: join(SHOTS, `${t}-${width}-carousel.png`), clip: { x: rail.x, y: Math.max(0, rail.y) + (await p.evaluate(() => scrollY)), width: rail.width, height: rail.height }, captureBeyondViewport: false }).catch(() => p.screenshot({ path: join(SHOTS, `${t}-${width}-carousel.png`) })) }

      /* A product's sheet. */
      const opened = await p.evaluate(() => { const t = [...document.querySelectorAll("*")].find((e) => e.childNodes.length === 1 && e.textContent.trim() === "Lightroom presets"); const b = t?.closest("a,button,[role=button]") || t; if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true })
      if (opened) {
        await sleep(1200)
        await p.screenshot({ path: join(SHOTS, `${t}-${width}-product-sheet.png`) })
        const sheet = await p.evaluate(() => (document.querySelector("[role=dialog]") ? "[role=dialog]" : null))
        if (sheet) await measureWords(p, sheet, `${label} product sheet`)
        else check(`${label}: the product sheet opened`, false)
        await p.keyboard.press("Escape")
        await sleep(700)
      }

      /* The share sheet. */
      const shared = await p.evaluate(() => { scrollTo(0, 0); const b = [...document.querySelectorAll("button")].find((x) => /share/i.test(x.getAttribute("aria-label") || "")); if (!b) return false; b.click(); return true })
      if (shared) {
        await sleep(1000)
        await p.screenshot({ path: join(SHOTS, `${t}-${width}-share.png`) })
        if (await p.$("[role=dialog]")) await measureWords(p, "[role=dialog]", `${label} share sheet`)
        await p.keyboard.press("Escape")
        await sleep(600)
      }

      /* The code's toast. */
      const copied = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^copy$/i.test(x.textContent.trim())); if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true })
      if (copied) {
        await sleep(500)
        await p.screenshot({ path: join(SHOTS, `${t}-${width}-toast.png`) })
      }
      await p.close()
    }
  }

  /* The picker, in the real editor. */
  const editor = await serveEditorProbe({ blocks: [{ id: "l1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Studio visits", url: "https://example.com/v" } }] })
  try {
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
    await p.goto(`${editor.base}/app/onepage#design`)
    await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
    await sleep(600)
    await p.click('[data-nav-row="theme"]')
    await p.waitForSelector('[data-theme-card="velvet"] [data-ts-button]', { timeout: 30000 })
    await sleep(1800)
    const ids = await p.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((c) => c.getAttribute("data-theme-card")))
    const at = (id) => ids.indexOf(id)
    check("picker: Velvet and Basalt are the last two of Clean, after Notebook", at("velvet") === at("notebook") + 1 && at("basalt") === at("velvet") + 1, ids.slice(at("notebook") - 1, at("notebook") + 4))
    const box = await p.evaluate(() => {
      const first = document.querySelector('[data-theme-card="default"]').getBoundingClientRect()
      const last = document.querySelector('[data-theme-card="basalt"]').getBoundingClientRect()
      first.y < 0 || scrollTo(0, 0)
      return { x: first.left - 16, y: first.top - 48, width: Math.max(last.right, first.right + 800) - first.left + 32, height: last.bottom - first.top + 80 }
    })
    await p.setViewport({ width: 1440, height: Math.ceil(box.y + box.height + 200), deviceScaleFactor: 2 })
    await sleep(1200)
    const b2 = await p.evaluate(() => {
      const first = document.querySelector('[data-theme-card="default"]').getBoundingClientRect()
      const last = document.querySelector('[data-theme-card="basalt"]').getBoundingClientRect()
      return { x: Math.max(0, first.left - 16), y: Math.max(0, first.top - 48), width: Math.min(innerWidth, last.right + 220) - Math.max(0, first.left - 16), height: last.bottom - first.top + 96 }
    })
    await p.screenshot({ path: join(SHOTS, "picker-clean.png"), clip: b2 })
    for (const id of ["velvet", "basalt"]) await (await p.$(`[data-theme-card="${id}"]`)).screenshot({ path: join(SHOTS, `picker-${id}.png`) })
    await p.close()
  } finally {
    editor.server.close()
  }
} finally {
  await browser.close()
  server.close()
  rmSync(files, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${SHOTS}`)
console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
