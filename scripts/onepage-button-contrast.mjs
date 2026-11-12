/**
 * ===========================================================================
 *  EVERY BUTTON'S WORDS READ, IN EVERY STATE (round 3)
 * ===========================================================================
 * The owner: "in some places the theme still doesn't apply well to buttons and
 * hover states, leading to invisible text: dark text on dark button colours
 * (and light on light)".
 *
 * The contrast pass of scripts/check-onepage-style-stability.mjs. It does not
 * ask the code what colour it chose: it looks at pixels, as
 * scripts/check-onepage-legible-w10.mjs does for the page at rest, but for
 * every button-like thing (a link, a button, a chip, a radio, the product's
 * button, a social icon, a sheet's buttons) in every state it can be in:
 *
 *   rest      as the page draws it: selected and unselected chips, a poll's
 *             options, a disabled button, all in one picture
 *   hover     the pointer on it (a Fill drawn by ::after, a Glow by ::before,
 *             a gradient, a picture under the words: whatever is painted)
 *   focus     focused from the keyboard (:focus-visible)
 *   active    the pointer held down on it
 *
 * For each state: the words' own colour is read (faded by their ancestors'
 * opacity), then every word on the page is made clear (-webkit-text-fill-color,
 * which leaves currentColor alone, so a chip filled with its words' colour
 * keeps its fill) and the button is photographed again. The pixels under the
 * glyphs (where the two pictures differ) are what the words sit on: 80% of them must reach 4.5:1 (3:1 for
 * large words, and for an icon's mark). States whose button looks the same at
 * rest share one reading (same classes, same computed look, same block).
 *
 * Then the sheets a visitor opens: a product's, Share, Subscribe and the tip
 * amount sheet, each button in it at rest, hovered and focused.
 */
import sharp from "sharp"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** What counts as a button: anything a visitor presses or picks. */
export const PRESSABLE =
  "a[href], button, [role=button], [role=radio], [role=tab], [role=option], [role=switch], [role=checkbox], [role=menuitemradio], input[type=submit], input[type=button], [data-product-cta], .op-btn, [data-op-social-icon]"

const FREEZE = "*,*::before,*::after{transition:none !important;caret-color:transparent !important}"
/* Words made clear: only the glyphs' own fill, so currentColor (a chip's fill, a border) stays as it is. */
/* Weighted over any skin's own !important (three ids that never match): a skin's text-shadow or stroke must not leave a copy of the words behind. */
const W = "html:not(#cg-a#cg-b#cg-c)"
const HIDE = `${W} *,${W} *::before,${W} *::after{-webkit-text-fill-color:transparent !important;-webkit-text-stroke:0 transparent !important;text-shadow:none !important;text-decoration-color:transparent !important}${W} :is(${PRESSABLE}) svg,${W} :is(${PRESSABLE}) [data-cg-icon]{visibility:hidden !important}`

