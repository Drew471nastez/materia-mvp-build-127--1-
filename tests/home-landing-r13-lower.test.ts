/**
 * HOME, LANDING ROUND 13, THE LOWER PAGE (track 7).
 *
 * The owner, after round 12:
 *   how       "See every sale as it happens": back to round 11's structure,
 *             the grey stages narrow, wide, narrow with their captions, and
 *             round 12's pictures inside them (the typed www.fernlyn.com,
 *             Ruben's tip, the Storelib dashboard with live figures). The
 *             dashboard never cut off: scaled whole into its stage.
 *   ai tools  the dot pattern still too strong: a bit less.
 *   close     the dots move subtly by default (a slow drift), are more
 *             subtle overall, and the pointer eases (no snapping). The
 *             email field and the Dashboard button stay.
 *   footer    the logo a white S on a near black square with some depth,
 *             like a dark app icon, not a white square, not outlined.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_CARDS, HOW_DASH_FIT, HOW_HEADING, HOW_IT_WORKS_STYLES } from "@/components/marketing/home/how-it-works"
import { AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { DOT_FIELD_CALM, DOT_FIELD_TONES } from "@/components/marketing/home/dot-field"
import { FinalCta } from "@/components/marketing/home/final-cta"
import { StorelibLogo, STORELIB_SOLID } from "@/components/brand/storelib-logo"
import { MarketingFooter } from "@/components/marketing/footer"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const ruleIn = (css: string, sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""

console.log("\n1. How it works: round 11's row, round 12's pictures")
const how = renderToStaticMarkup(createElement(HowItWorks))
const howCss = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const howSrc = strip(read("components/marketing/home/how-it-works.tsx"))
const rule = (sel: string) => ruleIn(howCss, sel)
check("the heading kept", HOW_HEADING.lead === "See every sale as it happens." && HOW_HEADING.rest === "Add tips and your own domain.")
check("narrow, wide, narrow: tips, the dashboard, the domain", HOW_CARDS.map((c) => `${c.key}:${c.wide}`).join() === "tips:false,business:true,domain:false" && [...how.matchAll(/class="cmh-card (cmh-\w+)" data-card="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}`).join() === "tips:cmh-narrow,business:cmh-wide,domain:cmh-narrow")
check("one row from 1100px, the wide card twice a narrow one; the wide card first on its own row from 640px", /@media\(min-width:1100px\)\{\.cmh-grid\{grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\)/.test(howCss) && /\.cmh-wide\{grid-column:1\/-1;order:-1\}/.test(howCss))
check("grey stages with round corners and their own quiet grounds, clipped", /background:#f4f4f6/.test(rule(".cmh-stage")) && /border-radius:17px/.test(rule(".cmh-stage")) && /overflow:hidden/.test(rule(".cmh-stage")) && [...how.matchAll(/class="cmh-stage" data-ground="(\w+)"/g)].map((m) => m[1]).join() === "tips,business,domain" && /\.cmh-stage\[data-ground=tips\]\{background:#f3f1f8\}/.test(howCss))
check("a laptop's stages stop at half the screen, never under 360px", howCss.includes("height:max(360px,min(clamp(400px,32vw,560px),50svh))"))
check("each card a title and one line under its stage", HOW_CARDS.every((c) => how.includes(`<h3 class="cmh-cap-t">${c.title}</h3><p class="cmh-cap">${c.line}</p>`)))
check("round 12's pictures inside: the tip flow, the dashboard, the typed domain", /class="cmh-sc cmh-tp"/.test(how) && /class="cmh-db-fit"/.test(how) && /class="cmh-db"/.test(how) && how.includes(">Pay $5.00<") && (how.match(/cmh-dm-ch/g) ?? []).length >= "www.fernlyn.com".length)

console.log("\n2. The dashboard scaled whole into its stage")
check("laid out at --db-w, centred and scaled by one transform; its own container for the app's layouts", /width:var\(--db-w,860px\)/.test(rule(".cmh-db-fit")) && /container-type:inline-size/.test(rule(".cmh-db-fit")) && /transform:translate3d\(-50%,-50%,0\) scale\(var\(--db-s,\.6\)\)/.test(rule(".cmh-db-fit")))
check("measured before paint and on resize only, never in a frame", /function useDashFit/.test(howSrc) && /useLayoutEffect\(\(\) => \{\s*const box = fit\.current/.test(howSrc) && /new ResizeObserver\(measure\)/.test(howSrc) && /ro\.observe\(stage\)/.test(howSrc) && /setProperty\("--db-s"/.test(howSrc))
check("no layer of its own inside the scale (no translateZ on the dashboard), so its type stays sharp", !/transform/.test(rule(".cmh-db")))
/* The fit at the widths the owner looks at (stage widths measured in Chromium at 390, 1440 and 1920; heights from the CSS). */
const fit = (sw: number, sh: number, h: (w: number) => number) => {
  const w = Math.round(Math.min(HOW_DASH_FIT.max, Math.max(HOW_DASH_FIT.min, sw * HOW_DASH_FIT.perStage)))
  const m = Math.max(HOW_DASH_FIT.marginMin, Math.min(sw, sh) * HOW_DASH_FIT.margin)
  const s = Math.min((sw - m * 2) / w, (sh - m * 2) / h(w))
  return { w, s, drawnW: w * s, drawnH: h(w) * s, m }
}
/* Natural heights measured in Chromium: about 553px at the phone's layout (473 wide), 520 without the rail (842), 523 with it (1120). */
const height = (w: number) => (w <= 600 ? 555 : 525)
const cases = [[350, 440], [624, 450], [848, 540]].map(([sw, sh]) => ({ sw, sh, ...fit(sw, sh, height) }))
check("whole inside its stage with a margin on every side at 390, 1440 and 1920", cases.every((c) => c.drawnW <= c.sw - 2 * c.m + 0.5 && c.drawnH <= c.sh - 2 * c.m + 0.5), cases)
check("its type lands near 10px (a scale of 0.6 or more), the phone's layout on a phone, the rail at 1920", cases.every((c) => c.s >= 0.6) && cases[0].w <= 600 && cases[1].w > 760 && cases[1].w <= 1020 && cases[2].w > 1020, cases)

