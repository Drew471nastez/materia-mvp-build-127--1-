/**
 * ===========================================================================
 *  THREE PARTS OF THE PRODUCT EDITOR, MEASURED
 * ===========================================================================
 * The real editor (app/(storelib)/app/products/new/product-editor.tsx), mounted from a
 * saved product by scripts/render-product-editor.tsx, at 390 and 1280.
 *
 *   FILES. The uploader (lib/storage/chunked-upload.ts) is a stand-in the
 *   probe drives frame by frame, so every state is seen: preparing,
 *   uploading, done, failed. Three files go at once. While they move, only
 *   transform and opacity animate inside the list, no row and nothing below
 *   the list moves, and nothing is violet or green. The one that finishes
 *   first (the second of three) stays second; its wash fades and a check
 *   comes and goes in its glyph. The one that fails says so in its row and
 *   Retry starts it again in the same place.
 *   PRICING. Fixed price, Pay what you want, Free: the white slides on
 *   transform in about 200ms and lands on the chosen one unscaled; the
 *   fields under it change in place and the box eases to its new height
 *   with no frame that jumps. Free clears the price, Fixed gives it back.
 *   Reduced motion: nothing slides.
 *   CATEGORY. A field in the main column above the description. On a
 *   phone, the shared sheet on the bottom edge: no X, no dots, 48px rows, a
 *   search on top, the suggestion pinned at its foot; a group slides open
 *   (transform and opacity only), Back slides back, a category chooses and
 *   closes. On a computer, the list opens from the field, its width, 6px
 *   under it, the field keeping the focus; a group slides open in the same
 *   list at the same height; Left, Down, Right, Enter, Escape and a click
 *   outside; type, Enter, chosen; the suggestion with its grey tag, and the
 *   x that clears it. A new product takes the suggestion as its value.
 *
 *   node scripts/check-editor-parts.mjs      (PROBE_CSS=source without a build)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face)")
const stubs = join(root, ".editor-parts-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-editor-parts-")), "shots")
mkdirSync(shots, { recursive: true })
const PREFIX = "editor-parts-"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the stand-in uploader: the same class, driven from the page ─────── */
const FAKE_UPLOADER = `
export async function computeSHA256() { return "probe" }
export class DirectUploader {
  constructor(o) { this.o = o; this.status = "idle"; this.aborted = false; (window.__fake ||= {})[o.file.name] = this }
  setStatus(s) { this.status = s; this.o.onStatusChange && this.o.onStatusChange(s) }
  start() {
    this.setStatus("computing_checksum")
    return new Promise((resolve, reject) => {
      this._resolve = resolve; this._reject = reject
      setTimeout(() => { if (this.aborted) return; this.setStatus("preparing"); setTimeout(() => { if (this.aborted) return; this.setStatus("uploading"); this.progress(5) }, 40) }, 40)
    })
  }
  progress(pct) {
    const total = this.o.file.size
    const sent = Math.min(total, Math.round(Math.max(0, pct - 5) / 90 * total))
    this.o.onProgress && this.o.onProgress(Math.round(pct), sent, total)
  }
  finish() {
    const f = this.o.file
    this.progress(95)
    this.setStatus("completing")
    setTimeout(() => {
      const r = { assetId: "asset-" + f.name, path: "c1/p/" + f.name, bucket: "digital-products", publicUrl: "", checksum: "probe", fileName: f.name, fileSize: f.size, mimeType: f.type || "application/octet-stream" }
      this.o.onProgress && this.o.onProgress(100, f.size, f.size)
      this.setStatus("complete")
      this.o.onComplete && this.o.onComplete(r)
      this._resolve(r)
    }, 60)
  }
  fail() {
    this.setStatus("error")
    const e = { message: "Network error during upload", code: "NETWORK_ERROR", retryable: true }
    this.o.onError && this.o.onError(e)
    this._reject(e)
  }
  abort() { this.aborted = true; this.setStatus("aborted"); const e = { message: "Upload cancelled", code: "ABORTED", retryable: false }; this.o.onError && this.o.onError(e); this._reject && this._reject(e) }
  pause() {} resume() { return this.start() } getStatus() { return this.status } destroy() {}
}
`

/* Every animation running inside a scope: which properties it moves. */
const ANIMATED_PROPS = `(scope) => {
  const out = []
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target
    if (!t || !scope.contains(t)) continue
    if (a.transitionProperty) out.push(a.transitionProperty)
    else for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) out.push(p)
  }
  return out
}`

/* A colour that reads as violet or green: hue in those bands, saturated. */
const TINTED = `(c) => {
  const m = c.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/)
  if (!m) return null
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => +x / 255)
  const a = m[4] === undefined ? 1 : +m[4]
  if (a < 0.05) return null
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.18) return null
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h >= 250 && h <= 290) return "violet"
  if (h >= 90 && h <= 160) return "green"
  return null
}`

