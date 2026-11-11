/**
 * ===========================================================================
 *  EVERY BUTTON AND ICON ON A ONEPAGE HAS ONE LOOK, AND ONE HOVER
 * ===========================================================================
 * The owner: buttons ("Follow on Instagram" on the Instagram block) "flash,
 * glitch and change colours on their own", "sometimes cycling through 3
 * colours on hover"; with some themes "double hovers, inconsistent hovers,
 * invisible text"; social icon styles that do not apply; block animations
 * that do not run; a product's Compact card with its price and title over
 * its button; and the old Instagram.
 *
 * scripts/render-onepage-style-stability.tsx draws a page of every kind of
 * block with a theme picked as Design › Themes picks it. For EVERY theme the
 * picker lists, on the published page and in the editor's preview frame:
 *
 *   load      every button, social icon and product button is read each
 *             animation frame from its first one for 1.5s (scripts/onepage-
 *             style-observe.js): fill, words, border, icon colour. Any change
 *             after a box's first paint, with no pointer on the page, fails.
 *   hover     each button is hovered for 600ms and left for 600ms, read every
 *             frame. The hover may move once, from rest to its hover look, on
 *             one straight line (a transition); a third colour, a reading
 *             that is neither, or not coming back to rest fails. The words
 *             must read on the hover fill (4.5:1).
 *   switch    (editor) a second theme posted to the frame: each box changes
 *             once, straight to the new theme's look, not through a third.
 *   overlap   the product block in every layout at 390 and 1280: title,
 *             price and button never overlap, and stay inside the card.
 *   icons     Design › Social icons (Solid, Outline, Glass × Brand colours,
 *             One colour) on the social row: every icon of a row drawn the
 *             same way, Glass a frosted tile, One colour one colour.
 *   motion    with a block animation chosen, the block runs it; with
 *             reduced motion it stands still.
 *
 *   node scripts/check-onepage-style-stability.mjs
 *   THEMES=a,b   only these        QUICK=1   live page only, no switch pass
 *   ONLY=load,hover,switch,overlap,icons,motion
 */
