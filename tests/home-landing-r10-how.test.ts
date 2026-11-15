/**
 * HOME, LANDING ROUND 10: HOW IT WORKS ("Take tips. See what sells. All on your own domain.")
 *
 * The owner, after round 9:
 *   1. "I don't like the 'Use your own domain' visual representation you
 *      added. Come up with something more simple and clean, something
 *      similar to 'Ready for Google and AI search' in terms of design."
 *      So no address pill over a drawn website and no DNS / HTTPS ticks:
 *      one address on a white band in the middle of the card, his name
 *      standing still and its ending gliding up one step at a time through
 *      a mask that never moves (his storelib.com address first, then
 *      domains of his own), a soft light turning slowly behind. The engines
 *      card's idea (analytics-showcase.tsx EnginesCard) on this section's
 *      light ground, with no script: one CSS animation on one transform.
 *   2. On a MacBook Air (about 1440x800) the section is too tall: the
 *      heading and the row of pictures should fit one screen. The pictures
 *      stop at half the screen's height on a computer, never under 360px.
 *      Measured (static render, Inter): section 914 -> 854px at 1440x800,
 *      924 -> 869 at 1470x830, 1014 -> 994 at 1920x1080, 1940 at 390
 *      (unchanged); heading top to the captions' last line 754 -> 694 at
 *      1440x800.
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_CARDS, HOW_DOMAIN, HOW_ENDINGS, HOW_IT_WORKS_STYLES } from "@/components/marketing/home/how-it-works"
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
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
const kf = (name: string) => (css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`)) ?? [])[1] ?? ""
const onlyTransform = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => x[1] === "transform")
const card = how.slice(how.indexOf('data-card="domain"'))

console.log("\n1. Use your own domain: one address, its ending gliding")
check("the round 9 picture is gone: no pill over a website, no ticks, no workshop picture", !/cmh-pill|cmh-site|cmh-url|cmh-ok|cmh-dm-ok/.test(src) && !/DNS found|HTTPS on|Built by hand/.test(text) && !existsSync("public/home/how/site-workshop.webp"))
check("one white band: a violet lock, his name, and the window its endings pass through", /<div class="cmh-dm-band"><span class="cmh-dm-lock"><svg[\s\S]*?<\/svg><\/span><span class="cmh-dm-name">lindewood<\/span><span class="cmh-dm-ends"><span class="cmh-dm-win"><span class="cmh-a cmh-dm-reel">/.test(card) && /background:#fff/.test(rule(".cmh-dm-band")) && /background:#8b5cf6;color:#fff/.test(rule(".cmh-dm-lock")))
const rows = [...card.matchAll(/<span class="cmh-dm-end"( data-storelib="")?>([^<]+)<\/span>/g)].map((m) => m[2])
check("the reel: his Storelib address first, then his own; two rows before and three after so a neighbour always shows", HOW_ENDINGS[0] === ".storelib.com" && rows.join() === [...HOW_ENDINGS.slice(-2), ...HOW_ENDINGS, ...HOW_ENDINGS.slice(0, 3)].join() && rows[2] === HOW_ENDINGS[0] && rows[2 + HOW_ENDINGS.length] === HOW_ENDINGS[0])
check("only the storelib.com ending is greyed", (card.match(/data-storelib=""/g) ?? []).length === 2 && /color:#a1a1aa/.test(rule(".cmh-dm-end[data-storelib]")))
check("every address it shows is real: his Storelib address, and domains Storelib accepts", `${HOW_DOMAIN.name}${HOW_ENDINGS[0]}` === HOW_DOMAIN.before && `${HOW_DOMAIN.name}${HOW_ENDINGS[1]}` === HOW_DOMAIN.host && HOW_ENDINGS.slice(1).every((e) => hostnameProblem(cleanHostname(`${HOW_DOMAIN.name}${e}`)) === null))
check("minimal words: the band and the caption, nothing else in the picture", text.includes("Use your own domain") && text.includes("On Pro, point a domain you own at your site. HTTPS is set up for you.") && HOW_CARDS[2].title === "Use your own domain")

console.log("\n2. Its motion, like the engines card")
const steps = [...kf("cmh-reel").matchAll(/translate3d\(0,(?:0|calc\(var\(--dm-step\) \* -(\d)\)),0\)/g)].map((m) => Number(m[1] ?? 0))
check("one step at a time, a hold between, ending one full set on so the loop never jumps", steps.join() === "0,1,2,3,4" && HOW_ENDINGS.length === 4 && /0%,16%\{/.test(kf("cmh-reel")) && /100%\{/.test(kf("cmh-reel")) && /animation-timing-function:cubic-bezier\(\.65,0,\.35,1\)/.test(rule(".cmh-dm-reel")))
check("the reel and the light move by transform only", onlyTransform(kf("cmh-reel")) && onlyTransform(kf("cmh-spin")) && /animation-name:cmh-reel/.test(rule(".cmh-dm-reel")) && /animation-name:cmh-spin/.test(rule(".cmh-dm-light")))
check("the mask is on the still window, never on what moves", /mask-image:linear-gradient/.test(rule(".cmh-dm-win")) && !/mask/.test(rule(".cmh-dm-reel")) && !/animation/.test(rule(".cmh-dm-win")) && [...css.matchAll(/([^{}\n]+)\{[^}]*mask-image/g)].every((m) => m[1] === ".cmh-dm-win"))
check("both are .cmh-a, so they stop off screen and in a hidden tab", /class="cmh-a cmh-dm-light"/.test(card) && /class="cmh-a cmh-dm-reel"/.test(card) && /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}"))
check("no script for it: no timer, no measuring, no React state", !/setInterval|useState/.test(code) && !/DomainScene[\s\S]*?useEffect[\s\S]*?const EASE/.test(code))
check("the light is soft and warm, never violet, never blurred", /radial-gradient\(26% 26%[^;]*rgba\(255,255,255,\.5\)[^;]*rgba\(255,170,110,\.16\)/.test(rule(".cmh-dm-light")) && !/gradient\([^)]*#8b5cf6/.test(css) && !/blur\(|backdrop-filter|filter:/.test(css))
check("reduced motion: his own domain on the band, still", /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.cmh-dm-reel\{transform:translate3d\(0,calc\(var\(--dm-step\) \* -1\),0\)\}/.test(css))
check("the light ground of this section, not a black card", /data-ground="peach"/.test(how.slice(how.indexOf('data-card="domain"'))) && /background:#ffe8d4/.test(rule(".cmh-stage[data-ground=peach]")))

console.log("\n3. One screen on a MacBook Air")
check("on a computer the pictures stop at half the screen's height, never under 360px", css.includes("@media(min-width:1100px){.cmh-stage,.cmh-wide .cmh-stage{height:max(360px,min(clamp(400px,32vw,560px),50svh))}}"))
check("svh, so the iPhone's URL bar never changes it, and no vh at all", !/[\d)]vh\b/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words or samples", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(text) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren Holt|Harbor yarn|enthusiast|\bfans?\b|Shopify|Liquid/i.test(code + text))
check("registered in the push suite, after round 9's", /"tests\/home-landing-r9-[\w-]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-how\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\nhome-landing-r10-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
