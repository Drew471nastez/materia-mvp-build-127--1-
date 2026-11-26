/**
 * ===========================================================================
 *  THE TEMPLATES' COVERS SHOW A PAGE AS A VISITOR SEES IT (round 30)
 * ===========================================================================
 * Two things the owner caught on the marketplace's covers:
 *
 *   Fairweather (capstees): the product cards' wishlist and quick view
 *   buttons, which a mouse only sees under the pointer, were on every card,
 *   because headless Chromium answers (hover: none).
 *   XP shop (xpshop) and Hookline (vsl): a background attached to the screen
 *   was painted again in every photographed screen, so it came out repeated
 *   down the stitched page.
 *
 * Here:
 *   prep      the cover script photographs through scripts/theme-templates/
 *             cover-prep.ts: the card buttons hidden (their room kept), every
 *             background attached to its box, a backdrop fixed to the screen
 *             in the first screen only, bars let go of, sticky things static
 *   release   releaseForPhotograph, run on a page of stand-ins: the first
 *             screen keeps the header and the backdrop; later screens keep
 *             neither; sticky becomes static
 *   covers    every cover in public/themes/materia, desktop and phone: no
 *             band of the page's sides repeats screen after screen (what a
 *             background painted in every screen looks like), and each cover
 *             is the width the marketplace expects
 *
 * scripts/check-theme-covers.ts measures the same in Chromium on every
 * template's real page.
 *
 *   npx tsx tests/theme-cover-hygiene.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { BACKDROP_SHARE, COVER_CARD_CONTROLS, COVER_CSS, releaseForPhotograph } from "../scripts/theme-templates/cover-prep"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

/* ── A page of stand-ins for releaseForPhotograph ─────────────────────── */
type Fake = { tag: string; position: string; height: number; header: boolean; style: Record<string, string> }
function runRelease(first: boolean, els: Fake[]) {
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { document: g.document, getComputedStyle: g.getComputedStyle, innerHeight: g.innerHeight }
  g.innerHeight = 900
  g.document = {
    querySelectorAll: () =>
      els.map((e) => ({
        offsetHeight: e.height,
        closest: () => (e.header ? {} : null),
        style: { setProperty: (k: string, v: string) => (e.style[k] = v) },
        __fake: e,
      })),
  }
  g.getComputedStyle = (el: { __fake: Fake }) => ({ position: el.__fake.style.position ?? el.__fake.position })
  try {
    return releaseForPhotograph(first, BACKDROP_SHARE)
  } finally {
    Object.assign(g, saved)
  }
}

/**
 * A background painted in every screen: the page's sides, pixel for pixel,
 * are the same screen after screen. Each side column has its median taken
 * off first (a window's border that runs down the whole page is not a
 * background), then every screen from the third is compared with the
 * second (the first carries the header). Repeated when the sides have
 * something in them in every screen and the later screens differ from the
 * second by under 45% of that. Calibrated on the covers: Hookline's starfield
 * before round 30 is 0.38, the closest honest cover 0.69.
 */
export function repeatsDownThePage(data: Uint8Array | Buffer, width: number, height: number, T: number, m: number): { sd: number; worst: number } | null {
  const n = Math.floor(height / T)
  if (n < 4) return null
  const cols: number[] = []
  for (let x = 0; x < m; x++) cols.push(x, width - 1 - x)
  const med = cols.map((x) => {
    const v: number[] = []
    for (let y = 0; y < height; y++) v.push(data[y * width + x])
    v.sort((a, b) => a - b)
    return v[v.length >> 1]
  })
  const at = (y: number, c: number) => data[y * width + cols[c]] - med[c]
  let sd = Infinity
  for (let k = 1; k < n; k++) {
    let sum = 0
    let sq = 0
    for (let y = k * T; y < (k + 1) * T; y++) for (let c = 0; c < cols.length; c++) {
      const v = at(y, c)
      sum += v
      sq += v * v
    }
    const N = T * cols.length
    sd = Math.min(sd, Math.sqrt(Math.max(0, sq / N - (sum / N) ** 2)))
  }
  let worst = 0
  for (let k = 2; k < n; k++) {
    let d = 0
    for (let y = 0; y < T; y++) for (let c = 0; c < cols.length; c++) d += Math.abs(at(k * T + y, c) - at(T + y, c))
    worst = Math.max(worst, d / (T * cols.length))
  }
  return sd > 1 && worst / sd < 0.45 ? { sd, worst } : null
}

