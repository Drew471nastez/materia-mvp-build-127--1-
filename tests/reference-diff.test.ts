/**
 * ===========================================================================
 *  A PAGE MEASURED AGAINST THE PICTURE IT WAS ASKED TO MATCH
 * ===========================================================================
 * lib/website-builder/agent/reference-diff.ts on pictures made here, and,
 * with CHROMIUM_PATH set, lib/website-builder/agent/visual-check.ts on a real
 * page: the page photographed against itself scores close, against another
 * design it does not, and the tablet width is measured.
 *
 * Run with:  npm run test:push
 */
import sharp from "sharp"
import { compareWithReference, describeComparison, MATCH_THRESHOLD, widthForReference } from "@/lib/website-builder/agent/reference-diff"
import { visualCheck, VIEWPORTS } from "@/lib/website-builder/agent/visual-check"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { classifyIntent, intentGuidance } from "@/lib/website-builder/agent/intent"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}${process.env.SHOW && detail ? `   ${detail.slice(0, 160)}` : ""}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}

/** A 1440 by 900 "page": a dark band at the top, a block of colour on the left, text-like stripes on the right. */
async function page(opts: { band?: string; block?: string; blockX?: number; invert?: boolean } = {}): Promise<Buffer> {
  const band = opts.band ?? "#111111"
  const block = opts.block ?? "#c2410c"
  const x = opts.blockX ?? 80
  const lines = Array.from({ length: 8 }, (_, i) => `<rect x="820" y="${300 + i * 42}" width="${480 - (i % 3) * 90}" height="14" fill="#333"/>`).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="${opts.invert ? "#111" : "#fafafa"}"/><rect width="1440" height="96" fill="${band}"/><rect x="${x}" y="220" width="620" height="520" fill="${block}"/>${lines}</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
}

async function main() {
  console.log("\nThe measure")
  const ref = await page()
  const same = await compareWithReference(ref, await page(), 1440)
  check("the same picture is close", !!same && same.score >= 95, JSON.stringify(same))
  const moved = await compareWithReference(ref, await page({ blockX: 760 }), 1440)
  check("the block moved to the other side is not close", !!moved && moved.score < MATCH_THRESHOLD && moved.score < (same?.score ?? 0) - 10, JSON.stringify(moved))
  check("and the regions that differ are named, with the layout said to be off", !!moved && moved.regions.some((r) => /layout there does not line up/.test(r)), JSON.stringify(moved?.regions))
  const inverted = await compareWithReference(ref, await page({ invert: true, band: "#fafafa" }), 1440)
  check("a page dark where the picture is light scores low", !!inverted && inverted.score < 60, JSON.stringify(inverted))
  check("and says which parts are darker", !!inverted && inverted.regions.some((r) => /yours is darker/.test(r)), JSON.stringify(inverted?.regions))
  const recoloured = await compareWithReference(ref, await page({ block: "#1d4ed8" }), 1440)
  check("the same layout in another colour scores between the two", !!recoloured && !!same && !!inverted && recoloured.score < same.score && recoloured.score > inverted.score, JSON.stringify(recoloured))
  const tall = await sharp({ create: { width: 1440, height: 3000, channels: 3, background: "#fafafa" } }).composite([{ input: await page(), top: 0, left: 0 }]).jpeg().toBuffer()
  const scrolled = await compareWithReference(ref, tall, 1440)
  check("a long page is compared on its first screen, the picture's proportions", !!scrolled && scrolled.score >= 90, JSON.stringify(scrolled))
  check("an unreadable picture is null, never a guess", (await compareWithReference(Buffer.from("not an image"), ref, 1440)) === null)
  check("a phone screenshot is measured at 390, a tablet's at 834, a laptop's at 1440", widthForReference(1170, 2532) === 390 && widthForReference(834, 1112) === 834 && widthForReference(2880, 1800) === 1440)
  check("the model is told the number and the threshold", !!moved && new RegExp(`${moved.score}/100`).test(describeComparison(moved)) && /NOT yet like the picture/.test(describeComparison(moved)))

  console.log("\nAsked for")
  const asked = classifyIntent("make my homepage exactly like this screenshot", { images: true, bodySections: 4 })
  check('"exactly like this screenshot" with a picture is a recreation', asked.recreate === true, JSON.stringify(asked))
  check("and told it will be measured", /MATCH THE PICTURE/.test(intentGuidance(asked)))
  check("a picture sent as a mood is not", classifyIntent("use the colours from this photo for my hero", { images: true, bodySections: 4 }).recreate === false)
  check("words alone are not", classifyIntent("make it exactly like apple.com", { bodySections: 4 }).recreate === false)

  console.log("\nThe tablet")
  check("the browser check measures 1440, 834 and 390", VIEWPORTS.map((v) => v.width).join(",") === "1440,834,390")
  check("and photographs the two the model reads", VIEWPORTS.filter((v) => v.shot).map((v) => v.width).join(",") === "1440,390")

  if (!process.env.CHROMIUM_PATH) {
    console.log("  skip  no CHROMIUM_PATH: the browser half was not run")
  } else {
    console.log("\nIn a browser")
    const state: ThemeState = { sections: [buildSection("hero-1", "hero_split")!, buildSection("feat-1", "features_grid")!], settings: {} }
    const first = await visualCheck({ state, sources: {}, shots: false, timeoutMs: 90_000, reference: { mediaType: "image/jpeg", data: (await page()).toString("base64"), name: "ref.jpg" } })
    check("a page measured against an unrelated design is not close", !!first?.comparison && first.comparison.score < MATCH_THRESHOLD, JSON.stringify(first?.comparison))
    check("and the shot that was measured comes back", !!first?.referenceShot && first.referenceShot.data.length > 1000)
    if (first?.referenceShot) {
      const again = await visualCheck({ state, sources: {}, shots: false, timeoutMs: 90_000, reference: first.referenceShot })
      check("the same page measured against its own photograph is close", !!again?.comparison && again.comparison.score >= 90, JSON.stringify(again?.comparison))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
await main()
