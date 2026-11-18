/**
 * ===========================================================================
 *  HOME, WAVE 13: SECTION 3 REBUILT AS THE OWNER'S 2 x 2 GRID
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx (+ everything-globe.tsx)
 *
 * The owner: lay it out like the reference (a wide card and a narrower one,
 * then a narrower one and a wide one), exactly four cards, each a big
 * picture with a caption written "Bold lead. Grey continuation."; a new
 * two-tone heading, no subheading; product slides whose light changes with
 * each slide; keep the globe and make it interactive; realistic numbers;
 * nothing moving off screen.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_CARDS, EVERYTHING_HEADING, EVERYTHING_SLIDES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import { EVERYTHING_GLOBE_ORDERS } from "@/components/marketing/home/everything-globe"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"

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
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const src = read("components/marketing/home/everything-in-one-place.tsx")
const globe = read("components/marketing/home/everything-globe.tsx")
/* Changed on purpose (wave 13 perf): the globe's turning and drawing moved to an engine (everything-globe-draw.ts) that a worker runs off the page's thread. */
const engine = read("components/marketing/home/everything-globe-draw.ts")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""

console.log("\n── layout and words ──")
/* Changed on purpose (landing round 4): the owner found "Make the work. Skip the busywork." too broad and vague; the same two tones, a specific line. */
/* Changed on purpose (landing round 5): the owner's new heading. */
check("the heading is new, two-tone, and not the old Everything in one place", /<h2 id="everything-in-one-place-title" class="ev-h">Sell what you make\. <span class="ev-h-mute">Get paid worldwide\.<\/span><\/h2>/.test(html) && !/Everything in one place/.test(text(html)) && EVERYTHING_HEADING.lead.endsWith(".") && EVERYTHING_HEADING.rest.endsWith("."))
check("the grey half of the heading is grey, the lead is dark", /\.ev-h\{[^}]*color:#18181b/.test(css) && /\.ev-h-mute\{color:#8e8c96\}/.test(css))
check("no subheading and no eyebrow pill above the heading", !/<h2[\s\S]*?<\/h2>\s*<p/.test(html) && !/eyebrow|rounded-full[^"]*uppercase/.test(html))
check("exactly four cards", (html.match(/<article /g) ?? []).length === 4 && EVERYTHING_CARDS.length === 4)
check("wide, narrow, then narrow, wide", EVERYTHING_CARDS.map((c) => (c.wide ? "W" : "N")).join("") === "WNNW" && /\.ev-wide\{grid-column:span 13\}/.test(css) && /\.ev-narrow\{grid-column:span 11\}/.test(css))
check("each caption is a bold lead sentence and a grey continuation", (html.match(/<p class="ev-cap"><b class="ev-cap-lead">[^<]+\.<\/b> [^<]+\.<\/p>/g) ?? []).length === 4 && /\.ev-cap\{[^}]*color:#7c7a84/.test(css) && /\.ev-cap-lead\{[^}]*color:#18181b/.test(css))
check("no check-mark icons, no em dash, no lorem", !/✓|✔|☑|—|lorem/i.test(text(html)) && !/lucide|Check\b/.test(src))
check("one column on a phone, the grid from 768px", /\.ev-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/.test(css) && /@media\(min-width:768px\)\{\s*\.ev-grid\{grid-template-columns:repeat\(24,minmax\(0,1fr\)\)/.test(css))

console.log("\n── card 1: product slides ──")
check("four product slides, each with its own light behind it", EVERYTHING_SLIDES.length === 4 && EVERYTHING_SLIDES.every((_, i) => new RegExp(`\\.ev-p-bg${i}\\{background:`).test(css)) && (html.match(/class="ev-p-bg ev-p-bg\d"/g) ?? []).length === 4)
check("the light cross-fades by opacity", /\.ev-p-bg\{[^}]*opacity:0;transition:opacity/.test(css) && /\.ev-p-bg\[data-on\]\{opacity:1\}/.test(css))
check("tabs are real buttons that say which is on", (html.match(/<button type="button" aria-pressed="(true|false)" class="ev-tab"/g) ?? []).length === 4 && /onClick=\{\(\) => setActive\(i\)\}/.test(src))
check("it plays by itself on the active tab's bar (paused off screen and under the mouse)", /onAnimationEnd=\{i === active \? next : undefined\}/.test(src) && /\.ev-tab\[data-on\] \.ev-tab-fill\{opacity:1;animation:ev-fill/.test(css) && /\.ev-p:hover \.ev-tab-fill\{animation-play-state:paused\}/.test(css) && /class="ev-tab-fill ev-loop"/.test(html))
check("products slide in from one side and out the other", /data-pos=\{pos === 0 \? "on" : pos === n - 1 \? "prev" : "next"\}/.test(src) && /\.ev-p-img\[data-pos="prev"\]/.test(css))
for (const s of EVERYTHING_SLIDES) {
  const num = (v: string) => Number(v.replace(/[^0-9.]/g, ""))
  const [price, count, revenue] = s.stats.map(([, v]) => num(v))
  check(`${s.tab}: ${s.stats[1][1]} x ${s.stats[0][1]} = ${s.stats[2][1]}`, Math.abs(price * count - revenue) < 0.005)
  check(`${s.tab}: its picture exists and is small`, existsSync(join(root, "public", s.img)) && statSync(join(root, "public", s.img)).size < 120 * 1024)
}
check("communities, never memberships", EVERYTHING_SLIDES.some((s) => s.tab === "Community") && !/Membership/i.test(text(html)))

console.log("\n── card 3: the globe ──")
check("the globe is in the section, on a canvas", /class="ev-vis ev-g"/.test(html) && /<canvas class="ev-globe-canvas"/.test(html))
check("it can be dragged (with momentum) and leans toward the mouse; up and down swipes still scroll", /addEventListener\("pointerdown"/.test(globe) && /setPointerCapture/.test(globe) && /st\.vyaw \+= \(\(st\.reduced \? 0 : AUTO_SPIN\) - st\.vyaw\)/.test(engine) && /targetLeanX/.test(engine) && /driver\.lean\(/.test(globe) && /touch-action:pan-y/.test(css))
check("it draws only while the section is live, the tab visible and the globe in view", /driver\.run\(st\.visible && st\.shown && st\.live && !st\.reduced\)/.test(globe) && /visibilitychange/.test(globe) && /new IntersectionObserver/.test(globe) && /st\.running = \(st\.want && !st\.reduced\) \|\| interacting/.test(engine) && /host\.caf\(st\.frame\)/.test(engine))
check("it is drawn off the page's thread where the browser can hand a worker the canvas", /transferControlToOffscreen\(\)/.test(globe) && /new Worker\(url\)/.test(globe) && /EVERYTHING_GLOBE_WORKER_SOURCE/.test(globe) && /createGlobeEngine/.test(read("components/marketing/home/everything-globe-worker.ts")))
{
  const build = await import(pathToFileURL(join(root, "scripts/build-globe-worker.mjs")).href)
  check("the worker's string is up to date (node scripts/build-globe-worker.mjs)", read("components/marketing/home/everything-globe-worker-source.ts") === build.everythingGlobeWorkerModule(await build.everythingGlobeWorkerSource()))
}
check("its size comes from the ResizeObserver's entry, never measured as it mounts", /entry\.contentRect\.width/.test(globe) && !/box\.getBoundingClientRect\(\)[\s\S]{0,80}\bfit\(\)/.test(globe))
/* Changed on purpose (landing round 5): the cap is 2x, or 1.5x on a low end phone (globeDprCap). */
check("device pixels capped, the sphere painted once per size", /Math\.min\(globeDprCap\(\), window\.devicePixelRatio/.test(globe) && /const paintStatic = \(\) =>/.test(engine))
/* Changed on purpose (land-globe): the pill is placed every frame the city moves (no 100ms glide that trailed the city), so it sits exactly on it. */
/* Changed on purpose (landing round 4): the pill is told where the city is and where it will be a moment later a few times a second, and glides there in one compositor animation (a style change every frame made dragging lag); still transform only. */
/* Changed on purpose (landing round 5): the owner saw the pill flash and jump as it chased the city; it stands in one place and only fades and lifts in and out. */
/* Changed on purpose (landing round 6): the owner wants the notification where the shot landed; it is placed once per landing by a transform on its pin and carried by one compositor animation, never re-aimed per frame (tests/home-landing-r6-globe). */
check("the order pill sits where the shot landed, placed once by transform, and comes and goes by opacity", !/style\.(left|top) =/.test(globe) && /pin\.style\.transform = /.test(globe) && !/data-glide/.test(css) && /host\.onPill\(\{ i, on: true, x0: /.test(engine))
check("the globe survives a second mount (a canvas handed to a worker is swapped for a fresh one)", /handedOver\.has\(canvas\)/.test(globe) && /canvas\.replaceWith\(fresh\)/.test(globe))
check("its motion runs on the display's frames by real elapsed time, on a clock that stops while paused", /const dt = Math\.max\(0, Math\.min\(50, t - st\.last\)\)/.test(engine) && /st\.clock \+= dt/.test(engine))
const symbols: Record<string, string> = { "€": "EUR", "£": "GBP", "CA$": "CAD", "A$": "AUD", "¥": "JPY", RON: "RON", $: "USD" }
const currencyOf = (price: string) => Object.entries(symbols).find(([sym]) => price.includes(sym))?.[1]
check("every order is in a currency checkout charges in", EVERYTHING_GLOBE_ORDERS.every((o) => { const c = currencyOf(o.price); return !!c && c in CURRENCY_FEE_RULES }), EVERYTHING_GLOBE_ORDERS.map((o) => o.price))
check("every order's flag exists", EVERYTHING_GLOBE_ORDERS.every((o) => existsSync(join(root, "public/flags", `${o.cc}.svg`))))

console.log("\n── card 2 and 4 ──")
/* Changed on purpose (landing round): the owner asked for a continuous carousel, like the creators rail; the stores drift without a stop, the set twice over moved by half its width in one linear loop. */
/* Changed on purpose (landing round 4): the strip can be dragged, so its drift is a Web Animation from script (one set's width a loop) that a hand can take over; tests/home-landing-topa4. */
/* Changed on purpose (landing round 6): the strip is EVERYTHING_STORES (merch stores and link pages), twice over. */
/* Changed on purpose (landing round 7): the lap is read from the boxes, so a fractional card width leaves no tick at the wrap. */
/* Changed on purpose (landing round 8): each page wraps round on its own over one turn of all of them, read from the laid out slots (tests/home-landing-r8-everything). */
// Changed on purpose (landing round 14): the set once; since round 8 each page wraps round on its own (tests/home-landing-r14-everything.test.ts).
check("the storefronts drift past without a stop, each page wrapping round on its own", /const strip = EVERYTHING_STORES\n/.test(src) && /turn = pitch \* n/.test(src) && /iterations: Infinity, easing: "linear"/.test(src))
/* Changed on purpose (landing round 2): the support card is the Support page as it reads, its two inboxes (From buyers, Storelib) and threads with no avatars, so the Storelib logo avatar went with them. */
/* Changed on purpose (landing round 4): the owner wants the support card of before without the From buyers / Storelib switch; the two kinds of request are told by their titles. */
/* Changed on purpose (landing round 5): the "Storelib support" and "From a buyer" labels are gone (the owner); the thread's subject heads it. */
check("support: a person at Storelib answers the creator, the store answers a buyer", !/Storelib support/.test(html) && !/From a buyer/.test(html) && /Moving my subscribers over/.test(html) && !/<span>From buyers<\/span>/.test(html))
const pics = [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1])
check("every picture is local and exists", pics.length > 20 && pics.every((u) => u.startsWith("/") && existsSync(join(root, "public", u))), pics.filter((u) => !existsSync(join(root, "public", u))))
/* Changed on purpose (wave 13 integration): the logo goes through next/image (StorelibLogo), whose test stub leaves out `loading`; it is lazy in production. */
/* Changed on purpose (landing round 8): the store strip's pictures load with the section (eager), so a page coming round the loop never shows before its photos; every other picture stays lazy. */
check("every picture is lazy and sized", [...html.matchAll(/<img [^>]*>/g)].filter((m) => !/data-storelib-logo/.test(m[0])).every((m) => (/loading="lazy"/.test(m[0]) || /\/home\/everything\/stores\/|\/home\/showcase\/a-satori/.test(m[0])) && /loading="(lazy|eager)"/.test(m[0]) && /width="\d+"/.test(m[0]) && /height="\d+"/.test(m[0]))) // Changed on purpose (landing round 14): Satori Studio's picture is in the strip too, eager like the stores' (the strip never waits for a picture).

console.log("\n── motion and loading ──")
check("the stylesheet is a React stylesheet, listed for idle preloading", /<style href="w13-everything" precedence="w13-home">/.test(src) && /styles: \(\) => import\("\.\/everything-in-one-place"\)\.then\(\(m\) => m\.EVERYTHING_STYLES\)/.test(read("components/marketing/home/lazy-sections.tsx")))
/* Changed on purpose (wave 13 perf): the heights were measured again at 390 to 1920 wide with the home page's one section padding (--home-pad). */
/* Changed on purpose (landing round): the formula is the fallback of var(--lz), which LAZY_SECTION_HEIGHTS_CSS sets to the measured height per width. */
check("its box holds the section's height: one column below 768px, the grid above", /name: "everything",[\s\S]*?minHeight: "var\(--lz, max\(calc\(clamp\(1852px, 172vw \+ 1376px, 2167px\) - clamp\(0px, \(100vw - 767px\) \* 100000, 100000px\)\), calc\(2 \* clamp\(320px, 32vw, 440px\) \+ 2 \* clamp\(48px, 5\.6vw, 80px\) \+ clamp\(340px, 6\.8vw \+ 280px, 380px\)\)\)\)"/.test(read("components/marketing/home/lazy-sections.tsx")))
check("every loop pauses while the section is not live", /\.ev\[data-platform-live="false"\] \.ev-loop/.test(css) && /usePlatformSection\(ref\)/.test(src))
/* Added on purpose (wave 13 perf): the active tab's progress bar is an animation of its own whose rule outranked the pause, so it kept the page restyling 60 times a second from anywhere on the page. */
check("the active tab's progress bar pauses with the rest", /\.ev\[data-platform-live="false"\] \.ev-tab\[data-on\] \.ev-tab-fill,\.ev:not\(\[data-platform-live\]\) \.ev-tab\[data-on\] \.ev-tab-fill\{animation-play-state:paused\}/.test(css))
check("nothing at rest has a 3D transform (each would be a compositor layer of its own)", !/\.ev-(p-card|p-img|p-rise|tabs|card|globe-pill-in)\{[^}]*translate3d/.test(css))
check("transitions move only transform and opacity", [...css.matchAll(/transition:([^;}]+)/g)].every((m) => m[1].split(/,(?![^(]*\))/).every((t) => /^\s*(opacity|transform|color|none)\b/.test(t))), [...css.matchAll(/transition:([^;}]+)/g)].map((m) => m[1]))
check("reduced motion: nothing loops, the reveal is instant", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-loop,[^{]*\{animation:none !important\}/.test(css) && /if \(st\.reduced\) \{\s*setRot\(\)\s*draw\(\)/.test(engine))
check("no :has(), no selector ending in *, no bare tag keyed on a data attribute", !/:has\(/.test(css) && !/\*\s*\{/.test(css) && !/(^|[\s,}])\[data-[^\]]+\]\s+[a-z]+[\s{,]/m.test(css))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
