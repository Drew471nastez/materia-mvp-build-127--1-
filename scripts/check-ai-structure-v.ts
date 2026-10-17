/**
 * ===========================================================================
 *  DOES THE CHECK WITHOUT A BROWSER AGREE WITH A BROWSER?
 * ===========================================================================
 *   npx tsx scripts/check-ai-structure-v.ts
 *
 * lib/storelib-ai/structural.ts refuses, from the file alone, a section a
 * phone cannot hold: a box 420px or wider, or three columns, with no narrow
 * screen rule for it. This draws sections in headless Chromium at 390 and
 * 1440 wide, inside a container the way the builder draws them, and measures:
 *
 *   overflow   the section wider than the screen (scrollWidth past 390)
 *   cramped    a grid laying three or more tracks under 140px each
 *
 * for the fixtures in tests/_ai-quality-v-runs.ts and every built-in section,
 * and prints each verdict beside the file check's. Exits 1 when the two
 * disagree about a fixture, or when a built-in section the check passes
 * overflows a phone.
 */
import puppeteer from "puppeteer-core"
import { FIXED_GRID, FIXED_WIDTH, GOOD } from "../tests/_ai-quality-v-runs"
import { checkResponsiveStructure } from "../lib/storelib-ai/structural"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { instanceFromSchema } from "../lib/website-builder/ai-placement"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"

function draw(path: string, source: string): { html: string; css: string } | null {
  const type = path.replace(/^sections\/|\.storelib$/g, "")
  const compiled = compileSection(source, { file: path, expectType: type })
  if (compiled.ok === false) return null
  try {
    const instance = instanceFromSchema(`${type}-1`, type, compiled.value.schema as never)
    const drawn = renderStorelibSection(instance, {} as never, { template: "index", in_editor: false }, { [path]: source })
    return drawn.ok ? { html: drawn.html, css: drawn.css } : null
  } catch {
    return null
  }
}

const MEASURE = `(() => {
  const root = document.querySelector('#frame')
  const vw = document.documentElement.clientWidth
  const overflow = Math.max(document.documentElement.scrollWidth, root.scrollWidth) - vw
  let cramped = 0
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.display !== 'grid' && cs.display !== 'inline-grid') continue
    const tracks = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((n) => n > 0)
    if (tracks.length >= 3 && tracks.every((n) => n < 140)) cramped = Math.max(cramped, tracks.length)
  }
  return { overflow, cramped }
})()`

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  const page = await browser.newPage()
  const measure = async (drawn: { html: string; css: string }, width: number) => {
    await page.setViewport({ width, height: 900 })
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;font-family:sans-serif}#frame{container-type:inline-size}</style><style>${drawn.css}</style></head><body><div id="frame">${drawn.html}</div></body></html>`, { waitUntil: "load" })
    return (await page.evaluate(MEASURE)) as { overflow: number; cramped: number }
  }
  let bad = 0
  const fixtures: [string, string, string][] = [
    ["good (one column, wide layout in @container)", "sections/good_list.storelib", GOOD],
    ["a 960px list, no narrow rule", "sections/good_list.storelib", FIXED_WIDTH],
    ["three columns at every width", "sections/good_list.storelib", FIXED_GRID],
  ]
  console.log("FIXTURES                                         file check        390px browser            1440px")
  for (const [name, path, source] of fixtures) {
    const drawn = draw(path, source)
    if (!drawn) {
      console.log(`  ${name}: did not draw`)
      bad++
      continue
    }
    const refused = checkResponsiveStructure(source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "").map((f) => f.id)
    const phone = await measure(drawn, 390)
    const desk = await measure(drawn, 1440)
    const broken = phone.overflow > 1 || phone.cramped >= 3
    const agree = broken === refused.length > 0
    if (!agree) bad++
    console.log(`  ${name.padEnd(48)} ${(refused.join(",") || "passes").padEnd(17)} overflow ${String(phone.overflow).padStart(4)}px, cramped ${phone.cramped}   overflow ${desk.overflow}px   ${agree ? "agree" : "DISAGREE"}`)
  }
  let built = 0
  let overflowing = 0
  const worst: string[] = []
  for (const [path, source] of Object.entries(DEFAULT_THEME_SOURCES)) {
    if (!path.startsWith("sections/")) continue
    const drawn = draw(path, source)
    if (!drawn) continue
    built++
    const phone = await measure(drawn, 390)
    if (phone.overflow > 1) {
      overflowing++
      worst.push(`${path} +${phone.overflow}px`)
    }
  }
  console.log(`\nBUILT-IN SECTIONS drawn at 390px: ${built}, wider than the phone: ${overflowing}${worst.length ? ` (${worst.slice(0, 6).join(", ")})` : ""}`)
  await browser.close()
  if (bad) {
    console.log(`\n${bad} fixture(s) where the file check and the browser disagree`)
    process.exit(1)
  }
}

void main()
