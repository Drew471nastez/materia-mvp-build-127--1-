/**
 * LANDING ROUND 17, SMALL (three asks from the owner)
 *
 *   1. components/marketing/build-showcase.tsx: the row of three numbers
 *      under the showcase's pictures (79 OnePage themes, 34 countries you get
 *      paid in, 10 GB largest file) goes completely, with its count up, its
 *      styles and its constants.
 *   2. components/billing/plan-cards.tsx, Get Grow: on hover (and keyboard
 *      focus) the button itself becomes an outline button. Its purple fill
 *      fades to white, the card's ground, with a 1.5px purple line and a
 *      purple label, in 250ms. No ring round the arrow disc any more; the
 *      disc stays a solid white circle with a fine purple hairline so it
 *      still reads on the white.
 *   3. components/marketing/home/how-it-works.tsx, Take tips: a different
 *      creator, Finn Hollis (made up), a surf filmmaker, with a real face and
 *      a cover that fits him (both Unsplash, webp at two widths, srcSet).
 *      Ines Duarte's pictures are deleted.
 *
 * Measured on the dev server with Playwright (scratchpad r17small): Get
 * Grow's computed background, box shadow and colour at rest and after
 * hovering, at 390, 1440 and 1920.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Showcase from "@/components/marketing/build-showcase"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { HowItWorks, HOW_COVER, HOW_SHOP } from "@/components/marketing/home/how-it-works"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i

console.log("\n1. The showcase: no row of numbers")
{
  const src = code(read("components/marketing/build-showcase.tsx"))
  const html = renderToStaticMarkup(createElement(Showcase.BuildShowcase))
  const css = Showcase.SHOWCASE_STYLES.map((s) => s.css).join("\n")
  const text = html.replace(/<[^>]+>/g, " ")
  check("no row, no labels, no figures from it", !/<dl|data-stat/.test(html) && !/OnePage themes|Countries you get paid in|Largest file you can sell|\b10 GB\b/.test(text))
  check("the section ends on the rail", /class="build-showcase-viewport"[\s\S]*<\/div><\/div><\/div><\/section>$/.test(html))
  check("no count up: no observer, no frame loop, no timing constant", !/ShowcaseStats|COUNT_MS|IntersectionObserver|requestAnimationFrame|useEffect|useRef/.test(src))
  check("no constants left: SHOWCASE_STATS and SHOWCASE_THEME_COUNT gone, no payout or upload imports", !("SHOWCASE_STATS" in Showcase) && !("SHOWCASE_THEME_COUNT" in Showcase) && !/payout-regions|uploads\/policy/.test(src))
  check("no styles left", !/build-showcase-stats|build-showcase-unit|data-stat/.test(css))
}

console.log("\n2. Get Grow: an outline button on hover")
{
  const CARDS = code(read("components/billing/plan-cards.tsx"))
  const css = /const PLAN_BUTTON_CSS = `([\s\S]*?)`/.exec(CARDS)?.[1] ?? ""
  const go = (label: string): PlanCardAction => ({ label, href: "/signup" })
  const cards = renderToStaticMarkup(createElement(PlanCards, { actions: { free: go("Start free"), growth: go("Get Grow"), pro: go("Get Pro") }, hideInterval: true }))
  const grow = cards.slice(cards.indexOf('data-plan-card="growth"'))
  const btn = /<a [^>]*data-plan-button="purple"[^>]*>/.exec(grow)?.[0] ?? ""
  check("at rest still solid Storelib purple with a white label", /bg-\[#7c3aed\] font-semibold text-white/.test(btn))
  check("Get Grow carries .plan-grow, not the light; the dark buttons keep the light", /class="[^"]* plan-grow"/.test(btn) && !/plan-shine/.test(btn) && (cards.match(/ plan-grow"/g) ?? []).length === 1 && (cards.match(/ plan-shine"/g) ?? []).length === 2)
  check("no darker purple hover left on it", !/hover:bg-\[#6d28d9\]|active:bg-\[#6d28d9\]/.test(CARDS))
  const rest = /\.plan-grow\{[^}]*\}/.exec(css)?.[0] ?? ""
  check("at rest: an invisible purple line already in place, so hover only fades it in", /box-shadow:inset 0 0 0 1\.5px rgba\(124,58,237,0\),/.test(rest))
  check("250ms for fill, line and label, eased out", /transition:background-color \.25s cubic-bezier\(\.22,1,\.36,1\),box-shadow \.25s cubic-bezier\(\.22,1,\.36,1\),color \.25s cubic-bezier\(\.22,1,\.36,1\)/.test(rest))
  const hover = /@media \(hover:hover\)\{\s*\.plan-grow:hover\{([^}]*)\}/.exec(css)?.[1] ?? ""
  check("hover (only where a pointer hovers): white fill, purple label, a 1.5px purple line inside", /background-color:#fff/.test(hover) && /color:#7c3aed/.test(hover) && /box-shadow:inset 0 0 0 1\.5px #7c3aed/.test(hover))
  const focus = /\.plan-grow:focus-visible\{([^}]*)\}/.exec(css)?.[1] ?? ""
  check("keyboard focus: the same outline button, and a soft focus ring outside it", /background-color:#fff/.test(focus) && /color:#7c3aed/.test(focus) && /inset 0 0 0 1\.5px #7c3aed,0 0 0 4px rgba\(124,58,237,\.18\)/.test(focus))
  check("no ring round the disc any more: no ::after, no offset outline", !/plan-disc::after/.test(css) && !/inset:-3\.5px/.test(css))
  check("the disc stays a solid white circle with a purple arrow", /class="plan-disc [^"]*rounded-full bg-white text-\[#7c3aed\]/.test(grow))
  check("  and takes a fine purple hairline on its own edge on hover and focus", /\.plan-grow:hover \.plan-disc\{box-shadow:0 0 0 1px rgba\(124,58,237,\.32\)/.test(css) && /\.plan-grow:focus-visible \.plan-disc\{box-shadow:0 0 0 1px rgba\(124,58,237,\.32\)/.test(css) && /\.plan-grow \.plan-disc\{box-shadow:0 0 0 1px rgba\(124,58,237,0\)/.test(css))
  check("no transition under reduced motion", /@media \(prefers-reduced-motion:reduce\)\{\.plan-grow,\.plan-grow \.plan-disc\{transition:none\}\}/.test(css))
  check("only colour and shadow move: no transform or size change on the button", !/\.plan-grow(:hover|:focus-visible)?\{[^}]*(transform|scale|translate|width|height|border-width)/.test(css))
}

console.log("\n3. Take tips: Finn Hollis")
{
  const how = renderToStaticMarkup(createElement(HowItWorks))
  const text = how.replace(/<[^>]+>/g, " ")
  check("a different creator: Finn Hollis, a surf filmmaker", HOW_SHOP.creator === "Finn Hollis" && HOW_SHOP.first === "Finn" && HOW_SHOP.handle === "finnhollis" && text.includes("Finn Hollis") && text.includes("Good morning, Finn") && text.includes(HOW_SHOP.line))
  check("no Ines Duarte and no Ruben Linde on the page", !/Ines|Duarte|Ruben|Linde/.test(how))
  check("his face at two widths, chosen by srcSet, everywhere it shows", (how.match(/src="\/home\/how\/finn-avatar-160\.webp" srcSet="\/home\/how\/finn-avatar-160\.webp 160w, \/home\/how\/finn-avatar-320\.webp 320w" sizes="[^"]+"/gi) ?? []).length === 3)
  check("his cover at two widths, chosen by srcSet", HOW_COVER.src === "/home/how/finn-cover-1000.webp" && new RegExp(`srcSet="${HOW_COVER.srcSet}"`, "i").test(how))
  const files = [["finn-avatar-160", 160, 160, 10], ["finn-avatar-320", 320, 320, 20], ["finn-cover-600", 600, 255, 20], ["finn-cover-1000", 1000, 425, 30]] as const
  const size = (p: string) => {
    const b = readFileSync(p)
    /* VP8 (lossy) header: the frame's width and height at bytes 26 to 29. */
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  }
  check("the files exist as webp, small, at their stated sizes", files.every(([f, w, h, kb]) => {
    const p = `public/home/how/${f}.webp`
    if (!existsSync(p) || statSync(p).size > kb * 1024) return false
    const b = readFileSync(p)
    const [sw, sh] = size(p)
    return b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" && sw === w && sh === h
  }), files.map(([f]) => [f, existsSync(`public/home/how/${f}.webp`) ? size(`public/home/how/${f}.webp`) : null]))
  check("Ines Duarte's pictures are deleted; the folder holds only Finn's", readdirSync("public/home/how").sort().join() === "finn-avatar-160.webp,finn-avatar-320.webp,finn-cover-1000.webp,finn-cover-600.webp")
  check("the photographs are credited in the code with their licence", /Logan Voss on Unsplash \(Unsplash Licence\)/.test(read("components/marketing/home/how-it-works.tsx")) && /Tim\s+\*?\s*Marshall on Unsplash \(Unsplash Licence\)/.test(read("components/marketing/home/how-it-works.tsx")))
}

console.log("\nWords")
check("no banned words, no em dashes in what changed", !BANNED.test(`${HOW_SHOP.line} ${HOW_SHOP.creator}`) && !/—/.test(read("components/billing/plan-cards.tsx") + read("components/marketing/build-showcase.tsx") + read("components/marketing/home/how-it-works.tsx")))
check("this suite runs with the push tests, after round 16's", /"tests\/home-landing-r16-checkout\.test\.ts",[\s\S]{0,600}"tests\/home-landing-r17-small\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