async function files(p, label, isPhone) {
  console.log("  -- files: three at once, each in its own row")
  await p.evaluate(() => document.querySelector("[data-file-list]").scrollIntoView({ block: "start" }))
  await sleep(200)
  const before = await p.$$eval("[data-file-row]", (r) => r.map((x) => x.querySelector("p").textContent))
  expect(before.length === 2, "the saved product's two files are rows", before)

  const dir = mkdtempSync(join(tmpdir(), "parts-files-"))
  const names = ["workbook.pdf", "presets.zip", "walkthrough.mp4"]
  const sizes = [3_400_000, 900_000, 2_200_000]
  const paths = names.map((n, i) => { const f = join(dir, n); writeFileSync(f, Buffer.alloc(sizes[i], 1)); return f })
  const input = await p.$("#file-input")
  await input.uploadFile(...paths)
  await sleep(250)
  const rows = await p.$$eval("[data-file-row]", (r) => r.map((x) => ({ name: x.querySelector("p").textContent, state: x.dataset.state, meta: x.querySelector("[data-file-meta]").textContent })))
  expect(rows.length === 5 && names.every((n, i) => rows[2 + i].name === n), "three new rows under the two, in the order they were chosen", rows.map((r) => r.name))
  const preparing = rows.slice(2).map((r) => r.meta)
  expect(preparing.every((m) => /^Preparing|of/.test(m)), "each says it is preparing, with its size", preparing)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-files-start.png`) })

  /* The geometry every frame must keep from here on. */
  const geometry = () => p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-file-row]")].map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.top * 10) / 10, Math.round(b.height * 10) / 10] })
    const next = document.querySelector("[data-file-list]").closest(".rounded-2xl").nextElementSibling.getBoundingClientRect().top
    return { rows, next: Math.round(next * 10) / 10 }
  })
  const g0 = await geometry()
  await p.evaluate(() => { window.__shiftsFrom = window.__shifts.length })

  /* Progress in steps, the way a browser reports an upload, sampled each frame. */
  await p.evaluate((names, ANIM, TINT) => {
    const animated = eval(ANIM)
    const tinted = eval(TINT)
    window.__samples = []
    window.__props = new Set()
    window.__tints = []
    const list = document.querySelector("[data-file-list]")
    const t0 = performance.now()
    const tick = () => {
      const t = performance.now() - t0
      const fill = [...document.querySelectorAll("[data-file-row]")].map((r) => {
        const f = r.querySelector("[data-upload-fill]")
        const cs = getComputedStyle(f)
        return { m: new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform).a, o: +cs.opacity }
      })
      window.__samples.push({ t, fill })
      for (const p of animated(list)) window.__props.add(p)
      for (const el of list.querySelectorAll("*")) {
        const cs = getComputedStyle(el)
        for (const c of [cs.backgroundColor, cs.borderTopColor, cs.color, cs.fill, cs.stroke]) {
          const k = tinted(c)
          if (k) window.__tints.push(k + ":" + (el.getAttribute("data-upload-fill") !== null ? "fill" : el.tagName))
        }
      }
      if (t < 2600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    let pct = 5
    const step = () => {
      pct += 6
      for (const n of names) window.__fake[n] && window.__fake[n].status === "uploading" && window.__fake[n].progress(Math.min(pct * (n === "presets.zip" ? 1.4 : 1), 90))
      if (pct < 60) setTimeout(step, 110)
    }
    setTimeout(step, 60)
  }, names, ANIMATED_PROPS, TINTED)
  await sleep(700)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-files-uploading.png`) })
  const mid = await p.$$eval("[data-file-row]", (r) => r.slice(2).map((x) => ({ meta: x.querySelector("[data-file-meta]").textContent, pct: x.querySelector("[data-upload-percent]")?.textContent })))
  expect(mid.every((m) => / of /.test(m.meta) && /\d+%/.test(m.pct ?? "")), "while they go: how much of how much, and a real percentage", mid)

  /* The second finishes first. */
  await sleep(300)
  await p.evaluate(() => window.__fake["presets.zip"].finish())
  const checkSeen = await p.evaluate(async () => {
    const row = [...document.querySelectorAll("[data-file-row]")].find((r) => r.querySelector("p").textContent === "presets.zip")
    const seen = []
    const t0 = performance.now()
    await new Promise((done) => {
      const tick = () => {
        const c = row.querySelector("[data-upload-check]")
        seen.push({ t: Math.round(performance.now() - t0), o: +getComputedStyle(c).opacity, fillO: +getComputedStyle(row.querySelector("[data-upload-fill]")).opacity, state: row.dataset.state })
        if (performance.now() - t0 < 1700) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    return { seen, connected: row.isConnected }
  })
  const peak = Math.max(...checkSeen.seen.map((s) => s.o))
  const last = checkSeen.seen[checkSeen.seen.length - 1]
  const firstDone = checkSeen.seen.find((s) => s.state === "done")
  expect(checkSeen.connected, "the finished row is the same element it was while uploading (no remount)")
  expect(peak > 0.95 && last.o < 0.05, "a check comes into its glyph and fades away again", { peak, end: last.o, at: firstDone?.t })
  expect(last.fillO < 0.05, "and the wash behind it has faded", last.fillO)
  const afterDone = await p.$$eval("[data-file-row]", (r) => r.map((x) => ({ name: x.querySelector("p").textContent, state: x.dataset.state })))
  expect(afterDone.map((r) => r.name).join() === [...before, ...names].join(), "finishing first does not move it: still second of the three", afterDone.map((r) => `${r.name}:${r.state}`))
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-files-one-done.png`) })

  /* The rest: one finishes, one fails. */
  await p.evaluate(() => { window.__fake["workbook.pdf"].finish(); window.__fake["walkthrough.mp4"].fail() })
  await sleep(400)
  const g1 = await geometry()
  const moved = g0.rows.map((r, i) => [r[0] - (g1.rows[i]?.[0] ?? NaN), r[1] - (g1.rows[i]?.[1] ?? NaN)]).filter(([a, b]) => Math.abs(a) > 0.5 || Math.abs(b) > 0.5)
  expect(moved.length === 0 && Math.abs(g0.next - g1.next) <= 0.5, "no row and nothing below the list moved from the first frame of the uploads to the last", { moved, below: [g0.next, g1.next] })
  const shifts = await p.evaluate(() => window.__shifts.slice(window.__shiftsFrom).map((v, i) => [v, (window.__shiftWho || [])[window.__shiftsFrom + i]]))
  expect(shifts.length === 0, "no layout shift at all while they uploaded, finished and failed", shifts)
  const props = await p.evaluate(() => [...window.__props])
  expect(props.length > 0 && props.every((x) => ["transform", "opacity"].includes(x)), "everything that animated in the list moved transform or opacity only", props)
  const tints = [...new Set(await p.evaluate(() => window.__tints))]
  expect(tints.length === 0, "no violet and no green anywhere in the list, bar or text", tints)
  const fills = await p.evaluate(() => window.__samples.map((s) => s.fill[2]?.m ?? 0))
  const grow = fills.filter((v, i) => i && v < fills[i - 1] - 0.001).length
  expect(fills.length > 30 && grow === 0 && fills[fills.length - 1] > 0.4, "the first upload's wash only ever grew, frame to frame", { frames: fills.length, backwards: grow, last: +fills[fills.length - 1].toFixed(3) })

  const failed = await p.$$eval("[data-file-row]", (r) => { const x = r[4]; return { state: x.dataset.state, meta: x.querySelector("[data-file-meta]").textContent, retry: !!x.querySelector("[data-upload-retry]"), h: x.getBoundingClientRect().height } })
  expect(failed.state === "error" && /Connection lost/.test(failed.meta) && failed.retry, "the failed one says why in its own row, with Retry", failed)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-files-failed.png`) })
  await p.click("[data-file-row] [data-upload-retry]")
  await sleep(200)
  const again = await p.$$eval("[data-file-row]", (r) => ({ name: r[4].querySelector("p").textContent, state: r[4].dataset.state }))
  expect(again.name === "walkthrough.mp4" && again.state !== "error", "Retry starts it again in the same place", again)
  await p.evaluate(() => window.__fake["walkthrough.mp4"].finish())
  await sleep(1700)
  const final = await p.$$eval("[data-file-row]", (r) => r.map((x) => x.dataset.state))
  expect(final.every((s) => s === "file"), "all five settle into plain file rows", final)

  /* Presses on a phone: every button in a row is 44px. */
  if (isPhone) {
    const small = await p.$$eval("[data-file-list] button", (b) => b.map((x) => { const r = x.getBoundingClientRect(); return [x.getAttribute("aria-label") || x.textContent.trim(), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
    expect(small.length === 0, "every button in the list is at least 44px on a phone", small)
  }
  rmSync(dir, { recursive: true, force: true })
}

async function pricing(p, label) {
  console.log("  -- pricing: the white slides, the fields change in place")
  await p.evaluate(() => document.querySelector("[data-segmented]").scrollIntoView({ block: "center" }))
  await sleep(250)
  const run = (value) => p.evaluate(async (value) => {
    const track = document.querySelector("[data-segmented]")
    const thumb = track.querySelector("[data-segment-thumb]")
    const box = document.querySelector("[data-swap-panels]")
    const below = box.closest(".rounded-2xl").nextElementSibling
    const button = track.querySelector(`[data-value="${value}"]`)
    const read = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(thumb).transform)
      return { t: performance.now(), x: m.e, sx: m.a, h: box.getBoundingClientRect().height, below: below.getBoundingClientRect().top }
    }
    const frames = [read()]
    button.click()
    await new Promise((done) => {
      const t0 = performance.now()
      const tick = () => { frames.push(read()); if (performance.now() - t0 < 520) requestAnimationFrame(tick); else done() }
      requestAnimationFrame(tick)
    })
    const t0 = frames[0].t
    return { frames: frames.map((f) => ({ ...f, t: Math.round(f.t - t0) })), target: button.offsetLeft, width: button.offsetWidth, thumbW: thumb.offsetWidth }
  }, value)

  const judge = (r, what) => {
    const f = r.frames
    const xs = f.map((x) => x.x)
    const dir = Math.sign(r.target - xs[0])
    const backwards = xs.filter((x, i) => i && dir * (x - xs[i - 1]) < -0.5).length
    const moving = f.filter((x, i) => i && (Math.abs(x.x - f[i - 1].x) > 0.3 || Math.abs(x.sx - f[i - 1].sx) > 0.002))
    const slide = moving.length ? moving[moving.length - 1].t : 0
    const end = f[f.length - 1]
    expect(backwards === 0 && Math.abs(end.x - r.target) < 0.6 && Math.abs(end.sx - 1) < 0.001 && r.thumbW === r.width,
      `${what}: the white slides one way and lands on it, unscaled`, { from: Math.round(xs[0]), to: Math.round(end.x), target: r.target, backwards, scaleAtRest: +end.sx.toFixed(3) })
    expect(slide >= 120 && slide <= 290, `${what}: in about 200ms`, { ms: slide, frames: moving.length })
    const hs = f.map((x) => x.h)
    const dh = hs[hs.length - 1] - hs[0]
    const steps = hs.slice(1).map((h, i) => h - hs[i])
    const biggest = Math.max(...steps.map(Math.abs))
    const wrongWay = steps.filter((s) => Math.sign(s) && Math.sign(dh) && Math.sign(s) !== Math.sign(dh) && Math.abs(s) > 0.3).length
    const eased = Math.abs(dh) < 1 || (biggest <= Math.max(6, Math.abs(dh) * 0.35) && wrongWay === 0)
    expect(eased, `${what}: the fields' box ${Math.abs(dh) < 1 ? "keeps its height" : "eases to its new height"} with no jump`, { from: Math.round(hs[0]), to: Math.round(hs[hs.length - 1]), biggestFrame: +biggest.toFixed(1), wrongWay })
    const b = f.map((x) => x.below)
    const bJump = Math.max(...b.slice(1).map((y, i) => Math.abs(y - b[i])))
    expect(bJump <= Math.max(6, Math.abs(dh) * 0.35), `${what}: the card below follows it smoothly`, { biggestFrame: +bJump.toFixed(1) })
  }

  const price0 = await p.$eval("#price", (i) => i.value)
  const r1 = await run("pwyw")
  judge(r1, "to Pay what you want")
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-pricing-pwyw.png`) })
  const pwyw = await p.evaluate(() => ({ min: !!document.querySelector("[data-panel=pwyw]:not([aria-hidden]) #pwywMin"), fixedHidden: getComputedStyle(document.querySelector("[data-panel=fixed]")).visibility }))
  expect(pwyw.min && pwyw.fixedHidden === "hidden", "the minimum and suggested amounts are what is shown and reachable", pwyw)
  const r2 = await run("free")
  judge(r2, "to Free")
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-pricing-free.png`) })
  const cleared = await p.$eval("#price", (i) => i.value)
  const r3 = await run("fixed")
  judge(r3, "back to Fixed price")
  const back = await p.$eval("#price", (i) => i.value)
  expect(cleared === "" && back === price0 && price0 !== "", "Free clears the price and Fixed gives it back", { before: price0, free: cleared, after: back })
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-pricing-fixed.png`) })
  const radios = await p.$$eval("[data-segmented] [role=radio]", (b) => b.map((x) => [x.textContent, x.getAttribute("aria-checked"), Math.round(x.getBoundingClientRect().height)]))
  expect(radios.map((r) => r[0]).join("|") === "Fixed price|Pay what you want|Free" && radios[0][1] === "true", "three choices, a radio group, Fixed price chosen", radios)
}

async function reduced(p) {
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const n = await p.evaluate(async () => {
    const track = document.querySelector("[data-segmented]")
    track.querySelector('[data-value="free"]').click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    /* Colour and opacity may still fade; nothing may move or resize. */
    const running = document.getAnimations()
      .filter((a) => track.contains(a.effect?.target) || a.effect?.target?.closest?.("[data-swap-panels]"))
      .flatMap((a) => a.transitionProperty ? [a.transitionProperty] : a.effect.getKeyframes().flatMap((k) => Object.keys(k)))
      .filter((p) => ["transform", "height", "translate", "scale"].includes(p)).length
    const box = getComputedStyle(document.querySelector("[data-swap-panels]")).transitionDuration
    track.querySelector('[data-value="fixed"]').click()
    return { running, box }
  })
  expect(n.running === 0, "reduced motion: the white and the fields change without moving", n)
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
}

/* What moved while a level slid in: every animated property inside the list. */
const SLIDE_WATCH = `(() => {
  window.__slideProps = new Set(); window.__slideGhosts = 0
  const root = document.querySelector("[data-category-dropdown], [data-app-sheet]")
  const tick = () => {
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.target
      if (!t || !root || !root.contains(t)) continue
      for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) window.__slideProps.add(p)
    }
    window.__slideGhosts = Math.max(window.__slideGhosts, document.querySelectorAll("[data-category-ghost]").length)
    if (performance.now() - start < 500) requestAnimationFrame(tick)
  }
  const start = performance.now()
  requestAnimationFrame(tick)
})()`
const slideResult = (p) => p.evaluate(() => ({ props: [...window.__slideProps], ghostsSeen: window.__slideGhosts, ghostsLeft: document.querySelectorAll("[data-category-ghost]").length }))
const chosenText = (p) => p.evaluate(() => document.querySelector("[data-category-chosen]")?.textContent ?? null)

async function category(p, label, isPhone, vp) {
  console.log("  -- category")
  /* In the main column, above the description, as a field. */
  const place = await p.evaluate(() => {
    const f = document.querySelector("[data-editor-category]")
    const main = document.querySelector("[data-editor-main]")
    const desc = f?.parentElement?.querySelector("[contenteditable]")
    return { inMain: !!f && !!main?.contains(f), above: !!f && !!desc && f.getBoundingClientRect().bottom <= desc.getBoundingClientRect().top, sideHasIt: !!document.querySelector("[data-editor-side] [data-category-field]") }
  })
  expect(place.inMain && place.above && !place.sideHasIt, "the field is in the main column, above the description", place)
  await p.evaluate(() => document.querySelector("[data-category-trigger]").scrollIntoView({ block: "center" }))
  await sleep(250)
  const suggested = await p.evaluate(() => document.querySelector("[data-product-editor] #title, #title")?.value)
  if (isPhone) {
    await p.click("[data-category-trigger]")
    await sleep(650)
    const sheet = await p.evaluate(() => {
      const root = document.querySelector("[data-app-sheet]")
      const panel = root?.querySelector("[data-sheet-panel]")
      if (!panel) return null
      const r = panel.getBoundingClientRect()
      const buttons = [...panel.querySelectorAll("button")]
      const xs = buttons.filter((b) => /close/i.test(b.getAttribute("aria-label") || "") || b.querySelector("svg.lucide-x"))
      const dots = [...panel.querySelectorAll("*")].filter((el) => {
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return b.width > 0 && b.width <= 8 && b.height <= 8 && parseFloat(cs.borderRadius) >= b.width / 2 - 0.5 && cs.backgroundColor !== "rgba(0, 0, 0, 0)"
      })
      const rows = [...panel.querySelectorAll("[data-category-row]")].map((x) => Math.round(x.getBoundingClientRect().height))
      const pin = panel.querySelector("[data-category-suggested]")
      return {
        state: root.dataset.appSheet,
        bottom: Math.round(innerHeight - r.bottom), left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top),
        xButtons: xs.length, dots: dots.length, bullet: /•/.test(panel.textContent), rows: [Math.min(...rows), rows.length],
        search: !!panel.querySelector("[data-category-search]"), grabber: !!panel.querySelector("[data-sheet-handle]"),
        pinned: pin ? { name: pin.dataset.categorySuggested, tag: !!pin.querySelector("[data-suggested-tag]"), atFoot: Math.round(r.bottom - pin.getBoundingClientRect().bottom) } : null,
      }
    })
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-sheet.png`) })
    expect(!!sheet && sheet.state === "open" && Math.abs(sheet.bottom) <= 1 && sheet.left === 0 && sheet.width === vp.width, "the shared sheet, on the bottom edge, the full width", sheet && { bottom: sheet.bottom, left: sheet.left, width: sheet.width, top: sheet.top })
    expect(sheet && sheet.xButtons === 0 && sheet.grabber, "no X: the grabber, a pull or a tap outside close it", sheet && { xButtons: sheet.xButtons })
    expect(sheet && sheet.dots === 0 && !sheet.bullet, "no dots", sheet && { dots: sheet.dots, bullet: sheet.bullet })
    expect(sheet && sheet.search && sheet.rows[0] >= 48, "a search on top, and rows at least 48px", sheet && { minRow: sheet.rows[0], rows: sheet.rows[1] })
    expect(!!sheet?.pinned && sheet.pinned.name === "Lightroom Presets" && sheet.pinned.tag && sheet.pinned.atFoot <= 60, "the suggestion pinned at the foot of the sheet, with its tag", sheet?.pinned)
    await p.evaluate(SLIDE_WATCH)
    await p.evaluate(() => document.querySelector('[data-category-group="Design & Creative"]').click())
    await sleep(120)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-sliding.png`) })
    await sleep(450)
    const slid = await slideResult(p)
    expect(slid.ghostsSeen === 1 && slid.ghostsLeft === 0 && slid.props.length > 0 && slid.props.every((x) => x === "transform" || x === "opacity"), "a group slides in on transform and opacity, and the old level is gone after", slid)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-group.png`) })
    const inGroup = await p.evaluate(() => ({ back: document.querySelector("[data-category-back]")?.textContent, header: document.querySelector("[data-category-header]")?.textContent, fonts: !!document.querySelector('[data-category-option="Fonts"]') }))
    expect(inGroup.back === "Back to All" && inGroup.header === "Design & Creative" && inGroup.fonts, "Back to All, the group as a header, its categories", inGroup)
    await p.evaluate(() => document.querySelector("[data-category-back]").click())
    await sleep(450)
    const backed = await p.evaluate(() => document.querySelectorAll("[data-category-group]").length)
    expect(backed >= 20, "and back slides to the groups", { groups: backed })
    await p.evaluate(() => document.querySelector('[data-category-group="Design & Creative"]').click())
    await sleep(450)
    await p.evaluate(() => document.querySelector('[data-category-option="Fonts"]').click())
    await sleep(700)
    const after = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-app-sheet]"), chosen: document.querySelector("[data-category-chosen]")?.textContent }))
    expect(!after.sheet && /^Fontsin Design & Creative/.test(after.chosen || ""), "choosing one closes the sheet, and it is shown under the field", after)
    /* Search. */
    await p.click("[data-category-trigger]")
    await sleep(650)
    await p.focus("[data-app-sheet] [data-category-search]")
    await p.keyboard.type("lut")
    await sleep(250)
    const found = await p.$$eval("[data-app-sheet] [data-category-option]", (b) => b.map((x) => x.dataset.categoryOption))
    expect(found.includes("Video LUTs") && found.includes("Cinematic LUTs"), "a search finds across every group", found.slice(0, 5))
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-search.png`) })
    await p.evaluate(() => document.querySelector('[data-category-option="Video LUTs"]').click())
    await sleep(700)
    const picked = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-app-sheet]"), chosen: document.querySelector("[data-category-chosen]")?.textContent }))
    expect(!picked.sheet && /^Video LUTs/.test(picked.chosen || ""), "and choosing a found one closes it too", picked)
    /* The suggestion, from the sheet's foot. */
    await p.click("[data-category-trigger]")
    await sleep(650)
    await p.evaluate(() => document.querySelector("[data-app-sheet] [data-category-suggested]").click())
    await sleep(700)
    const sug = await p.evaluate(() => ({ chosen: document.querySelector("[data-category-chosen]")?.textContent, tag: !!document.querySelector("[data-category-chosen] [data-suggested-tag]") }))
    expect(/^Lightroom Presets/.test(sug.chosen || "") && sug.tag, "the suggestion chosen, marked Suggested under the field", sug)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-chosen.png`) })
  } else {
    await p.click("[data-category-trigger]")
    await sleep(300)
    const drop = await p.evaluate(() => {
      const el = document.querySelector("[data-category-dropdown]")
      const field = document.querySelector("[data-category-search]")
      if (!el || !field) return null
      const r = el.getBoundingClientRect()
      const f = field.getBoundingClientRect()
      const pin = el.querySelector("[data-category-suggested]")
      return {
        left: Math.round(r.left - f.left), width: Math.round(r.width - f.width),
        below: Math.round(r.top - f.bottom), above: Math.round(f.top - r.bottom), h: Math.round(r.height),
        cx: Math.round(r.left + r.width / 2 - innerWidth / 2),
        focus: document.activeElement === field, dialog: !!document.querySelector('[role="dialog"][data-category-dialog], [data-app-sheet]'),
        groups: el.querySelectorAll("[data-category-group]").length,
        row: Math.round(el.querySelector("[data-category-row]").getBoundingClientRect().height),
        pinned: pin ? { name: pin.dataset.categorySuggested, tag: !!pin.querySelector("[data-suggested-tag]"), atFoot: Math.round(r.bottom - pin.getBoundingClientRect().bottom) } : null,
      }
    })
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-dropdown.png`) })
    expect(!!drop && drop.left === 0 && drop.width === 0 && (drop.below === 6 || drop.above === 6) && !drop.dialog, "the list opens from the field: its left edge, its width, 6px under (or over) it, not a window", drop)
    expect(!!drop && drop.focus, "and the field keeps the focus", drop && { focus: drop.focus })
    expect(!!drop && drop.groups >= 20 && drop.row === 36, "the groups, 36px rows", drop && { groups: drop.groups, row: drop.row })
    expect(!!drop?.pinned && drop.pinned.name === "Lightroom Presets" && drop.pinned.tag && drop.pinned.atFoot <= 8, "the suggestion pinned at the foot, with its tag", drop?.pinned)
    /* Into a group, with the mouse. */
    await p.evaluate(SLIDE_WATCH)
    await p.click('[data-category-group="Audio & Music"]')
    await sleep(120)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-sliding.png`) })
    await sleep(450)
    const slid = await slideResult(p)
    const inGroup = await p.evaluate(() => {
      const el = document.querySelector("[data-category-dropdown]")
      return { h: Math.round(el.getBoundingClientRect().height), back: el.querySelector("[data-category-back]")?.textContent, header: el.querySelector("[data-category-header]")?.textContent, drums: !!el.querySelector('[data-category-option="Drum Kits"]'), focus: document.activeElement?.hasAttribute("data-category-search") }
    })
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-group.png`) })
    expect(slid.ghostsSeen === 1 && slid.ghostsLeft === 0 && slid.props.length > 0 && slid.props.every((x) => x === "transform" || x === "opacity"), "a group slides in on transform and opacity, and the old level is gone after", slid)
    expect(inGroup.back === "Back to All" && inGroup.header === "Audio & Music" && inGroup.drums && inGroup.focus, "inside the same list: Back to All, the group as a header, its categories, the field still focused", inGroup)
    expect(drop && inGroup.h === drop.h, "the list keeps its height: nothing around it moves", { before: drop?.h, after: inGroup.h })
    /* Keys: Left goes back with the group it left highlighted, Up and Right open the one above it, Enter chooses. */
    await p.keyboard.press("ArrowLeft")
    await sleep(400)
    const left = await p.evaluate(() => ({ header: !!document.querySelector("[data-category-header]"), on: document.querySelector('[data-category-dropdown] [aria-selected="true"]')?.textContent }))
    expect(!left.header && left.on === "Audio & Music", "Left goes back, on the group it came from", left)
    await p.keyboard.press("ArrowUp")
    await p.keyboard.press("ArrowRight")
    await sleep(400)
    const keyed = await p.evaluate(() => ({ header: document.querySelector("[data-category-header]")?.textContent, on: document.querySelector('[data-category-dropdown] [aria-selected="true"]')?.textContent }))
    expect(keyed.header === "VFX & Motion" && keyed.on === "Motion Graphics", "Up and Right open the group above, on its first category", keyed)
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("Enter")
    await sleep(350)
    const enter = await p.evaluate(() => ({ open: !!document.querySelector("[data-category-dropdown]"), chosen: document.querySelector("[data-category-chosen]")?.textContent }))
    expect(!enter.open && /^After Effects Templatesin VFX & Motion/.test(enter.chosen || ""), "Down, Enter: chosen and closed; the choice is shown under the field", enter)
    /* Search. */
    await p.click("[data-category-trigger]")
    await sleep(250)
    await p.keyboard.type("pre")
    await sleep(200)
    const results = await p.$$eval("[data-category-dropdown] [data-category-option]", (b) => b.slice(0, 3).map((x) => x.textContent))
    expect(results.length === 3 && results.every((t) => t.length > 0), "typing lists categories with their group", results)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-search.png`) })
    await p.keyboard.press("Escape")
    await sleep(300)
    const closed = await p.evaluate(() => ({ open: !!document.querySelector("[data-category-dropdown]"), q: document.querySelector("[data-category-search]").value }))
    expect(!closed.open && closed.q === "", "Escape closes it and empties the search", closed)
    await p.click("[data-category-trigger]")
    await sleep(250)
    await p.keyboard.type("font")
    await sleep(150)
    await p.keyboard.press("Enter")
    await sleep(350)
    const typed = await p.evaluate(() => ({ open: !!document.querySelector("[data-category-dropdown]"), chosen: document.querySelector("[data-category-chosen]")?.textContent }))
    expect(!typed.open && /^Fonts/.test(typed.chosen || ""), "type, Enter: chosen and closed", typed)
    /* A click outside closes. */
    await p.click("[data-category-trigger]")
    await sleep(250)
    await p.mouse.click(5, vp.height - 80)
    await sleep(300)
    expect(await p.evaluate(() => !document.querySelector("[data-category-dropdown]")), "a click outside closes it")
    /* The suggestion, and clearing it. */
    await p.click("[data-category-trigger]")
    await sleep(250)
    await p.click("[data-category-suggested]")
    await sleep(350)
    const sug = await p.evaluate(() => ({ chosen: document.querySelector("[data-category-chosen]")?.textContent, tag: !!document.querySelector("[data-category-chosen] [data-suggested-tag]") }))
    expect(/^Lightroom Presets/.test(sug.chosen || "") && sug.tag, "the suggestion chosen, marked Suggested under the field", sug)
    await p.mouse.move(5, 5)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-chosen.png`) })
    await p.click("[data-category-clear]")
    await sleep(200)
    expect((await chosenText(p)) === null, "the x clears it")
  }
  /* Nothing violet anywhere in the field or its list. */
  const tinted = await p.evaluate(`(() => { const t = ${TINTED}; return [...document.querySelectorAll("[data-category-field] *, [data-category-field]")].flatMap((el) => { const cs = getComputedStyle(el); return [cs.color, cs.backgroundColor, cs.borderTopColor].map(t).filter((x) => x === "violet") }).length })()`)
  expect(tinted === 0, "nothing violet in the field", { tinted })
  void suggested
}

/* A new product: the suggestion becomes the value until the creator chooses. */
async function preselect(p, label) {
  await p.evaluate(() => document.querySelector("#title").scrollIntoView({ block: "center" }))
  await p.focus("#title")
  await p.keyboard.type("Procreate brushes for hand lettering")
  await sleep(700)
  const got = await p.evaluate(() => ({ chosen: document.querySelector("[data-category-chosen]")?.textContent ?? null, tag: !!document.querySelector("[data-category-chosen] [data-suggested-tag]") }))
  expect(/^Procreate Brushes/.test(got.chosen || "") && got.tag, "a new product: once the title settles, the suggestion is chosen and marked Suggested", got)
  await p.evaluate(() => document.querySelector("[data-editor-category]").scrollIntoView({ block: "center" }))
  await sleep(150)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-category-preselected.png`) })
}

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }\n`)
  writeFileSync(join(stubs, "chunked-upload.js"), FAKE_UPLOADER)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-product-editor.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.editor-parts-probe/navigation.js",
      "next/link": "./.editor-parts-probe/link.jsx",
      "next/image": "./.editor-parts-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
        b.onResolve({ filter: /storage\/chunked-upload$/ }, () => ({ path: join(stubs, "chunked-upload.js") }))
      },
    }],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const watch = `<script>window.__shifts = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__shifts.push(+e.value.toFixed(4)); (window.__shiftWho ||= []).push((e.sources || []).map((x) => x.node && x.node.nodeType === 1 ? (x.node.getAttribute("data-file-row") !== null ? "row" : x.node.tagName + "." + String(x.node.className).slice(0, 60)) : "text").join(" + ")) } }).observe({ type: "layout-shift", buffered: true })</script>`
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>${watch}</head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const runs = [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1280", { width: 1280, height: 800 }],
  ]
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null
  for (const [label, vp] of runs.filter(([l]) => !only || only.includes(l))) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith("file:") || r.url().startsWith("data:") ? r.continue() : r.abort()))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}`)
    await sleep(900)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await files(p, label, isPhone)
    await pricing(p, label)
    if (isPhone) await reduced(p)
    await category(p, label, isPhone, vp)
    /* A new product: no files yet, so the drop zone. */
    await p.goto(`file://${join(stubs, "index.html")}?new`)
    await sleep(900)
    await preselect(p, label)
    await p.evaluate(() => document.querySelector("[data-file-drop]").scrollIntoView({ block: "center" }))
    await sleep(200)
    const empty = await p.evaluate(() => {
      const z = document.querySelector("[data-file-drop]")
      const b = [...z.querySelectorAll("button")].find((x) => x.textContent.trim() === "Choose files")
      return { text: z.innerText.replace(/\n+/g, " | "), button: b ? Math.round(b.getBoundingClientRect().height) : 0, border: getComputedStyle(z).borderTopStyle }
    })
    expect(empty.button >= (isPhone ? 44 : 32) && empty.border === "dashed" && (isPhone ? !/Drop/.test(empty.text) : /Drop files here/.test(empty.text)), "a new product shows a quiet drop zone with Choose files", empty)
    await p.screenshot({ path: join(shots, `${PREFIX}${label}-files-empty.png`) })
    if (errors.length) expect(false, "no errors on the page", errors)
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
