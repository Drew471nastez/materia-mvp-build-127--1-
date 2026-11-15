/**
 * ===========================================================================
 *  HOME, LANDING ROUND 9 (ROWS): THE POSSIBILITIES, THE APPS, THE APP
 * ===========================================================================
 * components/marketing/product-marquee.tsx, home/integrations-section.tsx,
 * home/app-anywhere.tsx (and their module css). What the owner asked:
 *
 *   possibilities  "the texts and icons are too big; reduce them a little";
 *                  "on hover over the images there should be something
 *                  smooth going on around them"; better photos for tote
 *                  bags, online courses, presets, vinyl records, communities
 *                  and templates.
 *   apps           "when I interact with it and scroll, the heading moves
 *                  and stutters and the icons sometimes stutter": no canvas
 *                  redrawn every frame, no flip on a swipe, no dead stop
 *                  under a mouse.
 *   the app        "the section should be white", coming in smooth and
 *                  clean, with a motion graphic: one black stage, a phone
 *                  at the centre of thin rings, chips drifting on the rings
 *                  and lighting up as a notice lands.
 */
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MARQUEE_ROWS, ProductMarquee } from "@/components/marketing/product-marquee"
import { IntegrationsSection, CORNER_DOT_ALPHA, cornerLayer } from "@/components/marketing/home/integrations-section"
import { AppAnywhere, APP_CHIPS, APP_NOTICES, APP_LOOP_S } from "@/components/marketing/home/app-anywhere"

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
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "")
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform your)\b|—/i
const NEVER = /Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|\bfans?\b|Shopify|Liquid/i
/** What a rule's keyframes animate. */
function keyframeProps(css: string): string[] {
  const out = new Set<string>()
  for (const block of css.matchAll(/@keyframes [\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) for (const step of block[1].matchAll(/\{([^{}]*)\}/g)) for (const decl of step[1].split(";")) if (decl.includes(":")) out.add(decl.split(":")[0].trim())
  return [...out]
}
/** A WebP's pixel width (VP8, VP8L or VP8X). */
function webpWidth(file: string): number {
  const b = readFileSync(join(root, "public", file))
  const kind = b.toString("ascii", 12, 16)
  return kind === "VP8 " ? b.readUInt16LE(26) & 0x3fff : kind === "VP8L" ? 1 + (((b[22] << 8) | b[21]) & 0x3fff) : 1 + b.readUIntLE(24, 3)
}

console.log("\n── Unlimited possibilities: a little smaller, a hover, six new photos ──")
{
  const src = read("components/marketing/product-marquee.tsx")
  const html = renderToStaticMarkup(createElement(ProductMarquee))
  check("the photos an eighth smaller (was 60px to 124px)", /\.um-row\{--pic:clamp\(54px,5\.6vw,108px\);/.test(src))
  check("the words too (was 20px to 36px), and the room between items", /\.um-item\{[^}]*gap:clamp\(14px,1\.35vw,25px\);margin-right:clamp\(40px,4\.8vw,92px\);[^}]*font-size:clamp\(18px,1\.75vw,31px\)/.test(src))
  const items = MARQUEE_ROWS.flatMap((r) => r.items)
  check("a photo is a frame that tilts and a face that clips, so rings can open round it", (html.match(/<span class="um-pic"[^>]*><span class="um-face"><img /g) ?? []).length === items.length * 3 && /\.um-face\{[^}]*border-radius:inherit;overflow:hidden/.test(src) && !/\n\.um-pic\{[^}]*overflow:hidden/.test(src))
  const hover = src.slice(src.indexOf("@media(hover:hover) and (pointer:fine){"), src.indexOf(".um[data-um-paused]"))
  check("under a mouse it straightens, lifts and grows a little", /\.um-item:hover \.um-pic\{transform:translate3d\(0,-4px,0\) rotate\(0deg\) scale\(1\.06\)\}/.test(hover))
  check("a diamond turns square with its picture still upright and still covering it", /\.um-item:hover \.um-pic\[data-diamond\] img\{transform:rotate\(0deg\) scale\(1\.42\)\}/.test(hover))
  check("two thin rings open round it, the outer one a beat later", /\.um-pic::before\{inset:-7px;transform:scale\(\.88\)\}/.test(src) && /\.um-pic::after\{inset:-15px;[^}]*transform:scale\(\.84\)\}/.test(src) && /\.um-item:hover \.um-pic::before,\.um-item:hover \.um-pic::after\{opacity:1;transform:scale\(1\)\}/.test(hover) && /\.um-pic::after\{transition-delay:\.07s\}/.test(hover))
  const moved = [...hover.matchAll(/transition:([^;}]+(?:,[^;}]+)*)/g)].flatMap((m) => m[1].replace(/\([^)]*\)/g, "").split(",").map((t) => t.trim().split(" ")[0]))
  check("only transform and opacity are transitioned, and only where there is a mouse", moved.length >= 3 && moved.every((p) => p === "transform" || p === "opacity") && !/transition/.test(src.slice(src.indexOf("const CSS = `"), src.indexOf("@media(hover:hover)"))), moved)
  check("still under reduced motion", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.um-pic,\.um-pic img,\.um-pic::before,\.um-pic::after\{transition:none\}/.test(src))
  check("the row still glides to a stop under the mouse", /easeRow\(track, 0, 700\)/.test(src) && !/\.um-row:hover \.um-track/.test(src))
  /* The six the owner called too basic: their round 7 files, by git blob id. */
  const old: Record<string, string> = { totes: "dabd03ed9c42c08e8d95f50c16a9ab4f0efdaa01", courses: "d2bd9a9a45fcd124d264ba4e9cf8db3f29ee02bb", presets: "a3541dd3e70409632a6b619f20737df16742741b", vinyl: "87b619b9a16b737319f15c4775cff9bdc1474064", communities: "945a2d44e0a50b11ec42682dee0028a76fa17b59", templates: "4f5926c590477b50a994ea95d3a740d52427a72c" }
  const blob = (f: string) => {
    const b = readFileSync(join(root, "public/home/possibilities", `${f}.webp`))
    return createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex")
  }
  check("tote bags, courses, presets, vinyl, communities and templates have new photos", Object.entries(old).every(([f, id]) => blob(f) !== id), Object.keys(old).filter((f) => blob(f) === old[f]))
  check("every photo is 256px (twice the largest it is drawn) and small", items.every((i) => webpWidth(`home/possibilities/${i.photo}.webp`) === 256 && statSync(join(root, "public/home/possibilities", `${i.photo}.webp`)).size < 20_000))
  check("sized and decoded off the main thread", (html.match(/<img src="\/home\/possibilities\/[a-z]+\.webp" alt="" width="256" height="256" decoding="async"/g) ?? []).length === items.length * 3)
}

