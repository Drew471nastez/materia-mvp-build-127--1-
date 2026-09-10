/**
 * ===========================================================================
 *  GOING BACK SAYS SO, AND YOU CAN READ IT
 * ===========================================================================
 * The overlay shown while the editor is being left is dark glass: a near
 * black veil at brightness 0.55 over a blur of the builder. The loader on it
 * was rendered with `tone="light"` — which names the surface it is drawn ON,
 * not the colour of the ink — so it painted `text-neutral-500` grey onto
 * near black. There was text the whole time and nobody could read it.
 *
 * "Visible" is a claim about pixels, so this measures pixels. Both versions
 * are rendered over the same builder-like page, and each is scored by the
 * contrast between the brightest pixel in the line of text and the glass
 * immediately around it:
 *
 *   dark   what ships now, white and lit
 *   light  the same overlay with the old classes, as the control
 *
 * The control is not decoration. It differs in the two colour classes and
 * nothing else, so if it scored as well as the fix, the fixture would be
 * measuring something other than legibility and every number here would be
 * worthless.
 *
 * The squares are left out of the score on purpose: they animate their
 * opacity on a loop, and a screenshot of a loop catches them wherever the
 * clock happened to stop. The line of text does not move.
 *
 * Run after `pnpm build`:  node scripts/check-leaving-overlay.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import zlib from "node:zlib"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const W = 520, H = 340
/**
 * THE PAGE SAYS WHERE THE TEXT IS. IT IS NOT WORKED OUT HERE.
 *
 * Headless Chromium's viewport is some eighty pixels shorter than the
 * window it is asked for, and `.wb-leaving` is `position: fixed`, so it
 * covers the viewport and not the screenshot. The first version of this file
 * computed the text's position from the window size, sampled a band of empty
 * glass eighty pixels below the words, and reported the fix and the bug as
 * identical — twice, because both were being measured in the same blank
 * place.
 *
 * So the fixture measures the line itself after layout and drops two small
 * blue markers at its corners. This reads the markers back. The sample box
 * is then the browser's own answer, whatever it decided the viewport was.
 */
const MARK = [0, 0, 255]
const isMark = (p) => p[2] > 200 && p[0] < 60 && p[1] < 60

/** Exactly what BuilderLoader emits, with the tone's two classes swapped. */
const loader = (group, line) =>
  `<div role="status" aria-live="polite" class="flex flex-col items-center gap-5 ${group} wb-leaving-content">
     <span class="wb-squares" aria-hidden>${"<span></span>".repeat(9)}</span>
     <span class="wb-loading-line text-[13.5px] font-medium ${line}">Going back</span>
   </div>`

/**
 * The control has to be the OLD RENDERING, and simply putting the old
 * `text-neutral-500` class back does not produce it: the fix includes a
 * `.wb-leaving .wb-loading-line` rule that carries two classes to Tailwind's
 * one, so it wins over either tone and paints both white. A first attempt at
 * a control did exactly that and scored identically to the fix, which is the
 * shape of a control that is not controlling anything.
 *
 * So the control takes the old colour from a probe element carrying the old
 * class — the real token out of the real stylesheet, not a hex code
 * remembered here — and writes it inline, where nothing can override it. The
 * glow goes too, since that shipped with the fix.
 */
const OLD_TONE = `
  const probe = document.getElementById("tone-probe")
  const old = getComputedStyle(probe).color
  const line = document.querySelector(".wb-loading-line")
  line.style.color = old
  line.style.textShadow = "none"
  const squares = document.querySelector(".wb-squares")
  squares.style.color = getComputedStyle(document.getElementById("tone-probe-2")).color
  squares.style.filter = "none"`

const MARKERS = `
  const r = document.querySelector(".wb-loading-line").getBoundingClientRect()
  for (const [x, y] of [[r.left - 10, r.top], [r.right + 7, r.bottom - 3]]) {
    const m = document.createElement("div")
    m.style.cssText =
      "position:fixed;z-index:999;width:3px;height:3px;background:rgb(${MARK});left:" +
      Math.round(x) + "px;top:" + Math.round(y) + "px"
    document.body.appendChild(m)
  }`

