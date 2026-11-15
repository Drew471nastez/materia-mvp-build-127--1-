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
import { HowItWorks, HOW_CARDS, HOW_DOMAIN, HOW_IT_WORKS_STYLES } from "@/components/marketing/home/how-it-works"
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

// Changed on purpose (landing round 11): the owner disliked this picture too ("change the imagery to something else, smoother, cleaner, that works"). The reel of endings and the turning light are gone; the card shows his website in a browser, its address closing from lindewood.storelib.com to lindewood.com (tests/home-landing-r11-lower.test.ts pins it). What still holds from round 10 is checked here.
console.log("\n1. Use your own domain (round 11 replaced the reel)")
check("the round 9 picture is still gone: no pill, no ticks", !/cmh-pill|cmh-url|cmh-ok|cmh-dm-ok/.test(src) && !/DNS found|HTTPS on|Built by hand/.test(text) && !existsSync("public/home/how/site-workshop.webp"))
check("the reel and its light are gone", !/cmh-dm-reel|cmh-dm-light|cmh-dm-band|@keyframes cmh-reel|@keyframes cmh-spin/.test(src + css))
check("every address it shows is real: his Storelib address, and a domain Storelib accepts", `${HOW_DOMAIN.name}.storelib.com` === HOW_DOMAIN.before && `${HOW_DOMAIN.name}.com` === HOW_DOMAIN.host && hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null)
check("minimal words: the caption", text.includes("Use your own domain") && text.includes("On Pro, point a domain you own at your site. HTTPS is set up for you.") && HOW_CARDS[2].title === "Use your own domain")
check("its loops are .cmh-a, so they stop off screen and in a hidden tab, and move by transform and opacity", /class="cmh-a cmh-dm-com"/.test(card) && /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && onlyTransform(kf("cmh-dm-com")) && !/blur\(|backdrop-filter|filter:/.test(css))

console.log("\n3. One screen on a MacBook Air")
check("on a computer the pictures stop at half the screen's height, never under 360px", css.includes("@media(min-width:1100px){.cmh-stage,.cmh-wide .cmh-stage{height:max(360px,min(clamp(400px,32vw,560px),50svh))}}"))
check("svh, so the iPhone's URL bar never changes it, and no vh at all", !/[\d)]vh\b/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words or samples", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(text) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren Holt|Harbor yarn|enthusiast|\bfans?\b|Shopify|Liquid/i.test(code + text))
check("registered in the push suite, after round 9's", /"tests\/home-landing-r9-[\w-]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-how\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\nhome-landing-r10-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
