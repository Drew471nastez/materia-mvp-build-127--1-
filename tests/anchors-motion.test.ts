/**
 * ===========================================================================
 *  LINKS TO A SECTION, THE SCROLL TO IT, AND SECTIONS ARRIVING
 * ===========================================================================
 * "Scroll-to-section links that a non-technical person can set up", a smooth
 * scroll that lands under the header, and sections that animate in as they
 * scroll into view, the same in the builder and on the live site.
 *
 * The rules are pure (lib/website-builder/section-anchors.ts, link-menu.ts,
 * editor-navigation.ts) and run here; the wiring is read from source. The
 * motion itself is measured in Chromium by scripts/check-anchor-scroll.mjs
 * and scripts/check-section-reveal.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  anchorSlug,
  candidatesOf,
  easeInOutCubic,
  linkableSections,
  resolveSectionAnimation,
  resolveSectionHash,
  revealPlan,
  scrollDurationMs,
  sectionAnchor,
  sectionForHref,
  sectionHeading,
  sectionHref,
  splitSectionHref,
  themeAnimation,
  declaresOwnMotion,
  entranceSetting,
  tabSwitchUpgrade,
  withTabSwitchKey,
  type SectionLike,
} from "../lib/website-builder/section-anchors"
import { LINK_CATEGORIES, linkCategoryOf, linkMenu, sectionLinkTargets, sectionTargetFor, drillsIntoSections, picksDirectly } from "../lib/website-builder/link-menu"
import { editorPageKeyOf, editorPagePath, resolveEditorHref } from "../lib/website-builder/editor-navigation"
import { themeStylesheet } from "../lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "../lib/website-builder/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

/* A landing page as the builder stores it. The pricing section was saved
   with the id "pricing" by an older AI build, which is what "/#pricing"
   links in saved sites point at. */
const PAGE: SectionLike[] = [
  { id: "header-1", type: "header", name: "Header", settings: {} },
  { id: "hero-a1", type: "hero", name: "Hero", settings: { heading: "<p>Words that <strong>sell</strong></p>" } },
  { id: "svc-b2", type: "features_grid", name: "Features", settings: { heading: "Ghostwriting" } },
  { id: "pricing", type: "pricing_table", name: "Pricing table", settings: { title: "Plans &amp; prices" } },
  { id: "faq-c3", type: "faq_accordion", name: "FAQ", settings: {} },
  { id: "story-d4", type: "blocks_section", name: "Story", settings: {}, blocks: [{ type: "heading", settings: { text: "Our story" } }] },
  { id: "hidden-e5", type: "rich_text", name: "Draft", settings: { heading: "Not yet" }, hidden: true },
  { id: "footer-1", type: "footer", name: "Footer", settings: {} },
]