console.log("\n3. Tips and the domain fit a narrow card")
check("the tip page rises from the stage's foot, a phone's width at most", /bottom:0/.test(rule(".cmh-tp-page")) && /left:max\(16px,calc\(50% - 12\.5em\)\)/.test(rule(".cmh-tp-page")) && /border-radius:1\.15em 1\.15em 0 0/.test(rule(".cmh-tp-page")))
check("the domain is sized by its card: the address field (about 27em) fits 92% of a narrow card", /font-size:clamp\(9px,3\.25cqw,17px\)/.test(rule(".cmh-dm")) && 27 * 3.25 <= 92)

console.log("\n4. AI tools: the dots a bit less")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const dots = ruleIn(css, ".ait-dots")
  const alpha = Number(/rgba\(255,255,255,(\.\d+)\) 0/.exec(dots)?.[1] ?? 1)
  check("rest at .055 (was .085), the clear middle smaller", alpha === 0.055 && /#000 22%,transparent 76%/.test(dots), alpha)
}

console.log("\n5. The closing call: breathing dots, an eased pointer")
{
  /* Changed on purpose (lead, landing round 13): main moved the dots into a worker engine (dot-field-engine.ts); the closing call's calm is ported there. */
  const src = strip(read("components/marketing/home/dot-field-engine.ts"))
  check("more subtle overall: rests at 0.24, lights to 0.5 (was 0.34 and 0.68)", DOT_FIELD_TONES.dark.rest === 0.24 && DOT_FIELD_TONES.dark.lit === 0.5)
  check("the purple sheet unchanged", JSON.stringify(DOT_FIELD_TONES.purple) === JSON.stringify({ rgb: "255,255,255", rest: 0.17, lit: 0.4, r: 0.95, ride: 0.5 }) && /drift: tone === "dark" \? DOT_FIELD_CALM\.drift : 0/.test(src))
  check("every dot drifts on a small slow loop of its own, by itself", DOT_FIELD_CALM.drift > 0 && DOT_FIELD_CALM.drift <= 2 && DOT_FIELD_CALM.driftMs >= 10000 && /x \+= drift \* Math\.sin\(t \* w \+ pa\)/.test(src) && /y \+= drift \* Math\.cos\(t \* w \* 0\.83 \+ pa \* 1\.7\)/.test(src))
  /* Fastest a dot moves: drift * 2pi / (period * 0.67), per 60Hz frame. */
  const perFrame = (DOT_FIELD_CALM.drift * 2 * Math.PI) / ((DOT_FIELD_CALM.driftMs / 1000) * (1 / 1.33)) / 60
  check("under a thirtieth of a pixel a frame: a drift, never a shimmer", perFrame < 0.035, perFrame)
  check("the light eases after the mouse through two easings in a row, its pull fading in near the box", /f\.midX \+= \(tx - f\.midX\) \* k/.test(src) && /f\.lightX \+= \(f\.midX - f\.lightX\) \* k/.test(src) && /const pull = c\.reach !== null \? Math\.max\(0, 1 - out \/ c\.reach\) : 1/.test(src) && /goal = pull \* pull \* \(3 - 2 \* pull\)/.test(src))
  check("a gentler parting", DOT_FIELD_CALM.part < 6)
  check("no drift under reduced motion", /const drift = f\.reduced \? 0 : c\.drift/.test(src))
  const cta = renderToStaticMarkup(createElement(FinalCta))
  check("the email field and the Dashboard button stay", /<form [^>]*class="fcta-form"/.test(cta) && /type="email"/.test(cta) && /data-fcta-account|class="fcta-actions" hidden=""/.test(cta) && /"Dashboard"/.test(read("components/marketing/home/final-cta.tsx")))
}

