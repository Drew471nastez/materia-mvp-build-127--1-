/**
 * ===========================================================================
 *  WAVE 10 (legible): EVERY VISIBLE WORD ON EVERY THEME CAN BE READ
 * ===========================================================================
 * The owner: "there is no way across all of OnePage for errors like text not
 * showing or getting hidden ... fix across all places so it NEVER happens".
 *
 * scripts/render-onepage-legible-w10.tsx draws a page of every kind of block
 * (the newsletter in all eight of its layouts among them) with a theme picked
 * as Design › Themes picks it. This walks EVERY theme the picker lists (it
 * reads the list from the page, so a theme another track adds tomorrow is
 * walked too) in every block layout at 390, and every theme at 1280, plain and
 * with a creator's own colours over it (light words on a light theme, dark on a
 * dark one, a light grey button with light grey words), and the share sheet
 * of each theme.
 *
 * It does NOT ask lib/onepage/legible what it thinks (that is what it checks):
 * it looks at pixels. One screenshot of the page with every word made clear
 * (color: transparent) is what is painted under the words, photos, skins,
 * scenes and all; each word's glyph boxes (a Range over its text) are sampled
 * there, and the word's own computed colour (faded by its ancestors' opacity)
 * must reach 4.5:1 (3:1 for 24px, or 18.66px bold) against 80% of the pixels
 * under it (the rest may be a skin's grain, a sparkle, an icon). A field's
 * value and placeholder count as words.
 *
 *   node scripts/check-onepage-legible-w10.mjs          every theme × layout × override
 *   QUICK=1          the default layout only, and the override pass on every theme
 *   THEMES=a,b       only these themes      GUARD=0  the page without the guard (shows what it saves)
 *   ONLY=words,own   the words pass, and/or the creator's own Design over each skinned theme
 *   SHOTS=<dir>      a screenshot of each failing page, its failing words outlined
 */
import { existsSync, mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const SHOTS = process.env.SHOTS || ""
const QUICK = process.env.QUICK === "1"
const GUARD = process.env.GUARD !== "0"
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
let pages = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-legible-w10.tsx" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* In the page: every visible word's glyph boxes, its colour, its minimum. Words are marked data-lg="<n>". */
const COLLECT = (scope) => {
  /* Any colour the browser computes (rgb, color(srgb), oklch, ...), read back as the pixel it paints. */
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const parse = (s) => {
    if (!s) return null
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const out = []
  let n = 0
  const skip = "script,style,noscript,template,svg,canvas,video,audio,iframe,[data-legible-skip],[data-skin-scene]"
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(skip)) continue
    /* With a sheet up, the page behind it is under its shade: only the sheet's own words are seen. */
    if (scope && !el.closest(scope)) continue
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    if (field && el instanceof HTMLInputElement && /^(checkbox|radio|hidden|range|color|file|submit|button|image)$/.test(el.type)) continue
    const nodes = field ? [] : [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim())
    if (!field && !nodes.length) continue
    const cs = getComputedStyle(el)
    if (cs.visibility !== "visible" || cs.display === "none") continue
    let fade = 1
    let hidden = false
    for (let a = el; a; a = a.parentElement) {
      if (a.hasAttribute("inert")) hidden = true
      fade *= parseFloat(getComputedStyle(a).opacity)
    }
    if (hidden || fade < 0.05) continue
    const fill = cs.webkitTextFillColor
    const fillC = parse(fill)
    if (fillC && fillC.a === 0) continue /* words drawn as a gradient: a picture of words */
    if (/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || "")) continue
    let rects = []
    let kind = "text"
    let words = ""
    let color = parse(fillC && fill !== cs.color ? fill : cs.color)
    if (field) {
      const r = el.getBoundingClientRect()
      const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) }
      rects = [{ left: r.left + pad.l, top: r.top + pad.t, width: Math.max(0, r.width - pad.l - pad.r), height: Math.max(0, r.height - pad.t - pad.b) }]
      if (el.value) {
        kind = "value"
        words = el.value
      } else if (el.placeholder) {
        kind = "placeholder"
        words = el.placeholder
        color = parse(getComputedStyle(el, "::placeholder").color)
      } else continue
    } else {
      words = nodes.map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim()
      for (const t of nodes) {
        const range = document.createRange()
        range.selectNodeContents(t)
        rects.push(...[...range.getClientRects()].map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height })))
      }
    }
    rects = rects.filter((r) => r.width >= 2 && r.height >= 4).map((r) => ({ left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height }))
    if (!rects.length || !color) continue
    /* Clipped away (a carousel's off-screen card, a closed accordion) is not seen. */
    const clipped = (() => {
      const r = rects[0]
      const cx = r.left - scrollX + r.width / 2
      const cy = r.top - scrollY + r.height / 2
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") continue
        const b = a.getBoundingClientRect()
        if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) return true
      }
      return false
    })()
    if (clipped) continue
    /* Only the part of the words their scrolling or clipping boxes show. */
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") continue
      const b = a.getBoundingClientRect()
      rects = rects
        .map((r) => {
          const l = Math.max(r.left, b.left + scrollX)
          const t = Math.max(r.top, b.top + scrollY)
          const rr = Math.min(r.left + r.width, b.right + scrollX)
          const bb = Math.min(r.top + r.height, b.bottom + scrollY)
          return { left: l, top: t, width: rr - l, height: bb - t }
        })
        .filter((r) => r.width >= 2 && r.height >= 4)
    }
    if (!rects.length) continue
    /* A text-shadow strong enough to outline the words (a halo) carries them over a gloss or a photo. */
    const halo = cs.textShadow && cs.textShadow !== "none" ? parse((/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(cs.textShadow) || [])[1]) : null
    const size = parseFloat(cs.fontSize) || 16
    const weight = parseInt(cs.fontWeight) || 400
    el.setAttribute("data-lg", String(n))
    out.push({ n: n++, kind, words: words.slice(0, 60), halo: halo && halo.a >= 0.35 ? halo : null, color: { ...color, a: color.a * fade }, min: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5, rects })
  }
  return out
}