/* In the page: the words (and icon marks) of every visible pressable in `scope`, or of the one marked data-cg-only. */
const COLLECT = ({ scope, only, sel }) => {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const parse = (s) => {
    if (!s || s === "none" || /^url\(/.test(s)) return null
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const root = only ? document.querySelector(`[data-cg-target="${only}"]`) : scope ? document.querySelector(scope) : document.body
  if (!root) return { words: [], targets: [] }
  const skip = "script,style,noscript,template,canvas,video,audio,iframe,[data-legible-skip],[data-skin-scene],[aria-hidden='true'] [aria-hidden='true']"
  const fadeOf = (el) => {
    let fade = 1
    for (let a = el; a; a = a.parentElement) {
      if (a.hasAttribute("inert")) return 0
      fade *= parseFloat(getComputedStyle(a).opacity)
    }
    return fade
  }
  /* Clipped by the words' own box too: a truncated title's text runs on, unseen, under whatever is beside it. */
  const clipRects = (el, rects) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflowX === "visible" && s.overflowY === "visible") continue
      const b = a.getBoundingClientRect()
      rects = rects
        .map((r) => {
          const l = Math.max(r.left, b.left)
          const t = Math.max(r.top, b.top)
          return { left: l, top: t, width: Math.min(r.left + r.width, b.right) - l, height: Math.min(r.top + r.height, b.bottom) - t }
        })
        .filter((r) => r.width >= 2 && r.height >= 4)
    }
    return rects.filter((r) => r.left + r.width > 0 && r.top + r.height > 0 && r.left < innerWidth && r.top < innerHeight)
  }
  const targets = []
  const tIndex = new Map()
  const targetOf = (el) => {
    const t = el.closest(sel)
    if (!t || !root.contains(t) && !t.contains(root)) return null
    if (!tIndex.has(t)) {
      if (!t.hasAttribute("data-cg-target")) t.setAttribute("data-cg-target", String(window.__cgSeq = (window.__cgSeq || 0) + 1))
      const cs = getComputedStyle(t)
      const pa = getComputedStyle(t, "::after")
      const pb = getComputedStyle(t, "::before")
      const block = t.closest("[data-op-block], [data-block-id], [data-onepage-app], [role=dialog]")
      const blockName = block ? block.getAttribute("data-op-block") || block.getAttribute("data-block-id") || block.getAttribute("data-onepage-app") || "dialog" : ""
      const r = t.getBoundingClientRect()
      tIndex.set(t, targets.length)
      targets.push({
        id: t.getAttribute("data-cg-target"),
        block: blockName,
        label: (t.getAttribute("aria-label") || t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 32),
        focusable: t.tabIndex >= 0 && !t.disabled,
        disabled: !!t.disabled || t.getAttribute("aria-disabled") === "true",
        selected: ["aria-checked", "aria-pressed", "aria-selected"].some((k) => t.getAttribute(k) === "true") || t.getAttribute("data-state") === "on" || t.getAttribute("data-state") === "checked",
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        sig: [t.tagName, t.className && t.className.baseVal === undefined ? t.className : "", t.getAttribute("data-hover"), t.getAttribute("role"), t.getAttribute("aria-checked"), t.disabled, cs.backgroundColor, cs.backgroundImage.slice(0, 120), cs.color, cs.webkitTextFillColor, cs.borderTopColor, pa.backgroundColor, pa.backgroundImage.slice(0, 80), pb.backgroundColor, t.getAttribute("style"), (t.closest("[data-op-block]") || t.parentElement)?.getAttribute("data-op-block")?.replace(/[0-9]+$/, "")].join("|"),
      })
    }
    return tIndex.get(t)
  }
  const words = []
  const scan = only ? [root, ...root.querySelectorAll("*")] : root.querySelectorAll("*")
  for (const el of scan) {
    if (el.closest(skip)) continue
    const isIcon = el.tagName.toLowerCase() === "svg"
    const nodes = isIcon ? [] : [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim())
    if (!isIcon && !nodes.length) continue
    const ti = targetOf(el)
    if (ti === null || ti === undefined) continue
    const cs = getComputedStyle(el)
    if (cs.visibility !== "visible" || cs.display === "none") continue
    const fade = fadeOf(el)
    if (fade < 0.05) continue
    let color
    let rects
    let min
    let kind = "words"
    let text = ""
    if (isIcon) {
      /* An icon alone in its button (a social icon, Share): its mark at 3:1. An icon beside words is decoration. */
      const t = targets[ti]
      if (t.label && el.closest(sel).textContent.trim()) continue
      if (el.getAttribute("data-tone") === "brand") continue
      const shape = el.querySelector("path, circle, rect, polygon")
      if (!shape) continue
      const ss = getComputedStyle(shape)
      color = parse(ss.fill !== "none" ? ss.fill : ss.stroke)
      if (!color) continue
      /* A filter drawn over the mark (Arcade's black marks on its coins: brightness(0)) is what is seen; any other, unknown. */
      let filtered = null
      for (let a = el; a && a !== targets[ti] && a !== document.body; a = a.parentElement) {
        const f = getComputedStyle(a).filter
        if (f && f !== "none") filtered = f
        if (a === el.closest(sel)) break
      }
      if (filtered) {
        if (/^brightness\(0\) invert\(1\)/.test(filtered)) color = { r: 255, g: 255, b: 255, a: color.a }
        else if (/^brightness\(0\)/.test(filtered)) color = { r: 0, g: 0, b: 0, a: color.a }
        else continue
      }
      const r = el.getBoundingClientRect()
      rects = [{ left: r.left, top: r.top, width: r.width, height: r.height }]
      min = 3
      kind = "icon"
      text = targets[ti].label || el.closest(sel).getAttribute("data-op-social-icon") || "icon"
    } else {
      if (/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || "")) continue
      const fill = parse(cs.webkitTextFillColor)
      if (fill && fill.a === 0) continue
      color = fill || parse(cs.color)
      if (!color) continue
      rects = []
      for (const t of nodes) {
        const range = document.createRange()
        range.selectNodeContents(t)
        rects.push(...[...range.getClientRects()].map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height })))
      }
      const size = parseFloat(cs.fontSize) || 16
      const weight = parseInt(cs.fontWeight) || 400
      min = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5
      text = nodes.map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim().slice(0, 40)
    }
    rects = clipRects(el, rects.filter((r) => r.width >= 2 && r.height >= 4))
    if (!rects.length) continue
    const halo = !isIcon && cs.textShadow && cs.textShadow !== "none" ? parse((/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(cs.textShadow) || [])[1]) : null
    words.push({ t: ti, kind, text, color: { ...color, a: color.a * fade }, halo: halo && halo.a >= 0.35 ? halo : null, min, rects })
  }
  return { words, targets }
}

