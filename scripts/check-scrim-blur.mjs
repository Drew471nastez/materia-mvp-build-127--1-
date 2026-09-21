/**
 * ===========================================================================
 *  HOW BLURRED IS IT, AND WHERE
 * ===========================================================================
 * Asked for: softer overall than the flat 2px the sheets' scrim used, and
 * deepening towards the bottom of the page where the sheet is.
 *
 * Both halves of that are measurable without anyone squinting at a
 * screenshot. Fine horizontal stripes behind the scrim have a known, high
 * local contrast; blur is exactly the thing that destroys it. So: render the
 * stripes, put the scrim over them, photograph it, and read the standard
 * deviation of luminance in horizontal bands. Sharp stripes give a big
 * number, blurred ones a small one.
 *
 * The old scrim and the new one are photographed through the same fixture,
 * with the same dim, so the two columns are comparable.
 *
 * The rule under test is READ OUT OF app/globals.css rather than retyped
 * here, so this cannot quietly measure a blur the product does not have.
 *
 *   node scripts/check-scrim-blur.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const rule = css.match(/\.scrim-graduated::after\s*\{[\s\S]*?\n  \}/)
if (!rule) fail("No .scrim-graduated::after rule found in app/globals.css.")

const W = 520
const H = 900
/*
  ═══════════════════════════════════════════════════════════════════════════
   A PHONE IS 3x, AND AT 1x THIS PROBE COULD NOT SEE THE DIFFERENCE
  ═══════════════════════════════════════════════════════════════════════════
  A blur radius is written in CSS pixels and applied in DEVICE pixels, and
  Chromium quantises the result. Measured at scale 1 across a sweep of radii,
  0px and 0.5px came out identical — 0.5 did nothing at all — and so did 0.8
  and 1.1. At scale 3 every one of them separates:

      radius        0    0.5    0.8    1.1    1.6    2.5
      contrast   76.5  61.71   47.8  36.96  18.23   1.01

  So a run at 1x reported that a requested reduction had changed nothing,
  when on the device it asks about it changes a great deal. This renders at
  the scale the screenshot in the report came from.
*/
const DPR = Number(process.env.DPR ?? 3)
const out = mkdtempSync(join(tmpdir(), "storelib-scrim-"))

function page(variant) {
  const scrim = variant === "old"
    ? `<div class="scrim" style="backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px)"></div>`
    : `<div class="scrim scrim-graduated"></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; }
    /*
      6px stripes, not 2px. At 2px a blur(2px) annihilates them completely and
      the old scrim measured 0.0 in every band — which says only that it went
      past what the pattern could resolve, not how far past. Wider stripes
      leave both columns a real number to compare.
    */
    body { background: repeating-linear-gradient(to bottom, #000 0 3px, #fff 3px 6px); }
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.4); }
    ${rule[0]}
  </style></head><body>${scrim}</body></html>`
}

const shots = {}
for (const variant of ["old", "new"]) {
  const html = join(out, `${variant}.html`)
  writeFileSync(html, page(variant))
  const png = join(out, `${variant}.png`)
  execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${W},${H}`, `--force-device-scale-factor=${DPR}`, "--virtual-time-budget=3000",
    `--screenshot=${png}`, `file://${html}`], { stdio: ["ignore", "ignore", "ignore"] })
  if (!existsSync(png)) fail(`No screenshot for ${variant}.`)
  shots[variant] = png
}

/* Band contrast, read with python since PIL is what is available here. */
const py = `
import json
from PIL import Image

bands = 6

def scrim_bottom(px, w, h):
    '''
    Where the scrim actually ends, found from its own dim rather than assumed.

    A headless window of 900 gives a viewport of 813 and a screenshot of 900,
    so a fixed scrim leaves an 87px strip of bare stripes at the bottom — and
    the first run of this duly reported that strip as "sharper than the band
    above it", which was the fixture's fault and not the blur's.

    The stripes average mid-grey; under 40% black they average a good deal
    darker. Walking up from the bottom for the first clearly darkened window
    finds the edge whatever the viewport turns out to be.
    '''
    for y in range(h - 8, 8, -1):
        window = [px[w // 2, yy] for yy in range(y - 7, y + 1)]
        if sum(window) / len(window) < 100:
            return y
    return h

out = {}
for name, path in ${JSON.stringify(Object.entries(shots))}:
    im = Image.open(path).convert("L")
    w, h = im.size
    px = im.load()
    bottom = scrim_bottom(px, w, h)
    rows = []
    for b in range(bands):
        y0, y1 = int(bottom * b / bands), int(bottom * (b + 1) / bands)
        vals = [px[w // 2, y] for y in range(y0 + 4, y1 - 4)]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        rows.append(round(var ** 0.5, 1))
    out[name] = {"bands": rows, "scrimBottom": bottom, "image": h}
print(json.dumps(out))
`
const raw = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }))
const contrast = { old: raw.old.bands, new: raw.new.bands }

console.log(`\nStripe contrast through the scrim, top band to bottom band, at ${DPR}x`)
console.log(`(the scrim covers 0..${raw.new.scrimBottom} of a ${raw.new.image}px capture)`)
console.log(`(a big number is sharp, a small one is blurred)\n`)
console.log(`  ${"old, flat blur(2px)".padEnd(24)} ${contrast.old.map((n) => String(n).padStart(6)).join("")}`)
console.log(`  ${"new, graduated".padEnd(24)} ${contrast.new.map((n) => String(n).padStart(6)).join("")}`)
console.log("")

const problems = []
const [oldTop] = contrast.old
const nw = contrast.new
const avg = (a) => a.reduce((s, n) => s + n, 0) / a.length

/* 1. The top has to be clearer than it was. */
if (nw[0] <= oldTop * 1.5)
  problems.push(`the top band reads ${nw[0]} against the old ${oldTop} — it is not meaningfully clearer than the flat blur`)

/* 2. It has to deepen downwards, not sit flat. */
if (nw[0] <= nw[nw.length - 1] * 1.2)
  problems.push(`top ${nw[0]} and bottom ${nw[nw.length - 1]} are too close — the blur is not graduated`)
for (let i = 1; i < nw.length; i++) {
  if (nw[i] > nw[i - 1] + 1)
    problems.push(`band ${i + 1} (${nw[i]}) is sharper than band ${i} (${nw[i - 1]}) — the ramp goes the wrong way`)
}

/* 3. And it has to be softer OVERALL, which is the thing that was asked. */
if (avg(nw) <= avg(contrast.old))
  problems.push(`averaged down the page the new scrim is ${avg(nw).toFixed(1)} against the old ${avg(contrast.old).toFixed(1)} — it is not less blurred overall`)

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log(`Clear at the top (${nw[0]} vs ${oldTop}), deepening to ${nw[nw.length - 1]} at the bottom, and softer on average (${avg(nw).toFixed(1)} vs ${avg(contrast.old).toFixed(1)}).\n`)
