/**
 * Landing round 12, rails: the showcase under the hero and the creators rail.
 *
 * The owner, after round 11:
 *   - loudlib as the real loudlib.net looks (their own screenshot; the site turns a script away): the purple sale
 *     bar, the dark header, Bestselling and the boxed packs with their sale prices.
 *   - Off the Clock: a better picture, and the newsletter bell in the same light look as the share button.
 *   - The order: Tideline where Plainspace was, Plainspace where Ines Duarte was, Ines where Tideline was.
 *   - Plainspace: no black cover with "Your whole week. One calm page."; a realistic cover.
 *   - Mara Lind's and Gia Romano's OnePages out; two new creators on real themes (Nora Quinn on Paper, Dami Okoro
 *     on Night).
 *   - Every card a subtle hairline edge.
 *   - Creators rail: "on touch, when the finger goes down to swipe, it glitches and stutters left and right before
 *     it swipes". On a touch screen the rails' own motion is the page's frames (rail-frames.ts), not a compositor
 *     animation the page cannot read; a finger is read from one road at a time (rail-gesture.ts).
 *
 * Measured in a browser by scripts/check-landing-r12-rails.mjs: CDP finger drags per frame, and the screen itself
 * (a screencast) for a press on a gliding rail.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { cubicBezier, easingFunction } from "@/components/marketing/rail-frames"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"

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
/* A webp's own size, from its header (VP8, VP8L or VP8X). */
function webpSize(file: string) {
  const b = readFileSync(file)
  const kind = b.toString("ascii", 12, 16)
  if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }
  }
  return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 }
}
const src = read("components/marketing/build-showcase.tsx")
const css = src.slice(src.indexOf("const CSS = `"))
const hook = read("components/marketing/use-showcase-motion.ts")
const creators = read("components/marketing/home/creators-carousel.tsx")
const gesture = read("components/marketing/rail-gesture.ts")
const frames = read("components/marketing/rail-frames.ts")
const html = renderToStaticMarkup(createElement(BuildShowcase))
const all = SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")
const brand = (e: { src: string }) => e.src.match(/a-([a-z]+)\.webp$/)![1]
const by = (b: string) => SHOWCASE_EXAMPLES.find((e) => brand(e) === b)

console.log("\nThe showcase's cards, the owner's picks")
// Changed on purpose (landing round 13): the New York shop in Ines Duarte's place, last.
check("the order: Tideline first, Plainspace where Ines was, the New York shop last", SHOWCASE_EXAMPLES.map(brand).join(",") === "tideline,satori,app,plainspace,dami,strength,loud,otc,nightshift,luca,nora,nyshop", SHOWCASE_EXAMPLES.map(brand))
check("twelve cards, wide, OnePage, wide, in four groups", SHOWCASE_EXAMPLES.length === 12 && SHOWCASE_EXAMPLES.every((e, i) => e.format === (i % 3 === 1 ? "portrait" : "wide")))
check("Mara Lind and Gia Romano are gone, their files too", !/mara|gia\b|Gia Romano/i.test(all) && !existsSync("public/home/showcase/a-mara.webp") && !existsSync("public/home/showcase/a-gia.webp"))
const theme = (id: string) => THEME_TEMPLATES.find((t) => t.id === id)
check("Nora Quinn, a music teacher, on the Paper theme (a real Design tab theme)", !!theme("paper") && by("nora")?.format === "portrait" && /Paper theme/.test(by("nora")!.alt) && by("nora")!.label === "Sell music lessons")
check("Dami Okoro, a barber, on the Night theme with his shop as the cover", !!theme("night") && by("dami")?.format === "portrait" && /Night theme/.test(by("dami")!.alt) && /cover/.test(by("dami")!.alt) && by("dami")!.label === "Fill your bookings")
check("each card's ground is its page's own colour, a shade deeper", by("nora")!.tone === "#e4dfd4" && by("dami")!.tone === "#0d1117" && by("otc")!.tone === "#1d3fd8")
check("Plainspace: a cover photo, not the black cover and its words", /cover photo of a calm desk/.test(by("plainspace")!.alt) && !/black cover|One calm page|Your whole week/.test(all))
check("loudlib as loudlib.net: the sale bar, the dark header, Bestselling and its sale prices", /purple sale bar and a dark header: Bestselling/.test(by("loud")!.alt) && /€8,99/.test(by("loud")!.alt))
check("Off the Clock: Marcus at his microphone", /Marcus Bell at his microphone/.test(by("otc")!.alt))
check("captions three words at most", SHOWCASE_EXAMPLES.every((e) => e.label.split(" ").length <= 3))
check("none of the names the owner turned away", !/Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren Holt|Studio Marlow|Kai Moreno|ceramic|tote|After Dark|membership|Mondo Mango|Mara Lind/i.test(all))
{
  const sizes = (f: string) => (existsSync(f) ? webpSize(f) : { w: 0, h: 0 })
  const ok = (f: string, w: number, h: number) => sizes(f).w === w && sizes(f).h === h
  check("the new OnePage files are 540 x 1056 and 360 x 704", ["otc", "nora", "dami"].every((b) => ok(`public/home/showcase/a-${b}.webp`, 540, 1056) && ok(`public/home/showcase/a-${b}-360.webp`, 360, 704)))
  check("loudlib and Plainspace again at every size: 1440 x 990, 720 x 495, 960 x 720, 640 x 480", ["loud", "plainspace"].every((b) => ok(`public/home/showcase/a-${b}.webp`, 1440, 990) && ok(`public/home/showcase/a-${b}-720.webp`, 720, 495) && ok(`public/home/showcase/m-${b}-960.webp`, 960, 720) && ok(`public/home/showcase/m-${b}-640.webp`, 640, 480)))
  check("each new file is light (under 70 KB)", ["a-otc", "a-nora", "a-dami", "a-loud", "a-plainspace", "m-loud-960", "m-plainspace-960"].every((f) => statSync(`public/home/showcase/${f}.webp`).size < 70_000))
}
check("the cards are all in the markup with their pictures", SHOWCASE_EXAMPLES.every((e) => html.includes(`src="${e.src}"`)))

