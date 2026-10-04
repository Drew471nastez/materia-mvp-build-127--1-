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
  type SectionLike,
} from "../lib/website-builder/section-anchors"
import { LINK_CATEGORIES, linkCategoryOf, linkMenu, sectionLinkTargets, sectionTargetFor, drillsIntoSections, picksDirectly } from "../lib/website-builder/link-menu"
import { editorPageKeyOf, editorPagePath, resolveEditorHref } from "../lib/website-builder/editor-navigation"
import { themeStylesheet } from "../lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "../lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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
  check("and its own animation choice", /data-animation=\{sectionAnimationAttr\(props\.section\.settings\?\.animation\)\}/.test(renderer))
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
  check("on opacity and transforms only", /fill: "backwards"/.test(motion) && !/(height|top|margin)\s*:/.test(motion.slice(motion.indexOf("function keyframesFor"), motion.indexOf("export interface Reveal"))))
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the menu drawer closes, then scrolls", /window\.setTimeout\(go, CLOSE_MS\)/.test(header) && /if \(!followSectionLink\(href\)\) window\.location\.assign\(href\)/.test(header))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
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