console.log("\n6. The footer's logo: a dark app icon")
{
  const footer = renderToStaticMarkup(createElement(MarketingFooter))
  const mark = /<svg[^>]*data-storelib-logo="solid"[\s\S]*?<\/svg><\/svg>/.exec(footer)?.[0] ?? ""
  check("drawn at 40px in the footer, not the picture", /width="40" height="40"/.test(mark) && !/<img[^>]*data-storelib-logo/.test(footer))
  check("a white S (currentColor, white) on the square, no mask cutting it out", /color:#fff/.test(mark) && /<path d="[^"]+" transform="[^"]+" fill="currentColor"/.test(mark) && !/<mask/.test(mark))
  check("the square a near black gradient: lifted at the top, the footer's black at the foot", /fill="url\(#storelib-solid-ground\)"/.test(mark) && mark.includes(`stop-color="${STORELIB_SOLID.top}"`) && mark.includes(`stop-color="${STORELIB_SOLID.bottom}"`) && parseInt(STORELIB_SOLID.bottom.slice(1, 3), 16) <= 0x0c && parseInt(STORELIB_SOLID.top.slice(1, 3), 16) <= 0x30)
  check("a soft light over its top and a fine inner edge, brighter at the top, filled, not stroked", /fill="url\(#storelib-solid-sheen\)"/.test(mark) && /fill="url\(#storelib-solid-edge\)" fill-rule="evenodd"/.test(mark) && STORELIB_SOLID.edgeTop > STORELIB_SOLID.edgeBottom && STORELIB_SOLID.edgeTop <= 0.25 && !/stroke/.test(mark))
  check("every other place still draws the picture", /<img[^>]*data-storelib-logo=""/.test(renderToStaticMarkup(createElement(StorelibLogo, { size: 32 }))))
}

console.log("\nCopy and registration")
{
  const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ")
  check("no em dash, none of the banned words", !/—/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  check("registered after the round 12 suites", /"tests\/home-landing-r12-[\w-]+\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r13-lower\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))
}

console.log(`\nhome-landing-r13-lower: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