const page = (group, line, control) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>` + css + `</style>
<style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;font-family:system-ui,sans-serif;overflow:hidden}
  /* A builder to have behind the glass: the dark bar, the mat, white panels. */
  .bar{height:48px;background:#171717}
  .mat{height:${H - 48}px;background:#171717;display:flex;gap:8px;padding:8px}
  .panel{background:#fff;border-radius:12px}
</style></head><body>
<div class="bar"></div>
<div class="mat"><div class="panel" style="width:150px"></div><div class="panel" style="flex:1"></div></div>
<div class="wb-leaving">${loader(group, line)}</div>
<span id="tone-probe" class="text-neutral-500" style="position:fixed;left:-999px"></span>
<span id="tone-probe-2" class="text-neutral-400" style="position:fixed;left:-999px"></span>
<script>${control ? OLD_TONE : ""}
${MARKERS}</script>
</body></html>`

function readPng(path) {
  const d = readFileSync(path)
  let pos = 8, w, h, colourType
  let idat = Buffer.alloc(0)
  while (pos < d.length) {
    const len = d.readUInt32BE(pos)
    const type = d.subarray(pos + 4, pos + 8).toString("latin1")
    if (type === "IHDR") {
      w = d.readUInt32BE(pos + 8)
      h = d.readUInt32BE(pos + 12)
      colourType = d[pos + 17]
    } else if (type === "IDAT") idat = Buffer.concat([idat, d.subarray(pos + 8, pos + 8 + len)])
    pos += 12 + len
  }
  const raw = zlib.inflateSync(idat)
  const ch = colourType === 6 ? 4 : 3
  const stride = w * ch
  const px = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  let i = 0
  for (let y = 0; y < h; y++) {
    const f = raw[i++]
    const line = Buffer.from(raw.subarray(i, i + stride))
    i += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      if (f === 1) line[x] = (line[x] + a) & 255
      else if (f === 2) line[x] = (line[x] + b) & 255
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
    }
    line.copy(px, y * stride)
    prev = line
  }
  return { w, h, at: (x, y) => { const o = y * stride + x * ch; return [px[o], px[o + 1], px[o + 2]] } }
}

/** Rec. 709 luma, 0 to 255. */
const luma = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]

/** The two markers, as one box: the line of text, in screenshot pixels. */
function markedBox(img) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!isMark(img.at(x, y))) continue
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  return x1 < 0 ? null : { x0: x0 + 12, x1: x1 - 8, y0, y1: y1 + 1 }
}

function score(img) {
  const box = markedBox(img)
  if (!box || box.x1 - box.x0 < 20) return null
  let brightest = 0
  for (let x = box.x0; x < box.x1; x++) {
    for (let y = box.y0; y < box.y1; y++) brightest = Math.max(brightest, luma(img.at(x, y)))
  }
  /**
   * Glass at the same rows, left of the words and left of their glow. The
   * comparison has to be with what the text sits ON, not with the page
   * average, or a dark bar somewhere else flatters the number.
   */
  let total = 0, n = 0
  for (let x = 6; x < 60; x++) {
    for (let y = box.y0; y < box.y1; y++) { total += luma(img.at(x, y)); n++ }
  }
  const glass = total / n
  return { brightest, glass, contrast: brightest - glass, box }
}

const out = mkdtempSync(join(tmpdir(), "storelib-leaving-"))
try {
  const shot = (name, group, line, control = false) => {
    const html = join(out, `${name}.html`)
    const png = join(out, `${name}.png`)
    writeFileSync(html, page(group, line, control))
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${H}`,
       "--force-prefers-reduced-motion", "--virtual-time-budget=1500", `--screenshot=${png}`, `file://${html}`],
      { stdio: "ignore" },
    )
    return score(readPng(png))
  }
  const shipped = shot("shipped", "text-white/70", "text-white/75")
  const control = shot("control", "text-neutral-400", "text-neutral-500", true)
  if (!shipped || !control) fail("The markers were not found. The fixture did not lay the text out.")

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  /**
   * 60 points of luma. Grey-on-near-black scored 25 here and is the thing
   * being fixed, so the bar is set well clear of it rather than just above.
   */
  const FLOOR = 60
  console.log("\ngoing back says so, and you can read it\n")
  expect(
    shipped.contrast >= FLOOR,
    `the words stand clear of the glass they are on (${FLOOR}+ luma)`,
    `contrast ${shipped.contrast.toFixed(1)} — brightest ${shipped.brightest.toFixed(0)} on glass ${shipped.glass.toFixed(0)}`,
  )
  expect(
    control.contrast < FLOOR,
    "and the old grey-on-near-black does not, so this is measuring legibility and not just finding pixels",
    `control contrast ${control.contrast.toFixed(1)} — if this clears the bar the check above proves nothing`,
  )
  expect(
    shipped.contrast > control.contrast * 1.5,
    "the fix is a real improvement on it, not a rounding error",
    `${shipped.contrast.toFixed(1)} vs ${control.contrast.toFixed(1)}`,
  )

  console.log(
    `\n  text vs glass:  shipped ${shipped.contrast.toFixed(1)}` +
      `   old ${control.contrast.toFixed(1)}   (glass itself ${shipped.glass.toFixed(0)} luma,` +
      ` words measured at y ${shipped.box.y0}-${shipped.box.y1})\n`,
  )
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