/* In the page: the pixels under each word from the words-hidden screenshot (a PNG as a data URL), and each ratio. */
const MEASURE = async ({ png, words, dpr }) => {
  const img = new Image()
  img.src = png
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const bad = []
  for (const w of words) {
    const ratios = []
    const grounds = []
    for (const r of w.rects) {
      const steps = 8
      for (let i = 0; i < steps; i++)
        for (let j = 0; j < 3; j++) {
          const x = Math.floor((r.left + ((i + 0.5) / steps) * r.width) * dpr)
          const y = Math.floor((r.top + ((j + 0.5) / 3) * r.height) * dpr)
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue
          const d = ctx.getImageData(x, y, 1, 1).data
          const ground = { r: d[0], g: d[1], b: d[2] }
          grounds.push(ground)
          const a = w.color.a
          const fg = { r: w.color.r * a + ground.r * (1 - a), g: w.color.g * a + ground.g * (1 - a), b: w.color.b * a + ground.b * (1 - a) }
          ratios.push(ratio(fg, ground))
        }
    }
    if (!ratios.length) continue
    ratios.sort((p, q) => p - q)
    /* Outlined words read against their outline (laid over the ground under them), whatever else is there. */
    if (w.halo && grounds.length) {
      const g = grounds[Math.floor(grounds.length / 2)]
      const h = { r: w.halo.r * w.halo.a + g.r * (1 - w.halo.a), g: w.halo.g * w.halo.a + g.g * (1 - w.halo.a), b: w.halo.b * w.halo.a + g.b * (1 - w.halo.a) }
      if (ratio(w.color, h) >= w.min) continue
    }
    /* 80% of the pixels under the words must read: the lowest fifth may be grain, a sparkle, an icon beside them. */
    const at = ratios[Math.floor(ratios.length * 0.2)]
    if (at + 0.05 < w.min) bad.push({ n: w.n, kind: w.kind, words: w.words, ratio: Math.round(at * 100) / 100, min: w.min, rects: w.rects, color: w.color, sample: ratios.filter((_, i) => i % 3 === 0).map((r) => Math.round(r * 10) / 10) })
  }
  return bad
}

