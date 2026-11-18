/**
 * Landing round 14, showcase: the New York shop's card as the owner's picture has it.
 *
 * The owner, after round 13: "Curated Goods for New Yorkers" should look like the picture they sent, the whole
 * 4:3 picture with its pink and coral gradient round the rounded white page, not the page cut edge to edge.
 *   - On a phone the card is 4:3, so its files (960 x 720, 640 x 480) are that picture, scaled.
 *   - On a desktop the card keeps its 1440 x 990 like the other wide cards in its group; the picture sits whole
 *     in it, full height, and its gradient is carried on at the sides (no bars, no seam).
 * No other card changes.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import sharp from "sharp"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const brand = (e: { src: string }) => e.src.match(/a-([a-z]+)\.webp$/)![1]
const ny = SHOWCASE_EXAMPLES.find((e) => brand(e) === "nyshop")!
const dir = "public/home/showcase/"

type Px = [number, number, number]
async function pixels(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { w: info.width, h: info.height, at: (x: number, y: number): Px => { const o = (Math.round(y) * info.width + Math.round(x)) * 3; return [data[o], data[o + 1], data[o + 2]] } }
}
/* The owner's gradient runs from a peach orange to a coral pink: red high, blue well under it. */
const coral = ([r, g, b]: Px) => r > 200 && r - b > 60 && g < 200
/* The page: near white, no hue. */
const paper = ([r, g, b]: Px) => Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 14

async function main() {
  console.log("\nThe card")
  check("still the New York shop, last, a wide card, Sell curated goods", SHOWCASE_EXAMPLES.at(-1) === ny && ny.format === "wide" && ny.label === "Sell curated goods")
  check("its words say the store sits on a coral gradient; apparel, accessories and books kept", /^The New York Shop's Storelib store on a coral gradient, Curated Goods for New Yorkers/.test(ny.alt) && /apparel, accessories and books/.test(ny.alt))
  check("no banned word or em dash in its words", !/unlock|elevate|seamless|powerful|effortlessly|supercharge|transform|ceramic|totes?\b|—/i.test(ny.alt + ny.label))
  check("the phone's 4:3 files and the desktop's srcset are in the markup", (() => { const html = renderToStaticMarkup(createElement(BuildShowcase)); return html.includes(`src="${ny.src}"`) && html.includes("/home/showcase/a-nyshop-720.webp 720w, /home/showcase/a-nyshop.webp 1440w") && html.includes("/home/showcase/m-nyshop-640.webp 640w, /home/showcase/m-nyshop-960.webp 960w") })())
  check("the round 14 note is in the file", /LANDING ROUND 14, THE OWNER: the New York shop as the owner's picture has\s+it, the whole 4:3 picture with its coral gradient/.test(read("components/marketing/build-showcase.tsx")))

  console.log("\nOn a phone: the whole 4:3 picture")
  for (const [w, h] of [[960, 720], [640, 480]]) {
    const p = await pixels(`${dir}m-nyshop-${w}.webp`)
    const s = w / 960
    const corners = [p.at(4, 4), p.at(w - 5, 4), p.at(4, h - 5), p.at(w - 5, h - 5)]
    check(`m-nyshop-${w}: ${w} x ${h}, the gradient in all four corners and round the page`, p.w === w && p.h === h && corners.every(coral) && coral(p.at(Math.round(30 * s), h / 2)) && coral(p.at(w - Math.round(30 * s), h / 2)) && coral(p.at(w / 2, Math.round(16 * s))) && coral(p.at(w / 2, h - Math.round(16 * s))), corners)
    check(`m-nyshop-${w}: the white page inside it`, paper(p.at(Math.round(150 * s), Math.round(420 * s))) && paper(p.at(w / 2, Math.round(420 * s))))
  }

  console.log("\nOn a desktop: the card's 1440 x 990, the picture whole inside")
  for (const [w, h] of [[1440, 990], [720, 495]]) {
    const name = w === 1440 ? "a-nyshop" : "a-nyshop-720"
    const p = await pixels(`${dir}${name}.webp`)
    const s = w / 1440
    const corners = [p.at(2, 2), p.at(w - 3, 2), p.at(2, h - 3), p.at(w - 3, h - 3)]
    check(`${name}: ${w} x ${h}, the gradient in all four corners`, p.w === w && p.h === h && corners.every(coral), corners)
    check(`${name}: the gradient above, below and either side of the page, the page white within`, coral(p.at(w / 2, Math.round(24 * s))) && coral(p.at(w / 2, h - Math.round(24 * s))) && coral(p.at(Math.round(100 * s), h / 2)) && coral(p.at(w - Math.round(100 * s), h / 2)) && paper(p.at(Math.round(220 * s), Math.round(570 * s))))
    /* The picture is 1320 wide at 990 high (60px a side at 1440): no step where the carried gradient meets it. */
    const L = Math.floor((w - Math.round((1448 * h) / 1086)) / 2)
    const seam = [0.1, 0.5, 0.9].map((f) => { const y = Math.round(h * f); const a = p.at(L - 1, y), b = p.at(L, y); return Math.max(...a.map((v, i) => Math.abs(v - b[i]))) })
    check(`${name}: no seam where the gradient is carried on (under 8 levels)`, seam.every((d) => d < 8), seam)
  }

  console.log("\nWeight")
  const files = ["a-nyshop", "a-nyshop-720", "m-nyshop-960", "m-nyshop-640"].map((f) => `${dir}${f}.webp`)
  check("each New York file under 100 KB", files.every((f) => existsSync(f) && statSync(f).size < 100_000), files.map((f) => statSync(f).size))
  const wides = SHOWCASE_EXAMPLES.filter((e) => e.format === "wide"), talls = SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait")
  const phone2x = [...wides.map((e) => `${dir}m-${brand(e)}-640.webp`), ...talls.map((e) => `${dir}a-${brand(e)}-360.webp`)].reduce((n, f) => n + statSync(f).size, 0)
  const phone3x = [...wides.map((e) => `${dir}m-${brand(e)}-960.webp`), ...talls.map((e) => `public${e.src}`)].reduce((n, f) => n + statSync(f).size, 0)
  check("a phone still fetches the twelve inside the pinned limits (2x under 400 KB, 3x under 520 KB)", phone2x < 400_000 && phone3x < 520_000, { phone2x, phone3x })

  const runner = read("scripts/run-push-tests.mjs")
  const a = runner.indexOf('"tests/home-landing-r13-rails.test.ts"'), b = runner.indexOf('"tests/home-landing-r14-showcase.test.ts"')
  check("this suite runs on push, after round 13's", a > 0 && b > a)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
