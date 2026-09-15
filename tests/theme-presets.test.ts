/**
 * ===========================================================================
 *  A SCHEME HAS TO CHANGE THE PAGE, AND STAY READABLE WHILE IT DOES
 * ===========================================================================
 * "Make sure the pink colour scheme actually applies" was reported after a
 * round that left pink's page, header, footer and every bar at #ffffff, the
 * same values Default carries. Choosing it changed a button and nothing else
 * at page scale, which is indistinguishable from a scheme that is not being
 * applied at all. Nothing caught it because every individual colour was a
 * valid colour; what was wrong was the RELATIONSHIP between two schemes, and
 * that is only visible when you compare them.
 *
 * The contrast half is here for the same reason. Tinting a page moves every
 * ratio on it: pink's muted grey measured 4.83 against white and 4.43
 * against the new tint, so the tint would have quietly pushed text under AA
 * if nobody had done the arithmetic.
 *
 * scripts/check-creator-chrome.mjs renders these schemes in a browser and
 * measures what is actually painted. This is the cheap arithmetic underneath
 * it, run on the values themselves.
 */
import { themePresets } from "../lib/store-builder/defaults"
import { OFFERED_SCHEMES } from "../components/storefront/scheme-picker"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function luminance(hex: string) {
  const raw = hex.replace("#", "")
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)

/**
 * The surfaces that cover enough of the page for a change to read as one:
 * the page itself and the bar across the top of it.
 *
 * NOT THE FOOTER. The first version of this check included it, and a control
 * run caught the check being useless: Default's footer is #f9fafb and pink's
 * was #fdf2f8, so pink "differed from Default" on a strip at the bottom of
 * the page while the whole field above it was identical white. The check
 * passed on exactly the bug it was written for. What a person means by "the
 * scheme applies" is the big area they are looking at.
 */
function pageSurfaces(key: string) {
  const t = themePresets[key as keyof typeof themePresets] as any
  return [
    t.sections?.pageBackgroundColor ?? t.colors.background,
    t.sections?.headerBackgroundColor,
    t.subscribeBar?.backgroundColor,
  ]
    .map((c) => (typeof c === "string" ? c.toLowerCase() : c))
    .join("|")
}

console.log("\nEvery scheme on offer changes the page")

/*
  No exceptions list. Blacks looked like it would need one, being a white
  page like Default's, but it carries a BLACK subscribe bar across the top,
  so it differs at page scale like the rest. Every offered scheme has to
  change something a person sees without hunting for it.
*/
for (const key of OFFERED_SCHEMES) {
  if (key === "default") continue
  check(
    `${key} paints the page differently from Default`,
    pageSurfaces(key) !== pageSurfaces("default"),
    `${key} and default are both  ${pageSurfaces(key)}`,
  )
}

check(
  "pink carries one tint, so there is no seam where a section starts",
  new Set(pageSurfaces("pink").split("|")).size === 1,
  pageSurfaces("pink"),
)

console.log("\nand stays readable while it does")

for (const key of OFFERED_SCHEMES) {
  const t = themePresets[key as keyof typeof themePresets] as any
  const page = t.sections?.pageBackgroundColor ?? t.colors.background
  const pairs: [string, unknown, unknown][] = [
    ["body text", t.colors.foreground, page],
    ["footer text", t.sections?.footerTextColor, t.sections?.footerBackgroundColor ?? page],
    ["price", t.productCard?.priceColor, t.productCard?.backgroundColor ?? page],
    ["subscribe button", t.subscribeBar?.buttonTextColor, t.subscribeBar?.buttonColor],
    ["buy button", t.productHeader?.buyButtonTextColor, t.productHeader?.buyButtonColor],
    ["sticky button", t.stickyAddToCart?.buttonTextColor, t.stickyAddToCart?.buttonColor],
    ["image-text button", t.imageText?.buttonTextColor, t.imageText?.buttonColor],
  ]
  const bad = pairs
    .filter(([, fg, bg]) => isHex(fg) && isHex(bg))
    .map(([what, fg, bg]) => [what, ratio(fg as string, bg as string)] as const)
    .filter(([, r]) => r < 4.5)
  check(`${key} clears AA everywhere it puts text on a colour`, bad.length === 0,
    bad.map(([w, r]) => `${w} ${r.toFixed(2)}`).join(", "))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
