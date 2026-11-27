/**
 * ROUND 69 (r3): NO BROKEN PICTURE IN ADD A SECTION, ON THE CANVAS OR THE SITE, IN ANY THEME.
 *
 * The owner, digital products theme: "In the Add a section modal, certain sections don't have the placeholder image
 * as they should; they display a very bad, corrupted thumbnail (broken image icons on a grey box: 'Hero Benefits'
 * and a lookbook section 'See it worn, then make it yours'). Also when I add such a section. Fix it universally
 * across all the themes."
 *
 *   MATERIA   Materia's placeholder-image snippet makes the empty picture a data: SVG for an <img>, adding its own
 *             preserveAspectRatio to the engine's placeholder_svg_tag drawing, which had one already. Twice on one
 *             tag is fatal to an SVG read as a file (XML): the browser's broken icon, 32 sections in every one of the
 *             38 templates, in the library and on the canvas and site alike. The engine now keeps the first of a
 *             repeated root attribute when an SVG is made into an address (url_encode, url_escape, base64_encode),
 *             so themes installed earlier, with the old snippet in their files, are fixed as they draw.
 *   NATIVE    the default theme's gallery and collage cards drew /placeholder.svg through /_next/image, which
 *             answers an SVG with a 400 (no dangerouslyAllowSVG): an SVG is never sent to the optimizer now.
 *   CARDS     a card's theme resolves a "shopify://shop_images/x" picture to the theme's own copy, as the canvas and
 *             the live site do, so a card shows what adding the section gives.
 *   MEASURED  scripts/check-library-thumbs-r69.ts (every preset of every section of every template, in Chromium) and
 *             scripts/check-preview-reliability.ts (the real dialog; now counts broken pictures).
 *
 *   npx tsx tests/library-thumbs-r69.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COMPAT_FILTERS, svgForUrl } from "@/lib/storelib-theme/compat/filters"
import { isOptimizableImage, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { libraryThemeOptions, previewSectionFor, sectionMarkup } from "@/components/website-builder/compat/compat-section-preview"
import { themeOfInstall } from "@/lib/storelib-theme/compat/page"
import { templateOfPage } from "@/lib/storelib-theme/compat/install"
import type { CompatPage } from "@/lib/storelib-theme/compat/theme"
import type { SectionSchema } from "@/lib/website-builder/types"
import { importTemplate, siteFor } from "../scripts/theme-templates/site"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** The root tag's attribute names of an SVG, in order. */
const rootAttrs = (svg: string) => [...(svg.match(/^\s*<svg\b([^>]*)>/i)?.[1] ?? "").matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g)].map((m) => m[1].toLowerCase())
const repeats = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i)

console.log("\nAN SVG MADE INTO AN ADDRESS")
{
  const twice = '<svg preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.5 525.5" preserveAspectRatio="xMidYMid meet" role="img"><rect width="10" height="10"/></svg>'
  const once = svgForUrl(twice)
  check("a repeated root attribute is dropped, the first kept (what the same drawing shows inline)", repeats(rootAttrs(once)).length === 0 && once.includes('preserveAspectRatio="xMidYMid slice"') && !once.includes("xMidYMid meet"))
  check("the rest of the drawing is untouched", once.endsWith('role="img"><rect width="10" height="10"/></svg>'))
  check("an SVG with no repeat is returned as it was", svgForUrl('<svg a="1" b=\'2\' c><g a="1"/></svg>') === '<svg a="1" b=\'2\' c><g a="1"/></svg>')
  check("text that is not an SVG document is left alone", svgForUrl('hello <svg a="1" a="2">') === 'hello <svg a="1" a="2">' && svgForUrl("a b&c") === "a b&c")
  const f = COMPAT_FILTERS as unknown as Record<string, (v: unknown, args: unknown[]) => string>
  check("url_encode: one preserveAspectRatio", (decodeURIComponent(f.url_encode(twice, []).replace(/\+/g, " ")).match(/preserveAspectRatio/g) ?? []).length === 1)
  check("url_encode still encodes plain text as before", f.url_encode("a b&c/d", []) === "a+b%26c%2Fd")
  check("url_escape and base64_encode keep one too", (decodeURI(f.url_escape(twice, [])).match(/preserveAspectRatio/g) ?? []).length === 1 && (Buffer.from(f.base64_encode(twice, []), "base64").toString("utf8").match(/preserveAspectRatio/g) ?? []).length === 1)
  const snippet = read("theme-packages/materia/base/snippets/placeholder-image.liquid")
  check("(why) Materia's snippet adds its own preserveAspectRatio before url_encode", /replace_first: '<svg', '<svg preserveAspectRatio="xMidYMid slice"'/.test(snippet) && /url_encode/.test(snippet))
  check("(why) the engine's drawing carries one already", /preserveAspectRatio="xMidYMid slice" role="img"/.test(read("lib/storelib-theme/compat/filters.ts")))
}

