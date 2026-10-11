/**
 * Add a section files an imported theme's sections by kind
 * (lib/website-builder/section-categories.ts), and the library lists those
 * kinds with their counts instead of putting every one under Created.
 *
 * The cases are real sections: Materia's Posturex (which names a category
 * on each preset, and runs words together in its file names), Shopify's
 * Horizon (whose preset categories are locale keys) and Dawn (which names
 * none).
 */
import { readFileSync } from "node:fs"
import { classifyImportedSection, IMPORTED_SECTION_CATEGORIES, normalizeWords, type ImportedSectionFacts } from "../lib/website-builder/section-categories"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const is = (facts: ImportedSectionFacts, want: string) => {
  const got = classifyImportedSection(facts)
  check(`${facts.presetName ?? facts.name} (${facts.type}) is ${want}`, got === want, { got })
}

console.log("\nBy name, file name and the preset's own category\n")
/* Posturex: a category on each preset, words run together in file names. */
is({ type: "hero-product2", name: "Hero Product 2", presetName: "Hero Product 2", presetCategory: "Hero" }, "hero")
is({ type: "featured-product2", name: "Product Spotlight Hero", presetName: "Product Spotlight Hero", presetCategory: "Products" }, "products")
is({ type: "collection-banner", name: "Collection Banner", presetName: "Collection Banner", presetCategory: "Collections" }, "collections")
is({ type: "collection-list", name: "Collections Display", presetName: "Collections Display", presetCategory: "Collections" }, "collections")
is({ type: "reviews2", name: "Testimonial Carousel Pro", presetName: "Testimonial Carousel Pro", presetCategory: "Testimonials" }, "testimonials")
is({ type: "comunitysldier", name: "Community Feedback Slider", presetName: "Community Feedback Slider", presetCategory: "Testimonials" }, "testimonials")
is({ type: "products-carousel", name: "Products carousel", presetName: "Product — Products Carousel", presetCategory: "Products" }, "products")
is({ type: "images-carousel", name: "Gallery Scrolling Logos", presetName: "Gallery Scrolling Logos", presetCategory: "Gallery" }, "media")
is({ type: "image-with-text-icons", name: "Image With Icons", presetName: "Image With Icons", presetCategory: "Image With Text" }, "media")
is({ type: "imagewithtextgrid", name: "Image With Text Grid", presetName: "Image With Text Grid", presetCategory: "Image With Text" }, "media")
is({ type: "wavyrichtextbanner", name: "Wavy Richtext Banner", presetName: "Wavy Richtext Banner", presetCategory: "Banners" }, "hero")
is({ type: "richtext1", name: "RichText Pro", presetName: "RichText Pro", presetCategory: "Text Content" }, "text")
is({ type: "faq-tabs", name: "FAQ Tabs", presetName: "FAQ Tabs", presetCategory: "FAQ" }, "faq")
is({ type: "countdown-flip", name: "Countdown Timer Flip", presetName: "Countdown Timer Flip", presetCategory: "Countdown Timers" }, "countdown")
is({ type: "coming-soon", name: "Coming Soon", presetName: "Coming Soon" }, "countdown")
is({ type: "benefits-bar", name: "Benefits Bar", presetName: "Benefits Bar", presetCategory: "Benefits" }, "features")
is({ type: "comparison-table", name: "Comparison Table", presetName: "Comparison Table", presetCategory: "Comparisons" }, "features")
is({ type: "payment-icons1", name: "Payment Icons Pro 1", presetName: "Payment Icons Pro 1", presetCategory: "Trust Signals" }, "logos")
is({ type: "brand-logo", name: "Brand logo", presetName: "Social — Brand Logo", presetCategory: "Social" }, "logos")
is({ type: "instagram-promo", name: "Instagram Promo Pro 1", presetName: "Instagram Promo Pro 1", presetCategory: "Social" }, "social")
is({ type: "contactformsimple2", name: "Contact Form Simple 2", presetName: "Contact Form Simple 2", presetCategory: "Contact" }, "contact")
is({ type: "google-map", name: "Google map", presetName: "Layout — Google Map", presetCategory: "Contact" }, "contact")
is({ type: "newsletter", name: "Newsletter", presetName: "Promo — Newsletter", presetCategory: "Promotional Popup" }, "newsletter")
is({ type: "waves-divider", name: "Waves Divider 2", presetName: "Waves Divider 2", presetCategory: "Dividers" }, "layout")
is({ type: "slideshow", name: "Slideshow", presetName: "Slideshow", presetCategory: "Hero" }, "slideshow")

