/**
 * ===========================================================================
 *  ONEPAGE STYLE STABILITY: ONE LOOK PER BUTTON, ONE HOVER, ICONS, ENTRANCES,
 *  PRODUCTS APART, THE CURRENT INSTAGRAM
 * ===========================================================================
 * The owner:
 *   1  Buttons ("Follow on Instagram") "flash, glitch and change colours on their own", "cycling through 3 colours
 *      on hover", double hovers, invisible words, with some themes.
 *   2  Social icon styles (Solid, Outline, Glass, Brand colours, One colour) on every icon, every theme.
 *   3  Block entrance animations that do not run in the editor's preview or on the live page.
 *   4  A digital product as a Compact card: its price and title over its button.
 *   5  The current Instagram, not the old one.
 *
 * In a browser, every theme the picker lists, the live page and the editor's preview frame, read every animation
 * frame: scripts/check-onepage-style-stability.mjs over scripts/render-onepage-style-stability.tsx.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { LEGIBLE_CSS, GUARD_TOUCH, PRESSED_LOOK } from "@/lib/onepage/legible"
import { pageGroundIsLight, socialIconColorOf, socialIconStyleOf, socialIconToneOf, socialTileStyle } from "@/lib/onepage/social-look"
import { lookFingerprint } from "@/components/onepage/look-still"
import { ENTER_STAGGER_MAX_MS, ENTER_STAGGER_MS, PREVIEW_SHOWN_EVENT } from "@/components/onepage/block-entrance"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const css = code("app/globals.css")

console.log("\n1. A button's colour never animates unless a hover changes it")
{
  const base = /\.op-btn \{[^}]*transition-property: ([^;]+);/.exec(css)?.[1] ?? ""
  check("a button transitions only translate, scale and opacity at rest", base.trim() === "translate, scale, opacity", base)
  check("Fill and Pop, the hovers that change the words, add colour", /\.op-btn:is\(\[data-hover="fill"\], \[data-hover="pop"\]\) \{\s*transition-property: translate, scale, opacity, color;/.test(css))
  check("nothing on the page transitions while it takes on a look (first paint, hydration, a theme arriving)", /\.onepage-live\[data-op-still\] \*::after \{\s*transition: none !important;/.test(css))
  const pub = code("components/onepage/public-onepage.tsx")
  check("both of the page's roots carry the look's fingerprint", (pub.match(/data-op-still=\{lookStill\}/g) || []).length === 2)
  const a = lookFingerprint({ button_color: "#111111", text_color: "#ffffff" })
  check("the fingerprint is the look's: the same theme the same, any change another", a === lookFingerprint({ button_color: "#111111", text_color: "#ffffff" }) && a !== lookFingerprint({ button_color: "#111112", text_color: "#ffffff" }))
  const still = code("components/onepage/look-still.ts")
  check("it is lifted on the DOM two frames later, nothing re-rendered", /requestAnimationFrame\(\(\) => \{\s*second = requestAnimationFrame/.test(still) && /removeAttribute\("data-op-still"\)/.test(still) && !/useState/.test(still))
}

console.log("\n2. The legibility guard's pass starts no transition, and leaves a hovered button alone")
{
  check("every box a pass touches has its transitions off for the pass (and its children's, and their layers')", LEGIBLE_CSS.includes(`[${GUARD_TOUCH}],[${GUARD_TOUCH}]::before,[${GUARD_TOUCH}]::after,[${GUARD_TOUCH}] *,[${GUARD_TOUCH}] *::before,[${GUARD_TOUCH}] *::after{transition:none !important}`), LEGIBLE_CSS)
  const lib = code("lib/onepage/legible.ts")
  check("taking a colour back marks the box first", /if \(held\(el\)\) continue\s*const h = el as HTMLElement\s*h\.setAttribute\(GUARD_TOUCH, ""\)/.test(lib))
  check("giving a colour marks the box first", /for \(const \{ f, h, ground, wanted, fixed, whole \} of plans\) \{\s*h\.setAttribute\(GUARD_TOUCH, ""\)/.test(lib))
  check("a hovered button (or one in a hovered card or Design sample) is neither taken back nor measured", /function held\(el: Element\): boolean \{\s*const button = el\.closest\(PRESSED_LOOK\)/.test(lib) && /\.op-host:hover, \.op-demo:hover/.test(lib) && (lib.match(/if \(held\(el\)\) continue/g) || []).length === 2)
  check("a button is anything that answers a pointer as one", PRESSED_LOOK === ".op-btn, [data-product-cta]")
  const guard = code("components/onepage/legible-guard.tsx")
  check("the guard lets the browser work the styles out with the result in place, then lifts the hold", /guardLegibility\(document\.body\)[\s\S]*?void document\.documentElement\.offsetWidth\s*settleGuard\(document\.body\)/.test(guard))
  check("a button's hover ending measures it again, whatever its width", /t\.matches\(PRESSED_LOOK\)/.test(guard))
}

console.log("\n3. Social icons: one rule for the page, the theme cards and Design")
{
  check("Solid is the default and anything unknown", socialIconStyleOf({}) === "filled" && socialIconStyleOf({ social_icon_style: "nonsense" }) === "filled")
  check("Outline and Glass (saved as minimal) are read as saved", socialIconStyleOf({ social_icon_style: "outline" }) === "outline" && socialIconStyleOf({ social_icon_style: "minimal" }) === "minimal")
  check("One colour unless Brand colours was chosen", socialIconToneOf({}) === "mono" && socialIconToneOf({ social_icon_tone: "brand" }) === "brand")
  check("the icon colour, else the page's words", socialIconColorOf({ text_color: "#123456" }) === "#123456" && socialIconColorOf({ text_color: "#123456", social_icon_color: "#ff0000" }) === "#ff0000")
  const solidShort = socialTileStyle({ social_icon_style: "filled", social_icon_color: "#fff" }, { onLight: false })
  check("Solid draws a tile from a three digit colour (`#fff20` was no colour at all)", String(solidShort.backgroundColor).includes("color-mix(in srgb, #fff 12.5%"), solidShort)
  const outlineRgba = socialTileStyle({ social_icon_style: "outline", social_icon_color: "rgba(10, 20, 30, 0.9)" }, { onLight: true })
  check("Outline draws a 2px ring from any colour", outlineRgba.borderWidth === 2 && String(outlineRgba.borderColor).startsWith("color-mix(in srgb, rgba(10, 20, 30, 0.9) 25%"), outlineRgba)
  const glassDark = socialTileStyle({ social_icon_style: "minimal" }, { onLight: false })
  const glassLight = socialTileStyle({ social_icon_style: "minimal" }, { onLight: true })
  check("Glass is a frosted tile, as Design draws it, on a dark page and a light one", /blur/.test(String(glassDark.backdropFilter)) && glassDark.backgroundColor !== "transparent" && glassLight.backgroundColor !== glassDark.backgroundColor)
  check("every tile is round with every value inline, so it can be raised over a skin", ["borderRadius", "borderStyle", "borderWidth", "borderColor", "backgroundColor", "boxShadow", "color"].every((k) => k in glassDark && k in solidShort && k in outlineRgba))
  check("a photo page is a dark ground", !pageGroundIsLight({ background_type: "image", background_color: "#ffffff" }) && pageGroundIsLight({ background_color: "#fafafa" }) && !pageGroundIsLight({ background_color: "#111111" }))
  const pub = code("components/onepage/public-onepage.tsx")
  check("the social row draws its tile from the rule", /style=\{socialTileStyle\(theme as never, \{ onLight: pageIsLight\(theme as never\) \}\)\}/.test(pub) && !/socialColor\}20|socialColor\}40/.test(pub))
  check("the theme cards and Design's samples draw it from the rule too", /socialTileStyle\(c as never/.test(code("components/onepage/themes/theme-preview.tsx")) && (code("components/onepage/tabs/design-tab.tsx").match(/socialTileStyle\(/g) || []).length >= 2)
  check("over a skin, the creator's tile is raised whole (shape, ring, blur) and the skin's filter on the mark gives way", /socials: \{ boxes: "\[data-op-social-icon\]", props: \[[^\]]*"border-style"[^\]]*"backdrop-filter"/.test(code("lib/onepage/skin-own.ts")) && /\[data-op-skin\]\[data-sk-own~="socials"\] \[data-op-social-icon\] svg \{ filter: none !important; \}/.test(css))
}

console.log("\n4. Entrances where they can be seen, and still for reduced motion")
{
  const hook = code("components/onepage/block-entrance.ts")
  check("only a block out of sight at the start waits (live), every one in the preview", /if \(!preview && inView\(el\)\) continue\s*el\.setAttribute\(ATTR, "wait"\)/.test(hook))
  check("it arrives as it comes into view", /new IntersectionObserver/.test(hook) && /enter\(el, Math\.min\(i \* ENTER_STAGGER_MS, ENTER_STAGGER_MAX_MS\)\)/.test(hook))
  check("the preview starts once the editor shows the frame", /window\.dispatchEvent\(new Event\(PREVIEW_SHOWN_EVENT\)\)/.test(code("components/onepage/preview-document.tsx")) && PREVIEW_SHOWN_EVENT === "onepage-preview-shown")
  check("blocks of one screen arrive one after another, never more than 400ms behind", ENTER_STAGGER_MS === 50 && ENTER_STAGGER_MAX_MS === 400)
  check("waiting is hidden and holds the server's fade; arriving is opacity and translate only", /\[data-op-enter="wait"\] \{\s*opacity: 0;\s*animation: none !important;/.test(css) && /@keyframes op-block-enter \{\s*from \{ opacity: 0; translate: 0 10px; \}/.test(css))
  check("reduced motion: nothing arrives, no block animation loops", /@media \(prefers-reduced-motion: reduce\) \{\s*\.onepage-live \[data-onepage-enter\],\s*\.onepage-live \[data-op-enter\] \{ animation: none !important; opacity: 1; \}/.test(css) && /\.animate-onepage-swipe::after \{ animation: none !important; \}/.test(css))
  check("a press keeps a block's animation running", /html\[data-op-press\] \.animate-onepage-pulse\[data-op-pressing\]:not\(#op\) \{ animation: onepage-pulse/.test(css))
  check("every block row the page builds can arrive (link pairs too)", /data-onepage-enter=\{animClass \? "" : undefined\} data-link-pair=""/.test(code("components/onepage/public-onepage.tsx")))
}

console.log("\n5. A narrow product card restacks instead of overlapping")
{
  const pb = code("components/onepage/product-block.tsx")
  check("the card is a size container", /"group\/pc @container block w-full/.test(pb))
  check("Compact card: under 18rem its button takes its own line", /flex flex-wrap items-center gap-3 p-2\.5 sm:p-3/.test(pb) && /ctaButton\(cn\("h-9 max-w-\[45%\] shrink-0[^"]*", NARROW_FULL\)\)/.test(pb))
  check("a price never pushes out of its column", /<span className="min-w-0 max-w-full truncate">\{now\}<\/span>/.test(pb))
  check("Side, Overlay, Button and Minimal restack or drop the old price too", /NARROW_COLUMN\)\}>\s*\{picture\("w-\[36%\]/.test(pb) && /bottom-0 flex items-end gap-3 p-4[^"]*", NARROW_COLUMN/.test(pb) && /NARROW_STACK\)\}>/.test(pb) && (pb.match(/NARROW_HIDE/g) || []).length >= 3)
}

console.log("\n6. Instagram in its current colours")
{
  const icons = read("components/onepage/brand-icons.tsx")
  check("the 2022 brand colours", /INSTAGRAM_STOPS = \["#FFD600", "#FF7A00", "#FF0069", "#D300C5", "#7638FA"\]/.test(icons))
  check("the glyph and the tile take them", /stopColor=\{INSTAGRAM_STOPS\[0\]\}/.test(icons) && /INSTAGRAM_FILL = `radial-gradient\([^`]*INSTAGRAM_STOPS\[4\]/.test(icons))
  const old = ["#fdf497", "#285AEB", "#FFDD55", "#833AB4", "#d6249f"]
  const files = ["components/onepage/brand-icons.tsx", "components/onepage/app-block.tsx", "components/onepage/app-block-editor.tsx"]
  check("none of the 2016 colours left on a OnePage", files.every((f) => !old.some((c) => code(f).toLowerCase().includes(c.toLowerCase()))))
  check("the onboarding's Instagram field shows the mark, not a generic outline", /<SocialIcon platform="instagram" tone="brand"/.test(read("components/onepage/onboarding-modal.tsx")) && !/<Instagram /.test(read("components/onepage/onboarding-modal.tsx")))
}

console.log("\n7. Measured in a browser")
{
  const probe = read("scripts/check-onepage-style-stability.mjs")
  check("the probe walks every theme the picker lists, live and in the preview frame", /window\.__themeIds/.test(probe) && /\/app\?editor&t=/.test(probe) && /\/app\?live&t=/.test(probe))
  check("it reads every box each frame from its first paint and fails on any change after it", /changed \$\{list\.length\}x after its first paint/.test(probe) && /requestAnimationFrame\(tick\)/.test(read("scripts/onepage-style-observe.js")))
  check("hover: one straight line in, one back, words readable on the fill", /function onLine/.test(probe) && /on the hover fill/.test(probe))
  check("products at full and half width from 320 to 1280", /\[320, 390, 768, 1280\]/.test(probe) && /p-half-/.test(read("scripts/render-onepage-style-stability.tsx")))
  check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes("tests/onepage-style-stability.test.ts"))
}

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