/* Clears every inline text fill (the guard's own, a block's) so the HIDE sheet reaches it; puts them back after. */
const CLEAR_INLINE = () => {
  window.__cgInline = []
  for (const el of document.querySelectorAll("[style*='color'], [style*='text-shadow']")) {
    window.__cgInline.push([el, el.getAttribute("style")])
    el.style.setProperty("-webkit-text-fill-color", "transparent", "important")
    el.style.setProperty("text-shadow", "none", "important")
  }
}
const RESTORE_INLINE = () => {
  for (const [el, style] of window.__cgInline || []) el.setAttribute("style", style)
  window.__cgInline = []
}

const lin = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (c, g) => ({ r: c.r * c.a + g.r * (1 - c.a), g: c.g * c.a + g.g * (1 - c.a), b: c.b * c.a + g.b * (1 - c.a) })

/**
 * The words against the pixels under them in `shot` (raw RGBA, `origin` its top left in the page). Failures only.
 * `seen` is the same area with the words drawn: where it differs from `shot` is where the glyphs are, and only the
 * ground under those counts (a line box is taller and wider than its glyphs, and can reach past a pill's clipped
 * corners). Words that change nothing at all were drawn in the colour of what is under them: every sample counts.
 */
function judge(words, shot, origin, seen) {
  const bad = []
  for (const w of words) {
    let ratios = []
    let grounds = []
    const inked = []
    const inkedGrounds = []
    for (const r of w.rects) {
      const cols = w.kind === "icon" ? 8 : Math.max(8, Math.min(40, Math.round(r.width / 3)))
      const rows = w.kind === "icon" ? 8 : 6
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = Math.floor(r.left - origin.x + ((i + 0.5) / cols) * r.width)
          const y = Math.floor(r.top - origin.y + ((j + 0.5) / rows) * r.height)
          if (x < 0 || y < 0 || x >= shot.width || y >= shot.height) continue
          const k = (y * shot.width + x) * shot.channels
          const g = { r: shot.data[k], g: shot.data[k + 1], b: shot.data[k + 2] }
          const q = ratio(mix(w.color, g), g)
          grounds.push(g)
          ratios.push(q)
          if (seen && Math.max(Math.abs(seen.data[k] - g.r), Math.abs(seen.data[k + 1] - g.g), Math.abs(seen.data[k + 2] - g.b)) > 28) {
            inked.push(q)
            inkedGrounds.push(g)
          }
        }
    }
    if (inked.length >= 4) {
      ratios = inked
      grounds = inkedGrounds
    }
    if (!ratios.length) continue
    ratios.sort((p, q) => p - q)
    if (w.halo) {
      const g = grounds[Math.floor(grounds.length / 2)]
      if (ratio(w.color, mix(w.halo, g)) >= w.min) continue
    }
    const at = ratios[Math.floor(ratios.length * 0.2)]
    if (at + 0.05 < w.min) {
      const g = grounds.sort((p, q) => lum(p) - lum(q))[Math.floor(grounds.length / 2)]
      bad.push({ ...w, ratio: Math.round(at * 100) / 100, ground: `rgb(${g.r},${g.g},${g.b})` })
    }
  }
  return bad
}