console.log("\nThe hairline edge")
check("every card has a 1px hairline inside its edge, neutral and faint", /\.build-showcase-pic::after \{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba\(140,140,150,\.22\);pointer-events:none\}/.test(css))
check("it is a still layer: no transition or animation on it", !/\.build-showcase-pic::after[^}]*(transition|animation)/.test(css))

console.log("\nA finger on the rails")
check("on a touch screen the creators rail's legs are the page's own frames", /const frames = touch\.matches/.test(creators) && /anim = frameLeg\(from, by, ms, kind === "cruise" \? "linear" : easing/.test(creators))
check("a press keeps the place last written, with nothing read back", /if \(motion\.frames\) \{\s*x = \(anim as FrameLeg\)\.at\(\)/.test(creators))
check("a mouse keeps the compositor's animations", /anim = track\.animate\(/.test(creators))
check("the showcase's glide is the page's frames on a touch screen too", /glideFrames = touch\.matches/.test(hook) && /const leg = frameLeg\(from, to - from, ms, easing/.test(hook) && /if \(glideFrames\) \{\s*x = \(glide as FrameLeg\)\.at\(\)/.test(hook))
check("and a mouse's glide is paused before it is read", /glide\.pause\(\)\s*const m = getComputedStyle\(el\)\.transform/.test(hook))
check("a frame leg writes one transform a frame and clamps a long frame (no jump after a long task)", /const MAX_FRAME_MS = 50/.test(frames) && /elapsed \+= Math\.min\(MAX_FRAME_MS/.test(frames))
check("a leg's clock starts when it is made: no frame stands still after a release", /last = performance\.now\(\)/.test(frames))
check("a finger is read from one road at a time", /if \(d\.finger && d\.road === "touch" && road === "pointer"\) return d\.axis === "x"/.test(gesture) && /d\.startX \+= x - last\.cx/.test(gesture))
{
  const ease = cubicBezier(0.22, 1, 0.36, 1)
  const lin = easingFunction("linear")
  const pts = Array.from({ length: 41 }, (_, i) => ease(i / 40))
  check("the curve math: ends at 0 and 1, never goes back", ease(0) === 0 && ease(1) === 1 && pts.every((v, i) => i === 0 || v >= pts[i - 1] - 1e-9) && lin(0.5) === 0.5)
  const css1 = easingFunction("cubic-bezier(.5,0,.75,.5)")
  check("a CSS cubic-bezier is read from its text", Math.abs(css1(0.5) - cubicBezier(0.5, 0, 0.75, 0.5)(0.5)) < 1e-9 && css1(0.5) < 0.5)
}
check("the rails' check script measures a finger every frame and the screen itself", existsSync("scripts/check-landing-r12-rails.mjs") && /Page\.startScreencast/.test(read("scripts/check-landing-r12-rails.mjs")) && /Input\.dispatchTouchEvent/.test(read("scripts/check-landing-r12-rails.mjs")))

console.log("\nThe pictures arrive")
check("the showcase still waits for each decode and eases it in (opacity and a settle)", /\.build-showcase-track\[data-rail-ready\] \.build-showcase-pic img \{opacity:0;transform:scale\(1\.025\)/.test(css))
check("the creators rail too", /\.cc-track\[data-cc-ready\] \.cc-img\{opacity:0;transform:scale\(1\.025\)/.test(creators))

{
  const runner = read("scripts/run-push-tests.mjs")
  const a = runner.indexOf('"tests/home-landing-r11-rails.test.ts"'), b = runner.indexOf('"tests/home-landing-r12-rails.test.ts"')
  check("this suite runs on push, after round 11's", a > 0 && b > a)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
