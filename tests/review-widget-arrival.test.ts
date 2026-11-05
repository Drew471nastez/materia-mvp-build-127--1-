/**
 * ===========================================================================
 *  STORELIB REVIEWS › ADD TO WEBSITE, THROUGH TO THE BUILDER
 * ===========================================================================
 * The gallery's choice (which page, where on it) becomes the builder's
 * address (lib/reviews/widgets/placement.ts), and the builder adds the
 * section once the page asked for is the page open
 * (lib/reviews/widgets/arrival.ts). The owner's report: "it opens the
 * builder and nothing is added". A product page from the address is drawn
 * twice (the generic template, then the product's own page over it) and the
 * section went in on the first and was thrown away with it; an imported
 * theme got Storelib's section before its own files were in.
 *
 * Here the editor's order of events is played step by step, each step a
 * commit the arrival effect sees, and the section is put in with the same
 * placeSection the editor's addSection uses.
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/review-widget-arrival.test.ts
 */
import { readFileSync } from "node:fs"
import { editorAddress, readPlacement } from "../lib/reviews/widgets/placement"
import { planWidgetArrival, readWidgetArrival, type ArrivalState, type WidgetArrival } from "../lib/reviews/widgets/arrival"
import { placeSection, splitGroups } from "../lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"
import { customSectionSchemas } from "../lib/website-builder/storelib-schemas"
import { REVIEW_WIDGET_SECTION_TYPE, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${JSON.stringify(detail)}` : ""}`)
  }
}

const CONFIG = "3f2a6c1e-9b4d-4e8a-a1c2-0d9e8f7a6b5c"
type S = { id: string; type: string; group?: string; settings?: Record<string, unknown> }

/** The editor's addSection for this path: the list index turned into one inside the page's own sections, as it does. */
function add(sections: S[], plan: NonNullable<ReturnType<typeof planWidgetArrival>>): S[] {
  const header = splitGroups(sections).header.length
  const template = splitGroups(sections).template.length
  const section: S = { id: `${plan.type}-new`, type: plan.type, settings: plan.settings }
  return placeSection(sections, section, { groups: ["template"], group: "template", at: plan.at != null ? Math.max(0, Math.min(template, plan.at - header)) : null }).sections
}

/** The arrival effect over a run of commits: returns the sections after the last one, and the commit it added at. */
function play(href: string, commits: (Omit<ArrivalState, "headerCount" | "schemaOf"> & { schemas: Record<string, unknown>; replaceSections?: boolean })[]) {
  const read = readWidgetArrival(href)
  let want: WidgetArrival | null = read.want
  let sections: S[] = []
  let addedAt = -1
  commits.forEach((c, i) => {
    /* A commit that puts a page in replaces what was there, as handleSelectProductPage does. */
    if (c.replaceSections !== false) sections = c.sections as S[]
    if (!want) return
    const plan = planWidgetArrival(want, { ...c, sections, headerCount: splitGroups(sections).header.length, schemaOf: (t) => c.schemas[t] as never })
    if (!plan) return
    want = null
    addedAt = i
    sections = add(sections, plan)
  })
  return { sections, addedAt, cleaned: read.cleaned }
}

const header: S = { id: "header", type: "header" }
const footer: S = { id: "footer", type: "footer" }
const genericProduct: S[] = [header, { id: "product", type: "product", settings: {} }, { id: "related", type: "related_products" }, footer]
const realProduct: S[] = [header, { id: "product", type: "product", settings: { _product_data: { slug: "linen-apron" } } }, { id: "related", type: "related_products" }, footer]
const home: S[] = [header, { id: "hero", type: "hero" }, { id: "grid", type: "product_grid" }, footer]

function addressChecks() {
  console.log("\nThe gallery's choice, as the builder's address")
  const want = readPlacement(new URLSearchParams({ widget: "product_reviews", page: "product", placement: "below_product", config: CONFIG }))!
  const href = `https://storelib.com${editorAddress("inst-1", want, "linen-apron")}`
  const read = readWidgetArrival(href)
  check("the builder reads the widget, the look and the place", read.want?.widget === "product_reviews" && read.want.config === CONFIG && read.want.placement === "below_product", read)
  check("  and the address keeps only the page", read.cleaned === "/website-builder/editor/inst-1?previewPath=%2Fproducts%2Flinen-apron", read.cleaned)
  check("an address asking nothing is left alone", readWidgetArrival("https://storelib.com/website-builder/editor/i?previewPath=%2F").cleaned === null)
  const bad = readWidgetArrival("https://storelib.com/website-builder/editor/i?addReviewWidget=popup&placement=top")
  check("an unknown widget adds nothing, and its words still come off", bad.want === null && bad.cleaned === "/website-builder/editor/i")
}

