/**
 * Round 58 (f1): the website builder's two big pickers.
 *
 *   THE THEME MARKETPLACE (app/(storelib)/app/website-builder/themes/
 *   themes-client.tsx): a bottom sheet on a phone (the shared one, with its
 *   handle, safe areas and scroll inside), the order as Storelib's action
 *   menu rather than a <select>, the categories as the builder's chips with
 *   words that cannot be selected, and a category switch that hides and
 *   shows kept cards (no remount, no fade over the grid) with every cover
 *   fetched and decoded ahead.
 *
 *   ADD A SECTION (components/website-builder/editor/section-library.tsx):
 *   All in the order a page is built (lib/website-builder/all-sections-order.ts),
 *   heroes first and announcement bars, dividers and pop ups last.
 *
 * scripts/check-builder-modals-r58.mjs measures both in Chromium at 360,
 * 390, 768 and 1280.
 */
import { readdirSync } from "node:fs"
import { readCode, readSource } from "./_source"
import { ALL_SECTIONS_ORDER, familyPrefixes, orderForAll, sectionKind } from "../lib/website-builder/all-sections-order"
import { classifyImportedSection } from "../lib/website-builder/section-categories"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

console.log("\nThe order of All\n")
{
  const kinds = ALL_SECTIONS_ORDER.map((k) => k.kind)
  const at = (k: string) => kinds.indexOf(k as never)
  check("hero, then products and collections, image with text, rich text, testimonials", ["hero", "products", "collections", "image-with-text", "rich-text", "testimonials"].every((k, i, a) => i === 0 || at(a[i - 1]) < at(k)))
  check("announcement bars, dividers and pop ups come after everything that makes a page", ["announcements", "layout", "popups", "other"].every((k) => at(k) > at("countdown")))
  check("every kind says why it sits where it does", ALL_SECTIONS_ORDER.every((k) => k.why.length > 20 && !/—/.test(k.why)))
  check("every category an imported theme is filed under has a place", ["hero", "slideshow", "text", "media", "products", "collections", "features", "testimonials", "logos", "social", "faq", "countdown", "newsletter", "blog", "contact", "announcements", "layout", "popups", "other"].every((k) => at(k) >= 0))

  const f = (type: string, name: string, category?: string) => ({ type, name, category: category ?? classifyImportedSection({ type, name }), imported: true })
  check("Image with text is its own kind, ahead of the other pictures", sectionKind(f("image-with-text-grid", "Image With Text Grid")) === "image-with-text" && sectionKind(f("gallery-grid1", "Gallery Grid 1")) === "media")
  check("Rich text is its own kind, ahead of the other text", sectionKind(f("richtext1", "RichText Pro", "text")) === "rich-text" && sectionKind(f("text-heading", "Text Heading")) === "text")
  check("a Storelib theme's own categories are read from the names", sectionKind({ type: "collection_featured", name: "Featured collection", category: "products" }) === "collections" && sectionKind({ type: "promo_announcement", name: "Announcement bar", category: "marketing" }) === "announcements" && sectionKind({ type: "back_to_top", name: "Back to top", category: "overlay" }) === "popups")

  /* Materia's file order, the way All used to open. */
  const materia = [
    f("addtocartbutton", "Quick Add to Cart"), f("annoucment-bar-scrolling", "Announcement Bar Pro 1"), f("announcement-bar", "Announcement Bar Pro 2"),
    f("back-to-top-pro", "Back To Top Pro"), f("banner3", "Promo Banner 3"), f("divider", "Divider"), f("faq1", "FAQ 1"), f("featured-product", "Featured product"),
    f("coach-hero", "Coach hero"), f("coach-quote", "Coach client quote"), f("coach-steps", "Coach steps"), f("coach-offers", "Coach ways to work"),
    f("hero-image1", "Hero Image 1"), f("image-with-text-steps", "Image With Text Steps", "media"), f("collection-list", "Collections Display"),
    f("richtext1", "RichText Pro", "text"), f("testimonial-wall", "Testimonial Wall"), f("promotion-popup", "Promotion popup"), f("custom-liquid", "Custom code"),
  ]
  const names = orderForAll(materia, (x) => x).map((x) => x.name)
  check("Materia's All opens on a hero, not on an announcement bar", names[0] === "Hero Image 1", names.slice(0, 4))
  check("  then a featured product before the quick add button", names.indexOf("Featured product") < names.indexOf("Quick Add to Cart"))
  check("  products, collections, image with text, rich text, testimonials, in that order", ["Featured product", "Collections Display", "Image With Text Steps", "RichText Pro", "Testimonial Wall"].every((n, i, a) => i === 0 || names.indexOf(a[i - 1]) < names.indexOf(n)), names)
  const utility = ["Announcement Bar Pro 1", "Announcement Bar Pro 2", "Divider", "Back To Top Pro", "Promotion popup", "Custom code"]
  check("  the bars, then the divider, then the pop ups, then custom code, after every page section", utility.every((n, i) => i === 0 || names.indexOf(utility[i - 1]) < names.indexOf(n)) && names.indexOf(utility[0]) > names.indexOf("FAQ 1"), names)
  check("  a theme's general hero before one made for a single template (coach-)", names.indexOf("Hero Image 1") < names.indexOf("Coach hero") && familyPrefixes(materia.map((x) => ({ type: x.type, kind: sectionKind(x) }))).has("coach"))
  check("  stable: the same list comes out the same", JSON.stringify(orderForAll(materia, (x) => x)) === JSON.stringify(orderForAll([...materia], (x) => x)))

  /* Every section file Materia ships: nothing is lost, and nothing utility comes before the first hero. */
  const files = readdirSync("theme-packages/materia/base/sections").filter((n) => n.endsWith(".liquid")).map((n) => n.replace(/\.liquid$/, ""))
  const all = orderForAll(files.map((t) => f(t, t.replace(/[-_]/g, " "))), (x) => x)
  const firstUtility = all.findIndex((x) => ["announcements", "layout", "popups", "other"].includes(sectionKind(x)))
  check("Materia's whole shelf: every file kept, and the page making kinds all come before the utility ones", all.length === files.length && all.slice(firstUtility).every((x) => ["announcements", "layout", "popups", "other"].includes(sectionKind(x))), { files: files.length, firstUtility })
  check("  and it starts with a hero", sectionKind(all[0]) === "hero", all[0])

  const lib = readCode("components/website-builder/editor/section-library.tsx")
  check("the library's entries go through orderForAll", /return orderForAll\(out, \(e\) => \(\{ category: e\.category, type: e\.type, name: e\.schema\.name, presetName: e\.title, imported:/.test(lib))
}

console.log("\nThe theme marketplace\n")
{
  const src = readCode("app/(storelib)/app/website-builder/themes/themes-client.tsx")
  const raw = readSource("app/(storelib)/app/website-builder/themes/themes-client.tsx")
  check("a phone gets the shared bottom sheet, fixed height, its own scroller, under 768px", /<BottomSheet\b[\s\S]{0,400}hideFrom="md"[\s\S]{0,60}fill[\s\S]{0,60}height=\{SHEET_HEIGHT\}/.test(src) && /PHONE_QUERY = "\(max-width: 767\.98px\)"/.test(src) && /data-themes-scroll=""[\s\S]{0,200}overflow-y-auto overscroll-contain/.test(src))
  check("  the sheet stops short of the top, inside the safe area", /SHEET_HEIGHT = "calc\(100dvh - max\(env\(safe-area-inset-top\), 12px\) - 32px\)"/.test(src) && /env\(safe-area-inset-left\)/.test(src))
  check("  and sits under a theme's preview (z-index 50), as the window did", /zIndex=\{50\}/.test(src))
  check("the order is Storelib's action menu, not a <select>", !/<select\b/.test(src) && /<ResponsiveActionMenu\b[\s\S]{0,60}title=/.test(src) && /"Sort by"/.test(src) && /id: `sort-\$\{s\.id\}`/.test(src))
  check("  the chosen order wears a check, the others keep its room", /<Check className=\{cn\(s\.id === value \? "text-\[#1a1a2e\]" : "opacity-0"\)\}/.test(src))
  check("the categories are the builder's chips: dark when chosen, grey otherwise, words not selectable", /on \? "bg-\[#1a1a2e\] text-white" : "bg-\[#f3f4f6\] text-\[#4b5563\]/.test(src) && /data-themes-categories=""[\s\S]{0,200}select-none/.test(src) && /rounded-full px-4/.test(src))
  check("a category hides kept cards (a box round each), it does not mount new ones", /<div key=\{l\.slug\} data-themes-cell="" hidden=\{!inView\(l\)\}/.test(src) && !/shown\.map\(/.test(src))
  check("  and nothing fades over the grid on a switch", !/\.animate\(\[\{ opacity: 0\.25/.test(src) && !/GRID_SWAP_MS/.test(src))
  check("  every cover is asked for when built and decoded ahead, off the page and without a render", /\beager\b/.test(src) && /warmTemplateCover\(l, "lg"\)/.test(src) && /const warmed = React\.useRef\(false\)/.test(src) && !/setWarm\(/.test(src))
  check("  the card is memoised and its handlers are kept per theme", /export const ThemeTemplateCard = React\.memo\(/.test(readCode("components/website-builder/theme-template-card.tsx")) && /handlers\.get\(l\.slug\)!\.preview/.test(src))
  check("no AI words or em dashes in what it says", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform your)\b/i.test(raw.replace(/transform(:|,| and| on| is| free| only|=| \(|\))/g, "")) && !/tt\("[^"]*—/.test(raw))

  const card = readCode("components/website-builder/theme-template-card.tsx")
  check("a warmed cover is fetched with the card's own srcset and sizes, then counted as drawn", /export function warmTemplateCover\(listing: ThemeListing, size: "sm" \| "lg"\)/.test(card) && /img\.sizes = TEMPLATE_CARD_SIZES\[size\]/.test(card) && /img\.decode\(\)\.then\(\s*\(\) => \{\s*SEEN\.add\(picture\)/.test(card))
  check("an eager card asks at a low priority unless it is on the first screen", /loading=\{priority \|\| seen \|\| eager \? "eager" : "lazy"\}/.test(card) && /fetchPriority=\{priority \? "high" : eager \? "low" : undefined\}/.test(card))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