async function shoot(page, clip) {
  const buf = await page.screenshot({ type: "png", clip, captureBeyondViewport: false })
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

/** One reading: collect the words as they are now, hide them, photograph `clip`, judge. */
async function reading(page, { scope = null, only = null, clip = null }) {
  /* An entrance that began after the page was stilled (a block that came into view late) is finished first: read as it is seen. */
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        if (a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity) a.finish()
      } catch {}
    }
  })
  const { words, targets } = await page.evaluate(COLLECT, { scope, only, sel: PRESSABLE })
  if (!words.length) return { words, targets, bad: [] }
  const vp = page.viewport()
  const area = clip || { x: 0, y: 0, width: vp.width, height: vp.height }
  /* The words as drawn, then the same area with every word made clear. */
  const seen = await shoot(page, area)
  const hide = await page.addStyleTag({ content: HIDE })
  await page.evaluate(CLEAR_INLINE)
  const shot = await shoot(page, area)
  await page.evaluate(RESTORE_INLINE)
  await hide.evaluate((n) => n.remove())
  const bad = judge(words, shot, area, seen)
  if (process.env.CG_DUMP && bad.length && !clip) {
    const b = bad[0].rects[0]
    const x = Math.max(0, Math.floor(b.left - 20)), y = Math.max(0, Math.floor(b.top - 20))
    await sharp(shot.data, { raw: { width: shot.width, height: shot.height, channels: shot.channels } }).extract({ left: x, top: y, width: Math.min(shot.width - x, Math.ceil(b.width + 40)), height: Math.min(shot.height - y, Math.ceil(b.height + 40)) }).png().toFile(`${process.env.CG_DUMP}/${bad[0].text.slice(0, 12).replace(/\W/g, "_")}.png`)
  }
  return { words, targets, bad }
}

/** The page still: entrances finished, endless motion paused, no transitions (a state is read as it ends up). */
async function still(page) {
  await page.addStyleTag({ content: FREEZE })
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish()
        else a.pause()
      } catch {}
    }
  })
  /* Nothing pressed here navigates or opens anything. */
  await page.evaluate(() => {
    if (window.__cgBlock) return
    window.__cgBlock = true
    for (const t of ["click", "auxclick"]) window.addEventListener(t, (e) => { if (window.__cgBlockClicks) { e.preventDefault(); e.stopImmediatePropagation() } }, true)
    window.__cgBlockClicks = true
  })
  await sleep(120)
}

