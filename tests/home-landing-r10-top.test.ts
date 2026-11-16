/**
 * ===========================================================================
 *  HOME, LANDING ROUND 10 (TOP): A SMALLER IDEAS PICTURE WITHOUT THE LINE
 *  UNDER THE HEADING, A NEW COVER FOR FIELDWORK THAT MATCHES THE OTHER
 *  STORES, AND THE FOUR PICTURES CAPPED BY THE SCREEN'S HEIGHT
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx and everything-in-one-place.tsx.
 *
 * The owner, after round 9:
 *   1. ideas: "on desktop and larger screens the representation is just too
 *      big and occupies too much; reduce it a little more, but keep the
 *      things";
 *   2. ideas: "Get rid of the subheading";
 *   3. the store strip: "I don't like the cover for Fieldwork, come up with
 *      something else", and "in terms of height it doesn't match";
 *   4. (the round's brief) on a 1440x800 laptop a section's picture and its
 *      heading fit in one screen.
 *
 * Measured (Chromium, the sections' own markup and stylesheets, and the dev
 * server for the screenshots; before is round 9's code):
 *   - ideas, heading top to picture foot: 925px before, 770px now at
 *     1440x800 (so heading, tabs and the whole picture stand in one screen);
 *     939 and 783 at 1470x830; 1163 and 981 at 1920x1080; 450 and 355 at 390.
 *     The picture 1137 x 669 before, 1008 x 593 now at 1440; 1542 x 907 and
 *     1367 x 804 at 1920; 350 x 206 at 390 both times. Tabs top to picture
 *     foot 735 before, 659 now at 1440x800.
 *   - Fieldwork in the strip (a page is drawn at 390 and scaled): its first
 *     row of pieces ended 446px down and its content 646px at 1440, where the
 *     other stores end theirs at 345 and 540, so its pieces were cut at their
 *     names; now 345 and 540, the same, at 1920 450 and 705 (was 582 and
 *     842), at 390 275 and 431 (was 356 and 515).
 *   - the four pictures: 475px tall before and 464 now at 1440x800 (481 at
 *     1470x830, 620 at 1920x1080, 335 at 390, unchanged); heading top to the
 *     foot of the first row 698 before and 687 now at 1440x800. The section
 *     1598px before and 1575 now at 1440x800, 1887 at 1920, 2096 at 390.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"

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
const F = {
  ev: "components/marketing/home/everything-in-one-place.tsx",
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
}
const css = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const ideasCss = Ideas.IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
const ideas = renderToStaticMarkup(createElement(Ideas.IdeasComeToLife))
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))

console.log("\n── 1. Ideas: a smaller picture, the same things in it ──")
const frame = rule(ideasCss, ".ideas-frame")
check("from 768px the frame is 78% of the shared width", /@media\(min-width:768px\)\{\.ideas-frame\{width:min\(78%,calc\(\(100svh - 170px\) \* 1280 \/ 752\)\)\}\}/.test(ideasCss))
check("and never taller than the screen under the tabs allows (svh, so iOS's bar never moves it)", /100svh - 170px/.test(ideasCss) && !/100vh/.test(ideasCss))
check("centred, full width on a phone", /justify-self:center/.test(frame) && /width:100%/.test(frame) && !/@media\(max-width:767px\)\{[^}]*\.ideas-frame/.test(ideasCss))
check("the picture keeps its shape, so the editor inside shrinks whole", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(ideasCss))
check("the three editors are all still there", Ideas.IDEAS_TABS.map((t) => t.title).join() === "Website builder,OnePage editor,Community" && (ideas.match(/role="tabpanel"/g) ?? []).length >= 1)
// Changed on purpose (landing round 11): the owner: "a little more depth, just a little"; one soft layered shadow on the frame, which never changes (tests/home-landing-r11-top.test.ts).
check("the frame has the hairline and only round 11's soft shadow", /border:1px solid #e3e3e6/.test(frame) && /box-shadow:0 1px 2px rgba\(16,24,40,\.04\),0 6px 16px -6px rgba\(16,24,40,\.08\),0 22px 44px -22px rgba\(16,24,40,\.16\)\}/.test(frame))

console.log("\n── 2. Ideas: no line under the heading ──")
check("the line is gone from the page", !/class="ideas-sub"/.test(ideas) && !/No code, nothing to install/.test(ideas))
check("and from the code and the stylesheet", !("IDEAS_SUB" in Ideas) && !/ideas-sub/.test(code(read(F.ideas))))
check("the heading still changes by itself over the tabs", /<h2 id="ideas-title"/.test(ideas) && ideas.indexOf('class="ideas-head"') < ideas.indexOf('class="ideas-tabs-row"'))

console.log("\n── 3. Fieldwork: a new cover, the same height as the other stores ──")
const fw = EVERYTHING_STORES.find((s) => s.key === "fieldwork")
check("its cover is the new photo", fw?.kind === "merch" && fw.hero === "/home/everything/stores/knit-cover.webp")
const cover = join(root, "public/home/everything/stores/knit-cover.webp")
check("a real webp, small", existsSync(cover) && readFileSync(cover).subarray(0, 4).toString() === "RIFF" && readFileSync(cover).subarray(8, 12).toString() === "WEBP" && statSync(cover).size < 60 * 1024, existsSync(cover) && statSync(cover).size)
check("the old cover is gone", !existsSync(join(root, "public/home/everything/stores/knit-hero.webp")) && !/knit-hero/.test(read(F.ev)))
const page = html.slice(html.indexOf('data-store=""'), html.indexOf('data-store=""') + 4000)
check("the menu, wordmark and cart stand on the cover, the drop's name on its left", /<span class="ev-ms-cover"><img class="ev-ms-hero" src="\/home\/everything\/stores\/knit-cover\.webp"[^>]*width="780" height="464"[^>]*><span class="ev-ms-top"><span class="ev-ms-nav">Shop all<\/span><span class="ev-ms-mark">Fieldwork<\/span><span class="ev-ms-nav">Cart \(0\)<\/span><\/span><span class="ev-ms-drop"><b>Cold<\/b><b>Season<\/b><i>4 pieces<\/i><\/span><\/span>/.test(page), page.slice(0, 700))
check("the pieces in the same grid as the other stores", /<\/span><span class="ev-mc-grid"><span class="ev-mc-item">/.test(page) && !/ev-ms-grid/.test(css + html))
check("the cover is as tall as the others' header and title (214 of the page's 390px), the grid 24 under it", /\.ev-ms-cover\{[^}]*height:calc\(214 \* var\(--r\)\);overflow:hidden/.test(css) && /\.ev-ms-cover \+ \.ev-mc-grid\{margin-top:calc\(24 \* var\(--r\)\)\}/.test(css))
// Changed on purpose (landing round 12): Jonah Wells's store uses this cover too, with a soft shade over his darker photo (only under data-ink="light"); Fieldwork's cover still has nothing drawn over it (tests/home-landing-r12-top.test.ts).
check("the photo fills the cover, nothing drawn over it but the words", /\.ev-ms-hero\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover/.test(css) && !/(^|\})\s*\.ev-ms-cover::(before|after)/.test(css) && !/data-ink="light"/.test(page))
check("dark words on the photo's light grey, nothing moves", /\.ev-ms-drop\{[^}]*color:#141414\}/.test(css) && !/\.ev-ms[^{]*\{[^}]*(animation|transition)/.test(css))
check("the other pages are as they were", EVERYTHING_STORES.length === 7 && EVERYTHING_STORES.filter((s) => s.kind === "merch").length === 2 && EVERYTHING_STORES.filter((s) => s.kind === "merch" && s.hero).length === 1) // Changed on purpose (landing round 12): Jonah Wells's store is laid out on a cover as well. Changed on purpose (landing round 14): his store gave way to Liam Bailey's real product page (tests/home-landing-r14-everything.test.ts): two stores, Fieldwork on its cover.

console.log("\n── 4. The four pictures fit a laptop's screen ──")
check("from 768px the pictures are capped at 58% of the screen's height", /@media\(min-width:768px\)\{\.ev-vis\{height:clamp\(300px,min\(33vw,58svh\),620px\);border-radius:19px\}\}/.test(css))
check("a phone's pictures are as they were", /\.ev-vis\{position:relative;overflow:hidden;height:clamp\(300px,86vw,380px\);/.test(css))

console.log("\n── Copy ──")
const all = code(read(F.ev)) + code(read(F.ideas))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Weeknight Pasta|sourdough|Golden Hour|Elena Ruiz/i.test(all))
check("this suite runs with the push tests, after round 9's", /"tests\/home-landing-r9-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
