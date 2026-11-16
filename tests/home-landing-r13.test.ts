/**
 * HOME PAGE, LANDING ROUND 13 (the owner's iPhone recording: the page stutters and glitches, the carousels do not
 * play, and "Understand your business" and the checkout pictures should be the computer's, only smaller).
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { HOW_DASH_W } from "@/components/marketing/home/how-it-works"
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
check("the dashboard is drawn at least 1100 wide (the sidebar shows) and scaled down below that", HOW_DASH_W === 1100 && /\.cmh-db-fit\[data-k\]>\.cmh-db-w\{width:\$\{HOW_DASH_W\}px;transform:scale\(var\(--k\)\);transform-origin:0 0\}/.test(how) && /\.cmh-db-w\{display:block;container-type:inline-size\}/.test(how))
check("  its height follows the scaled drawing, set before paint", /useLayoutEffect\(\(\) => \{\s*const box = fit\.current/.test(how) && /--fh", `\$\{inner\.offsetHeight \* k\}px`/.test(how))
check("the checkout pictures on a phone are the computer's 48 x 42, and Built to convert is not laid out again", /\.cmc-vis\{height:auto;aspect-ratio:48\/42;/.test(co) && /\.cmc-vis-in\{font-size:calc\(100cqw \/ 48\)\}/.test(co) && !/CDX_NARROW/.test(co) && !/\.cdx-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(co))

console.log("\n── pictures asked for ahead ──")
check("a lazy picture is asked for three screens ahead", PICTURE_AHEAD === "300% 0px 300% 0px" && /if \(img\.loading === "lazy"\) img\.loading = "eager"/.test(story) && /rootMargin: PICTURE_AHEAD/.test(story))

console.log(`\n${failed ? `${failed} failed` : "all passed"}`)
if (failed) process.exit(1)
