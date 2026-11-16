/**
 * HOME PAGE, LANDING ROUND 13 (the owner's iPhone recording: the page stutters and glitches, the carousels do not
 * play, and "Understand your business" and the checkout pictures should be the computer's, only smaller).
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { HOW_DASH_FIT } from "@/components/marketing/home/how-it-works"
import { PICTURE_AHEAD } from "@/components/marketing/landing-story"

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/(storelib)/(marketing)/page.tsx")
const how = read("components/marketing/home/how-it-works.tsx")
const co = read("components/marketing/home/checkout-scene.tsx")
const story = read("components/marketing/landing-story.tsx")

console.log("\n── no rebuild of the whole page on a late file (React #418) ──")
check("the page is a Suspense boundary of its own, around the dark wrapper", /return \(\s*\/\*[\s\S]*?\*\/\s*<Suspense fallback=\{null\}>\s*<div className="bg-\[#050506\]" data-home-ground="dark">/.test(page) && /<\/div>\s*<\/Suspense>\s*\)\s*\}\s*$/.test(page))
check("the landing inside it is one more boundary", /<Suspense fallback=\{null\}>\s*<LandingStory>/.test(page) && /<\/LandingStory>\s*<\/Suspense>/.test(page))
for (const tag of ["<ProductMarquee />", "<PricingSection editorial hideDetailsLink />", "<FaqSection editorial />", "<FinalCta />"]) {
  check(`  ${tag} sits in a boundary of its own`, page.includes(`<Suspense fallback={null}>${tag}</Suspense>`))
}

console.log("\n── the loops play ──")
check("no gate pauses loops through the Animations API (near-gate.tsx is gone)", !existsSync(join(process.cwd(), "components/marketing/home/near-gate.tsx")) && !/NearGate/.test(page))

console.log("\n── the computer's pictures on a phone ──")
check("the dashboard is never laid out narrower than 1040 (the computer's layout with its sidebar, from 1020), scaled whole", HOW_DASH_FIT.min >= 1040 && /--db-w/.test(how) && /scale\(var\(--db-s/.test(how))
check("  on a phone its stage takes the dashboard's shape", /@media\(max-width:639px\)\{\.cmh-stage\[data-ground=business\]\{height:auto;aspect-ratio:16\/10\}\}/.test(how))
check("the checkout pictures on a phone are the computer's 48 x 42, and Built to convert is not laid out again", /\.cmc-vis\{height:auto;aspect-ratio:48\/42;/.test(co) && /\.cmc-vis-in\{font-size:calc\(100cqw \/ 48\)\}/.test(co) && !/CDX_NARROW/.test(co) && /\.cmc-card\[data-k=convert\] \.cmc-vis-in\{left:0;width:100%;height:100%;margin-left:0\}\n  \.cmc-card\[data-k=convert\] \.cdx\{inset:6px;/.test(co) && !/\.cdx-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(co))

console.log("\n── pictures asked for ahead ──")
check("a lazy picture is asked for three screens ahead", PICTURE_AHEAD === "300% 0px 300% 0px" && /if \(img\.loading === "lazy"\) img\.loading = "eager"/.test(story) && /rootMargin: PICTURE_AHEAD/.test(story))

console.log("\n── round 14: nothing in the checkout follows the scroll on a phone ──")
check("the scroll timelines and the held stage start at 900px", /@media \(min-width:900px\)\{\s*@supports \(animation-timeline:view\(\)\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}\s*\.cmc-stage\{position:sticky;top:0\}/.test(co) && (co.match(/@supports \(animation-timeline:view\(\)\)/g) || []).length === 1)
check("the dark header has no backdrop filter (a solid bar)", !/backdrop-blur/.test(read("lib/platform/header-chrome.ts").replace(/\/\*[\s\S]*?\*\//g, "").split("if (!light)")[1].split("}")[0]))

const layout = read("app/(storelib)/(marketing)/layout.tsx")
const gate = read("components/marketing/document-ready.tsx")
check("the page slot in <main> is a Suspense boundary (a late page or code file never makes React begin <main> twice)", /<main className="flex-1">\s*<Suspense fallback=\{null\}>\{children\}<\/Suspense>\s*<\/main>/.test(layout))
check("nothing under the marketing layout hydrates before the document has arrived", /<DocumentReady>\s*<div className="flex min-h-svh flex-col marketing-flex-wrapper">/.test(layout) && /document\.readyState !== "loading"/.test(gate) && /DOMContentLoaded/.test(gate) && /if \(wait\) use\(wait\)/.test(gate))

console.log(`\n${failed ? `${failed} failed` : "all passed"}`)
if (failed) process.exit(1)
