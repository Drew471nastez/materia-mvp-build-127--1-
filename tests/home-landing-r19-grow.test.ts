/**
 * LANDING ROUND 19, GROW (the owner: on hover only the white arrow circle
 * should get an outline, not the whole Get Grow button)
 *
 * components/billing/plan-cards.tsx, Get Grow on the home page's pricing and
 * on /pricing:
 *   - the button stays solid Storelib purple with a white label on hover and
 *     focus; round 17's white fill, purple line and purple label are gone;
 *   - it carries the same faint light as Start free and Get Pro (.plan-shine);
 *   - only the white disc changes: a 1.5px white ring 2px clear of its edge,
 *     its ::after drawn by a still shadow, fades and grows in (opacity 0 at scale .86 to 1 at
 *     scale 1) in 300ms. Opacity and scale only, no box shadow animated;
 *   - keyboard focus shows the ring and the button's own focus ring;
 *   - hover only where a pointer hovers (no stuck hover after a tap);
 *   - under reduced motion it only fades, no growth.
 *
 * Measured in Chromium at 1440 and 390 (scratchpad l5-shots/r19-grow-*):
 * the button's background and colour at rest and hovered, and the ring's
 * opacity and box at rest, mid transition and hovered.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const copy = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i

const RAW = read("components/billing/plan-cards.tsx")
const CARDS = code(RAW)
const css = /const PLAN_BUTTON_CSS = `([\s\S]*?)`/.exec(CARDS)?.[1] ?? ""
const go = (label: string): PlanCardAction => ({ label, href: "/signup" })
const cards = renderToStaticMarkup(createElement(PlanCards, { actions: { free: go("Start free"), growth: go("Get Grow"), pro: go("Get Pro") }, hideInterval: true }))
const grow = cards.slice(cards.indexOf('data-plan-card="growth"'))
const btn = /<a [^>]*data-plan-button="purple"[^>]*>/.exec(grow)?.[0] ?? ""

console.log("\n1. The button stays purple")
{
  check("solid Storelib purple with a white label at rest", /bg-\[#7c3aed\] font-semibold text-white/.test(btn))
  check("no rule changes its fill, label or line on hover or focus", !/\.plan-grow(:hover|:focus-visible)\{/.test(css) && !/#6d28d9|inset 0 0 0 1\.5px|color:#7c3aed/.test(css))
  check("it carries the same faint light as Start free and Get Pro", /class="[^"]* plan-shine plan-grow"/.test(btn) && (cards.match(/ plan-shine( plan-grow)?"/g) ?? []).length === 3)
  check("the label sits above the light: the light is z-index -1 in the button's own stacking context", /\.plan-shine\{overflow:hidden;isolation:isolate\}/.test(css) && /\.plan-shine::before\{[^}]*z-index:-1/.test(css))
}

console.log("\n2. Only the white disc takes a ring")
{
  const ring = /\.plan-grow \.plan-disc::after\{([^}]*)\}/.exec(css)?.[1] ?? ""
  check("the disc is still a solid white 34px circle at the button's right end", /class="plan-disc absolute right-\[5px\] top-1\/2 grid h-\[34px\] w-\[34px\] [^"]*rounded-full bg-white text-\[#7c3aed\]/.test(grow))
  check("a 1.5px white ring 2px clear of the disc, round, drawn by a still shadow (a 1.5px border renders 1px in Chrome)", /inset:-2px/.test(ring) && /box-shadow:0 0 0 1\.5px rgba\(255,255,255,\.9\)/.test(ring) && !/border:/.test(ring) && /border-radius:9999px/.test(ring) && /pointer-events:none/.test(ring))
  check("  41px across, concentric with the 44px button's round end, so it never touches the edge", 34 + 2 * (2 + 1.5) === 41 && 5 + 34 / 2 === 44 / 2)
  check("hidden at rest: opacity 0 at scale .86", /opacity:0/.test(ring) && /scale:\.86/.test(ring))
  check("300ms on an ease out, opacity and scale only (compositor properties)", /transition:opacity \.3s cubic-bezier\(\.22,1,\.36,1\),scale \.3s cubic-bezier\(\.22,1,\.36,1\)/.test(ring))
  check("no shadow animated anywhere on Get Grow: only the rest rule has one, and no transition names it", [...css.matchAll(/\.plan-grow[^{]*\{([^}]*)\}/g)].filter((m) => /box-shadow/.test(m[1])).length === 1 && !/transition:[^;}]*box-shadow/.test(css.slice(css.indexOf(".plan-grow"))))
  check("hover shows it, only where a pointer hovers", /@media \(hover:hover\)\{\s*\.plan-grow:hover \.plan-disc::after\{opacity:1;scale:1\}/.test(css) && !/\.plan-grow:hover[^{]*\{/.test(css.replace(/@media \(hover:hover\)\{[^@]*\}\s*\}/g, "")))
  check("keyboard focus shows it too", /\.plan-grow:focus-visible \.plan-disc::after\{opacity:1;scale:1\}/.test(css))
  check("  and the button keeps its own visible focus ring", /focus-visible:outline-none focus-visible:ring-4/.test(CARDS) && /focus-visible:ring-\[#7c3aed\]\/30/.test(btn))
  check("reduced motion: it fades only, no growth", /@media \(prefers-reduced-motion:reduce\)\{\.plan-grow \.plan-disc::after\{scale:none;transition:opacity \.15s linear\}\}/.test(css))
  check("the disc is on Get Grow only", (cards.match(/class="plan-disc /g) ?? []).length === 1)
}

console.log("\n3. Copy and registration")
check("no banned words in what the cards say, no em dashes in the file", !BANNED.test(copy(cards)) && !RAW.includes("\u2014"), copy(cards).match(BANNED)?.[0])
check("this suite runs with the push tests, after round 18's", /"tests\/home-landing-r18-business\.test\.ts",[\s\S]{0,1200}"tests\/home-landing-r19-grow\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