console.log("\n── Connect your favorite apps: nothing left to stutter ──")
{
  const src = read("components/marketing/home/integrations-section.tsx")
  const code = noComments(src)
  const css = read("components/marketing/home/integrations-section.module.css")
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  check("no canvas, no frame loop for the dots, no layout read anywhere", !/<canvas|getContext|ResizeObserver|getBoundingClientRect|clientWidth|clientHeight|offsetWidth/.test(code))
  const dots = code.slice(code.indexOf("function CornerDots"), code.indexOf("const FLIP"))
  check("the dots are sent by the server: four still SVG layers, two a corner", (html.match(/<svg class="[^"]*" data-corner="[01]" data-layer="[01]"/g) ?? []).length === 4 && !/useEffect|requestAnimationFrame/.test(dots))
  const layers = ([0, 1] as const).flatMap((c) => ([0, 1] as const).map((l) => cornerLayer(c, l)))
  check("each layer has its dots, none darker than 16% grey", layers.every((l) => l.length > 0 && l.every((p) => p.alpha > 0 && p.alpha <= CORNER_DOT_ALPHA && (p.d.match(/M/g) ?? []).length >= 1)) && layers.every((l) => l.reduce((n, p) => n + (p.d.match(/M/g) ?? []).length, 0) === 44))
  check("a layer's dots are all inside its own quarter", cornerLayer(0, 0).every((p) => [...p.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].every((m) => +m[1] < 0 && +m[2] > 0)) && cornerLayer(1, 1).every((p) => [...p.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].every((m) => +m[1] > 0 && +m[2] < 0)))
  check("the same on the server and in the browser (no hydration mismatch)", JSON.stringify(cornerLayer(0, 1)) === JSON.stringify(cornerLayer(0, 1)))
  check("the dots keep their size when a layer grows", (html.match(/vector-effect="non-scaling-stroke"/g) ?? []).length >= 8 && /stroke-linecap="round"/.test(html))
  check("they move by CSS on the compositor, the second layer half a lap behind", /\.cloud \{[^}]*animation: breathe 28s linear infinite;/.test(css) && /\.cloud\[data-layer="1"\] \{\s*animation-name: breatheBack;\s*animation-delay: -14s;/.test(css) && /\$\{s\.cloud\} \$\{m\.loop\}/.test(src))
  check("every keyframe animates transform and opacity only", keyframeProps(noComments(css)).every((p) => p === "transform" || p === "opacity"), keyframeProps(noComments(css)))
  check("a finger turns an icon with a tap, never with the touch that starts a swipe", /rows\.addEventListener\("click", tap, \{ passive: true \}\)/.test(code) && /const tap = \(e: MouseEvent\) => \{\s*if \(touch\) flip\(/.test(code) && !/const down = \(e: PointerEvent\) => \{\s*if \(!fine\(e\)\) flip/.test(code))
  check("a mouse still turns it by reaching it", /const over = \(e: PointerEvent\) => \{\s*if \(fine\(e\)\) flip\(/.test(code))
  check("no dead stop under a mouse: the row glides to a stop and back", !/:hover \.track/.test(noComments(css)) && !/animation-play-state/.test(noComments(css)) && /easeRow\(track, 0, 600\)/.test(code) && /easeRow\(track, 1, 900\)/.test(code) && /updatePlaybackRate/.test(code) && (html.match(/data-row-track=""/g) ?? []).length === 2)
  check("no scroll or move listener", !/addEventListener\(\s*"(scroll|pointermove|mousemove|touchmove|wheel)"/.test(code))
  check("the heading and the two rows are as they were", /aria-label="Connect your favorite apps"/.test(html) && /--tile: clamp\(90px, 5\.6vw, 116px\);/.test(css))
}

console.log("\n── Run your business from anywhere: white, one black stage ──")
{
  const src = read("components/marketing/home/app-anywhere.tsx")
  const code = noComments(src)
  const css = read("components/marketing/home/app-anywhere.module.css")
  const bare = noComments(css)
  const html = renderToStaticMarkup(createElement(AppAnywhere))
  check("white by its own class, so it reads the same on any sheet", /\.section \{\s*background: #fff;\s*color: #18181b;/.test(css) && /className=\{`\$\{m\.root\} \$\{s\.section\} /.test(src))
  check("the heading in its light form, the same line under it", /aria-label="Run your business from anywhere"/.test(html) && !/data-story-dark/.test(html) && text(html).includes("Your sales, orders and visitors on your phone, wherever you are."))
  check("in the shared width, the heading at the inset", /<div class="home-wrap">/.test(html) && /\.head \{\s*padding-left: var\(--home-head-inset, 14px\);/.test(css))
  check("one black stage, named for assistive tech, its insides hidden from it", (html.match(/data-app-stage=""/g) ?? []).length === 1 && /role="img" aria-label="The Storelib app on a phone: [^"]+"/.test(html) && /\.card \{[^}]*background: #09090b/.test(css))
  const card = bare.slice(bare.indexOf(".card {"), bare.indexOf("}", bare.indexOf(".card {")))
  check("the stage itself never fades or moves in (no blank box on a fast scroll)", !/opacity|transform|animation|transition/.test(card) && /<div className=\{s\.card\} data-app-stage=""/.test(src))
  check("only what is in it eases in, once", (html.match(/<div class="[^"]*reveal[^"]*"/g) ?? []).length === 3)
  check("its height is fixed by the screen's width alone, so nothing shifts as it loads", /--h: clamp\(440px, 38vw, 620px\);/.test(css) && /@media \(max-width: 899px\) \{\s*\.card \{\s*--h: 580px;/.test(css) && /height: var\(--h\);/.test(card))
  check("five thin rings round the phone, two with a brighter arc going round", (html.match(/data-ring="[0-4]"/g) ?? []).length === 7 && /border: 1px solid rgba\(255, 255, 255, 0\.085\)/.test(css) && /animation: turn 26s linear infinite;/.test(css))
  check("Orders, Sales, Payouts and Visitors on the rings", APP_CHIPS.map((c) => c.label).join() === "Orders,Sales,Payouts,Visitors" && APP_CHIPS.every((c) => text(html).includes(c.label)))
  check("a chip drifts along its ring and stays level: the arm sways, the chip turns back by the same", /@keyframes sway \{\s*from \{\s*transform: rotate\(calc\(var\(--a\) - var\(--sw\)\)\);\s*\}\s*to \{\s*transform: rotate\(calc\(var\(--a\) \+ var\(--sw\)\)\);/.test(css) && /@keyframes unsway \{\s*from \{\s*transform: rotate\(calc\(var\(--sw\) - var\(--a\)\)\);\s*\}\s*to \{\s*transform: rotate\(calc\(-1 \* var\(--a\) - var\(--sw\)\)\);/.test(css))
  check("beside the phone on a wide stage, above and below it on a narrow one", /\.arm\[data-slot="b"\] \{\s*--a: 194deg;/.test(css) && /@media \(max-width: 899px\) \{[\s\S]*\.arm\[data-slot="a"\] \{\s*--a: -66deg;[\s\S]*\.arm\[data-slot="d"\] \{\s*--a: 114deg;/.test(css))
  check("three notices a loop, five seconds apart", APP_NOTICES.length === 3 && APP_LOOP_S === 15 && (html.match(/data-notice="[0-2]"/g) ?? []).length === 3 && /animation-delay:0\.6s/.test(html) && /animation-delay:5\.6s/.test(html) && /animation-delay:10\.6s/.test(html))
  check("each chip lights with the notice it is about, Sales a beat after Orders", /animation-delay:0\.85s/.test(html) && /animation-delay:1\.15s/.test(html) && /animation-delay:5\.85s/.test(html) && /animation-delay:10\.85s/.test(html) && APP_CHIPS.every((c) => c.on < APP_NOTICES.length))
  check("the order is the shared tee, the list has the shared LUT pack", APP_NOTICES[0].line === "Midnight Studio Tee, $32.00" && text(html).includes("Cine Tones LUT Pack") && text(html).includes("$29.00"))
  check("every keyframe animates transform and opacity only", keyframeProps(bare).length > 0 && keyframeProps(bare).every((p) => p === "transform" || p === "opacity"), keyframeProps(bare))
  const animated = [...bare.matchAll(/([^{}]+)\{[^{}]*\banimation: /g)].map((m) => m[1].trim().split(/\s|,|\[/)[0].replace(/^\./, ""))
  check("every loop is paused off screen and in a background tab (platform's .loop)", animated.length >= 7 && animated.every((c) => new RegExp(`\\$\\{s\\.${c}\\} \\$\\{m\\.loop\\}`).test(src)), animated)
  check("no script drives it: no frame loop, no timer, no state, no layout read", !/requestAnimationFrame|setInterval|setTimeout|useState|useEffect|getBoundingClientRect/.test(code))
  check("reduced motion stands still on the order, its chip lit", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.notice\[data-notice="0"\] \{\s*opacity: 1;\s*transform: none;[\s\S]*\.lit\[data-first\] \{\s*opacity: 1;/.test(css))
  /* Changed on purpose (wave 17): loaded with the section and decoded as drawn, not lazy and async: on an iPhone flick the phone came in without them. */
  check("its pictures are 96px thumbnails, sized, loaded with the section", ["order-tee", "order-lut"].every((f) => webpWidth(`home/app/${f}.webp`) === 96) && (html.match(/<img[^>]*>/g) ?? []).every((t) => /width="96" height="96"/.test(t) && !/loading="lazy"/.test(t) && !/decoding="async"/.test(t)))
  check("no shadow, filter or blur is animated or laid over the stage", !/backdrop-filter|filter:/.test(bare))
  check("the three points and both badges kept, the Coming soon label edged for white", ["A ping for every sale", "Orders, products and numbers", "Your community, in your pocket", "App Store", "Google Play", "Coming soon"].every((w) => text(html).includes(w)) && /\.soon \{\s*box-shadow: 0 0 0 1px rgba\(24, 24, 27, 0\.14\);/.test(css))
}

console.log("\n── Copy and registration ──")
{
  const files = ["components/marketing/product-marquee.tsx", "components/marketing/home/integrations-section.tsx", "components/marketing/home/app-anywhere.tsx"]
  const words = [text(renderToStaticMarkup(createElement(ProductMarquee))), text(renderToStaticMarkup(createElement(IntegrationsSection))), text(renderToStaticMarkup(createElement(AppAnywhere)))].join(" ")
  check("no banned words or em dashes in what is drawn or written", !BANNED.test(words) && files.every((f) => !BANNED.test(read(f))))
  check("none of the names that must never be on the page", !NEVER.test(words))
  check("registered after the round 8 suites", /"tests\/home-landing-r8-frame\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-rows\.test\.ts",/.test(read("scripts/run-push-tests.mjs")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