function main() {
  console.log("\nThe sections a link can point at")
  const links = linkableSections(PAGE)
  check("every section but the header, the footer and a hidden one, in page order",
    links.map((l) => l.id).join(",") === "hero-a1,svc-b2,pricing,faq-c3,story-d4", links.map((l) => l.id))
  check("named by what a visitor reads: the heading, as words",
    links.map((l) => l.label).join("|") === "Words that sell|Ghostwriting|Plans & prices|FAQ|Our story", links.map((l) => l.label))
  check("never by an id or a hash", links.every((l) => !l.label.includes("#") && !l.label.includes("section-")))
  check("a heading block counts as the heading", sectionHeading(PAGE[5]) === "Our story")
  check("each stored as a stable anchor from the instance id", links[0].anchor === "section-hero-a1" && sectionAnchor("x") === "section-x")
  check("with its page in the address, so a header link works from any page",
    sectionHref("pricing", "/") === "/#section-pricing" && sectionHref("x", "/about/") === "/about#section-x")
  check("and the hash alone on a product page, which is a template for many addresses", sectionHref("x", null) === "#section-x")

  console.log("\nThe link menu's \"Sections on this page\"")
  const targets = [
    ...sectionLinkTargets(PAGE, "/"),
    { href: "/", label: "Home", kind: "page" as const },
    { href: "/products", label: "Shop", kind: "page" as const },
    { href: "/about", label: "About", kind: "page" as const },
    { href: "/terms-of-service", label: "Terms of service", kind: "page" as const },
  ]
  const menu = linkMenu(targets)
  check("is a category of its own, first", menu[0]?.category.key === "sections" && menu[0].category.label === "Sections on this page")
  check("that opens onto its list rather than picking", !picksDirectly(menu[0]) && menu[0].targets.length === 5)
  check("a section target sorts there by its kind", linkCategoryOf({ href: "/#section-x", kind: "section" }) === "sections")
  check("a page with no sections has no such category", linkMenu(targets.filter((t) => t.kind !== "section")).every((e) => e.category.key !== "sections"))
  check("the category list still has no blogs", !LINK_CATEGORIES.some((c) => /blog/i.test(c.label)))
  check("home and the creator's pages open onto their own sections; the shop and policies do not",
    drillsIntoSections(targets[5]) && drillsIntoSections(targets[7]) && !drillsIntoSections(targets[6]) && !drillsIntoSections(targets[8]))

  console.log("\nA stored link is shown by its section's name")
  const name = (v: string, path: string | null = "/") => sectionTargetFor(v, targets, path)?.label ?? null
  check('"/#section-svc-b2", what the picker stores, is "Ghostwriting"', name("/#section-svc-b2") === "Ghostwriting")
  check('"#pricing" (a saved site\'s link) is the section saved with id pricing', name("#pricing") === "Plans & prices")
  check('"/#pricing" is the same section', name("/#pricing") === "Plans & prices")
  check('"#ghostwriting" finds the section headed "Ghostwriting"', name("#ghostwriting") === "Ghostwriting")
  check('"#faq" finds the FAQ by its name', name("#faq") === "FAQ")
  check('"#nowhere" is nothing, and the field keeps the text as typed', name("#nowhere") === null)
  check('"/about#pricing" is another page\'s, not this one\'s', name("/about#pricing") === null)
  check("another page's sections are matched once they are read",
    sectionTargetFor("/about#section-t1", [...targets, ...sectionLinkTargets([{ id: "t1", type: "team", settings: { heading: "Team" } }], "/about", undefined, "About")], "/")?.label === "Team")

  console.log("\nWhich section a hash means")
  const c = candidatesOf(PAGE)
  check("our own anchor first", resolveSectionHash("#section-faq-c3", c) === "faq-c3")
  check("then the instance id", resolveSectionHash("pricing", c) === "pricing")
  check("then the heading", resolveSectionHash("#Ghostwriting", c) === "svc-b2")
  check("then the type, or a type it starts (faq for faq_accordion)",
    resolveSectionHash("#features-grid", c) === "svc-b2" && resolveSectionHash("#features", c) === "svc-b2")
  check("an encoded hash is read as the words it is", resolveSectionHash("#plans%20%26%20prices", c) === "pricing")
  check("an own `anchor` setting is honoured", resolveSectionHash("#book", candidatesOf([{ id: "z", type: "cta", settings: { anchor: "Book" } }])) === "z")
  check("the header and the footer are never a target", resolveSectionHash("#header", c) === null && resolveSectionHash("#footer", c) === null)
  check("slugs are lower case, no accents, dashes", anchorSlug("  Café & Crème ") === "cafe-creme")
  check("sectionForHref reads the page from the address",
    sectionForHref("/#pricing", "/", PAGE)?.id === "pricing" && sectionForHref("/#pricing", "/about", PAGE) === null && sectionForHref("#pricing", "/about", PAGE)?.id === "pricing")
  check("an external address or a bare # is not a section link",
    splitSectionHref("https://x.com/#a") === null && splitSectionHref("#") === null && splitSectionHref("/about") === null && splitSectionHref("//x.com#a") === null)

  console.log("\nIn the builder's canvas")
  const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: false, shopPath: "/products", customPageKeys: ["lookbook"] }
  const d1 = resolveEditorHref("/#pricing", ctx)
  check('"/#pricing" on home scrolls to it (it was the top of the page)', d1.kind === "anchor" && d1.id === "pricing", d1)
  const d2 = resolveEditorHref("/lookbook#section-x", ctx)
  check('"/lookbook#section-x" from home opens the page and keeps the hash', d2.kind === "page" && d2.key === "lookbook" && d2.anchor === "section-x", d2)
  const d3 = resolveEditorHref("/lookbook#section-x", { ...ctx, currentPage: "lookbook" })
  check("and from that page it is a scroll", d3.kind === "anchor" && d3.id === "section-x", d3)
  check('"/" from home is still the top', resolveEditorHref("/", ctx).kind === "top")
  check("with the inspector on, a section's link still selects", resolveEditorHref("#pricing", { ...ctx, inspectorEnabled: true }).kind === "ignore")
  check("but the header's still scrolls", resolveEditorHref("/#pricing", { ...ctx, inspectorEnabled: true, fromNav: true }).kind === "anchor")
  check("a page's address, both ways", editorPagePath("home", "/products") === "/" && editorPagePath("login", "/products") === "/account/login" &&
    editorPagePath("lookbook", "/products") === "/lookbook" && editorPagePath("product", "/products") === null &&
    editorPageKeyOf("/", ctx) === "home" && editorPageKeyOf("/lookbook", ctx) === "lookbook" && editorPageKeyOf("/products/tote", ctx) === null)

  console.log("\nThe scroll")
  check("eases in and out, from 0 to 1", easeInOutCubic(0) === 0 && easeInOutCubic(1) === 1 && Math.abs(easeInOutCubic(0.5) - 0.5) < 1e-9 && easeInOutCubic(0.1) < 0.1 && easeInOutCubic(0.9) > 0.9)
  check("takes longer for further, never past a second", scrollDurationMs(300) < scrollDurationMs(3000) && scrollDurationMs(100000) === 1000 && scrollDurationMs(0) === 0 && scrollDurationMs(40) >= 380)

  console.log("\nHow sections arrive")
  const theme = { animations_enabled: true, animation_style: "fade-up" }
  check("the theme's choice, in the section's words", themeAnimation(theme) === "fade_up" && themeAnimation({ animations_enabled: true, animation_style: "zoom-in" }) === "zoom" && themeAnimation({ animations_enabled: true, animation_style: "fade-in" }) === "fade")
  check("off unless the theme switched it on", themeAnimation({}) === "none" && themeAnimation({ animations_enabled: false, animation_style: "zoom-in" }) === "none")
  check('a section\'s "theme" is the theme\'s', resolveSectionAnimation("theme", theme) === "fade_up" && resolveSectionAnimation(undefined, theme) === "fade_up")
  check("its own choice wins, both ways", resolveSectionAnimation("zoom", theme) === "zoom" && resolveSectionAnimation("none", theme) === "none" && resolveSectionAnimation("fade", {}) === "fade")
  check("anything unknown is the theme's", resolveSectionAnimation("spin", theme) === "fade_up")

  const boxes = [
    { type: "header", chrome: true },
    { type: "hero", chrome: false },
    { type: "features_grid", chrome: false },
    { type: "pricing_table", chrome: false, animation: "none" },
    { type: "faq_accordion", chrome: false, animation: "zoom" },
    { type: "marquee", chrome: false, ownMotion: true },
    { type: "rich_text", chrome: false },
    { type: "footer", chrome: true },
  ]
  const plan = revealPlan(boxes, theme)
  check("never the header or the footer", plan[0] === null && plan[7] === null)
  check("never the first section of the page", plan[1] === null)
  check("the others as the theme says", plan[2] === "fade_up" && plan[6] === "fade_up")
  check('a section set to "none" does not move', plan[3] === null)
  check("a section's own choice over the theme's", plan[4] === "zoom")
  check("a section with animation of its own is not animated twice", plan[5] === null)
  check("with the theme off, only a section that asked moves", revealPlan(boxes, {}).join(",") === ",,,,zoom,,,", revealPlan(boxes, {}))
  check("the first section is the first BODY section, whatever sits above it",
    revealPlan([{ type: "announcement", chrome: true }, { type: "header", chrome: true }, { type: "x", chrome: false }, { type: "y", chrome: false }], theme).join(",") === ",,,fade_up")
  check("own CSS animation is recognised", declaresOwnMotion("@keyframes rise{}") && declaresOwnMotion(".a{animation: rise 1s}") && !declaresOwnMotion(".a{transition: opacity 1s}"))

  console.log("\nThe stylesheet")
  const css = themeStylesheet({ animations_enabled: true } as ThemeSettingsValues)
  check("hides only what the runtime marked pending, so nothing is hidden without JavaScript",
    /\[data-reveal="pending"\]\{opacity:0;\}/.test(css) && !/storelibSectionIn/.test(css) && !/\[data-section\][^{]*\{animation:/.test(css))
  check("and never for somebody who asked for less motion", /@media \(prefers-reduced-motion:reduce\)\{[^}]*\[data-reveal\]\{opacity:1;\}/.test(css))
  check("a browser's own jump lands under the header by the measured offset", /\[data-section-box\][^{]*\{scroll-margin-top:var\(--sl-anchor-offset,0px\);\}/.test(css))

  console.log("\nWired the same in the canvas and on the live page")
  const renderer = read("components/website-builder/sections/SectionRenderer.tsx")
  check("every section's box carries its anchor and its key, in both",
    /data-anchor=\{sectionAnchor\(props\.section\.id\)\}/.test(renderer) && /data-section-key=\{props\.section\.id\}/.test(renderer))
  check("and its own animation choice", /data-animation=\{sectionAnimationAttr\(entranceSetting\(props\.section\)\)\}/.test(renderer))

  /* Tabs kept its tab switch in `animation` before `tab_animation`: that is not an entrance (it faded every tabs section in with the theme's animations off). */
  check("a tabs section saved before tab_animation has no entrance of its own", entranceSetting({ type: "tabs_content", settings: { animation: "fade" } }) === undefined)
  check("  one saved since keeps the entrance it chose", entranceSetting({ type: "tabs_content", settings: { tab_animation: "slide", animation: "zoom" } }) === "zoom")
  check("  every other section reads `animation` as before", entranceSetting({ type: "image_banner", settings: { animation: "fade" } }) === "fade")
  check("  the schema calls the switch tab_animation", /"id": "tab_animation",\s*"label": "Tab switch animation"/.test(read("themes/default/sections/tabs_content.json")) && !/"id": "animation"/.test(read("themes/default/sections/tabs_content.json")))
  const tabs = read("components/website-builder/sections/renderers/TabsContentSection.tsx")
  check("  and the section still reads an old saved switch", /str\(s\.tab_animation, str\(s\.animation, "fade"\)\)/.test(tabs))
  check("  a new tabs section is added with tab_animation, never animation", /"tab_animation": "fade"/.test(read("themes/default/sections/tabs_content.json")) && !/"animation": "fade"/.test(read("themes/default/sections/tabs_content.json")))
  const upgraded = withTabSwitchKey<{ type: string; settings: Record<string, unknown> }>({ type: "tabs_content", settings: { animation: "slide", heading: "x" } })
  check("  an old one is brought up to date as the editor loads it: the switch moved, the old key gone", upgraded.settings.tab_animation === "slide" && !("animation" in upgraded.settings) && upgraded.settings.heading === "x")
  check("    so setting its switch later never turns the old value into an entrance", entranceSetting({ ...upgraded, settings: { ...upgraded.settings, tab_animation: "none" } }) === undefined)
  check("    and the editor does it on every page it loads", /sec = withTabSwitchKey\(sec\)/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
  const write = tabSwitchUpgrade({ type: "tabs_content", settings: { animation: "fade" } }, { tab_animation: "slide" })
  check("  a write through the assistant or the agent API to an old one clears the old key", write.settings.tab_animation === "slide" && write.unset.join() === "animation")
  const designPanel = read("components/website-builder/editor/design-panels.tsx")
  check("  the panel offers the entrance for tabs too", /const own = entranceSetting\(section\)/.test(designPanel) && /const setAnimation = \(v: string\) => onUpdateSetting\("animation"/.test(designPanel))
  check("the panel says the first section shows without an entrance", /firstBody \? <p[^>]*>\{?"?The first section is on screen as the page opens, so it shows without an entrance\."?\}?/.test(designPanel) && /firstBody=\{sections\.find\(\(x\) => !x\.hidden && !isChromeType\(x\.type\)\)\?\.id === section\.id\}/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
  check("\"Same as theme\" names alternate sides, never fade up", /themeAlternates\(asRecord\(theme\)\) \? "alternate sides"/.test(designPanel))

  /* A changed setting plays in the editor: the edited section is on screen, and on screen is never hidden. */
  const revealCode = read("lib/website-builder/section-motion.ts")
  check("the reveal can play an entrance on what is in view", /preview: \(keys: string\[\] \| null\) => void/.test(revealCode) && /if \(r\.bottom <= view\.top \|\| r\.top >= view\.bottom\) return/.test(revealCode))
  check("  only what the plan animates: never the first section, the chrome or None", /const s = plan\[i\]\s*if \(!s \|\| b\.hasAttribute\("data-reveal"\)\) return/.test(revealCode))
  const motionHook = read("components/website-builder/theme/use-site-motion.ts")
  check("  the editor plays it after a change, never on first load or on the live page", /if \(!inEditor \|\| !before\) return/.test(motionHook) && /if \(before\.theme !== now\.theme\) return r\.preview\(null\)/.test(motionHook) && /if \(changed\.length\) r\.preview\(changed\)/.test(motionHook))
  check("  and the plan's key reads the same entrance the renderer does", /* Changed on purpose (merge with main): only the sections that chose their own entrance are named, by id. */ /const own = entranceSetting\(s\)\s*return own == null \? \[\] : \[\[s\.id, own\]\]/.test(motionHook))
  const themePage = read("components/website-builder/theme/ThemePage.tsx")
  check("the published box keeps its section-<id> id", /wrapperId=\{`section-\$\{section\.id\}`\}/.test(themePage))
  check("ThemePage runs the motion for every surface", /useSiteMotion\(rootRef, theme, sections, storefront\?\.inEditor === true\)/.test(themePage) && /ref=\{rootRef\}/.test(themePage))
  const hook = read("components/website-builder/theme/use-site-motion.ts")
  check("links and an arriving hash on the live page only", /if \(!root \|\| inEditor\) return\s*\n\s*return installSectionLinks\(root\)/.test(hook))
  const motion = read("lib/website-builder/section-motion.ts")
  check("the scroll is one requestAnimationFrame loop", /frame = requestAnimationFrame\(step\)/.test(motion))
  check("measured, not a number: the header's height when it stays on screen", /header\.offsetHeight/.test(motion) && /cs\.position !== "sticky" && cs\.position !== "fixed"/.test(motion))
  check("reduced motion lands without travel", /const duration = reduced \? 0 : scrollDurationMs\(distance\)/.test(motion))
  check("the address changes without a jump", /window\.history\.pushState\(window\.history\.state, "", url\.hash\)/.test(motion))
  check("a stylesheet's smooth scrolling is off while it runs", /styled\.style\.scrollBehavior = "auto"/.test(motion))
  check("sections are hidden only below the screen, and observed once", /if \(b\.getBoundingClientRect\(\)\.top < bottom\) return/.test(motion) && /io\.unobserve\(e\.target\)/.test(motion))
  /* Changed on purpose (the owner: the builder plays the theme's animations like the live site). Measured in scripts/check-section-reveal.mjs, "The builder's canvas, edited". */
  check("in the builder too: after an edit, a box not seen before is planned like any other, and none already seen is touched",
    /const rescan = \(\) => \{/.test(motion) && /if \(seen\.has\(b\)\) return\s*seen\.add\(b\)/.test(motion) && !/for \(const b of boxes\) seen\.add\(b\)/.test(motion) && /reveal\.current\?\.rescan\(\)/.test(hook))
  check("  a section added, removed or moved is not a new plan: only the sections that chose their own animation are named, by id",
    /* Changed on purpose (merge): read through entranceSetting, which a tabs section's own animation goes by. */ /body\.flatMap\(\(s\) => \{\s*const own = entranceSetting\(s\)\s*return own == null \? \[\] : \[\[s\.id, own\]\]/.test(hook))
  check("on opacity and transforms only", /fill: "backwards"/.test(motion) && !/(height|top|margin)\s*:/.test(motion.slice(motion.indexOf("function keyframesFor"), motion.indexOf("export interface Reveal"))))
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the menu drawer closes, then scrolls", /window\.setTimeout\(go, CLOSE_MS\)/.test(header) && /if \(!followSectionLink\(href\)(?: && !followSitePage\(href\))?\) window\.location\.assign\(href\)/.test(header))
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the canvas scrolls an anchor with the same code", /scrollToHash\(root, decision\.id, \{ scroller \}\)/.test(editor))
  check("a section link in preview scrolls the canvas", /if \(decision\.kind === "anchor"\) handleEditorNavigate\(href, inNav\)/.test(editor))
  check("a page opened by a section link goes on to the section", /pendingAnchor\.current = decision\.anchor \?\? null/.test(editor) && /scrollToHash\(root, anchor, \{ scroller \}\)/.test(editor))
  check("the link fields get the open page's sections and a reader for the others",
    /\.\.\.sectionTargets,/.test(editor) && (editor.match(/<LinkTargetsProvider targets=\{linkTargets\} sections=\{sectionSource\}>/g) ?? []).length === 2 && /linkSections: sectionSource/.test(editor))
  const picker = read("components/website-builder/link-picker.tsx")
  check("the field shows a section by its name with the section mark", /sections: Rows3/.test(picker) && /sectionTargetFor\(value,/.test(picker))
  check("a page's row opens its sections", /aria-label=\{`Sections on \$\{t\.label\}`\}/.test(picker) && /openSections\(t, false\)/.test(picker))
  const panel = read("components/website-builder/editor/design-panels.tsx")
  check("a section can choose its own animation, never the header or footer",
    /onUpdateSetting\("animation", v === "theme" \? undefined : v\)/.test(panel) && /!isChromeType\(section\.type\)/.test(panel))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