console.log("\nWhat a name settles on its own\n")
is({ type: "size-chart-popup", name: "Size Chart Popup", presetName: "Size Chart Popup", presetCategory: "Product" }, "popups")
is({ type: "fake-order", name: "Order Notification Pro 1", presetName: "Order Notification Pro 1", presetCategory: "Promotional Popup" }, "popups")
is({ type: "top-bar", name: "Announcement Bar Pro 3", presetName: "Announcement Bar Pro 3", presetCategory: "Announcement Bars" }, "announcements")
is({ type: "before-and-after-slider", name: "Before and After Slider", presetName: "Before and After Image Slider", presetCategory: "Comparisons" }, "media")
is({ type: "before-and-after-image", name: "Before/After Images", presetName: "Before After Comparison Images", presetCategory: "Comparisons" }, "media")
is({ type: "custom-liquid", name: "Custom liquid", presetName: "Content — Custom Liquid", presetCategory: "Custom Code" }, "other")
is({ type: "promo", name: "Promo", groups: ["overlay"] }, "popups")

console.log("\nA preset category that is a locale key (Horizon)\n")
is({ type: "section", name: "Section", presetName: "FAQ", presetCategory: "t:categories.text" }, "faq")
is({ type: "section", name: "Section", presetName: "Icons with text", presetCategory: "t:categories.text" }, "features")
is({ type: "section", name: "Section", presetName: "Contact form", presetCategory: "t:categories.forms" }, "contact")
is({ type: "custom-liquid", name: "Custom Liquid", presetName: "Custom Liquid", presetCategory: "t:categories.layout" }, "other")
is({ type: "featured-blog-posts", name: "Blog posts", presetName: "Blog posts: Grid", presetCategory: "t:categories.storytelling" }, "blog")
is({ type: "product-hotspots", name: "Product hotspots", presetName: "Product hotspots", presetCategory: "t:categories.products" }, "products")
is({ type: "layered-slideshow", name: "Layered slideshow", presetName: "Layered slideshow", presetCategory: "t:categories.banners" }, "slideshow")
check("a locale key's dotted path never reads as a category word", classifyImportedSection({ type: "section", name: "Section", presetName: "Thing", presetCategory: "t:categories.layout" }) === "other")

console.log("\nNo category on the preset (Dawn)\n")
is({ type: "image-banner", name: "Image banner" }, "hero")
is({ type: "image-with-text", name: "Image with text", blockTypes: ["heading", "text", "button"] }, "media")
is({ type: "multicolumn", name: "Multicolumn" }, "features")
is({ type: "collapsible-content", name: "Collapsible content" }, "faq")
is({ type: "featured-collection", name: "Featured collection" }, "collections")
is({ type: "featured-product", name: "Featured product" }, "products")
is({ type: "main-blog", name: "Blog posts" }, "blog")
is({ type: "email-signup-banner", name: "Email signup banner" }, "newsletter")
is({ type: "rich-text", name: "Rich text" }, "text")
is({ type: "apps", name: "Apps" }, "other")

console.log("\nWhen the names say nothing: what it is made of\n")
is({ type: "s-blocks", name: "Block", blockTypes: ["slide"], settingTypes: ["product"] }, "products")
is({ type: "zz", name: "Thing", settingTypes: ["collection_list"] }, "collections")
is({ type: "zz", name: "Thing", groups: ["footer"] }, "layout")
check("a block type never outweighs the section's own name", classifyImportedSection({ type: "image-with-text", name: "Image with text", blockTypes: ["testimonial", "review", "faq_item"] }) === "media")

console.log("\nThe same answer every time, and only categories the library knows\n")
const ids = new Set<string>(IMPORTED_SECTION_CATEGORIES.map((c) => c.id))
const facts: ImportedSectionFacts = { type: "heroproduct1", name: "Hero Product 1", presetName: "Hero Product 1", presetCategory: "Hero", blockTypes: ["rating", "image"] }
check("deterministic", classifyImportedSection(facts) === classifyImportedSection({ ...facts }))
check("every answer is a listed category", ["", "x", "Popup", "Gallery", "t:categories.banners"].every((n) => ids.has(classifyImportedSection({ type: n, name: n, presetCategory: n }))))
check("labels are plain and say no platform name", IMPORTED_SECTION_CATEGORIES.every((c) => !/shopify|liquid/i.test(c.label) && !/—/.test(c.label)))
check("words run together in a file name are read apart", classifyImportedSection({ type: "testimonialslider3", name: "X" }) === "testimonials" && normalizeWords("A-B_C/D") === " a b c d ")

console.log("\nThe library uses it for an imported theme\n")
{
  const library = readFileSync("components/website-builder/editor/section-library.tsx", "utf8")
  check("an imported theme's sections are filed by kind, not under Created", /compatInstallId && schema\.imported\s*\?\s*classifyImportedSection\(/.test(library))
  check("the categories are listed with their counts", /data-category-count/.test(library))
  check("search still looks through everything, whatever category is chosen", /words\.length \? words\.every\(\(w\) => e\.haystack\.includes\(w\)\)/.test(library))
  check("the category's name is something search finds too", /haystack: `\$\{name\} \$\{schema\.name\} \$\{label\}/.test(library))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
