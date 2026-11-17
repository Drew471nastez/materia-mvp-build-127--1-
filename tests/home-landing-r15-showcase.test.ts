/**
 * ===========================================================================
 *  HOME, LANDING ROUND 15: THE BUILDER'S EDIT, LOUDLIB SHARP, THREE NUMBERS
 * ===========================================================================
 * components/marketing/home/showcase-mocks/builder-mocks.tsx,
 * components/marketing/home/ideas-come-to-life.tsx and
 * components/marketing/build-showcase.tsx.
 *
 * The owner, after round 14:
 *   1. The website builder's demo reads like a real edit: the heading selected
 *      (the outline on the heading), its words changed, saved; a smooth scroll,
 *      the products section selected, its top padding made larger (the section
 *      gets the space), saved. Transform and opacity only.
 *   2. loudlib's pictures are blurry: sharp at their drawn size on a 3x phone
 *      and a desktop, without needlessly big files.
 *   3. Under "Build your page, sell your products, and manage everything in
 *      one place." three numbers that count up when seen, three across on a
 *      phone too, each a true fact about the product read from the code.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IDEAS_TABS } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, EDIT_PLAN, SteezSite, WB_DURATION_MS, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { SHOWCASE_EXAMPLES, SHOWCASE_STYLES } from "@/components/marketing/build-showcase"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const kf = (name: string) => {
  const at = BUILDER_CSS.indexOf(`@keyframes ${name}{`)
  return at < 0 ? "" : BUILDER_CSS.slice(at, BUILDER_CSS.indexOf("}}", at) + 2)
}
const webp = (p: string) => {
  const f = join(root, "public", p)
  if (!existsSync(f)) return null
  const b = readFileSync(f)
  const kind = b.subarray(12, 16).toString()
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), kb: statSync(f).size / 1024 }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1, kb: statSync(f).size / 1024 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, kb: statSync(f).size / 1024 }
}

console.log("\n── 1. The builder's edit ──")
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
const stz = renderToStaticMarkup(createElement(SteezSite, { rings: true }))
check("the website builder has its own, longer moment; the other editors keep theirs", IDEAS_TABS[0].ms === WB_DURATION_MS && WB_DURATION_MS === 11600 && IDEAS_TABS[1].ms === 8400 && /\.bm\.wb\{--bm-t:11\.6s\}/.test(BUILDER_CSS))
check("the heading is outlined as the editor outlines what a click opened (2px #3b82f6, 4px corners)", /<span class="wx-edit"><i class="wx-hd"><\/i>/.test(stz) && /\n\.wx-hd\{[^}]*border-radius:calc\(4\*var\(--u\)\);box-shadow:0 0 0 calc\(2\*var\(--u\)\) #3b82f6/.test(BUILDER_CSS))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the section panels: Back, the name, the settings; Steez's Slideshow then Products carousel", /<span class="wx-panels"><div class="wx-panel wx-pa"><div class="wx-pb"><span class="wx-pb-back">[\s\S]*?<b>Slideshow<\/b>[\s\S]*?<div class="wx-panel wx-pz">[\s\S]*?<b>Products carousel<\/b>/.test(wb) && !/Featured products/.test(wb))
check("the words are typed in the Heading field, its old words selected", /<i>Heading<\/i><span class="wx-in wx-in-ed"><span class="wx-edit wx-edit-f"><span class="wx-was"><i class="wx-mark"><\/i>Summer Madness &#x27;26<\/span>/.test(wb))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("Top padding is the editor's slider: its number steps 66px to 120px", /<i class="wx-f-sl">Top padding<\/i><span class="wx-sl">[\s\S]*?<span class="wx-num-run"><b>66px<\/b>[\s\S]*?<b>120px<\/b><\/span>/.test(wb))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the section grows by the same 54px of the theme (.711u a px)", EDIT_PLAN.stz.grow === 38.4 && kf("sxk-stz-grow").includes("translateY(calc(38.4*var(--u)))") && !("ll" in EDIT_PLAN))
check("the thumb, the fill and the pointer move by the same distance over the same keyframes", ["stz"].every((id) => { const dx = `translateX(calc(${EDIT_PLAN[id as "stz"].dx}*var(--u)))`; return kf(`sxk-${id}-thumb`).includes(dx) && kf(`sxk-${id}-fill`).includes(dx) && kf(`sxk-${id}-grow`).split("{")[2].startsWith("transform:none") }))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the number steps (one transform with steps()), nothing laid out per frame", /animation-timing-function:steps\(7,end\)/.test(kf("sxk-stz-num")))
check("the ring's chip at the bottom right, its bottom edge and chip moving with the space, its sides carried on by a scaleY strip", /<span class="wx-sel wx-ring"><i class="wx-sel-x"><\/i><i class="wx-sel-b"><\/i><em>Selected<\/em><\/span>/.test(stz) && /transform:scaleY\(0\);transform-origin:top/.test(BUILDER_CSS) && /\.stz \.wx-sel-b,\[data-mock-live\] \.stz \.wx-sel em\{animation:sxk-stz-grow/.test(BUILDER_CSS))
check("every keyframe of the moment moves only transform and opacity", [...BUILDER_CSS.matchAll(/@keyframes (sxk-(?:ed|cur|stz|ll|wx)-[\w-]+)\{([\s\S]*?)\}\}/g)].every((m) => !/[{;](?!opacity|transform|animation-timing-function)[a-z-]+:/.test(m[2])))
check("every animation of the moment waits for motion to be welcome", [...BUILDER_CSS.matchAll(/animation:sxk-(ed|cur|stz|ll|wx)-/g)].length === [...BUILDER_CSS.matchAll(/@media\(prefers-reduced-motion:no-preference\)\{[^@]*animation:sxk-(ed|cur|stz|ll|wx)-/g)].length)
check("at rest nothing is selected: the panels, the outline and the ring are hidden", /\n\.wx-panel\{[^}]*opacity:0/.test(BUILDER_CSS) && /\n\.wx-hd\{[^}]*opacity:0/.test(BUILDER_CSS) && /\n\.wx-sel\{[^}]*opacity:0/.test(BUILDER_CSS))
check("Publish twice: its panel says Changes since published just now the second time", /<span class="wx-pub-again">Changes since published just now<\/span>/.test(wb) && /\[data-mock-live\] \.wx-pub-again\{animation:sxk-wx-again/.test(BUILDER_CSS))

console.log("\n── 2. loudlib sharp ──")
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
// The builder's loudlib and its six boxes are gone; the showcase's loudlib card keeps its sharp pictures.
const loud = SHOWCASE_EXAMPLES.find((e) => e.src.includes("a-loud"))
check("the showcase's loudlib card uses the same sharp boxes, at the sizes it had", !!loud && loud.src === "/marketing/loudlib/a-loud.webp" && /\/marketing\/loudlib\/a-loud-720\.webp 720w/.test(loud.srcSet) && /\/marketing\/loudlib\/m-loud-960\.webp 960w/.test(loud.phoneSrcSet ?? "") && [["a-loud", 1440, 990], ["a-loud-720", 720, 495], ["m-loud-960", 960, 720], ["m-loud-640", 640, 480]].every(([n, w, h]) => { const s = webp(`marketing/loudlib/${n}.webp`); return !!s && s.w === w && s.h === h && s.kb < 80 }))
check("no blur, no upscaling filter on the pictures", !/filter:blur|image-rendering/.test(BUILDER_CSS + SHOWCASE_STYLES[0].css))

console.log("\n── 3. Three numbers ──")
// Changed on purpose (landing round 15, later): the owner asked for no numbers under the heading, the numbers under the
// pictures with thin vertical lines between them, and different ones: pinned in tests/home-landing-r15-stats.test.ts.
check("no em dashes, no banned words in the builder", !/—/.test(read("components/marketing/build-showcase.tsx") + read("components/marketing/home/showcase-mocks/builder-mocks.tsx")) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge)\b/i.test(IDEAS_TABS[0].alt))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
