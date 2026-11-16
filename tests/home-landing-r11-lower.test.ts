/**
 * HOME, LANDING ROUND 11, THE LOWER TRACK.
 *
 * The owner, after round 10:
 *   1. "'Run your business from anywhere' should be how it was before, the
 *      image and things": round 8's section (031e4c6f8^) again, his
 *      photograph and the points and badges beside it, kept on the white
 *      sheet, in the page's one width, coming in smoothly (the photograph
 *      fades in once decoded, over a still box of its own shape).
 *   2. "Your AI tools work here too": the pattern "more visible and clean";
 *      "around the terminal a smooth, buttery effect like a laser glow
 *      moving around the corners, dispersing"; "the height is too short
 *      now, make it a little more natural".
 *   3. How it works: "I like the structure, but I don't like the visual
 *      representations: change the imagery to something else, smoother,
 *      cleaner, that works." Same row and captions, new pictures.
 *   4. The closing call: the dots "more smooth and clean and more visible
 *      at the bottom as well", and the section "a little" shorter.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AppAnywhere } from "@/components/marketing/home/app-anywhere"
import { AiToolsSection, AI_TOOLS_STYLES, AI_TOOLS_SCRIPT } from "@/components/marketing/home/ai-tools-section"
import { HowItWorks, HOW_IT_WORKS_STYLES } from "@/components/marketing/home/how-it-works"
import { DOT_FIELD_CSS, DOT_FIELD_MAX_DPR, DOT_FIELD_TONES } from "@/components/marketing/home/dot-field"
import { FinalCta } from "@/components/marketing/home/final-cta"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const DIR = "components/marketing/home"
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const kfBodies = (c: string) => [...c.matchAll(/@keyframes ([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)].map((m) => [m[1], m[2]] as const)
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].every((x) => x[1] === "transform" || x[1] === "opacity")
const BANNED = /—|\bunlock|\belevate|seamless|powerful|effortless|supercharge|\btransform(s|ing|ed)?\b(?!:)/i
const NEVER = /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Maren Holt|enthusiasts|Studio Marlow|Kai Moreno|ceramics|Weeknight Pasta|sourdough|Golden Hour|\bfans\b|Shopify|Liquid/i

console.log("\n1. Run your business from anywhere: the photograph again, on white")
{
  const src = read(`${DIR}/app-anywhere.tsx`)
  const code = bare(src)
  const css = read(`${DIR}/app-anywhere.module.css`)
  const html = renderToStaticMarkup(createElement(AppAnywhere))
  const old = "031e4c6f8^"
  check("round 8's parts: the photograph, the heading, the line, three points, two badges", /<img[^>]*src="\/home\/app\/storelib-app-720\.webp"/.test(html) && /srcSet="\/home\/app\/storelib-app-720\.webp 720w, \/home\/app\/storelib-app-1280\.webp 1280w"/.test(src) && ["A ping for every sale", "Orders, products and numbers", "Your community, in your pocket", "App Store", "Google Play", "Coming soon"].every((t) => words(html).includes(t)) && old.length > 0)
  check("both photo files are there", existsSync("public/home/app/storelib-app-720.webp") && existsSync("public/home/app/storelib-app-1280.webp"))
  check("on the white sheet: white by its own class, the heading in its light form", /\.section \{\s*background: #fff;\s*color: #18181b;/.test(css) && !/data-story-dark/.test(html) && /accent=\{\["anywhere"\]\} \/>/.test(src))
  check("in the page's one width: the photograph's edge on the showcase cards' edge, the words at the inset on a phone", /className=\{`home-wrap \$\{s\.grid\}`\}/.test(src) && /\.copy \{[^}]*padding-left: var\(--home-head-inset, 0px\);/.test(css))
  check("round 8's columns on a computer (the photograph first, wider), the words first on a phone", /@media \(min-width: 1024px\) \{\s*\.grid \{\s*grid-template-columns: minmax\(0, 1\.12fr\) minmax\(0, 0\.88fr\);/.test(css) && /\.copy \{\s*min-width: 0;\s*order: -1;/.test(css))
  check("the photograph's box is there before the file: its own 4:3, a still grey, so nothing shifts", /\.photo \{[^}]*aspect-ratio: 4 \/ 3;[^}]*background: #e9ecf1;/.test(css) && /width=\{1280\}\s*height=\{960\}/.test(src))
  check("the picture fades in once decoded, never half drawn (opacity only, data-ready)", /\.img \{[^}]*opacity: 0;\s*transition: opacity 650ms/.test(css) && /\.photo\[data-ready\] \.img \{\s*opacity: 1;/.test(css) && /img\.decode\(\)\.then\(ready, ready\)/.test(code) && /img\.complete && img\.naturalWidth/.test(code))
  check("without script the picture shows anyway", /@media \(scripting: none\) \{\s*\.img \{\s*opacity: 1;/.test(css))
  check("the photograph and the points rise in once (platform's reveal, transform and opacity), staggered", (html.match(/class="[^"]*reveal[^"]*"/g) ?? []).length === 5 && /usePlatformSection\(ref\)/.test(code))
  check("lazy and decoded off the main thread", /loading="lazy"\s*decoding="async"/.test(src))
  check("no stage, no loops, no keyframes", !/data-app-stage|@keyframes/.test(html + css) && !/m\.loop/.test(code))
  check("reduced motion: no fade on the picture or the badges", /@media \(prefers-reduced-motion: reduce\) \{\s*\.badge,\s*\.img \{\s*transition: none;/.test(css))
}

console.log("\n2. Your AI tools: the dots, the light round the terminal, the height")
{
  const src = read(`${DIR}/ai-tools-section.tsx`)
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const html = renderToStaticMarkup(createElement(AiToolsSection))
  const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
  check("the card carries a fine grid of round dots behind the copy, still (no canvas, no frame loop)", /<div class="ait-card"><span class="ait-dots" aria-hidden="true"><\/span>/.test(html) && /background-image:radial-gradient\(circle,rgba\(255,255,255,\.085\) 0,rgba\(255,255,255,\.085\) 1px,transparent 1\.35px\);background-size:20px 20px/.test(rule(".ait-dots")) /* Changed on purpose (landing round 12): a third as strong */ && !/DotField|<canvas|requestAnimationFrame/.test(src) && /\.ait-card\{position:relative;isolation:isolate;/.test(css) && /\.ait-copy\{position:relative;z-index:1;/.test(css))
  check("the grid is clear on the copy's side and gone before the terminal and the edges", /mask-image:radial-gradient\(70% 95% at 22% 50%/.test(rule(".ait-dots")) && /@media \(max-width:1023px\)\{\.ait-dots\{-webkit-mask-image:radial-gradient\(110% 55% at 50% 22%/.test(css))
  check("two rims under the terminal: a 1.5px beam and a soft glow", /<div class="ait-tw"><span class="ait-glow" aria-hidden="true"><i class="ait-spin"><\/i><\/span><span class="ait-beam" aria-hidden="true"><i class="ait-spin"><\/i><\/span><div class="ait-term"/.test(html) && /inset:-1\.5px/.test(rule(".ait-beam")) && /inset:-14px/.test(rule(".ait-glow")))
  check("the terminal sits over them, opaque, so only the rim lights", /position:relative;z-index:1/.test(rule(".ait-term")) && /--term-bg:#09080c/.test(rule(".ait-term")))
  check("each light is the bright end of a conic gradient, two of them, opposite", /conic-gradient\(from 0deg,[^;]*rgba\(220,210,255,\.42\) 170deg,rgba\(220,210,255,0\) 180deg,[^;]*rgba\(220,210,255,\.42\) 350deg,rgba\(220,210,255,0\) 360deg\)/.test(rule(".ait-spin"))) // Changed on purpose (landing round 12): a soft lilac head that fades out, not a white one.
  check("only one thing moves: the layer turns (a transform), linear", /@keyframes ait-spin\{from\{transform:rotate\(0deg\)\}to\{transform:rotate\(360deg\)\}\}/.test(css) && /animation:ait-spin \d+s linear infinite paused/.test(rule(".ait-spin")) /* Changed on purpose (landing round 12): 26s a lap now, pinned in tests/home-landing-r12-close.test.ts */ && /will-change:transform/.test(rule(".ait-spin")))
  check("the glow spreads off the edge by a still mask, no blur (a blurred rim dropped 42 frames of 248 at 1440x800), the rims clip and are contained", /inset:-14px/.test(rule(".ait-glow")) && /mask-image:linear-gradient\(90deg,transparent,#000 14px/.test(rule(".ait-glow")) && /mask-composite:intersect/.test(rule(".ait-glow")) && !/filter/.test(css) && /overflow:hidden;contain:strict/.test(rule(".ait-beam,.ait-glow")))
  check("it turns only while the terminal is on screen and the tab visible", /\.ait-tw\[data-live\] \.ait-spin\{animation-play-state:running\}/.test(css) && /el\.parentElement\?\.toggleAttribute\("data-live", live\)/.test(src) && /visibilitychange/.test(src))
  check("reduced motion: the light stands still", /\.ait-spin\{animation:none!important;transform:rotate\(38deg\)\}/.test(css))
  const at = css.indexOf("@media (min-width:1024px) and (max-height:900px){")
  const laptop = css.slice(at, css.indexOf("\n}\n", at))
  check("a short laptop keeps all 18 lines at line height 1.7 and pads a little more (about 590px at 1440x800, was about 500)", AI_TOOLS_SCRIPT.length === 18 && /\.ait-card\{padding:clamp\(40px,7svh,64px\) clamp\(40px,4\.4vw,64px\)\}/.test(laptop) && /\.ait-body\{padding:16px 18px 18px;line-height:1\.7\}/.test(laptop) && !/ait-nophone/.test(laptop))
  check("every keyframe moves transform and opacity only", kfBodies(css).every(([, b]) => onlyCompositor(b)))
}

console.log("\n3. How it works: new pictures in the same row")
{
  const src = read(`${DIR}/how-it-works.tsx`)
  const code = bare(src)
  const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(HowItWorks))
  const text = words(html)
  const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
  // Changed on purpose (landing round 12): the owner replaced these pictures again (the real dashboard, a tip flow, a typed domain over a store); tests/home-landing-r12-how.test.ts pins them. What stays from round 11 is how they move.
  check("every keyframe moves transform and opacity only", kfBodies(css).length >= 10 && kfBodies(css).every(([, b]) => onlyCompositor(b)))
  check("every loop is paused off screen and in a hidden tab; reduced motion shows the finished frame", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}\s*\.cmh-o\{animation:none!important\}/.test(css))
  check("the pictures take no pointer and hold nothing to press", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/pointer-events:auto/.test(css) && !/<(a|button|input|select)\b/.test(html) && !/addEventListener\("click"/.test(code))
  check("no blur, no glass, no violet gradient", !/blur\(|backdrop-filter|filter:/.test(css) && !/gradient\([^)]*#(7c3aed|8b5cf6|a855f7)/.test(css))
}

console.log("\n4. The closing call: the dots and the height")
{
  const cta = read(`${DIR}/final-cta.tsx`)
  const dots = read(`${DIR}/dot-field.tsx`)
  renderToStaticMarkup(createElement(FinalCta))
  check("more visible: the dark tone rests at 0.34 and lights to 0.68 (was 0.19 and 0.46), the purple its own (the purple track, same round)", DOT_FIELD_TONES.dark.rest === 0.34 && DOT_FIELD_TONES.dark.lit === 0.68 && DOT_FIELD_TONES.dark.ride === 0 && /const TROUGH = \{ dark: 0\.45, purple: 0\.3 \}/.test(dots))
  check("clean: a dot stands on its point (no sub-pixel drift), drawn at up to 2 device pixels", DOT_FIELD_MAX_DPR === 2 && DOT_FIELD_TONES.dark.ride === 0 && /\(flow - 0\.5\) \* 0\.8 \* colour\.ride/.test(dots)) // Lead (landing round 11): the purple track keeps a half ride on purple, so the closing call stands still by ride 0, not by dropping the ride
  check("visible to the bottom: only the last 56px fade, the sides still soft", /\.dotf\[data-fade="close"\]\{-webkit-mask-image:linear-gradient\(#000 calc\(100% - 56px\),transparent\),radial-gradient\(120% 135% at 50% 42%,#000 42%,transparent 82%\);-webkit-mask-composite:source-in;[^}]*mask-composite:intersect\}/.test(DOT_FIELD_CSS))
  check("a little shorter: about 15% less padding above and below", /padding:clamp\(76px,8\.4vw,128px\) var\(--home-edge,clamp\(20px,5\.15vw,84px\)\) clamp\(68px,7\.6vw,116px\)/.test(cta))
  check("still paused off screen and in a hidden tab, no CSS animation in the field", /IntersectionObserver/.test(dots) && /visibilitychange/.test(dots) && !/@keyframes/.test(DOT_FIELD_CSS))
}

console.log("\nCopy and registration")
{
  const files = ["app-anywhere.tsx", "ai-tools-section.tsx", "how-it-works.tsx", "final-cta.tsx", "dot-field.tsx"].map((f) => `${DIR}/${f}`)
  const drawn = [AppAnywhere, AiToolsSection, HowItWorks, FinalCta].map((c) => words(renderToStaticMarkup(createElement(c)))).join(" ")
  check("no em dash and none of the banned words in what is drawn", !BANNED.test(drawn))
  check("none of the names that must never be on the page", !NEVER.test(drawn) && files.every((f) => !NEVER.test(bare(read(f)))))
  check("registered after the round 10 suites", /"tests\/home-landing-r10-[\w-]+\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r11-lower\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))
}

console.log(`\nhome-landing-r11-lower: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
