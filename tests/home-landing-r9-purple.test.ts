/**
 * LANDING ROUND 9, TRACK PURPLE: the analytics section and the world map.
 *
 * The owner, on the live page:
 *   analytics  "as I reach the section, the tabs and things should appear
 *              smoothly, clean, animated as I scroll down": every block has
 *              its own entrance the first time it is on screen, the six
 *              reports one after another; opacity and translate only, once,
 *              nothing hidden by the markup, nothing run twice with the
 *              page's own entrance (components/marketing/landing-story.tsx).
 *   the globe  "more smooth and clean and doesn't cause lag": the land goes
 *              to the engine as its bitmask (fewer, larger dots on a small
 *              ball), fewer device pixels on a phone, stopped the moment it
 *              leaves the screen and while the page is flung. The shared
 *              engine files are not touched.
 *   the map    on a white sheet now, "keep the card black"; "the autoplay is
 *              every 3 seconds"; the product changing "more smooth and
 *              clean, buttery, without lag"; Buy now no longer glued to
 *              "Their money, their language".
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { ANALYTICS_GLOBE_DPR, FAST_SCROLL, RESUME_MS } from "@/components/marketing/home/analytics-globe"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_STEP_MS } from "@/components/marketing/home/sell-everywhere-map"
import { BAND_CSS, REVEAL_BODIES, REVEAL_HEADINGS } from "@/components/marketing/landing-story"

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
const DIR = "components/marketing/home"
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i

console.log("\n── analytics: each block's own entrance ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const marked = html.match(/data-rise=""/g) ?? []
  check("five blocks are watched: the words, the reports, the globe card, the search card, the engines", marked.length === 5, marked.length)
  check("nothing is hidden by the markup: no block arrives waiting", !/data-rise="(wait|in)"/.test(html))
  check("the old all at once riser is gone from the section", !/m\.reveal/.test(src))
  check("a block waits only when the first report finds it below the screen (or in a lazy box still skipped)", /if \(box\.top > innerHeight \|\| \(box\.width === 0 && box\.height === 0\)\) el\.dataset\.rise = "wait"/.test(src) && /else io\.unobserve\(el\)/.test(src))
  check("it comes in when it is on screen, once, and is let go", /if \(el\.dataset\.rise === "wait"\) el\.dataset\.rise = "in"\s+io\.unobserve\(el\)/.test(src))
  check("one observer, no scroll listener, nothing measured", (src.match(/new IntersectionObserver/g) ?? []).length === 1 && !/addEventListener\("scroll"|getBoundingClientRect\(\)/.test(src))
  check("reduced motion: nothing is watched or hidden", /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(src) && /@media \(prefers-reduced-motion: no-preference\) \{\s*\.rise\[data-rise="wait"\]/.test(css))
  const rise = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("The reports (landing round 7"))
  check("hidden means opacity and the translate property only (no room given or taken)", /\.rise\[data-rise="wait"\] \{\s*opacity: 0;\s*translate: 0 16px;\s*\}/.test(rise) && /\.reports\[data-rise="wait"\] \.report \{\s*opacity: 0;\s*translate: 0 10px;\s*\}/.test(rise) && !/height|margin|display|visibility|transform:/.test(rise))
  check("only opacity and translate are eased", [...rise.matchAll(/transition:([^;]*);/g)].every((m) => m[1].split(/,\s*\n/).every((t) => /^\s*(opacity|translate) /.test(t))), [...rise.matchAll(/transition:([^;]*);/g)].map((m) => m[1]))
  check("the reports follow each other 55ms apart", /\.reports\[data-rise="in"\] \.report \{[^}]*calc\(60ms \+ var\(--i, 0\) \* 55ms\)/.test(rise) && [0, 1, 2, 3, 4, 5].every((i) => html.includes(`style="--i:${i}"`)))
  check("the reports row itself is never hidden, only its tiles", !/\.reports\[data-rise="wait"\] \{/.test(css) && /<ul class="[^"]*reports[^"]*"[^>]*data-rise=""/.test(html) && !/<ul class="[^"]*rise[^"]*"/.test(html.replace(/reports/g, "")))
  check("not twice: none of these blocks is in the page's own entrance list", !/analytics|data-rise|\.rise/.test(`${REVEAL_HEADINGS},${REVEAL_BODIES}`) && /\.story-heading:not/.test(REVEAL_HEADINGS))
  check("no banned words or em dashes in what the section says", !BANNED.test(text(html)))
}

console.log("\n── the globe: lighter on a phone, still while it cannot be seen ──")
{
  const src = read(`${DIR}/analytics-globe.tsx`)
  check("the land goes as its bitmask, so the engine lays out fewer dots for a small ball", /const LAND: GlobeLand = \{ b64: EVERYTHING_LAND_B64/.test(src) && /pts, cities, home, land \}, \[off\]/.test(src) && /home,\s+land,\s+\)/.test(src) && !/platform-globe-land/.test(src))
  check("no points are built on the page's thread", /const NO_POINTS = new Float32Array\(0\)/.test(src) && !/landPoints/.test(src))
  check("a phone asks for fewer device pixels", ANALYTICS_GLOBE_DPR.phone === 1.25 && ANALYTICS_GLOBE_DPR.wide === 1.5 && /matchMedia\("\(max-width: 639px\), \(pointer: coarse\)"\)/.test(src) && /Math\.min\(dprCap, window\.devicePixelRatio \|\| 1\)/.test(src))
  check("it stops the moment its box leaves the screen (no margin)", /\{ rootMargin: "0px" \}/.test(src) && !/rootMargin: "60px 0px"/.test(src))
  check("it waits while the page is flung and starts again once calm", FAST_SCROLL > 0.8 && FAST_SCROLL < 2 && RESUME_MS >= 120 && RESUME_MS <= 300 && /Math\.abs\(y - lastY\) \/ dt > FAST_SCROLL/.test(src) && /\}, RESUME_MS\)/.test(src))
  check("the scroll listener is passive and attached only while the globe is on screen", /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(src) && /listen\(st\.visible\)/.test(src) && /removeEventListener\("scroll", onScroll\)/.test(src) && /listen\(false\)\s+driver\.run\(false\)/.test(src))
  check("the listener reads a clock and scrollY, nothing that lays the page out", !/getBoundingClientRect|offsetTop|offsetHeight|getComputedStyle/.test(src))
  check("the driver hears only changes", /if \(on === running\) return/.test(src))
  check("the shared engine is used, not edited here", /from "\.\/everything-globe-draw"/.test(src) && /EVERYTHING_GLOBE_WORKER_SOURCE/.test(src))
}

console.log("\n── the map: white ground, black card, 3s, no render per turn ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  check("white by its own classes, stronger than a band's recolouring", /\[data-landing-story\] \.cmm\.cmm\{background:#fff;color:#0f0e13\}/.test(src) && /\[data-band\] \.cmm\{background:transparent;color:#fff\}/.test(BAND_CSS))
  check("a dark heading on it, whatever the sheet", /\[data-landing-story\] \.cmm \.cmm-head \.story-heading\{--story-ink:#18181b;--story-muted:#777780;--story-accent:#7c3aed\}/.test(src) && !/\[data-band\] \.cmm \.story-heading/.test(src))
  check("the card stays black, its words light and its copy a muted grey", /\.cmm-card\{[^}]*color:#fff;background:#0f0f12;/.test(src) && /\.cmm-copy p\{[^}]*color:#a3a1ad\}/.test(src))
  const shadow = src.match(/\.cmm-card\{[^}]*box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.08\),0 (\d+)px (\d+)px -(\d+)px rgba\(15,14,19,\.5\)/)
  const reach = shadow ? Number(shadow[1]) + Number(shadow[2]) - Number(shadow[3]) : 999
  const pad = read("app/globals.css").match(/--home-pad:clamp\((\d+)px,/)
  check("its shadow is back on white and ends inside the section's own foot (--home-pad, 48px at the least), so the lazy box never cuts it", !!shadow && !!pad && reach <= Number(pad[1]) - 10 && /\[data-landing-story\] \[data-story-section\] \{padding-block:var\(--home-pad\)\}/.test(read("app/globals.css")), { reach, pad: pad?.[1] })
  check("on a purple sheet the round 8 rule still takes the shadow away", /\[data-band\] \.cmm-card\{box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.08\)\}/.test(BAND_CSS))
  check("the autoplay is every 3 seconds", SELL_STEP_MS === 3000 && /animation:cmm-time \$\{STEP\}ms linear both/.test(src))
  check("a turn renders nothing: no state for the country, attributes written to the layers", !/setTurn|useState\(\{ active/.test(src) && /const turn = useRef\(\{ active: 0, prev: N - 1, laps: 0 \}\)/.test(src) && /node\.toggleAttribute\("data-on", k === i\)/.test(src) && /node\.toggleAttribute\("data-was", k === t\.prev\)/.test(src))
  check("the turn's three numbers are written where they are read and never inherited, so the card is not restyled", /@property --cmm-a\{syntax:"<number>";inherits:false;initial-value:0\}/.test(src) && /@property --cmm-pan-x\{syntax:"<percentage>";inherits:false;initial-value:0%\}/.test(src) && /querySelector<HTMLElement>\("\.cmm-flag-lit"\)\?\.style\.setProperty\("--cmm-a", String\(i\)\)/.test(src) && /map\?\.style\.setProperty\("--cmm-pan-x", pan\.x\)/.test(src) && !/className="cmm-card" style=/.test(src) && !/var\(--a\)|var\(--pan-/.test(src))
  check("the pressed flag is kept true for screen readers", /node\.setAttribute\("aria-pressed", String\(k === i\)\)/.test(src) && (html.match(/aria-pressed="true"/g) ?? []).length === 1)
  check("every swapping layer carries its country: 6 pins, 6 flags, 6 pictures and 4 x 6 words", (html.match(/data-i="\d"/g) ?? []).length === SELL_COUNTRIES.length * 7 && (html.match(/data-on="true"/g) ?? []).length === 7, (html.match(/data-i="\d"/g) ?? []).length)
  check("the line restarts without measuring anything", /\.cmm-time\[data-lap="1"\]\{animation-name:cmm-time-b\}/.test(src) && /@keyframes cmm-time-b\{from\{transform:scaleX\(0\)\}to\{transform:scaleX\(1\)\}\}/.test(src) && !/offsetWidth|getComputedStyle|getBoundingClientRect/.test(src))
  check("the picture, the words and the button change on one clock", /\.cmm-photos img\[data-on\]\{opacity:1;z-index:2;transform:none;transition:opacity \.7s \$\{SOFT\},transform 1\.1s \$\{EASE\}\}/.test(src) && /\.cmm-swap span\[data-on\]\{[^}]*\.45s ease-out \.16s,transform \.7s \$\{EASE\} \.16s\}/.test(src) && /\.cmm-buy span\[data-on\]\{[^}]*\.45s ease-out \.16s,transform \.7s \$\{EASE\} \.16s\}/.test(src))
  check("only transform and opacity move", [...src.matchAll(/transition:([^;}]*)/g)].every((m) => m[1].split(",").every((t) => /^\s*(none|opacity|transform)\b/.test(t))))
  check("Buy now and the copy: laid out one under the other, 44px apart (28 to 30 on a phone)", /\.cmm-side\{position:relative;z-index:1;width:max-content;/.test(src) && /\.cmm-copy\{position:relative;z-index:2;margin:44px 0 0 clamp\(28px,3vw,40px\)/.test(src) && /\.cmm-copy\{order:3;margin:30px 22px 0;max-width:none\}/.test(src) && /\.cmm-copy\{margin:28px 18px 0\}/.test(src) && !/\.cmm-copy\{position:absolute/.test(src))
  check("the card grows with what is in it, never under 500px on a wide screen", /\.cmm-card\{[^}]*box-sizing:border-box;padding:30px 0 36px;min-height:500px\}/.test(src) && !/\.cmm-card\{[^}]*[;{]height:500px/.test(src))
  check("on a phone the map's faded sides are two gradients, not a mask over a moving layer", /\.cmm-world::before\{left:0;background:linear-gradient\(90deg,#0f0f12,rgba\(15,15,18,0\)\)\}/.test(src) && !/\.cmm-world\{[^}]*mask-image/.test(src) && /\.cmm-map\{width:\$\{ZOOM \* 100\}%;transform:translate3d\(var\(--cmm-pan-x,0\),var\(--cmm-pan-y,0\),0\);transition:transform 1\.4s \$\{EASE\};will-change:transform\}/.test(src))
  check("no banned words or em dashes in what the section says", !BANNED.test(text(html)))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 8 landing suites", /"tests\/home-landing-r8-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-purple\.test\.ts"/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