import { existsSync, readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const QUICK = process.env.QUICK === "1"
const ONLY = new Set((process.env.ONLY || "load,hover,switch,overlap,icons,motion").split(","))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OBSERVE = readFileSync(new URL("./onepage-style-observe.js", import.meta.url), "utf8")

const problems = []
const counts = { pages: 0, boxes: 0, loadChanges: 0, hovered: 0, hoverBad: 0, hoverUnreadable: 0, switchBad: 0, overlaps: 0, iconBad: 0, motionBad: 0, entranceFlashes: 0 }
const fail = (where, what) => problems.push(`${where}: ${what}`)

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-style-stability.tsx" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })

async function open(path, { width = 390, height = 900, reduced = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
  await page.evaluateOnNewDocument(OBSERVE)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}${path}`)
  return { page, errors }
}

/* The frame the page is drawn in: the editor's preview frame, or the page itself. */
async function pageFrame(page, editor) {
  if (!editor) return page.mainFrame()
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((x) => x.url().includes("/onepage-preview"))
    if (f && (await f.evaluate(() => document.querySelectorAll(".op-btn").length).catch(() => 0)) > 0) return f
    await sleep(50)
  }
  throw new Error("the preview frame never drew the page")
}

const themeIds = await (async () => {
  const { page } = await open("/app?live")
  await page.waitForFunction(() => Array.isArray(window.__themeIds))
  const ids = await page.evaluate(() => window.__themeIds)
  await page.close()
  const only = process.env.THEMES ? process.env.THEMES.split(",") : null
  return only ? ids.filter((id) => only.includes(id)) : ids
})()
console.log(`\n${themeIds.length} themes\n`)

/* Rest → hover → rest, read every frame: does it move once, on one line, and come back? */
const HOVER_READ = () => {
  const out = []
  const btn = window.__hoverTarget
  const label = btn.querySelector(".op-label") || btn
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const rgba = (s) => {
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }
  return new Promise((resolve) => {
    const t0 = performance.now()
    const step = () => {
      const cs = getComputedStyle(btn)
      const after = getComputedStyle(btn, "::after")
      const before = getComputedStyle(btn, "::before")
      out.push({ t: performance.now() - t0, bg: rgba(cs.backgroundColor), words: rgba(getComputedStyle(label).color), afterOp: parseFloat(after.opacity) || 0, afterBg: rgba(after.backgroundColor), beforeBg: rgba(before.backgroundColor), beforeOp: parseFloat(before.opacity) || 0 })
      if (performance.now() - t0 < window.__hoverFor) requestAnimationFrame(step)
      else resolve(out)
    }
    requestAnimationFrame(step)
  })
}

const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
/* Is c on the straight line from a to b (each channel between them, all at the same fraction)? */
function onLine(a, b, c, tol = 4) {
  let f = null
  for (let i = 0; i < 4; i++) {
    const span = b[i] - a[i]
    if (Math.abs(span) <= tol) {
      if (Math.abs(c[i] - a[i]) > tol) return false
      continue
    }
    const k = (c[i] - a[i]) / span
    if (k < -0.05 || k > 1.05) return false
    if (f === null) f = k
    else if (Math.abs(k - f) > 0.12) return false
  }
  return true
}
const lum = ([r, g, b]) => {
  const ch = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
const over = (top, under) => {
  const a = top[3] / 255
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(255)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

async function hoverPass(page, frame, where) {
  const targets = await frame.evaluate(() => {
    const seen = new Set()
    const list = []
    for (const el of document.querySelectorAll(".op-btn[data-hover], [data-product-cta][data-hover]")) {
      const r = el.getBoundingClientRect()
      if (r.width < 20 || r.height < 16) continue
      const block = el.closest("[data-op-block]")?.getAttribute("data-op-block") || el.textContent.trim().slice(0, 20)
      const k = `${block}|${el.getAttribute("data-hover")}|${el.hasAttribute("data-product-cta")}`
      if (seen.has(k)) continue
      seen.add(k)
      el.setAttribute("data-probe-hover", String(list.length))
      list.push({ i: list.length, block, hover: el.getAttribute("data-hover"), text: (el.querySelector(".op-label") || el).textContent.trim().slice(0, 28) })
    }
    return list
  })
  const offset = frame === page.mainFrame() ? { x: 0, y: 0 } : await page.evaluate(() => { const r = document.getElementById("preview").getBoundingClientRect(); return { x: r.left, y: r.top } })
  for (const t of targets) {
    const box = await frame.evaluate((i) => {
      const el = document.querySelector(`[data-probe-hover="${i}"]`)
      el.scrollIntoView({ block: "center" })
      const r = el.getBoundingClientRect()
      window.__hoverTarget = el
      window.__hoverFor = 500
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, t.i)
    await page.mouse.move(1, 1)
    await sleep(250)
    const reading = frame.evaluate(HOVER_READ)
    await sleep(30)
    await page.mouse.move(offset.x + box.x, offset.y + box.y)
    const into = await reading
    const leaving = frame.evaluate(HOVER_READ)
    await sleep(30)
    await page.mouse.move(1, 1)
    const out = await leaving
    counts.hovered++
    const rest = into[0]
    const top = into[into.length - 1]
    const name = `${where} ${t.block} "${t.text}" (${t.hover})`
    const bad = []
    for (const field of ["bg", "words", "afterBg"]) {
      for (const s of into) if (!onLine(rest[field], top[field], s[field])) { bad.push(`${field} passed through rgba(${s[field]}) on its way from rgba(${rest[field]}) to rgba(${top[field]}) at ${Math.round(s.t)}ms`); break }
      for (const s of out) if (!onLine(top[field], rest[field], s[field])) { bad.push(`${field} passed through rgba(${s[field]}) on the way back at ${Math.round(s.t)}ms`); break }
      const end = out[out.length - 1]
      if (!near(end[field], rest[field])) bad.push(`${field} did not come back to rest: rgba(${rest[field]}) then rgba(${end[field]})`)
    }
    /* Opacity of the fill layer: one way in, one way out. */
    const ups = into.slice(1).filter((s, i) => s.afterOp + 0.02 < into[i].afterOp).length
    if (ups) bad.push("the hover fill dimmed while the pointer was still on it")
    if (bad.length) {
      counts.hoverBad++
      fail(name, bad.join("; "))
    }
    /* The words on what is under them at the end of the hover, where the fill or tint is solid enough to judge. */
    if ((t.hover === "fill" || t.hover === "pop") && top.afterOp > 0.95 && top.afterBg[3] === 255) {
      const r = ratio(over(top.words, top.afterBg), top.afterBg)
      if (r < 4.5) {
        counts.hoverUnreadable++
        fail(name, `the words rgba(${top.words}) on the hover fill rgba(${top.afterBg}) read at ${r.toFixed(2)}:1`)
      }
    }
  }
}

async function loadPass(path, editor, where, extra = {}) {
  const { page, errors } = await open(path, extra)
  const frame = await pageFrame(page, editor)
  await frame.waitForFunction(() => document.querySelectorAll(".op-btn").length > 0, { timeout: 15000 })
  await sleep(1500)
  const result = await frame.evaluate(() => {
    const o = window.__styleObs
    return { boxes: o.boxes.size, frames: o.frames, changes: o.changes.slice(0, 400), flashes: o.flashes }
  })
  for (const f of result.flashes) {
    counts.entranceFlashes++
    fail(where, `a block seen whole went out again: ${f}`)
  }
  counts.pages++
  counts.boxes += result.boxes
  if (errors.length) fail(where, `the page threw: ${errors[0]}`)
  if (ONLY.has("load")) {
    const byBox = new Map()
    for (const c of result.changes) {
      if (!byBox.has(c.k)) byBox.set(c.k, [])
      byBox.get(c.k).push(c)
    }
    counts.loadChanges += result.changes.length
    for (const [k, list] of byBox) fail(where, `${k.split("|").slice(0, 2).join(" ")} changed ${list.length}x after its first paint, first at ${list[0].t}ms: ${list[0].from}  →  ${list[0].to}`)
  }
  return { page, frame }
}

for (const id of themeIds) {
  /* The published page. */
  {
    const { page, frame } = await loadPass(`/app?live&t=${encodeURIComponent(id)}`, false, `live ${id}`)
    if (ONLY.has("hover")) await hoverPass(page, frame, `live ${id}`)
    if (ONLY.has("overlap")) await overlapPass(frame, `live ${id} 390`)
    await page.close()
  }
  if (QUICK) continue
  /* The editor's preview frame, and a theme switch inside it. */
  {
    const { page, frame } = await loadPass(`/app?editor&t=${encodeURIComponent(id)}`, true, `editor ${id}`)
    if (ONLY.has("switch")) {
      const next = themeIds[(themeIds.indexOf(id) + 7) % themeIds.length]
      await frame.evaluate(() => { const o = window.__styleObs; o.changes = []; for (const b of o.boxes.values()) b.before = b.last })
      await page.evaluate((n) => window.__setTheme(n), next)
      await sleep(1500)
      const sw = await frame.evaluate(() => {
        const o = window.__styleObs
        const per = new Map()
        for (const c of o.changes) per.set(c.k, (per.get(c.k) || 0) + 1)
        return [...per].filter(([, n]) => n > 1).map(([k, n]) => ({ k, n, list: o.changes.filter((c) => c.k === k).slice(0, 4) }))
      })
      for (const s of sw) {
        counts.switchBad++
        fail(`editor ${id} → ${next}`, `${s.k.split("|").slice(0, 2).join(" ")} changed ${s.n} times instead of once: ${s.list.map((c) => `${c.t}ms ${c.to}`).join("  |  ")}`)
      }
    }
    if (ONLY.has("hover")) await hoverPass(page, frame, `editor ${id}`)
    await page.close()
  }
}

/* The product block in every layout: title, price and button apart, inside the card. */
async function overlapPass(frame, where) {
  const found = await frame.evaluate(() => {
    const out = []
    const hit = (a, b, m = 1) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m
    for (const card of document.querySelectorAll("[data-product-block]")) {
      const c = card.getBoundingClientRect()
      if (c.width < 10) continue
      const parts = [["title", card.querySelector("[data-block-title]")], ["price", card.querySelector("[data-product-price]")], ["button", card.querySelector("[data-product-cta]")]].filter(([, el]) => el)
      const rects = parts.map(([n, el]) => {
        /* The words' own box: a truncated title is as wide as what shows. */
        const r = el.getBoundingClientRect()
        return [n, r]
      })
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) if (hit(rects[i][1], rects[j][1], 3)) out.push(`${card.getAttribute("data-product-block")}: the ${rects[i][0]} and the ${rects[j][0]} overlap by ${Math.round(Math.min(rects[i][1].bottom, rects[j][1].bottom) - Math.max(rects[i][1].top, rects[j][1].top))}px`)
        const r = rects[i][1]
        if (r.left < c.left - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) out.push(`${card.getAttribute("data-product-block")}: the ${rects[i][0]} runs out of the card`)
      }
      /* Words cut by the button: the price's or title's text running under it. */
      const btn = card.querySelector("[data-product-cta]")
      if (btn) {
        const b = btn.getBoundingClientRect()
        for (const el of card.querySelectorAll("[data-block-title], [data-product-price] span")) {
          const range = document.createRange()
          range.selectNodeContents(el)
          /* What is painted of the words: a truncated line is cut where its box (or a clipping ancestor) ends. */
          let clip = { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 }
          for (let a = el; a && a !== card.parentElement; a = a.parentElement) {
            const s = getComputedStyle(a)
            if (s.overflowX === "visible" && s.overflowY === "visible") continue
            const q = a.getBoundingClientRect()
            clip = { left: Math.max(clip.left, q.left), right: Math.min(clip.right, q.right), top: Math.max(clip.top, q.top), bottom: Math.min(clip.bottom, q.bottom) }
          }
          for (const raw of range.getClientRects()) {
            const r = { left: Math.max(raw.left, clip.left), right: Math.min(raw.right, clip.right), top: Math.max(raw.top, clip.top), bottom: Math.min(raw.bottom, clip.bottom) }
            if (r.right - r.left > 1 && r.bottom - r.top > 1 && hit(r, b)) out.push(`${card.getAttribute("data-product-block")}: "${el.textContent.trim().slice(0, 20)}" is drawn under the button`)
          }
        }
      }
    }
    return [...new Set(out)]
  })
  for (const f of found) {
    counts.overlaps++
    fail(where, f)
  }
}

if (ONLY.has("overlap")) {
  for (const width of [320, 390, 768, 1280]) {
    const { page, errors } = await open(`/app?live&t=${encodeURIComponent(themeIds[0])}`, { width })
    await page.waitForFunction(() => document.querySelectorAll("[data-product-block]").length > 0, { timeout: 15000 })
    await sleep(800)
    await overlapPass(page.mainFrame(), `live ${width}`)
    if (errors.length) fail(`live ${width}`, errors[0])
    await page.close()
  }
}

/* Design › Social icons on the social row. */
if (ONLY.has("icons")) {
  for (const id of themeIds) {
    for (const style of ["filled", "outline", "minimal"]) {
      for (const tone of ["brand", "mono"]) {
        const { page } = await open(`/app?live&t=${encodeURIComponent(id)}&icons=${style}/${tone}`)
        await page.waitForFunction(() => document.querySelectorAll("[data-op-social-icon]").length > 0, { timeout: 15000 }).catch(() => {})
        await sleep(300)
        const icons = await page.evaluate(() =>
          [...document.querySelectorAll("[data-op-social-icon]")].map((a) => {
            const cs = getComputedStyle(a)
            const svg = a.querySelector("svg")
            const path = svg?.querySelector("path")
            return {
              platform: a.getAttribute("data-op-social-icon"),
              bg: cs.backgroundColor,
              bgImage: cs.backgroundImage,
              border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
              blur: cs.backdropFilter,
              w: a.getBoundingClientRect().width,
              ink: path ? getComputedStyle(path).fill : "",
              svgColor: svg ? getComputedStyle(svg).color : "",
              mark: svg?.getAttribute("data-mark") || "",
              tone: svg?.getAttribute("data-tone") || "",
            }
          }),
        )
        await page.close()
        const where = `icons ${id} ${style}/${tone}`
        if (!icons.length) {
          counts.iconBad++
          fail(where, "no social icons drawn")
          continue
        }
        const sig = (i) => `${i.bg}|${i.bgImage}|${i.border}|${i.blur}|${Math.round(i.w)}`
        if (new Set(icons.map(sig)).size > 1) {
          counts.iconBad++
          fail(where, `the icons of one row are drawn differently: ${icons.map((i) => `${i.platform} ${sig(i)}`).join("  /  ")}`)
        }
        const i0 = icons[0]
        const alpha = (c) => { const m = /rgba?\(([^)]*)\)/.exec(c); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1 }
        if (style === "filled" && !(alpha(i0.bg) > 0.05)) { counts.iconBad++; fail(where, `Solid draws no tile behind the mark (${i0.bg})`) }
        if (style === "outline" && !(parseFloat(i0.border) >= 1 && alpha(i0.border.split(" ").slice(2).join(" ")) > 0.2)) { counts.iconBad++; fail(where, `Outline draws no ring (${i0.border})`) }
        if (style === "minimal" && !(alpha(i0.bg) > 0.05 && /blur/.test(i0.blur || ""))) { counts.iconBad++; fail(where, `Glass draws no frosted tile (${i0.bg}, ${i0.blur})`) }
        if (tone === "mono" && new Set(icons.map((i) => i.ink || i.svgColor)).size > 1) { counts.iconBad++; fail(where, `One colour draws ${new Set(icons.map((i) => i.ink)).size} colours: ${icons.map((i) => `${i.platform} ${i.ink}`).join(", ")}`) }
        if (tone === "brand" && !icons.some((i) => i.tone === "brand")) { counts.iconBad++; fail(where, "Brand colours draws no mark in its brand's colour") }
      }
    }
  }
}

/* The block animations: running when chosen, still under reduced motion. */
if (ONLY.has("motion")) {
  for (const anim of ["pulse", "bounce", "shake", "glow", "swipe"]) {
    for (const editor of [false, true]) {
      for (const reduced of [false, true]) {
        const where = `${editor ? "editor" : "live"} ${anim}${reduced ? " reduced" : ""}`
        const { page } = await open(`/app?${editor ? "editor" : "live"}&t=${encodeURIComponent(themeIds[0])}&anim=${anim}`, { reduced })
        const frame = await pageFrame(page, editor)
        await frame.waitForFunction(() => document.querySelectorAll(".op-btn").length > 0, { timeout: 15000 })
        await sleep(2600)
        /* The entrance: the first screen arrived (in the preview, once the frame was shown), and a block below it arrives when scrolled to. */
        const first = await frame.evaluate(() => ({ ...window.__styleObs.anims }))
        const firstIn = (first["animationend:op-block-enter"] || 0) + (first["animationend:enter"] || 0)
        if (!reduced && !firstIn) { counts.motionBad++; fail(where, `the first screen's blocks never arrived (${JSON.stringify(first)})`) }
        if (reduced && firstIn) { counts.motionBad++; fail(where, `blocks faded in under reduced motion (${JSON.stringify(first)})`) }
        const below = await frame.evaluate(async () => {
          const before = window.__styleObs.anims["animationend:op-block-enter"] || 0
          const last = [...document.querySelectorAll("[data-op-block]")].pop()
          const waiting = last.closest("[data-op-enter]")?.getAttribute("data-op-enter") || null
          last.scrollIntoView({ block: "center" })
          await new Promise((r) => setTimeout(r, 900))
          let o = 1
          for (let a = last; a && a !== document.body; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity)
          return { waiting, arrived: (window.__styleObs.anims["animationend:op-block-enter"] || 0) - before, opacity: o }
        })
        if (!reduced && (below.waiting !== "wait" || below.arrived < 1)) { counts.motionBad++; fail(where, `the last block did not wait for its turn and arrive when scrolled to (${JSON.stringify(below)})`) }
        if (below.opacity < 0.99) { counts.motionBad++; fail(where, `the last block is at opacity ${below.opacity} once scrolled to`) }
        if (reduced && below.waiting) { counts.motionBad++; fail(where, "a block was held for an entrance under reduced motion") }
        const r = await frame.evaluate(() => {
          const els = [...document.querySelectorAll('[class*="animate-onepage-"]')]
          return els.map((el) => {
            const anims = el.getAnimations({ subtree: true }).filter((a) => /onepage-(pulse|bounce|shake|glow|swipe)/.test(a.animationName || ""))
            return { cls: [...el.classList].find((c) => c.startsWith("animate-onepage-")), running: anims.filter((a) => a.playState === "running").length, block: el.closest("[data-op-block]")?.getAttribute("data-op-block") }
          })
        })
        await page.close()
        if (!r.length) {
          counts.motionBad++
          fail(where, "no block carries the animation")
          continue
        }
        const still = r.filter((x) => !x.running)
        const moving = r.filter((x) => x.running)
        if (!reduced && still.length) {
          counts.motionBad++
          fail(where, `${still.length} of ${r.length} animated blocks stand still: ${still.map((x) => x.block).join(", ")}`)
        }
        if (reduced && moving.length) {
          counts.motionBad++
          fail(where, `${moving.length} blocks move under reduced motion: ${moving.map((x) => x.block).join(", ")}`)
        }
      }
    }
  }
}

await browser.close()
server.close()

console.log(`  pages drawn               ${counts.pages}`)
console.log(`  boxes watched             ${counts.boxes}`)
console.log(`  changes after first paint ${counts.loadChanges}`)
console.log(`  buttons hovered           ${counts.hovered}`)
console.log(`  hovers off their line     ${counts.hoverBad}`)
console.log(`  hover words unreadable    ${counts.hoverUnreadable}`)
console.log(`  theme switch, not once    ${counts.switchBad}`)
console.log(`  product overlaps          ${counts.overlaps}`)
console.log(`  social icon rows wrong    ${counts.iconBad}`)
console.log(`  block animations wrong    ${counts.motionBad}`)
console.log(`  entrance flashes          ${counts.entranceFlashes}`)
if (problems.length) {
  const shown = problems.slice(0, Number(process.env.SHOW || 60))
  console.error(`\n${problems.length} problems${problems.length > shown.length ? ` (first ${shown.length})` : ""}:\n${shown.map((p) => `  - ${p}`).join("\n")}\n`)
  process.exit(1)
}
console.log("\nEvery button and icon holds one look per theme, hovers once, and reads; products keep their words apart.\n")
