/**
 * Landing round 13, rails: the showcase and the creators rail.
 *
 * The owner, after round 12:
 *   - Move the showcase ("Build your page, sell your products, and manage everything in one place") away from
 *     right under the hero, to where it fits further down. It is now between what you could earn and pricing, on
 *     a dark ground of its own between two white sheets, mounted as it comes near like its neighbours.
 *   - "Instead of Stefan, it should say Satori Studio": the name on Satori Studio's OnePage, and its words.
 *   - Plainspace: another cover photo, with no words in it; the store's heading as it is.
 *   - Ines Duarte's Lisbon card: the owner's own New York shop picture, cut to the card at both shapes.
 *   - The creators rail starts scrolled to the streamers' card and drifts and loops on its own, smooth.
 *
 * Measured in a browser by scripts/check-landing-r13-rails.mjs: where the rail starts, the place every frame while
 * it cruises, and the frame times at 390 with the CPU slowed 4x, cruising and through a swipe.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES, SHOWCASE_STYLES } from "@/components/marketing/build-showcase"
import { CREATORS, CREATORS_START } from "@/components/marketing/home/creators-carousel"

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
/* Without comments, so a word in a note never passes for code. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
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
const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
const lazy = read("components/marketing/home/lazy-sections.tsx")
const src = read("components/marketing/build-showcase.tsx")
const css = src.slice(src.indexOf("const CSS = `"))
const creators = read("components/marketing/home/creators-carousel.tsx")
const creatorsCode = code("components/marketing/home/creators-carousel.tsx")
const frames = read("components/marketing/rail-frames.ts")
const html = renderToStaticMarkup(createElement(BuildShowcase))
const all = SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")
const brand = (e: { src: string }) => e.src.match(/a-([a-z]+)\.webp$/)![1]
const by = (b: string) => SHOWCASE_EXAMPLES.find((e) => brand(e) === b)

console.log("\nThe showcase moves down the page")
check("the hero stands alone on the first dark ground, and Make the work's white sheet laps it", /<ScrollRevealBackdrop>\s*<Hero \/>\s*<\/ScrollRevealBackdrop>\s*<ScrollRevealPanel tone="white">\s*<LazyEverythingInOnePlace \/>/.test(page))
check("the showcase is after what you could earn and before pricing, on a dark ground of its own between two white sheets", /<LazyEarningsCalculator \/>\s*<\/ScrollRevealPanel>\s*<ScrollRevealBackdrop>\s*<LazyBuildShowcase \/>\s*<\/ScrollRevealBackdrop>\s*<ScrollRevealPanel tone="white">\s*<LazySection name="pricing"/.test(page))
check("it is on the page once, and only as the lazy section", (page.match(/<LazyBuildShowcase \/>/g) || []).length === 1 && !/<BuildShowcase \/>/.test(page) && !/from "@\/components\/marketing\/build-showcase"/.test(page))
check("its lazy box has a name and a var(--lz) height, so the height script measures it", /name: "showcase",\s*minHeight: "var\(--lz, /.test(lazy) && /import\("\.\.\/build-showcase"\)\.then\(\(m\) => m\.BuildShowcase\)/.test(lazy))
check("its stylesheet is a React stylesheet, put in place while idle before it mounts", /<style href="r13-build-showcase" precedence="w12-section">\{CSS\}<\/style>/.test(src) && SHOWCASE_STYLES.length === 1 && SHOWCASE_STYLES[0].href === "r13-build-showcase" && /m\.SHOWCASE_STYLES/.test(lazy))
check("the section is square and pulls up over nothing (the sheets carry the corners; no radius, so no mask on the moving rail)", /\.build-showcase \{display:flow-root;position:relative;overflow:hidden;overflow:clip;margin:0;color:#fafafa;background:#050506\}/.test(css) && !/--showcase-radius|border-radius:var\(--showcase-radius\)/.test(css))
check("its ground is the dark ground's own colour, so the join shows no seam", /background:#050506/.test(css) && /\[data-sheet-backdrop\]\{--srp-bg:#050506;background:#050506\}/.test(read("components/marketing/scroll-reveal-panel.tsx")))
check("the scroll reveal and the rail are kept: the heading inked by the scroll, the rail's motion hook, the pictures easing in", /<StoryHeading[\s\S]*showcase\s*\/>/.test(src) && /useShowcaseMotion\(\)/.test(src) && /\.build-showcase-track\[data-rail-ready\] \.build-showcase-pic img \{opacity:0/.test(css))

console.log("\nThe cards")
check("the order: Tideline first, the New York shop last", SHOWCASE_EXAMPLES.map(brand).join(",") === "tideline,satori,app,plainspace,dami,strength,loud,otc,nightshift,luca,nora,nyshop", SHOWCASE_EXAMPLES.map(brand))
check("Satori Studio, not a first name", /^Satori Studio's OnePage/.test(by("satori")!.alt) && !/Stefan|Ștefan/.test(all + src))
check("Plainspace: another cover photo, a desk with a lamp, no laptop screen; the store as it was", /cover photo of a calm desk, a grey lamp on light wood/.test(by("plainspace")!.alt) && !/laptop/.test(by("plainspace")!.alt) && by("plainspace")!.label === "Sell Notion templates" && /Life OS, Content Calendar Pro and Freelance Client Hub/.test(by("plainspace")!.alt))
check("the New York shop in Ines Duarte's place: curated goods, apparel, accessories and books", !!by("nyshop") && by("nyshop")!.format === "wide" && by("nyshop")!.label === "Sell curated goods" && /New York Shop/.test(by("nyshop")!.alt) && /apparel, accessories and books/.test(by("nyshop")!.alt) && !/Ines|Lisbon|Alfama|travel/i.test(all))
check("no banned word, no em dash, captions three words at most", !/unlock|elevate|seamless|powerful|effortlessly|supercharge|transform|enthusiast|ceramic|totes?\b|—/i.test(all) && SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3))
{
  const ok = (f: string, w: number, h: number) => existsSync(f) && webpSize(f).w === w && webpSize(f).h === h
  check("the New York shop at every size: 1440 x 990, 720 x 495, 960 x 720, 640 x 480", ok("public/home/showcase/a-nyshop.webp", 1440, 990) && ok("public/home/showcase/a-nyshop-720.webp", 720, 495) && ok("public/home/showcase/m-nyshop-960.webp", 960, 720) && ok("public/home/showcase/m-nyshop-640.webp", 640, 480))
  check("Plainspace again at every size", ok("public/home/showcase/a-plainspace.webp", 1440, 990) && ok("public/home/showcase/a-plainspace-720.webp", 720, 495) && ok("public/home/showcase/m-plainspace-960.webp", 960, 720) && ok("public/home/showcase/m-plainspace-640.webp", 640, 480))
  check("Satori Studio's OnePage at both sizes", ok("public/home/showcase/a-satori.webp", 540, 1056) && ok("public/home/showcase/a-satori-360.webp", 360, 704))
  check("each new file is light (under 100 KB)", ["a-nyshop", "m-nyshop-960", "a-plainspace", "m-plainspace-960", "a-satori"].every((f) => statSync(`public/home/showcase/${f}.webp`).size < 100_000))
  check("the Lisbon files are gone", !["a-ines", "a-ines-720", "m-ines-640", "m-ines-960"].some((f) => existsSync(`public/home/showcase/${f}.webp`)))
}
check("every card is in the markup with its picture, the phone's 4:3 file for the New York shop too", SHOWCASE_EXAMPLES.every((e) => html.includes(`src="${e.src}"`)) && html.includes("/home/showcase/m-nyshop-640.webp 640w, /home/showcase/m-nyshop-960.webp 960w"))

console.log("\nThe creators rail starts on the streamers")
const start = CREATORS.findIndex((c) => c.slug === CREATORS_START)
check("the start is the Streamers card, and the cards keep their order", CREATORS_START === "streamers" && CREATORS[start]?.kind === "Streamers" && CREATORS[0].slug === "youtubers")
check("the stylesheet draws the rail there before the script (--cc-from cards along)", /style=\{\{ "--cc-from": START_AT \} as CSSProperties\}/.test(creators) && /\.cc-track\{[^}]*transform:translate\(calc\(\(var\(--cc-w\) \+ var\(--cc-gap\)\) \* var\(--cc-from,0\) \* -1\)\)\}/.test(creators))
check("the script takes that place over on its first measure, once", /if \(!started && loop > 0\) \{\s*started = true\s*x = START_AT \* step\s*\}/.test(creatorsCode))
check("the step and the lap are read to the fraction of a px, so a lap wraps exactly onto the copy", /step = second\.getBoundingClientRect\(\)\.left - left0/.test(creatorsCode) && /loop = copy\.getBoundingClientRect\(\)\.left - left0/.test(creatorsCode) && !/offsetLeft/.test(creatorsCode))
check("the photos are decoded in the order the rail shows them, from the card it starts on", /\[\.\.\.own\.slice\(START_AT\), \.\.\.own\.slice\(0, START_AT\)\]/.test(creatorsCode))
check("reduced motion still shows a still grid with no transform", /\.cc-track\{display:grid;[^}]*transform:none!important/.test(creators))

console.log("\nRound 12's work is kept")
check("on a touch screen the legs are the page's own frames (the touch fix)", /const frames = touch\.matches/.test(creatorsCode) && /anim = frameLeg\(from, by, ms, kind === "cruise" \? "linear" : easing/.test(creatorsCode) && /if \(motion\.frames\) \{\s*x = \(anim as FrameLeg\)\.at\(\)/.test(creatorsCode))
check("will-change only while live, and paused off screen", /const want = live\(\) \? "transform" : ""/.test(creatorsCode) && /if \(live\(\)\) motion\.anim\.play\(\)\s*else motion\.anim\.pause\(\)/.test(creatorsCode) && !/\.cc-track\{display:flex[^}]*will-change/.test(creators))
check("a frame leg clamps a long frame", /const MAX_FRAME_MS = 50/.test(frames))
check("the check script measures the start, the cruise and the frame times at 4x CPU", existsSync("scripts/check-landing-r13-rails.mjs") && /setCPUThrottlingRate", \{ rate: 4 \}/.test(read("scripts/check-landing-r13-rails.mjs")))

{
  const runner = read("scripts/run-push-tests.mjs")
  const a = runner.indexOf('"tests/home-landing-r12-perf.test.ts"'), b = runner.indexOf('"tests/home-landing-r13-rails.test.ts"')
  check("this suite runs on push, after round 12's", a > 0 && b > a)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