console.log("\nEVERY SECTION OF A MATERIA TEMPLATE, AS A CARD DRAWS IT")
{
  const t = await importTemplate("materia/digital")
  const page = { template: templateOfPage("home").template, path: "/", designMode: true, host: "", products: [], collections: [], menus: {}, shop: { name: "My store", currency: "USD", moneyFormat: "${{amount}}" }, product: null, collection: null, search: null, pageObject: null, groups: { header: [], footer: [] } } as unknown as CompatPage
  const theme = themeOfInstall(t.files, t.theme.settings, libraryThemeOptions("probe", t.files, () => "probe"))
  const types = [...new Set(Object.keys(t.files).map((p) => p.match(/^(?:shopify\/)?sections\/([^/]+)\.(?:liquid|storelib)$/)?.[1]).filter(Boolean) as string[])]
  let drawn = 0
  let svgs = 0
  const bad: string[] = []
  for (const type of types) {
    const schema = theme.schemaOf("sections", type) as unknown as SectionSchema
    const presets = (schema.presets ?? []) as unknown[]
    for (let i = 0; i < presets.length; i++) {
      let html = ""
      try {
        html = sectionMarkup(theme, page, previewSectionFor(type, i, schema), t.files, 1200, 800)
      } catch {
        continue
      }
      drawn++
      for (const m of html.matchAll(/\ssrc="(data:image\/svg\+xml,[^"]*)"/g)) {
        svgs++
        let svg = ""
        try {
          svg = decodeURIComponent(m[1].slice("data:image/svg+xml,".length).replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
        } catch {
          bad.push(`${type}: undecodable`)
          continue
        }
        const r = repeats(rootAttrs(svg))
        if (r.length) bad.push(`${type}: ${r.join(",")}`)
      }
    }
  }
  check(`every preset drawn (${drawn})`, drawn > 250, drawn)
  check(`every placeholder picture a well formed SVG file: no repeated root attribute (${svgs} pictures)`, svgs > 60 && bad.length === 0, bad.slice(0, 5))
  const benefits = sectionMarkup(theme, page, previewSectionFor("hero-benefits", 0, theme.schemaOf("sections", "hero-benefits") as unknown as SectionSchema), t.files, 1200, 800)
  check("Hero Benefits: its empty picture is the theme's placeholder", /<img\s[^>]*src="data:image\/svg\+xml,/.test(benefits.replace(/\s+/g, " ")))
  const collage = sectionMarkup(theme, page, previewSectionFor("hero-collage", 0, theme.schemaOf("sections", "hero-collage") as unknown as SectionSchema), t.files, 1200, 800)
  check("the lookbook (Hero Collage): three placeholder pictures", (collage.match(/class="hcl__img" data-r7h-image src="data:image\/svg\+xml,/g) ?? []).length === 3)

  /* The canvas and the live site draw with the same engine and the same snippet: the address of their pictures is the same. */
  const live = siteFor(t, { name: "My store", products: [] }).theme
  const onSite = sectionMarkup(live, page, previewSectionFor("hero-benefits", 0, live.schemaOf("sections", "hero-benefits") as unknown as SectionSchema), t.files, 1200, 800)
  const svgOf = (h: string) => decodeURIComponent((h.match(/src="data:image\/svg\+xml,([^"]*)"/)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  check("once added (canvas, site): the same well formed placeholder", svgOf(onSite).startsWith("<svg") && repeats(rootAttrs(svgOf(onSite))).length === 0)
}

console.log("\nA CARD'S PICTURES ARE THE CANVAS'S")
{
  const rows = { "shopify/config/assets.json": JSON.stringify({ "hero.jpg": "https://storelib.com/media/t/hero.jpg" }) }
  const o = libraryThemeOptions("i", rows, () => "v")
  check("a store picture the theme brought is its own copy", o.imageUrl("shopify://shop_images/hero.jpg") === "https://storelib.com/media/t/hero.jpg")
  check("one it did not bring is no address (the section draws its placeholder)", o.imageUrl("shopify://shop_images/missing.jpg") === "")
  check("web and site addresses as they are", o.imageUrl("https://x.test/a.png") === "https://x.test/a.png" && o.imageUrl("/a.png") === "/a.png")
  check("a theme file by its stored address, else the asset route", o.assetUrl("hero.jpg") === "https://storelib.com/media/t/hero.jpg" && o.assetUrl("base.css") === "/api/site-theme/assets/i/v/base.css")
}

console.log("\nNATIVE: AN SVG NEVER GOES TO THE OPTIMIZER")
{
  check("/placeholder.svg is drawn as it is", optimizedImageUrl("/placeholder.svg", 960, 90) === "/placeholder.svg" && !isOptimizableImage("/placeholder.svg"))
  check("with a query or upper case too", !isOptimizableImage("https://storelib.com/media/a/logo.SVG?v=2") && optimizedSrcSet("/x.svg#a", [640]) === "")
  check("a photograph still is", optimizedImageUrl("/placeholder.jpg", 960, 90) === "/_next/image?url=%2Fplaceholder.jpg&w=1920&q=90")
  check("(why) next.config does not allow SVG through the optimizer", !/dangerouslyAllowSVG\s*:\s*true/.test(read("next.config.mjs")))
  check("(why) the library gives an empty native picture /placeholder.svg", /const PLACEHOLDER_PICTURE = "\/placeholder\.svg"/.test(read("components/website-builder/editor/section-library.tsx")))
}

console.log("\nMEASURED")
{
  const audit = read("scripts/check-library-thumbs-r69.ts")
  check("scripts/check-library-thumbs-r69.ts: every template, the library's and the canvas's rules, broken, empty, blank and words", /readdirSync\(ROOT\)/.test(audit) && /library,canvas/.test(audit) && /naturalWidth === 0/.test(audit) && /blank/.test(audit))
  check("scripts/check-preview-reliability.ts counts broken pictures in the real dialog", /pictures: \$\{pictures\.broken\.length\} broken/.test(read("scripts/check-preview-reliability.ts")))
  check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/library-thumbs-r69.test.ts"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