async function audit(path, width, label) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}${path}${GUARD ? "" : "&guard=0"}`)
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]))
  await sleep(900)
  if (path.includes("share=1")) {
    await page.evaluate(() => [...document.querySelectorAll("[data-onepage-share-button]")].find((e) => e.getClientRects().length)?.click())
    await sleep(1100)
  }
  /* Still: no motion between the two pictures. */
  await page.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important}" })
  /* The whole page in one viewport, so the layout measured is the layout pictured (a full-page capture re-lays a page out). */
  if (!path.includes("share=1")) {
    for (let i = 0; i < 3; i++) {
      const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
      await page.setViewport({ width, height: Math.min(h, 16000), deviceScaleFactor: 1 })
      await sleep(250)
      if ((await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))) === h) break
    }
  }
  /* Entrances that the tall viewport just started (a block revealed as it scrolls in) end now; endless ones stop. */
  await sleep(100)
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish()
        else a.pause()
      } catch {}
    }
  })
  await sleep(450)
  const words = await page.evaluate(COLLECT, path.includes("share=1") ? "[role='dialog']" : null)
  const hide = await page.addStyleTag({ content: "*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;text-decoration-color:transparent !important}*::placeholder{color:transparent !important;-webkit-text-fill-color:transparent !important}" })
  /* An inline colour set !important (the guard's own, a block's) is not reached by a stylesheet: clear those too. */
  await page.evaluate(() => {
    window.__lgInline = []
    for (const el of document.querySelectorAll("[style*='color']")) {
      window.__lgInline.push([el, el.getAttribute("style")])
      el.style.setProperty("color", "transparent", "important")
      el.style.setProperty("-webkit-text-fill-color", "transparent", "important")
    }
  })
  await sleep(60)
  const shot = await page.screenshot({ encoding: "base64", captureBeyondViewport: false })
  await hide.evaluate((n) => n.remove())
  await page.evaluate(() => window.__lgInline.forEach(([el, style]) => el.setAttribute("style", style)))
  if (process.env.DEBUG && SHOTS) (await import("node:fs")).writeFileSync(`${SHOTS}/${label.replace(/[^a-z0-9-]+/gi, "_")}-hidden.png`, Buffer.from(shot, "base64"))
  const bad = await page.evaluate(MEASURE, { png: `data:image/png;base64,${shot}`, words, dpr: 1 })
  pages++
  if (bad.length && SHOTS) {
    await page.evaluate((ns) => ns.forEach((n) => { const e = document.querySelector(`[data-lg="${n}"]`); if (e) e.style.outline = "2px solid #ff00aa" }), bad.map((b) => b.n))
    await page.screenshot({ path: `${SHOTS}/${label.replace(/[^a-z0-9-]+/gi, "_")}.png`, captureBeyondViewport: false })
  }
  if (process.env.DEBUG) console.log(JSON.stringify(bad.slice(0, 3)))
  check(`${label}: ${words.length} words, every one reads`, bad.length === 0 && errors.length === 0, errors.length ? errors.slice(0, 2) : bad.slice(0, 6).map((b) => `${b.kind} "${b.words}" ${b.ratio}:1 < ${b.min}`).join("; ") + (bad.length > 6 ? ` …+${bad.length - 6}` : ""))
  await page.close()
  return words.length
}

/* Every theme the Themes panel lists, read from the page itself. */
const probe = await browser.newPage()
await probe.goto(`${base}/app/onepage?live&t=default`)
await sleep(600)
let themes = await probe.evaluate(() => globalThis.__themeIds || [])
await probe.close()
if (process.env.THEMES) themes = process.env.THEMES.split(",")
console.log(`\n${themes.length} themes in the picker${GUARD ? "" : " (GUARD=0: without the guard)"}`)
check("the picker lists the W9 skinned themes", ["aero", "aqua", "messenger", "y2k", "playful", "grunge"].every((t) => themes.includes(t)) || !!process.env.THEMES, themes)

const ONLY = (process.env.ONLY || "words,own").split(",")

/*
 * OWN: on every skinned theme, the creator's Design changes made after picking it (?d=1: colour, corners, shadow,
 * border, social icons, typeface) show on the page: each box's computed value is the renderer's own (its inline
 * style), not the skin's, and the button is visibly the pink the creator chose.
 */
if (ONLY.includes("own")) {
  console.log("\nOwn design over a skinned theme")
  for (const t of themes) {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 900 })
    await page.goto(`${base}/app/onepage?live&t=${t}&d=1${GUARD ? "" : "&guard=0"}`)
    await sleep(1300)
    const r = await page.evaluate(() => {
      const root = [...document.querySelectorAll("[data-op-skin]")].find((e) => e.getClientRects().length)
      if (!root) return null
      const btn = [...root.querySelectorAll("a.op-btn")].find((e) => e.getClientRects().length)
      const social = [...root.querySelectorAll("[data-op-social-icon]")].find((e) => e.getClientRects().length)
      const cs = getComputedStyle(btn)
      const inline = (el, p) => el.style.getPropertyValue(p)
      const same = (el, p) => {
        const want = inline(el, p)
        if (!want) return true
        const probe = document.createElement("div")
        probe.style.setProperty(p, want)
        document.body.appendChild(probe)
        const w = getComputedStyle(probe).getPropertyValue(p)
        probe.remove()
        return getComputedStyle(el).getPropertyValue(p) === w
      }
      return {
        skin: root.getAttribute("data-op-skin"),
        own: root.getAttribute("data-sk-own"),
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        clip: cs.clipPath,
        font: cs.fontFamily,
        btn: ["background-color", "border-radius", "box-shadow", "border-top-width", "border-top-color"].filter((p) => !same(btn, p)),
        social: social ? ["background-color", "border-radius", "border-top-color"].filter((p) => !same(social, p)) : [],
      }
    })
    await page.close()
    if (!r) continue
    check(`${t} (${r.skin}): the creator's pink pill, shadow and border win over the skin`, r.bg === "rgb(224, 36, 94)" && parseFloat(r.radius) >= 20 && r.clip === "none" && r.btn.length === 0, r)
    check(`${t} (${r.skin}): the social icons and typeface are the creator's`, r.social.length === 0 && /Georgia/.test(r.font), r)
  }
}

const LAYOUTS = QUICK ? ["list"] : ["list", "grid", "cards", "compact", "masonry"]
for (const t of ONLY.includes("words") ? themes : []) {
  console.log(`\n${t}`)
  for (const l of LAYOUTS) await audit(`/app/onepage?live&t=${t}&l=${l}`, 390, `${t} ${l} 390`)
  await audit(`/app/onepage?live&t=${t}`, 1280, `${t} 1280`)
  for (const o of ["light", "dark", "buttons"]) await audit(`/app/onepage?live&t=${t}&o=${o}`, 390, `${t} own ${o} colours 390`)
  await audit(`/app/onepage?live&t=${t}&share=1`, 390, `${t} share sheet 390`)
}

await browser.close()
server.close()
console.log(`\n${pages} pages measured`)
if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
