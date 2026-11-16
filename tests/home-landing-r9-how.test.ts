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
  HowItWorks, HOW_CARDS, HOW_COUNTRIES, HOW_DAYS, HOW_DAY_CENTS, HOW_DOMAIN, HOW_FIELD, HOW_HEADING, HOW_IT_WORKS_STYLES, HOW_LUTS, HOW_PRODUCTS, HOW_SALES_CENTS, TIP_AMOUNTS,
} from "@/components/marketing/home/how-it-works"
import { EVERYTHING_SLIDES } from "@/components/marketing/home/everything-in-one-place"
import { cleanHostname, hostnameProblem } from "@/lib/custom-domains/hostname"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const FILE = "components/marketing/home/how-it-works.tsx"
const src = read(FILE)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
/* Changed on purpose (landing round 6 perf): the field is drawn by the shared engine in a worker; the page's side is dot-field-mount.ts (canvases are made there, not in the markup). */
const strip = (f: string) => read(`components/marketing/home/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const MOUNT = strip("dot-field-mount.ts")
const DRIVER = strip("dot-field-driver.ts")
const ENGINE = strip("dot-field-engine.ts")
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
check("three cards in the row's order: tips, the numbers, the domain; narrow, wide, narrow", HOW_CARDS.map((c) => `${c.key}:${c.wide}`).join() === "tips:false,business:true,domain:false" && [...how.matchAll(/class="cmh-card (cmh-wide|cmh-narrow)" data-card="(\w+)"/g)].map((m) => m[2]).join() === "tips,business,domain")
check("one row from 1100px, the wide card twice a narrow one", /@media\(min-width:1100px\)\{\.cmh-grid\{grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\);/.test(css))
check("a phone stacks them in that order; between, the wide card leads and the narrow two share a row", /\.cmh-grid\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:40px\}/.test(css) && /@media\(min-width:640px\) and \(max-width:1099px\)\{\s*\.cmh-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*\}\s*\.cmh-wide\{grid-column:1\/-1;order:-1\}/.test(css))
check("each caption is a title and one short line under it", (how.match(/<h3 class="cmh-cap-t">[^<]+<\/h3><p class="cmh-cap">[^<]+<\/p>/g) ?? []).length === 3 && HOW_CARDS.every((c) => !/[.!]$/.test(c.title) && c.line.split(" ").length <= 16 && text.includes(c.title) && text.includes(c.line)))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No ring lines.
check("no ring lines, no orbiting dots", !/cmh-rings|<circle |cmh-arm/.test(how + css))
check("white ground, light pictures, in the shared box with the heading set in", /\.cmh\{[^}]*background:#fff/.test(css) && how.includes('class="cmh-in home-wrap"') && /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && /\.cmh-h\{[^}]*padding-left:var\(--home-head-inset,14px\)/.test(css))

console.log("\n3. Take tips: colourful, lively")
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
check("a quiet lilac tinted ground, violet only as the accent of the amounts", /background:#f3f1f8/.test(rule(".cmh-stage[data-ground=tips]")) && /color:#6d3fe0/.test(rule(".cmh-tip-row>em")))
const hearts = [...how.matchAll(/class="cmh-a cmh-heart" style="[^"]*color:(#[0-9a-f]{6})/g)].map((m) => m[1])
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No hearts.
check("no hearts and no confetti", !/cmh-heart/.test(how + css))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
check("tips arrive at the top of the list from people with coloured faces", (how.match(/class="cmh-tip-row"/g) ?? []).length === 8 && text.includes("Marco") && text.includes("Priya") && text.includes("$10"))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The picture is not pressed any more.
check("it takes no press: no click listener, the amounts are the tip button's own three", TIP_AMOUNTS.join() === "$3,$5,$10" && !/addEventListener\("click"/.test(code) && !how.includes("data-amt"))
check("no green anywhere in the section", !/#15803d|#16a34a|#22c55e|#10b981|green/i.test(css))

console.log("\n4. Understand your business")
const s3 = (kind: string) => EVERYTHING_SLIDES.find((s) => s.kind === kind)!
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
check("the two products are section 3's, by name, with section 3's revenue", HOW_PRODUCTS[0].name === s3("luts").name && HOW_PRODUCTS[1].name === s3("tee").name && s3("luts").stats.some((r) => r[1] === "$11,194.00") && s3("tee").stats.some((r) => r[1] === "$6,848.00") && text.includes("Cine Tones LUT Pack $11,194") && text.includes("Midnight Studio Tee $6,848"))
check("the black tee is section 3's photograph and the pack its black cover", HOW_PRODUCTS[1].img === s3("tee").img && existsSync(`public${HOW_PRODUCTS[1].img}`) && HOW_LUTS.still === s3("luts").img && /<span class="cmh-top-pic" data-kind="luts"><span class="cmh-lut[^"]*">/.test(how))
check("every figure adds up: thirty days, 386 packs, 214 tees, $18,042.00", HOW_DAYS.length === 30 && HOW_DAYS.reduce((a, d) => a + d[0], 0) === 386 && HOW_DAYS.reduce((a, d) => a + d[1], 0) === 214 && HOW_SALES_CENTS === 386 * 2900 + 214 * 3200 && HOW_SALES_CENTS === HOW_DAY_CENTS.reduce((a, b) => a + b, 0) && text.includes("$18,042.00"))
check("orders by country add up to the orders", HOW_COUNTRIES.reduce((a, c) => a + c.orders, 0) === 386 + 214 && HOW_COUNTRIES.every((c) => text.includes(c.name) && text.includes(String(c.orders))) && (how.match(/class="cmh-flag"/g) ?? []).length === 3)
check("the reports carry the product's own names", ["Sales", "Top products", "Orders by country"].every((w) => text.includes(w)) && ["Top products", "Orders by country"].every((w) => read("app/(storelib)/app/analytics/analytics-reports.tsx").includes(`tt("${w}")`)) && !/Your profit/.test(text))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Bars rise once instead of a line drawing in.
check("the bars rise once, a scale from their foot, when a third of the card is seen; no stroke-dashoffset", /@keyframes cmh-rise\{from\{transform:scaleY\(\.02\);opacity:\.4\}to\{transform:scaleY\(1\);opacity:1\}\}/.test(css) && !/dashoffset/.test(css) && /\[data-seen\] \.cmh-o\{animation-play-state:running\}/.test(css) && /threshold: 0\.35/.test(code))
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The reading glides by itself.
check("a reading glides over four days by itself, no mouse listener, no frame loop", !/pointermove|requestAnimationFrame\(frame\)[\s\S]*cmh-ch/.test(code.slice(code.indexOf("export function HowItWorks"))) && (how.match(/class="cmh-a cmh-read-v"/g) ?? []).length === 4)

console.log("\n5. Use your own domain")
// Changed on purpose (landing round 10): the owner did not like the pill over his website: one address band in the spirit of "Ready for Google and AI search" (tests/home-landing-r10-how.test.ts).
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). His website in a browser.
check("his website in one browser window; no www / shop / club list", how.includes('class="cmh-dm-win"') && !how.includes("cmh-dm-band") && !how.includes("cmh-pill") && !/cmh-br|cmh-dm-row/.test(how + css) && !/>(www|shop|club)\.</.test(how))
// Changed on purpose (landing round 10): the name is "lindewood" (one line on a narrow card) and the DNS and HTTPS ticks are gone with the website.
check("his site's Storelib address comes first, then a domain Storelib accepts", HOW_DOMAIN.before === "lindewood.storelib.com" && hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && !text.includes("DNS found"))

console.log("\n6. The heading and the ground")
check("a new two tone heading for these three cards", HOW_HEADING.lead === "Take tips. See what sells." && HOW_HEADING.rest === "All on your own domain." && /<h2 id="cmh-title" class="cmh-h">Take tips\. See what sells\. <span class="cmh-h-mute">All on your own domain\.<\/span><\/h2>/.test(how))
check("a dot field behind the head of the section, behind the words, taking no pointer", /<div class="cmh-field" aria-hidden="true"><\/div>/.test(how) && /\.cmh-field\{position:absolute;z-index:-1;[^}]*pointer-events:none\}/.test(css) && /\.cmh\{position:relative;isolation:isolate/.test(css))
// Changed on purpose (landing round 10): the domain card's endings fade through a still mask; the dot field still has none.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). The masks are on the tip list's still window and the dot field has none.
check("subtle and cheap: faint dots, at most 1.5 device pixels a pixel, no mask", HOW_FIELD.rest <= 0.2 && HOW_FIELD.maxDpr <= 1.5 && HOW_FIELD.gap >= 18 && !/mask/.test(rule(".cmh-field") + rule(".cmh-field canvas")) && [...css.matchAll(/([^{}\n]+)\{[^}]*mask-image/g)].every((m) => m[1] === ".cmh-tip-win"))
check("it stops off screen and in a hidden tab, stands still for reduced motion, and follows a mouse only", /new IntersectionObserver/.test(MOUNT) && /visibilitychange/.test(DRIVER) && /f\.reduced/.test(ENGINE) && /if \(fine && !reduced\)/.test(MOUNT) && /mountDotField\(box, \{ kind: "how", gap: HOW_FIELD\.gap, pointer: section \}\)/.test(code))
check("its place is read on resize and as a mouse comes in, never in the frame", (MOUNT.match(/getBoundingClientRect/g) ?? []).length === 1 && !/getBoundingClientRect/.test(code.slice(code.indexOf("function HowField"), code.indexOf("function useDomainCut"))) && !/getBoundingClientRect/.test(MOUNT.slice(MOUNT.indexOf("const flush"), MOUNT.indexOf("const onMove"))) && !MOUNT.includes('"scroll"') && !/useState/.test(code.slice(code.indexOf("function HowField"), code.indexOf("function useDomainCut"))))

console.log("\n7. Smooth")
// Changed on purpose (landing round 10): the domain card has two keyframes now (the reel and the light), not six.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Fewer, calmer loops.
check("every keyframe moves transform and opacity only", keyframeBodies(css).length >= 10 && keyframeBodies(css).every(onlyCompositor))
check("no transition or animation on a paint or layout property", [...css.matchAll(/transition:([^;}]+)/g)].every((m) => m[1].split(/,(?![^(]*\))/).every((t) => /^(transform|opacity) |^none$/.test(t.trim()))) && !/animation[^;}]*(height|width|box-shadow|filter)/.test(css))
check("loops run only while their card is near the screen in a visible tab", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /rootMargin: "120px 0px"/.test(code) && /visibilitychange/.test(code))
check("the cards never hide, so a fast scroll finds no blank box", !/\.cmh-card\{[^}]*(opacity|transform)/.test(css) && !/\.cmh-stage\{[^}]*opacity/.test(css))
// Changed on purpose (landing round 10): on a computer the pictures stop at half the screen's height (svh, so the URL bar never changes it), never under 360px.
check("fixed picture heights, so nothing shifts as it plays", /\.cmh-stage\{[^}]*height:430px/.test(css) && /\.cmh-wide \.cmh-stage\{height:440px\}/.test(css) && /height:max\(360px,min\(clamp\(400px,32vw,560px\),50svh\)\)/.test(css))
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