async function main() {
  console.log("\nThe cover script photographs through the cover's own preparation\n")
  const script = read("scripts/build-theme-template-covers.ts")
  check("it imports cover-prep and adds COVER_CSS to every page", /from "\.\/theme-templates\/cover-prep"/.test(script) && /addStyleTag\(\{ content: COVER_CSS \}\)/.test(script))
  check("  and lets go of fixed and sticky things through releaseForPhotograph, the first screen apart", /p\.evaluate\(releaseForPhotograph, first, BACKDROP_SHARE\)/.test(script) && /await release\(true\)/.test(script) && /if \(y > 0\) \{ await release\(false\)/.test(script))
  check("  no card button rule of its own left behind (one list, in cover-prep)", !/pc-actions/.test(script))
  for (const sel of [".pc-actions", ".pc-action", ".pc-tip", ".pc-arrow", ".product-item__button-wishlist", "button-quickview"]) {
    check(`COVER_CSS hides ${sel} on product cards, keeping its room`, COVER_CARD_CONTROLS.some((c) => c.endsWith(sel) && c.startsWith(".product-item")) && /visibility: hidden !important/.test(COVER_CSS))
  }
  check("a product section's own wishlist button is not touched (every rule is scoped to a card)", COVER_CARD_CONTROLS.every((c) => c.startsWith(".product-item ")))
  check("every background is attached to its box for the photograph", /\*, \*::before, \*::after \{ background-attachment: scroll !important; \}/.test(COVER_CSS))
  check("the add button on the picture and the second picture stay hidden (round 23)", /pc-form--media \{ opacity: 0 !important; \}/.test(COVER_CSS) && /secondary-image \{ opacity: 0 !important; \}/.test(COVER_CSS))
  check("a backdrop is half the screen or more", BACKDROP_SHARE === 0.5)
  check("the Chromium measurement is there and uses the same preparation", existsSync("scripts/check-theme-covers.ts") && /releaseForPhotograph/.test(read("scripts/check-theme-covers.ts")) && /COVER_CSS/.test(read("scripts/check-theme-covers.ts")))

  console.log("\nreleaseForPhotograph, screen by screen\n")
  const page = (): Fake[] => [
    { tag: "header bar", position: "fixed", height: 72, header: true, style: {} },
    { tag: "wallpaper", position: "fixed", height: 900, header: false, style: {} },
    { tag: "back to top", position: "fixed", height: 44, header: false, style: {} },
    { tag: "sticky aside", position: "sticky", height: 400, header: false, style: {} },
    { tag: "text", position: "static", height: 300, header: false, style: {} },
  ]
  const one = page()
  const r1 = runRelease(true, one)
  check("first screen: the header and the backdrop stay, back to top goes, sticky is static", !one[0].style.display && !one[1].style.visibility && one[2].style.display === "none" && one[3].style.position === "static" && !Object.keys(one[4].style).length, one.map((e) => [e.tag, e.style]))
  check("  it says it saw one backdrop", r1.backdrops === 1)
  const later = page()
  runRelease(false, later)
  check("later screens: the header goes and the backdrop is not painted again", later[0].style.display === "none" && later[1].style.visibility === "hidden" && later[2].style.display === "none", later.map((e) => [e.tag, e.style]))

  console.log("\nEvery cover in public/themes/" + CODE_THEME_PACKAGE + "\n")
  /* repeatsDownThePage, first on made up pages: a faint starfield painted in every screen, and the same page with it painted once. */
  {
    const W = 1200
    const T = 750
    const H = T * 6
    const stars = new Uint8Array(W * H).fill(12)
    const once = new Uint8Array(W * H).fill(12)
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(rand() * W)
      const y = Math.floor(rand() * T)
      for (let k = 0; k < 6; k++) stars[(y + k * T) * W + x] = 90
      once[y * W + x] = 90
    }
    check("a faint background painted in every screen is caught", !!repeatsDownThePage(stars, W, H, T, 80))
    check("  and the same page with it painted once is not", !repeatsDownThePage(once, W, H, T, 80))
  }
  /* Screens are 900 pixels at 1440 on a computer (750 in the 1200 wide cover) and 844 on a phone. */
  const repeated: string[] = []
  const wrongWidth: string[] = []
  for (const t of CODE_TEMPLATES) {
    for (const phone of [false, true]) {
      const file = join("public/themes", CODE_THEME_PACKAGE, `${t.template}${phone ? "-phone" : ""}.webp`)
      if (!existsSync(file)) {
        wrongWidth.push(`${file} missing`)
        continue
      }
      const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true })
      if (info.width !== (phone ? 390 : 1200)) wrongWidth.push(`${file} is ${info.width} wide`)
      const T = phone ? 844 : 750
      const m = phone ? 12 : 80
      const n = Math.floor(info.height / T)
      if (n < 4) continue
      const r = repeatsDownThePage(data, info.width, info.height, T, m)
      if (r) repeated.push(`${t.template}${phone ? " phone" : ""} (sides vary by ${r.sd.toFixed(2)}, every later screen within ${r.worst.toFixed(2)})`)
    }
  }
  check(`no cover repeats a background screen after screen (${CODE_TEMPLATES.length} templates, desktop and phone)`, repeated.length === 0, repeated)
  check("every cover is there, 1200 wide on a computer and 390 on a phone", wrongWidth.length === 0, wrongWidth)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
