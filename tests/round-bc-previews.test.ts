/**
 * ===========================================================================
 *  ROUND BC: EVERY CARD IN ADD A SECTION SHOWS ITS SECTION
 * ===========================================================================
 * The owner, on the imported Materia theme: many cards ("Community Feedback
 * Slider", "Contact Form Simple", "Content Tabs") were grey boxes with the
 * section's name, previews came and went, showed odd words, and changed one
 * another. Now:
 *
 *   a section that is all blocks, with a preset that has none, is drawn with
 *   a few of its own blocks (lib/website-builder/preview-markup.ts);
 *   words in any element count as something to see, and a card measured
 *   while put away is never named for good;
 *   no <noscript> words, and a theme's `no-js` is drawn as `js`;
 *   each card's own styles are kept to its card (@scope);
 *   Storelib's reviews and breadcrumbs sections are drawn with samples;
 *   what still cannot be pictured shows one designed card (preview-fallback.tsx).
 *
 * The browser half is scripts/check-preview-reliability.ts.
 *
 * Run with:  npx tsx tests/round-bc-previews.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { markupLooksEmpty, sampleBlocks } from "../lib/website-builder/preview-markup"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { schemasFromSources } from "../lib/website-builder/storelib-schemas"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

;(async () => {
  console.log("\nSample blocks for a preset with none")
  {
    const one = sampleBlocks([{ type: "review", fields: [{ id: "quote", default: "Best" }, { id: "author" }] }], undefined, "p")
    check("one block type: three of it, filled with its defaults", one.length === 3 && one.every((b) => b.type === "review" && b.settings.quote === "Best" && !("author" in b.settings)), one)
    check("  each with an id of its own", new Set(one.map((b) => b.id)).size === 3)
    const many = sampleBlocks([{ type: "heading", limit: 1, fields: [] }, { type: "tab", fields: [] }, { type: "@app" }, { type: "_private", private: true }], undefined, "p")
    check("several types: one of each, no app blocks, no private theme blocks", many.map((b) => b.type).join(",") === "heading,tab", many)
    check("a type's limit holds", sampleBlocks([{ type: "x", limit: 2, fields: [] }], undefined, "p").length === 2)
    check("the section's max_blocks holds", sampleBlocks([{ type: "x", fields: [] }], 1, "p").length === 1)
    check("a block preset's settings are laid over the defaults", sampleBlocks([{ type: "x", fields: [{ id: "a", default: 1 }], presets: [{ settings: { a: 2 } }] }], undefined, "p")[0].settings.a === 2)
    check("no block types: none", sampleBlocks(undefined, undefined, "p").length === 0)
  }

  console.log("\nWhat counts as nothing to see")
  {
    check("a shell with padding and styles is empty", markupLooksEmpty('<style>.a{padding:90px}</style><div class="a"><div class="track"> </div></div>'))
    check("words only in <noscript> are empty", markupLooksEmpty("<div><noscript>Turn on JavaScript</noscript></div>"))
    check("a word is something", !markupLooksEmpty("<div><blockquote>Best</blockquote></div>"))
    check("a picture is something", !markupLooksEmpty('<div><img src="/a.png"></div>'))
    check("a field is something", !markupLooksEmpty('<form><input type="text"></form>'))
    check("&nbsp; alone is empty", markupLooksEmpty("<p>&nbsp;</p>"))
  }

  console.log("\nAn imported theme's cards (tests/fixtures/shopify-preview-stress)")
  {
    /* The library module is a client one; its pure exports are read through a dynamic import so this file stays a plain test. */
    const { previewSectionFor, sectionMarkup } = await import("../components/website-builder/compat/compat-section-preview")
    const zip = new JSZip()
    const root = join(process.cwd(), "tests/fixtures/shopify-preview-stress")
    const walk = (dir: string, rel: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
        else zip.file(`${rel}${n}`, readFileSync(p))
      }
    }
    walk(root, "")
    const r = await convertShopifyTheme(zip)
    if (!r.ok) {
      check("the fixture converts", false, r)
      process.exit(1)
    }
    const rows = r.theme.files as Record<string, string>
    const theme = themeOfInstall(rows, r.theme.settings, { assetUrl: (n: string) => `/a/${n}`, assetText: () => null })
    const schemas = schemasFromSources(Object.fromEntries(Object.entries(rows).filter(([p]) => p.endsWith(".storelib"))))
    const page = { template: "index", path: "/", designMode: true, host: "", products: [], collections: [], menus: {}, shop: { name: "My store", currency: "USD", moneyFormat: "${{amount}}" }, product: null, collection: null, search: null, pageObject: null, groups: { header: [], footer: [] } }
    const draw = (type: string, sample: boolean) => sectionMarkup(theme, page as never, previewSectionFor(type, 0, schemas[type], sample), rows, 1200, 800)
    check("Content Tabs as its preset gives it: nothing to see", !!schemas["content-tabs"] && markupLooksEmpty(draw("content-tabs", false)))
    const tabs = draw("content-tabs", true)
    check("  with sample blocks: its heading and its cards", tabs.includes("Inside the formula.") && (tabs.match(/L-Citrulline/g) ?? []).length === 1, tabs.slice(0, 400))
    const slider = draw("comunitysldier", true)
    check("Community Feedback Slider with sample blocks: three reviews", (slider.match(/Best purchase this year\./g) ?? []).length === 3)
    check("  and none of its <noscript> words", !/noscript|turn on JavaScript/i.test(slider))
    const form = draw("contactformsimple", true)
    check("Contact Form Simple with sample blocks: its fields", (form.match(/<input\b/g) ?? []).length >= 3)
    check("a preset that has blocks keeps its own", previewSectionFor("content-tabs", 0, { ...schemas["content-tabs"], presets: [{ name: "x", settings: {}, blocks: [{ id: "h", type: "heading", settings: { heading: "Mine" } }] }] }, true).blocks?.length === 1)
  }

  console.log("\nThe library's code")
  {
    const cs = read("components/website-builder/compat/compat-section-preview.tsx")
    check("a card is measured shown, whatever put it away", /* Changed on purpose (round 45: what is shown or put away is the card's box, frameOf) */ /private measure\(key: string, w: HTMLElement\) \{[\s\S]{0,900}const box = frameOf\(w\)\s*box\.hidden = false/.test(cs))
    check("words in any element count (a tree walk over its text)", /function somethingToSee[\s\S]{0,800}createTreeWalker\(root, NodeFilter\.SHOW_TEXT\)/.test(cs))
    check("a blank card is drawn again with its own blocks, once", /if \(!shows && !this\.sampled\.has\(key\)\)/.test(cs))
    check("each card's own <style>s are put in an @scope of its wrapper", /@scope \(\$\{scope\}\)/.test(cs) && /keepStylesInside\(w, key\)/.test(cs))
    check("  not the theme's stylesheets carried in", /style:not\(\[data-sheet-from\]\)/.test(cs))
    check("<noscript> taken out, `no-js` drawn as `js`", /<noscript\\b/.test(cs) && /no-js\\b\/i, "\$1js"/.test(cs))
    check("a slider a script would start is shown", /\.slick-slider,\.swiper,\.splide/.test(cs))
    check("a named card is the designed fallback, saying why", /<PreviewFallback title=\{schema\.name\} reason=\{unavailable \|\| sheet\?\.cannotDraw\(key\) \? "unavailable" : "empty"\} \/>/.test(cs))
    const lib = read("components/website-builder/editor/section-library.tsx")
    check("Storelib's cards: sample reviews and a shop name", /sampleStorefrontReviews\(readReviewsApp\(\{ enabled: true \}\), ""\)/.test(lib) && /<StorelibLiveProvider sources=\{job\.sources\} inEditor=\{floats\} preview data=\{previewStorefront\(\)\}>/.test(lib))
    check("  a blank card drawn again with sample blocks, then with placeholder pictures", /drawWith\(job, true, false\)/.test(lib) && /drawWith\(job, sample, true\)/.test(lib) && /PLACEHOLDER_PICTURE = "\/placeholder\.svg"/.test(lib))
    check("  the empty card is the shared fallback", /function EmptyPreview\(\{ title \}: \{ title: string \}\) \{\s*return <PreviewFallback title=\{title\} \/>/.test(lib))
    const live = read("components/website-builder/sections/storelib-live.tsx")
    check("Breadcrumbs gets a product page's trail in a card", /if \(preview && Array\.isArray\(out\.breadcrumbs\) && out\.breadcrumbs\.length === 0\) out\.breadcrumbs = breadcrumbTrail/.test(live))
    const fb = read("components/website-builder/editor/preview-fallback.tsx")
    check("the fallback's words go through tt()", /tt\("No preview for this section"\)/.test(fb) && /tt\("Shows once it has content"\)/.test(fb))
    for (const code of ["de", "es", "fr", "it", "pl", "pt-BR"]) check(`  "No preview for this section" in ${code}`, read(`lib/i18n/catalog/${code}.ts`).includes('"No preview for this section":'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
})()