/** Every pressable in `scope` in each of `states`. Returns { readings, failures }. */
async function statesOf(page, where, { scope = null, states = ["rest", "hover", "focus", "active"] } = {}) {
  const failures = []
  let readings = 0
  const rest = await reading(page, { scope })
  readings += rest.words.length
  for (const b of rest.bad) failures.push({ where, state: rest.targets[b.t]?.disabled ? "disabled" : rest.targets[b.t]?.selected ? "selected" : "rest", block: rest.targets[b.t]?.block, ...b })
  /* One reading per look: buttons drawn alike at rest hover alike. */
  const seen = new Set()
  const unique = rest.targets.filter((t) => {
    if (seen.has(t.sig)) return false
    seen.add(t.sig)
    return t.rect.w >= 8 && t.rect.h >= 8 && rest.words.some((w) => rest.targets[w.t] === t)
  })
  for (const t of unique) {
    for (const state of states) {
      if (state === "rest") continue
      if (state === "focus" && !t.focusable) continue
      if (t.disabled && state !== "focus") continue
      /* Where the target is now (a sheet may have moved), and its centre. */
      const box = await page.evaluate((id) => {
        const el = document.querySelector(`[data-cg-target="${id}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        if (r.width < 4 || r.bottom < 0 || r.top > innerHeight) return null
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }, t.id)
      if (!box) continue
      const cx = box.x + box.w / 2
      const cy = box.y + box.h / 2
      await page.mouse.move(1, 1)
      if (state === "hover") await page.mouse.move(cx, cy)
      if (state === "active") {
        await page.mouse.move(cx, cy)
        await page.mouse.down()
      }
      if (state === "focus") {
        const ok = await page.evaluate((id) => {
          const el = document.querySelector(`[data-cg-target="${id}"]`)
          el.focus({ focusVisible: true, preventScroll: true })
          return document.activeElement === el && el.matches(":focus-visible")
        }, t.id)
        if (!ok) continue
      }
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const vp = page.viewport()
      const x = Math.max(0, Math.floor(box.x) - 2)
      const y = Math.max(0, Math.floor(box.y) - 2)
      const clip = { x, y, width: Math.max(1, Math.min(vp.width, Math.ceil(box.x + box.w) + 2) - x), height: Math.max(1, Math.min(vp.height, Math.ceil(box.y + box.h) + 2) - y) }
      const r = await reading(page, { only: t.id, clip })
      readings += r.words.length
      for (const b of r.bad) failures.push({ where, state, block: t.block, ...b })
      if (state === "active") {
        await page.mouse.move(1, 1)
        await page.mouse.up()
      }
      if (state === "focus") await page.evaluate(() => document.activeElement?.blur())
    }
  }
  await page.mouse.move(1, 1)
  return { readings, failures, buttons: rest.targets.length }
}

/**
 * The contrast pass for one theme: the page at 390 (every pressable, every state), and its sheets.
 * `open(path, opts)` opens a probe page ({ page }); `id` the theme.
 */
export async function contrastPass(open, id, { width = 390, sheets = true, style = null } = {}) {
  const bs = style ? `&bs=${style}` : ""
  const failures = []
  const opened = []
  let readings = 0
  let buttons = 0
  {
    const { page } = await open(`/app?live&all=1${bs}&t=${encodeURIComponent(id)}`, { width, height: 900 })
    await page.waitForFunction(() => document.querySelectorAll(".op-btn").length > 0, { timeout: 15000 })
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]))
    await sleep(900)
    /* The whole page in one viewport: nothing scrolls between a state and its picture. */
    for (let i = 0; i < 3; i++) {
      const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
      await page.setViewport({ width, height: Math.min(h, 14000), deviceScaleFactor: 1 })
      await sleep(250)
      if ((await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))) === h) break
    }
    await still(page)
    await sleep(350)
    const r = await statesOf(page, `${id}${style ? `/${style}` : ""} ${width}`)
    readings += r.readings
    buttons += r.buttons
    failures.push(...r.failures)
    await page.close()
  }
  if (sheets) {
    /* Each sheet a visitor opens: a product's, Share, Subscribe, the tip amounts. */
    const opens = [
      ["product", () => document.querySelector('[data-op-block="p-sheet"] [data-product-cta]')?.click()],
      ["share", () => [...document.querySelectorAll("[data-onepage-share-button]")].find((e) => e.getClientRects().length)?.click()],
      ["subscribe", () => [...document.querySelectorAll("[data-onepage-bell]")].find((e) => e.getClientRects().length)?.click()],
      ["tip", () => document.querySelector('[data-tip-amount="other"]')?.click()],
    ]
    for (const [name, how] of opens) {
      const { page } = await open(`/app?live&all=1${bs}&t=${encodeURIComponent(id)}`, { width, height: 844 })
      await page.waitForFunction(() => document.querySelectorAll(".op-btn").length > 0, { timeout: 15000 })
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]))
      await sleep(700)
      await page.evaluate(how)
      await sleep(1100)
      const scope = await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog], [data-onepage-dialog]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height > 60).pop()
        if (!d) return null
        d.setAttribute("data-cg-sheet", "")
        return "[data-cg-sheet]"
      })
      if (!scope) {
        await page.close()
        continue
      }
      await still(page)
      const r = await statesOf(page, `${id}${style ? `/${style}` : ""} ${name} sheet`, { scope, states: ["rest", "hover", "focus"] })
      opened.push(`${name} ${r.buttons}`)
      readings += r.readings
      buttons += r.buttons
      failures.push(...r.failures)
      await page.close()
    }
  }
  return { failures, readings, buttons, opened }
}