function storelibThemeChecks() {
  console.log("\nA Storelib theme")
  const schemas = SECTION_SCHEMAS as unknown as Record<string, unknown>
  check("its Reviews widget section is there to add", !!SECTION_SCHEMAS.reviews_widget)
  const href = "https://storelib.com/website-builder/editor/i?previewPath=%2Fproducts%2Flinen-apron&addReviewWidget=product_reviews&reviewConfig=" + CONFIG + "&placement=below_product"
  /* 1: install read, generic product template in, the product still coming (canvasLoading). 2: the product's page swapped in. */
  const run = play(href, [
    { busy: true, sections: [], compat: false, schemas },
    { busy: true, sections: genericProduct, compat: false, schemas },
    { busy: false, sections: realProduct, compat: false, schemas },
  ])
  check("on a product page from the address, it waits for the product's own page", run.addedAt === 2, run.addedAt)
  const at = run.sections.findIndex((s) => s.type === "reviews_widget")
  check("  and goes in right under the product, naming the saved look", at === 2 && run.sections[1].type === "product" && run.sections[at].settings?.review_config === CONFIG && run.sections[at].settings?.widget === "product_reviews", run.sections.map((s) => s.type))
  check("  on the product's page, not the template that was replaced", (run.sections[1].settings?._product_data as { slug?: string } | undefined)?.slug === "linen-apron")
  check("  once", run.sections.filter((s) => s.type === "reviews_widget").length === 1)

  /* What used to happen: added on the first commit with sections, then thrown away by the second. */
  const old = (() => {
    let sections = genericProduct
    const plan = planWidgetArrival({ widget: "product_reviews", config: CONFIG, placement: "below_product" }, { busy: false, sections, headerCount: 1, compat: false, schemaOf: (t) => schemas[t] as never })!
    sections = add(sections, plan)
    sections = realProduct
    return sections
  })()
  check("  (adding before the product's page is in loses it, which is what the owner saw)", !old.some((s) => s.type === "reviews_widget"))

  const top = play("https://storelib.com/website-builder/editor/i?previewPath=%2F&addReviewWidget=testimonials&placement=top", [{ busy: false, sections: home, compat: false, schemas }])
  check("at the top of the home page: under the header", top.sections[1].type === "reviews_widget" && top.sections[0].type === "header", top.sections.map((s) => s.type))
  const bottom = play("https://storelib.com/website-builder/editor/i?previewPath=%2F&addReviewWidget=marquee&placement=bottom", [{ busy: false, sections: home, compat: false, schemas }])
  check("at the end of the home page: above the footer", bottom.sections.at(-2)?.type === "reviews_widget" && bottom.sections.at(-1)?.type === "footer", bottom.sections.map((s) => s.type))
  const preset = (SECTION_SCHEMAS.reviews_widget?.presets ?? []).findIndex((p) => (p.settings as Record<string, unknown> | undefined)?.widget === "marquee")
  const plan = planWidgetArrival({ widget: "marquee", config: "", placement: "bottom" }, { busy: false, sections: home, headerCount: 1, compat: false, schemaOf: (t) => schemas[t] as never })
  check("  with that widget's own preset", preset >= 0 && plan?.presetIndex === preset)
}

function importedThemeChecks() {
  console.log("\nAn imported theme")
  const files = withStorelibReviewsSection({ "layout/theme.storelib": wrapCompatTemplate("<html><body>{{ content_for_layout }}</body></html>") })
  const own = customSectionSchemas(files) as unknown as Record<string, unknown>
  const builtIn = SECTION_SCHEMAS as unknown as Record<string, unknown>
  const sections: S[] = [{ id: "h", type: "header", group: "header" }, { id: "main", type: "main-product" }, { id: "rec", type: "product-recommendations" }, { id: "f", type: "footer", group: "footer" }]
  /* The install says compat before its files are in: Storelib's own schemas only, no imported Reviews widget yet. */
  const run = play("https://storelib.com/website-builder/editor/i?previewPath=%2Fproducts%2Fa&addReviewWidget=product_reviews&placement=below_product", [
    { busy: false, sections, compat: true, schemas: builtIn },
    { busy: false, sections, compat: true, schemas: { ...builtIn, ...own }, replaceSections: false },
  ])
  check("it waits for the theme's files, never adding Storelib's section to it", run.addedAt === 1 && !run.sections.some((s) => s.type === "reviews_widget"), run.sections.map((s) => s.type))
  const at = run.sections.findIndex((s) => s.type === REVIEW_WIDGET_SECTION_TYPE)
  check("  and its own Reviews widget goes under the theme's main product", at === 2 && run.sections[1].type === "main-product", run.sections.map((s) => s.type))
}

function editorChecks() {
  console.log("\nThe editor")
  const editor = readFileSync("app/(storelib)/website-builder/editor/[installId]/page.tsx", "utf8")
  const effect = editor.slice(editor.indexOf("const widgetArrival = useRef"), editor.indexOf("const widgetArrival = useRef") + 1600)
  check("waits on every kind of page loading, and knows an imported theme from its install", /busy: loading \|\| canvasLoading \|\| sectionsLoading/.test(effect) && /compat: compatInstall \|\| importedTheme\.current/.test(effect))
  check("  runs again when each of them changes", /\[loading, canvasLoading, sectionsLoading, sections, librarySchemas, compatInstall\]\)/.test(effect))
  check("  and adds it selected, with its settings open (addSection selects what it adds)", /addSection\(plan\.type, plan\.presetIndex, true/.test(effect) && /setSelectedPanel\(\{ type: "section", sectionId: newSection\.id \}\)/.test(editor))
}

addressChecks()
storelibThemeChecks()
importedThemeChecks()
editorChecks()

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`  failing: ${failures.join(", ")}`)
  process.exit(1)
}
