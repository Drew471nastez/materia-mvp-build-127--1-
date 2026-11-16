/**
 * HOME, LANDING ROUND 9: HOW IT WORKS (section "Take tips. See what sells. All on your own domain.")
 *
 * The owner, after round 8:
 *   1. the products card repeats "Sell anything you make" and the course
 *      card repeats the section that shows what you can build: both go;
 *   2. the structure of the reference: a heading, then three picture cards
 *      in one row, narrow, wide, narrow, each with a caption title and one
 *      short line, thin concentric ring lines inside the pictures, on white;
 *   3. "Take tips" smoother, cleaner and more colourful ("too grey");
 *   4. a wide middle card like "Your profit": a chart drawing in, top
 *      products (the black tee and the Cine Tones LUT Pack), by country;
 *   5. "Use your own domain" in a new, simple design, no address list;
 *   6. a new heading; a subtle dot field in the section's ground that flows
 *      by itself and follows the mouse;
 *   7. no lag: transform and opacity only, nothing running off screen, no
 *      blank boxes on a fast scroll.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  HowItWorks, HOW_CARDS, HOW_FIELD, HOW_IT_WORKS_STYLES, TIP_AMOUNTS, // Changed on purpose (landing round 12): the figures, countries, LUT cover and Storelib address are gone with their pictures
} from "@/components/marketing/home/how-it-works"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const FILE = "components/marketing/home/how-it-works.tsx"
const src = read(FILE)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
const keyframeBodies = (c: string) => [...c.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1])
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => ["transform", "opacity"].includes(x[1]))

console.log("\n1. The two cards that repeated other sections are gone")
check("no products card and no course card", !/Sell physical and digital products|Build and sell a course|You keep|Print cost|Lessons|2 of 7 done/.test(text) && !/cmh-pc|cmh-cp|ProductsScene|CourseScene/.test(src))
check("their pictures are deleted", !existsSync("public/home/how/tee-white.webp") && !existsSync("public/home/how/lesson-plane.webp"))

console.log("\n2. The reference's structure, on white")
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "three cards in the row".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "one row from 1100px".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "a phone stacks them".
check("each caption is a title and one short line under it", (how.match(/<h3 class="cmh-cap-t">[^<]+<\/h3><p class="cmh-cap">[^<]+<\/p>/g) ?? []).length === 3 && HOW_CARDS.every((c) => !/[.!]$/.test(c.title) && c.line.split(" ").length <= 16 && text.includes(c.title) && text.includes(c.line)))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No ring lines.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "no ring lines".
check("white ground, light pictures, in the shared box with the heading set in", /\.cmh\{[^}]*background:#fff/.test(css) && how.includes('class="cmh-in home-wrap"') && /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && /\.cmh-h\{[^}]*padding-left:var\(--home-head-inset,14px\)/.test(css))

console.log("\n3. Take tips: colourful, lively")
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "a quiet lilac".
const hearts = [...how.matchAll(/class="cmh-a cmh-heart" style="[^"]*color:(#[0-9a-f]{6})/g)].map((m) => m[1])
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No hearts.
check("no hearts and no confetti", !/cmh-heart/.test(how + css))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "tips arrive at the top".
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The picture is not pressed any more.
check("it takes no press: no click listener, the amounts are the tip button's own three", TIP_AMOUNTS.join() === "$3,$5,$10" && !/addEventListener\("click"/.test(code) && !how.includes("data-amt"))
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "no green anywhere".

console.log("\n4. Understand your business")
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "the two products are section 3".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "the black tee".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "every figure adds up".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "orders by country".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "the reports carry".
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Bars rise once instead of a line drawing in.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "the bars rise once".
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The reading glides by itself.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "a reading glides".

console.log("\n5. Use your own domain")
// Changed on purpose (landing round 10): the owner did not like the pill over his website: one address band in the spirit of "Ready for Google and AI search" (tests/home-landing-r10-how.test.ts).
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). His website in a browser.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "his website in one browser".
// Changed on purpose (landing round 10): the name is "lindewood" (one line on a narrow card) and the DNS and HTTPS ticks are gone with the website.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "his site's Storelib address".

console.log("\n6. The heading and the ground")
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "a new two tone heading".
check("a dot field behind the head of the section, behind the words, taking no pointer", /<div class="cmh-field" aria-hidden="true"><canvas><\/canvas><\/div>/.test(how) && /\.cmh-field\{position:absolute;z-index:-1;[^}]*pointer-events:none\}/.test(css) && /\.cmh\{position:relative;isolation:isolate/.test(css))
// Changed on purpose (landing round 10): the domain card's endings fade through a still mask; the dot field still has none.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The masks are on the tip list's still window and the dot field has none.
check("subtle and cheap: faint dots, at most 1.5 device pixels a pixel, no mask", HOW_FIELD.rest <= 0.2 && HOW_FIELD.maxDpr <= 1.5 && HOW_FIELD.gap >= 18 && !/mask/.test(rule(".cmh-field") + rule(".cmh-field canvas")) && [...css.matchAll(/([^{}\n]+)\{[^}]*mask-image/g)].every((m) => m[1] === ".cmh-tip-win"))
check("it stops off screen and in a hidden tab, stands still for reduced motion, and follows a mouse only", /near && document\.visibilityState !== "hidden" && !reduced/.test(code) && /cancelAnimationFrame\(raf\)/.test(code) && /if \(fine && !reduced\) \{\s*section\.addEventListener\("pointerenter"/.test(code))
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "its place is read on resize".

console.log("\n7. Smooth")
// Changed on purpose (landing round 10): the domain card has two keyframes now (the reel and the light), not six.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Fewer, calmer loops.
check("every keyframe moves transform and opacity only", keyframeBodies(css).length >= 10 && keyframeBodies(css).every(onlyCompositor))
check("no transition or animation on a paint or layout property", [...css.matchAll(/transition:([^;}]+)/g)].every((m) => m[1].split(/,(?![^(]*\))/).every((t) => /^(transform|opacity) |^none$/.test(t.trim()))) && !/animation[^;}]*(height|width|box-shadow|filter)/.test(css))
check("loops run only while their card is near the screen in a visible tab", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /rootMargin: "120px 0px"/.test(code) && /visibilitychange/.test(code))
check("the cards never hide, so a fast scroll finds no blank box", !/\.cmh-card\{[^}]*(opacity|transform)/.test(css) && !/\.cmh-stage\{[^}]*opacity/.test(css))
// Changed on purpose (landing round 10): on a computer the pictures stop at half the screen's height (svh, so the URL bar never changes it), never under 360px.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard, a tip flow and a typed domain, full width on the section; tests/home-landing-r12-how.test.ts pins them. Retired here: "fixed picture heights".
check("no blur, no glass", !/backdrop-filter|blur\(/.test(css))
const imgs = [...how.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
// Changed on purpose (landing round 10): three pictures now, his website's are gone.
check("every picture is lazy, decoded off the main thread, with its size set, a small local webp", imgs.length >= 3 && imgs.every((i) => /loading="lazy"/.test(i) && /decoding="async"/.test(i) && /width="\d+"/.test(i) && /height="\d+"/.test(i)) && [...new Set(imgs.map((i) => i.match(/src="([^"]+)"/)![1]))].every((p) => p.endsWith(".webp") && existsSync(`public${p}`) && statSync(`public${p}`).size < 120 * 1024))
check("reduced motion: every picture's finished frame, still", /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}\s*\.cmh-o\{animation:none!important\}/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words, none of the banned samples", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(text) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren Holt|Harbor yarn|enthusiast|\bfans?\b|Shopify|Liquid/i.test(code + text))
check("registered in the push suite, after round 8's", /"tests\/home-landing-r8-[\w-]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-how\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\nhome-landing-r9-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
