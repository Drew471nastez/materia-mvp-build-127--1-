/**
 * The sections, pages and schema keys added to close the gap with Shopify's
 * theme structure: Plans, Rows, Course Outline and the 404 page's own
 * section; the product grid's chosen products; `visible_if`; the `lines`
 * filter; the generated 404 page; and the header and announcement rules.
 *
 * Every section is rendered from its own presets, the way it arrives when a
 * creator adds it, and then with the values that change what it draws.
 *
 *   npx esbuild tests/theme-sections.test.ts --bundle --platform=node --format=cjs \
 *     --alias:@=. --alias:server-only=/tmp/claude-0/empty.js --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import { compileTemplate, renderTemplate, validateSectionSchema, type RenderContext } from "../lib/storelib-theme"
import { conditionHolds, parseCondition } from "../lib/storelib-theme/storelib/template"
import { visibleFields } from "../lib/storelib-theme/visible-if"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"
import { STORELIB_SCHEMAS } from "../lib/website-builder/storelib-schemas"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { storefrontData } from "../lib/website-builder/storefront-data"
import { chromeScheme, notFoundSections, searchSections, shopSections } from "../lib/website-builder/shop-page"
import { BUILT_IN_PAGE_KEYS, GENERATED_PAGE_KEYS, NOT_FOUND_PAGE_KEY, pageKeyFromSegment, pageTitleFromKey, templateForPage } from "../lib/website-builder/site-pages"
import { headerMenuBlocks, mobileMenuStyle, transparentHere } from "../lib/website-builder/header-settings"
import { MAX_ANNOUNCEMENTS, announcementMessages, announcementSeconds } from "../lib/website-builder/announcement"
import { PAGE_META, type SectionInstance, type ThemeSettingsValues } from "../lib/website-builder/types"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else { failed++; failures.push(name) }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
function section(t: string) { console.log(`\n${t}`) }

const theme = {} as ThemeSettingsValues
type Card = { id: string; type: string; settings: Record<string, unknown> }
const card = (id: string, title: string, price = "$20.00", image = `https://cdn.example/${id}.jpg`): Card =>
  ({ id, type: "product", settings: { title, price, compare_price: "", image, url: `/products/${id}`, tag: "" } })
const CATALOG = [card("tote", "Canvas tote", "$48.00"), card("apron", "Linen apron", "$64.00"), card("wallet", "Card wallet", "$29.00")]

/** An instance as Add Section makes it: the preset's settings and blocks. */
function fromPreset(type: string, n = 0): SectionInstance {
  const preset = SECTION_SCHEMAS[type]?.presets?.[n]
  return {
    id: `s-${type}`,
    type,
    name: type,
    settings: { ...(preset?.settings ?? {}) },
    blocks: (preset?.blocks ?? []).map((b, i) => ({ id: `b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } })),
  } as SectionInstance
}
function draw(sec: SectionInstance, opts: { products?: Card[]; catalog?: Card[]; template?: string; inEditor?: boolean } = {}) {
  const data = opts.catalog ? storefrontData({ dynamic: {}, catalog: opts.catalog as never, menus: {} }) : undefined
  const r = renderStorelibSection(sec, theme, { template: opts.template ?? "index", in_editor: opts.inEditor }, {}, opts.products as never, data)
  if (r.ok === false) throw new Error(`${sec.type}: ${JSON.stringify((r as { errors?: unknown }).errors).slice(0, 400)}`)
  return r.html
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

// ═══════════════════════════════════════════════════════════════════════════
section("The new sections are in the library, and compile")
// ═══════════════════════════════════════════════════════════════════════════
{
  for (const t of ["pricing_table", "course_curriculum", "multirow"]) {
    check(`${t} is addable`, ADDABLE_SECTIONS.includes(t))
    check(`${t} has a preset that fills it`, (STORELIB_SCHEMAS[t]?.presets?.[0]?.blocks?.length ?? 0) >= 2)
  }
  check("the 404 page's section is not in Add Section, like the search page's", !!STORELIB_SCHEMAS.not_found && !ADDABLE_SECTIONS.includes("not_found") && !ADDABLE_SECTIONS.includes("search"))
  check("each file's schema validates on its own", ["pricing_table", "course_curriculum", "multirow", "not_found"].every((t) => {
    const src = DEFAULT_THEME_SOURCES[`sections/${t}.storelib`]
    const json = src.slice(src.indexOf("<schema>") + 8, src.indexOf("</schema>"))
    return validateSectionSchema(JSON.parse(json)).ok
  }))
  check("every preset of every new section renders", ["pricing_table", "course_curriculum", "multirow", "not_found"].every((t) =>
    (SECTION_SCHEMAS[t].presets ?? []).every((_, i) => draw(fromPreset(t, i)).includes(`data-section-type="${t}"`))))
  check("none of their copy has an em dash", ["pricing_table", "course_curriculum", "multirow", "not_found"].every((t) => !/[—–]/.test(DEFAULT_THEME_SOURCES[`sections/${t}.storelib`].split("<schema>")[1])))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Plans")
// ═══════════════════════════════════════════════════════════════════════════
{
  const html = draw(fromPreset("pricing_table"))
  check("three plans, in a grid sized for three", (html.match(/class="plan[ "]/g) ?? []).length === 3 && html.includes("pt__grid--3"))
  check("the one to pick is marked, and its button is the primary one", /plan plan--pick[\s\S]*?s__btn--primary/.test(html) && (html.match(/plan--pick/g) ?? []).length === 1)
  check("what a plan includes is a list, one item per typed line", /<ul class="plan__list">\s*<li>Twelve video lessons<\/li>\s*<li>A workbook to print<\/li>/.test(html))
  check("the label is text above the name, not a badge", /<p class="plan__label">Best value<\/p>\s*<h3 class="plan__name">Course and community<\/h3>/.test(html))

  const linked = fromPreset("pricing_table")
  linked.blocks = [{ id: "p", type: "plan", settings: { name: "Tote club", price: "", button_text: "Join", button_url: "/products/tote" } }] as never
  const withShop = draw(linked, { catalog: CATALOG })
  check("an empty price shows the price of the product the button goes to", /<span class="plan__amount">\$48\.00<\/span>/.test(withShop))
  check("and the button still goes to the product", /href="\/products\/tote"/.test(withShop))
  check("one plan is one column", withShop.includes("pt__grid--1"))
  const typed = fromPreset("pricing_table")
  typed.blocks = [{ id: "p", type: "plan", settings: { name: "Tote club", price: "$5", period: "a month", button_url: "/products/tote" } }] as never
  check("a typed price wins over the product's", /plan__amount">\$5<\/span>\s*<span class="plan__period">a month<\/span>/.test(draw(typed, { catalog: CATALOG })))
  const unknown = fromPreset("pricing_table")
  unknown.blocks = [{ id: "p", type: "plan", settings: { name: "Gone", price: "", button_url: "/products/deleted" } }] as never
  check("a product that is not in the shop leaves no empty price", !/plan__price/.test(draw(unknown, { catalog: CATALOG })))
  const empty = fromPreset("pricing_table")
  empty.blocks = []
  check("with no plans, the editor asks for one and a visitor sees nothing", draw(empty, { inEditor: true }).includes("Add plans in the sidebar") && !draw(empty).includes("Add plans"))
  const hostile = fromPreset("pricing_table")
  hostile.blocks = [{ id: "p", type: "plan", settings: { name: "<img src=x onerror=alert(1)>", features: "<script>alert(1)</script>\nok", button_text: "Go", button_url: "javascript:alert(1)" } }] as never
  const h = draw(hostile)
  check("names and lines are escaped, and a script link is refused", !/<img src=x/.test(h) && !/<script>alert/.test(h) && h.includes("&lt;script&gt;") && !/href="javascript:/i.test(h))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Course Outline")
// ═══════════════════════════════════════════════════════════════════════════
{
  const html = draw(fromPreset("course_curriculum"))
  check("four modules, each a <details>", (html.match(/<details class="cc__module"/g) ?? []).length === 4)
  check("the first is open and the rest are not", /<details class="cc__module" open>/.test(html) && (html.match(/<details class="cc__module" open>/g) ?? []).length === 1)
  check("lessons are a numbered list from the lines typed", /<ol class="cc__lessons">\s*<li>A flat wash<\/li>\s*<li>A graded wash<\/li>\s*<li>Wet into wet<\/li>\s*<li>Rescuing a patchy wash<\/li>\s*<\/ol>/.test(html))
  check("modules are numbered when the section says so", /cc--num/.test(html) && /<span class="cc__num" aria-hidden="true">2<\/span>/.test(html))
  const plain = fromPreset("course_curriculum")
  plain.settings = { ...plain.settings, numbered: false, open_first: false }
  const p = draw(plain)
  check("and not when it does not, with every module closed", !/cc__num/.test(p) && !/cc--num/.test(p) && !/ open>/.test(p))
  const blank = fromPreset("course_curriculum")
  blank.blocks = [{ id: "m", type: "module", settings: { title: "Intro", lessons: "\n\n   \n" } }] as never
  check("a module with no lessons draws no empty list", !/cc__lessons/.test(draw(blank)))
}

// ═══════════════════════════════════════════════════════════════════════════
section("Rows")
// ═══════════════════════════════════════════════════════════════════════════
{
  const html = draw(fromPreset("multirow"))
  check("three rows inside one wrapper, so alternation counts rows only", (html.match(/class="mr__row"/g) ?? []).length === 3 && (html.match(/class="mr__rows"/g) ?? []).length === 1)
  check("rows alternate by default, starting on the left", /class="s mr mr--left mr--alt"/.test(html))
  check("with no section heading, each row's heading is an h2", (html.match(/<h2 class="mr__h">/g) ?? []).length === 3)
  const titled = fromPreset("multirow")
  titled.settings = { ...titled.settings, heading: "How a cup is made" }
  check("under a section heading they are h3", (draw(titled).match(/<h3 class="mr__h">/g) ?? []).length === 3)
  const pictured = fromPreset("multirow")
  pictured.blocks = [{ id: "r", type: "row", settings: { image: "https://cdn.example/cup.jpg", image_focus: "30% 70%", heading: "Cup" } }] as never
  check("a row's picture keeps its focus in view", /object-position: 30% 70%;/.test(draw(pictured)))
  pictured.blocks = [{ id: "r", type: "row", settings: { image: "https://cdn.example/cup.jpg", image_focus: "30%; background:url(x)", heading: "Cup" } }] as never
  check("a focus that is not a focus is drawn as the centre, not written into the style", /object-position: 50% 50%;/.test(draw(pictured)) && !/url\(x\)/.test(draw(pictured)))
  const shaped = fromPreset("multirow")
  shaped.settings = { ...shaped.settings, shape: "1 / 1; color: red" }
  check("a shape that is not one of the options is drawn as the default", /--mr-shape: 4 \/ 3;/.test(draw(shaped)))
}

// ═══════════════════════════════════════════════════════════════════════════
section("The 404 page")
// ═══════════════════════════════════════════════════════════════════════════
{
  const html = draw(fromPreset("not_found"), { products: [...CATALOG, card("d", "Four"), card("e", "Five")], template: "page.404" })
  check("one h1 that says the page is not here", (html.match(/<h1/g) ?? []).length === 1 && /This page is not here/.test(html))
  check("a search box that searches this site", /<form class="nf__find" action="\/search" method="get" role="search">/.test(html) && /name="q"/.test(html))
  check("the way home", /href="\/"[^>]*>Back to the home page/.test(html))
  check("four products from the shop, not all five", (html.match(/class="card"/g) ?? []).length === 4 && !text(html).includes("Five"))
  const quiet = fromPreset("not_found")
  quiet.settings = { show_search: false, show_products: false }
  const q = draw(quiet, { products: CATALOG })
  check("the search box and the products can each be turned off", !/nf__find/.test(q) && !/class="card"/.test(q))
  check("with no products, a visitor sees no empty heading", !/From the shop/.test(draw(fromPreset("not_found"), { products: [] })))

  const home = [
    { id: "h", type: "header", name: "Header", settings: {}, blocks: [] },
    { id: "hero", type: "hero_centered", name: "Hero", settings: {}, blocks: [] },
    { id: "f", type: "footer", name: "Footer", settings: {}, blocks: [] },
  ] as unknown as SectionInstance[]
  const page = notFoundSections(home)
  check("the generated page is the home page's header and footer around the 404 section", page.map((s) => s.type).join(",") === "header,not_found,footer")
  check("with a fixed id, so the same page renders the same twice", notFoundSections(home)[1].id === page[1].id)
  check("its settings are the section's own defaults", (() => {
    const defaults = Object.fromEntries((SECTION_SCHEMAS.not_found.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))
    return Object.entries(page[1].settings).every(([k, v]) => JSON.stringify(defaults[k]) === JSON.stringify(v))
  })())
  const dark = home.map((s) => (s.type === "header" ? { ...s, settings: { color_scheme: "black" } } : s)) as SectionInstance[]
  check("on a dark site the generated pages are dark too, not a white band between the chrome",
    notFoundSections(dark)[1].settings.color_scheme === "black" && searchSections(dark)[1].settings.color_scheme === "black" && shopSections(dark, theme)[1].settings.color_scheme === "black" && chromeScheme(home) === "white")
  check("404 is generated, built in, and never an address of its own", GENERATED_PAGE_KEYS.has("404") && BUILT_IN_PAGE_KEYS.has("404") && pageKeyFromSegment("404") === null && NOT_FOUND_PAGE_KEY === "404")
  check("it is called Page not found, and drawn as page.404", pageTitleFromKey("404") === "Page not found" && templateForPage("404") === "page.404")
  check("the page switcher lists it", PAGE_META["404"]?.label === "404 page")
}

// ═══════════════════════════════════════════════════════════════════════════
section("The product grid can show products somebody chose")
// ═══════════════════════════════════════════════════════════════════════════
{
  const grid = fromPreset("product_grid")
  grid.settings = { ...grid.settings, source: "chosen", chosen: ["wallet", "/products/tote", "missing", "wallet"] }
  const html = draw(grid, { catalog: CATALOG })
  const titles = [...html.matchAll(/class="card__title">([^<]*)</g)].map((m) => m[1])
  check("in the order they were chosen, each once, and a missing one skipped", JSON.stringify(titles) === JSON.stringify(["Card wallet", "Canvas tote"]), titles)
  check("with the shop's own prices and links", html.includes("$29.00") && /href="\/products\/wallet"/.test(html))
  grid.settings = { ...grid.settings, chosen: [] }
  check("none chosen: the editor asks, a visitor sees nothing", draw(grid, { catalog: CATALOG, inEditor: true }).includes("Choose products in the sidebar") && !/class="card /.test(draw(grid, { catalog: CATALOG })))
  const typed = fromPreset("product_grid")
  /* The preset starts from the shop now; cards are the picked source. */
  typed.settings = { ...typed.settings, source: "picked" }
  typed.blocks = [{ id: "b", type: "product", settings: { title: "Tote", price: "$48", url: "/products/tote" } }] as never
  check("a typed card with no photo shows the photo of the product it links to", /<img src="https:\/\/cdn\.example\/tote\.jpg"/.test(draw(typed, { catalog: CATALOG })))
  check("the picked cards are still the default", SECTION_SCHEMAS.product_grid.fields.find((f) => f.id === "source")?.default === "picked")
}

// ═══════════════════════════════════════════════════════════════════════════
section("The countdown's end is a date")
// ═══════════════════════════════════════════════════════════════════════════
{
  const cd = fromPreset("promo_countdown")
  cd.settings = { ...cd.settings, ends_text: "", ends_at: "2026-11-29T23:00" }
  const html = draw(cd)
  check("a picked date is written out when nothing is typed", /<time class="cd__ends-when" datetime="2026-11-29T23:00">29 November 2026, 23:00<\/time>/.test(html))
  cd.settings = { ...cd.settings, ends_text: "Sunday night" }
  check("typed words win, and the moment is still in the markup", /<time class="cd__ends-when" datetime="2026-11-29T23:00">Sunday night<\/time>/.test(draw(cd)))
  cd.settings = { ...cd.settings, ends_text: "Sunday night", ends_at: "next week" }
  check("a value that is not a date, saved before it was one, is left out rather than printed", !/datetime=/.test(draw(cd)) && /Sunday night/.test(draw(cd)))
}

// ═══════════════════════════════════════════════════════════════════════════
section("visible_if: a setting the panel shows only when it matters")
// ═══════════════════════════════════════════════════════════════════════════
{
  const base = [
    { type: "select", id: "source", label: "Source", default: "picked", options: [{ label: "A", value: "picked" }, { label: "B", value: "chosen" }] },
    { type: "checkbox", id: "show_button", label: "Button", default: true },
  ]
  const v = (visible_if: string, extra: unknown[] = []) =>
    validateSectionSchema({ type: "x", name: "X", settings: [...base, ...extra, { type: "text", id: "t", label: "T", visible_if }] })
  const messages = (r: ReturnType<typeof v>) => (r.ok === false ? r.errors.map((e) => e.message).join(" | ") : "")
  check("a condition on a section setting validates", v("{{ section.settings.source == 'chosen' }}").ok)
  check("and, or, not and a plain setting do too", v("{{ section.settings.show_button and not section.settings.source == 'picked' }}").ok)
  check("a condition on a setting that does not exist is refused, naming it", /section\.settings\.nope, which is not a setting/.test(messages(v("{{ section.settings.nope }}"))))
  check("a block's settings cannot be read from a section setting", /may read section\.settings/.test(messages(v("{{ block.settings.x }}"))))
  check("a condition without braces is refused, with the shape to write", /write it as \{\{ … \}\}/.test(messages(v("section.settings.source == 'chosen'"))))
  check("a condition that does not parse is refused with the parser's reason", !v("{{ section.settings.source == }}").ok)
  check("a setting cannot hide itself", /by its own value/.test(messages(validateSectionSchema({ type: "x", name: "X", settings: [{ type: "checkbox", id: "a", label: "A", visible_if: "{{ section.settings.a }}" }] }) as never)))
  const blockSchema = validateSectionSchema({
    type: "x", name: "X", settings: base,
    blocks: [{ type: "b", name: "B", settings: [{ type: "checkbox", id: "wide", label: "W" }, { type: "text", id: "cap", label: "C", visible_if: "{{ block.settings.wide and section.settings.show_button }}" }] }],
  })
  check("a block setting may read its block and its section", blockSchema.ok)

  const fields = [
    { id: "source", default: "picked" },
    { id: "chosen", visible_if: "{{ section.settings.source == 'chosen' }}" },
    { id: "label", visible_if: "{{ section.settings.show_button }}" },
    { id: "show_button", default: true },
  ]
  const ids = (saved: Record<string, unknown>) => visibleFields(fields, saved).map((f) => f.id).join(",")
  check("hidden until the section is in that mode", ids({}) === "source,label,show_button")
  check("shown once it is", ids({ source: "chosen" }) === "source,chosen,label,show_button")
  check("a setting never touched reads as its default, so a button on by default shows its label", ids({}).includes("label") && !ids({ show_button: false }).includes("label"))
  const blockFields = [{ id: "cap", visible_if: "{{ section.settings.source == 'chosen' and block.settings.wide }}" }, { id: "wide", default: false }]
  check("a block's field reads its block and its section", visibleFields(blockFields, { wide: true }, { fields, saved: { source: "chosen" } }).length === 2 && visibleFields(blockFields, { wide: true }, { fields, saved: {} }).length === 1)
  check("a broken condition shows its setting rather than hiding it for good", conditionHolds("{{ section.settings.x ==", { section: { settings: {} } }) === true)
  check("parsed conditions report the paths they read", (() => { const p = parseCondition("{{ section.settings.a or block.settings.b }}"); return p.ok && p.paths.map((s) => s.join(".")).join(",") === "section.settings.a,block.settings.b" })())
  check("the product grid uses it for its chosen products", SECTION_SCHEMAS.product_grid.fields.find((f) => f.id === "chosen")?.visible_if === "{{ section.settings.source == 'chosen' }}")
}

// ═══════════════════════════════════════════════════════════════════════════
section("The lines filter")
// ═══════════════════════════════════════════════════════════════════════════
{
  const ctx = (settings: Record<string, unknown>): RenderContext => ({ settings, blocks: [], theme: {}, page: { template: "index" }, section: { id: "s", type: "t" }, scheme: {}, assets: {} } as unknown as RenderContext)
  const t = compileTemplate(`{% for l in settings.t | lines %}[{{ l }}]{% endfor %}`)
  const run = (v: unknown) => (t.ok ? renderTemplate(t.value, ctx({ t: v })) : "did not compile")
  check("each line with something on it, trimmed", run("a\n\n  b  \r\nc\n") === "[a][b][c]")
  check("escaped like any other output", run("<b>x</b>") === "[&lt;b&gt;x&lt;/b&gt;]")
  check("nothing in, nothing out", run("") === "" && run(undefined) === "")
  check("at most a hundred", run(Array.from({ length: 150 }, (_, i) => `l${i}`).join("\n")).split("][").length === 100)
}

// ═══════════════════════════════════════════════════════════════════════════
section("The header's newer settings")
// ═══════════════════════════════════════════════════════════════════════════
{
  const menus = {
    "main-menu": { title: "Main menu", links: [{ title: "Shop", url: "/products", links: [{ title: "New", url: "/products?sort=new" }] }, { title: "About", url: "/about" }] },
    footer: { title: "Footer", links: [] },
  }
  const blocks = headerMenuBlocks("main-menu", menus as never)
  check("a menu becomes the header's nav links, children under their parent", !!blocks && blocks.length === 3 && blocks[1].settings.parent_id === blocks[0].id && blocks[2].settings.label === "About")
  check("no menu, an unknown one or an empty one leaves the header's own links", headerMenuBlocks("", menus as never) === null && headerMenuBlocks("nope", menus as never) === null && headerMenuBlocks("footer", menus as never) === null)
  check("the phone menu comes from the left unless told otherwise", mobileMenuStyle(undefined) === "left" && mobileMenuStyle("right") === "right" && mobileMenuStyle("full") === "full" && mobileMenuStyle("<x>") === "left")
  check("transparent on every page, or on the home page only", transparentHere(true, "all", "page.about") && transparentHere(true, "home", "index") && !transparentHere(true, "home", "page.about") && !transparentHere(false, "all", "index"))
}

// ═══════════════════════════════════════════════════════════════════════════
section("The announcement bar takes turns")
// ═══════════════════════════════════════════════════════════════════════════
{
  check("the first message, then each line of the rest, each once", JSON.stringify(announcementMessages({ announcement_bar_text: "Free UK delivery", announcement_bar_messages: "New prints\n\nFree UK delivery\n  Studio closed Monday  " })) === JSON.stringify(["Free UK delivery", "New prints", "Studio closed Monday"]))
  check("never more than the most a bar can hold", announcementMessages({ announcement_bar_text: "a", announcement_bar_messages: Array.from({ length: 20 }, (_, i) => `m${i}`).join("\n") }).length === MAX_ANNOUNCEMENTS)
  check("a bar with no message has none", announcementMessages({}).length === 0)
  check("seconds per message are 3 to 10, 5 unless set", announcementSeconds({}) === 5 && announcementSeconds({ announcement_bar_rotate: 1 }) === 3 && announcementSeconds({ announcement_bar_rotate: 99 }) === 10 && announcementSeconds({ announcement_bar_rotate: "x" }) === 5)
}

// ═══════════════════════════════════════════════════════════════════════════
section("Bugs found on the way")
// ═══════════════════════════════════════════════════════════════════════════
{
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  const published = read("lib/website-builder/published-site.ts")
  const publish = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  check("a publish purges the rendered page under every name the site answers to, found by the creator's user", /\.from\("creators"\)\s*\.select\("user_id, slug"\)/.test(published) && /websiteHandleOf\(creatorId, admin\)/.test(published) && !/\.from\("profiles"\)\s*\.select\("username"\)\s*\.eq\("id", creatorId\)/.test(published))
  check("a renamed name is matched literally, not as a LIKE pattern", /\.ilike\("old_username", literal\)/.test(published) && /name\.replace\(\/\[\\\\%_\]\/g/.test(published))
  check("publishing cleans each page by the section files that go live with it", /readOwnSectionFields\(admin, installId,/.test(publish) && /sanitizeSections\(page\.draft_sections as SectionInstance\[\], own\)/.test(publish))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
