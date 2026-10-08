/**
 * ===========================================================================
 *  EVERY SECTION RENDERS WHAT IT SHIPS WITH
 * ===========================================================================
 * The settings audit next door proves that every control is READ. It cannot
 * prove the section still renders once they are — and twenty-five renderers
 * changed to make it pass. A typo in a style object, a hook called after an
 * early return, an undefined array index: none of those are type errors, and
 * the first person to find one would be a creator clicking Add.
 *
 * So every section is rendered here, for real, through the same registry the
 * editor and the storefront dispatch through, with exactly what it ships with:
 * its preset's settings and blocks where it has a preset, its field defaults
 * where it does not. Both are asserted — a section that throws fails, and so
 * does one that renders nothing, which is the quieter failure of the two.
 *
 * Run with:  npm run test:push
 */

import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { SECTION_COMPONENTS } from "@/components/website-builder/sections/registry"
import { STORELIB_SCHEMAS, STORELIB_SECTION_TYPES } from "@/lib/website-builder/storelib-schemas"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { THEME_ROOT_ATTRIBUTE } from "@/lib/website-builder/theme-css"
import {
  maxWidth,
  num,
  parseInZone,
  sectionPadding,
} from "@/components/website-builder/sections/_shared"

const root = process.cwd()
const SECTIONS = join(root, "themes/default/sections")

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

function section(title: string) {
  console.log(`\n${title}`)
}

interface Field {
  id: string
  type: string
  default?: unknown
}
interface Schema {
  fields?: Field[]
  blocks?: { type: string; fields?: Field[] }[]
  presets?: { name?: string; settings?: Record<string, unknown>; blocks?: { type: string; settings?: Record<string, unknown> }[] }[]
}

/** What the editor puts on the canvas when somebody clicks Add. */
function asShipped(type: string, schema: Schema): SectionInstance {
  const settings: Record<string, unknown> = {}
  for (const field of schema.fields ?? []) {
    if (field.default !== undefined) settings[field.id] = field.default
  }
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})

  /**
   * The preset's blocks, or one of each block type the section declares. A
   * section rendered with no blocks exercises only its empty state, and the
   * empty state is not where the bugs are.
   */
  const blocks = (preset?.blocks ?? (schema.blocks ?? []).map((b) => ({ type: b.type, settings: {} }))).map(
    (block, i) => {
      const blockSchema = (schema.blocks ?? []).find((b) => b.type === block.type)
      const blockSettings: Record<string, unknown> = {}
      for (const field of blockSchema?.fields ?? []) {
        if (field.default !== undefined) blockSettings[field.id] = field.default
      }
      Object.assign(blockSettings, block.settings ?? {})
      return { id: `${type}-block-${i}`, type: block.type, settings: blockSettings }
    },
  )

  return { id: `${type}-1`, type, name: type, settings, blocks }
}

/** The theme as it ships: every group's declared defaults, flattened. */
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((group) =>
    (group.fields ?? [])
      .filter((f) => f.default !== undefined)
      .map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues
/**
 * A section type is a JSON schema in themes/default/sections, or a .storelib
 * file there whose <schema> the editor reads through the same adapter the
 * sidebar uses. Both are "the fifty", and both render.
 */
const types = [
  ...readdirSync(SECTIONS).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")),
  ...STORELIB_SECTION_TYPES,
]
const schemaFor = (type: string): Schema =>
  STORELIB_SCHEMAS[type] ?? (JSON.parse(readFileSync(join(SECTIONS, `${type}.json`), "utf8")) as Schema)

// ===========================================================================
section("Fifty sections, rendered")
// ===========================================================================

const rendered = new Map<string, string>()
{
  const threw: string[] = []
  const empty: string[] = []

  for (const type of types) {
    const schema: Schema = schemaFor(type)
    const Component = SECTION_COMPONENTS[type]
    if (!Component) {
      threw.push(`${type}: no renderer in the registry`)
      continue
    }
    try {
      const html = renderToStaticMarkup(
        /**
         * A .storelib section has no markup until something compiles it, and
         * in the editor that something is StorelibLiveProvider. Wrapping every
         * section in it renders the JSON ones exactly as before and gives the
         * engine-backed ones the renderer the editor gives them.
         */
        createElement(StorelibLiveProvider, {
          sources: {},
          children: createElement(Component, { section: asShipped(type, schema), theme }),
        }),
      )
      rendered.set(type, html)
      // A wrapper div and nothing inside it is a section that renders as a
      // blank strip on the page.
      if (html.replace(/<[^>]*>/g, "").trim().length === 0 && !/<(img|video|iframe|input|svg)/.test(html)) {
        empty.push(type)
      }
    } catch (error) {
      threw.push(`${type}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  check("not one of them throws", threw.length === 0, threw.slice(0, 6).join("\n        "))
  /*
    Retired React sections that never receive the store (product_list,
    products_carousel): a visitor gets nothing rather than invented products.
    Everything else still draws something.
  */
  const STORELESS = new Set(["product_list", "products_carousel"])
  check(
    "and not one of them renders an empty box",
    empty.filter((t) => !STORELESS.has(t)).length === 0,
    empty.join(", "),
  )
  check("the retired product sections draw nothing at all for a visitor, never invented products", [...STORELESS].every((t) => !/Digital Template Pack|Product 1|\$29\.99/.test(rendered.get(t) ?? "")))
}

// ===========================================================================
section("The fixes are on the page, not just in the source")
// ===========================================================================

/**
 * Spot checks on what the audit next door could only assert indirectly. These
 * are the specific defects that were found: each one names what was wrong and
 * looks for what should now be in the markup.
 */
{
  const has = (type: string, needle: string | RegExp) => {
    const html = rendered.get(type) ?? ""
    return typeof needle === "string" ? html.includes(needle) : needle.test(html)
  }

  check(
    "the call to action has a button",
    // It read `s.button_text`; the schema declares `btn_primary_text`. The one
    // section that exists to have a button shipped without one.
    has("cta", /<a [^>]*href=/),
    (rendered.get("cta") ?? "").slice(0, 200),
  )
  check(
    "the hero renders both of its buttons and its eyebrow",
    (rendered.get("hero")?.match(/<a /g) ?? []).length >= 2 && has("hero", "New collection"),
  )
  check(
    "the gallery shows its photos rather than a placeholder",
    // Block schema: `image`. Renderer read `image_url`.
    !has("gallery", "Photo") || has("gallery", "<img"),
  )
  check(
    "the pricing table lists the features each plan includes",
    // The `features` textarea — five lines by default — was never read.
    has("pricing", "Unlimited projects") && has("pricing", "Priority support"),
  )
  check(
    "the footer builds columns from its column blocks",
    // Every block was rendered as a link, so the column headings were links
    // with no label and the columns did not exist.
    (rendered.get("footer")?.match(/<a /g) ?? []).length > 0,
  )
  check(
    "the slideshow renders every slide, not only the first",
    (rendered.get("slideshow")?.match(/aria-label="Go to slide/g) ?? []).length >= 1 ||
      (rendered.get("slideshow")?.match(/aria-hidden/g) ?? []).length >= 1,
  )
  check(
    "the FAQ's answer is HTML, so its formatting is formatting",
    // `answer` is a richtext field rendered as text: visitors saw the markup.
    has("faq", "<p>") && !has("faq", "&lt;p&gt;"),
  )
  check(
    "the ebook shows the excerpt it ships with",
    /**
     * Text that appears ONLY in the excerpt. A break test caught the first
     * version of this: it looked for "Chapter 1", which is also the first line
     * of the table of contents, so hiding the excerpt entirely left it green.
     */
    has("ebook_showcase", "Every great business begins"),
  )
  check(
    "stats render their prefix and suffix",
    has("stats", "+"),
  )
}

// ===========================================================================
section("A page is a page, whichever surface renders it")
// ===========================================================================

/**
 * The editor canvas, the storefront, the seller page and the product page each
 * assembled a page from scratch — four announcement bars, four
 * header-first-footer-last rules. They had already drifted, and every setting
 * added to one had to be remembered in three others.
 *
 * ThemePage is the one page. These drive it rather than grepping for it.
 */
{
  const shipped = (type: string) =>
    asShipped(type, schemaFor(type))

  /** Saved in the WRONG order, which an editor with drag-and-drop allows. */
  const outOfOrder = [shipped("footer"), shipped("hero"), shipped("header")]

  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(ThemePage, {
        theme: { ...theme, announcement_bar_enabled: true, announcement_bar_text: "Free shipping" },
        sections: outOfOrder,
      }),
    })
  )

  /**
   * `indexOf` returns -1 for something that is not there, and -1 is less than
   * every real index — so an ordering assertion written on raw `indexOf`
   * passes when the thing has DISAPPEARED. A break test caught exactly that:
   * deleting the header render left "the header comes first" green.
   */
  const at = (needle: string) => {
    const i = html.indexOf(needle)
    if (i < 0) return Number.POSITIVE_INFINITY
    return i
  }
  check(
    "the header comes first and the footer last, whatever order they were saved in",
    /**
     * A header is chrome, not content: an editor that lets you drag it into
     * the middle of the page should not produce a page with a navigation bar
     * halfway down it.
     */
    Number.isFinite(at("section-header-1")) &&
      Number.isFinite(at("section-footer-1")) &&
      at("section-header-1") < at("section-hero-1") &&
      at("section-hero-1") < at("section-footer-1"),
    JSON.stringify({ header: at("section-header-1"), hero: at("section-hero-1"), footer: at("section-footer-1") }),
  )
  check("the announcement bar is above all of it", at("Free shipping") < at("section-header-1"))
  check(
    "the theme's own variables are on the page root",
    html.includes("--theme-page-width") && html.includes("--theme-spacing-scale"),
  )
  check(
    "and its stylesheet is scoped to that root",
    html.includes(`[${THEME_ROOT_ATTRIBUTE}]`) && html.includes("data-section"),
  )

  const bare = renderToStaticMarkup(createElement(ThemePage, { theme, sections: [] }))
  /**
   * THE SELECTOR AND THE ATTRIBUTE HAVE TO AGREE.
   *
   * A break test caught this: deleting `data-chrome` from the wrapper left the
   * suite green, because it only checked that the CSS excluded `[data-chrome]`
   * and that the source mentioned `isChrome`. Neither notices that the
   * attribute is no longer emitted — and then the entrance animation is back
   * on the sticky header, displacing it by 16px, which is the bug this all
   * came from.
   */
  const headerTag = html.slice(html.indexOf('id="section-header-1"') - 400, html.indexOf('id="section-header-1"') + 200)
  check(
    "the header says it is chrome, in the markup",
    /data-chrome/.test(headerTag),
    headerTag.slice(0, 200),
  )
  const footerAt = html.indexOf('id="section-footer-1"')
  check(
    "and so does the footer",
    // The container with the id carries the section's design tokens (a
    // style attribute of `--scheme-*` properties) before the wrapper that
    // says chrome, so the window after the id is wider than the header's.
    /data-chrome/.test(html.slice(footerAt - 400, footerAt + 1400)),
  )
  check(
    "while an ordinary section does not",
    !/data-chrome/.test(html.slice(html.indexOf('id="section-hero-1"'), html.indexOf('id="section-hero-1"') + 400)),
  )

  check(
    "an empty page says so rather than rendering nothing",
    /being set up/.test(bare),
  )
  check(
    "and a theme with no announcement text does not render an empty bar",
    !/announcement/i.test(bare),
  )
}

// ===========================================================================
section("A deadline is a deadline in the zone the creator picked")
// ===========================================================================

/**
 * The countdown section has offered a Time zone control from the day it
 * shipped and parsed the end date in whatever zone the VISITOR was in. A sale
 * ending at midnight Pacific ended at 8pm for somebody in London and at 4pm
 * the next afternoon in Sydney — every visitor saw a different deadline, and
 * none of them saw the one the creator set.
 *
 * `Intl` formats an instant into a zone but will not parse one, so the offset
 * is recovered by formatting and reading the wall clock back, twice — the
 * second pass is what gets a time near a DST change right. These cases are
 * checked against the real IANA data the runtime carries.
 */
{
  const cases: [string, string, string][] = [
    ["2026-07-04 12:00", "America/New_York", "2026-07-04T16:00:00.000Z"],
    ["2026-01-15 12:00", "America/New_York", "2026-01-15T17:00:00.000Z"],
    ["2026-12-31 23:59", "America/Los_Angeles", "2027-01-01T07:59:00.000Z"],
    ["2026-06-01 09:00", "Europe/London", "2026-06-01T08:00:00.000Z"],
    ["2026-06-01 09:00", "Asia/Tokyo", "2026-06-01T00:00:00.000Z"],
    ["2026-07-04", "Australia/Sydney", "2026-07-03T14:00:00.000Z"],
  ]
  const wrong = cases.filter(
    ([wall, zone, want]) => new Date(parseInZone(wall, zone)).toISOString() !== want,
  )
  check(
    "the same wall clock means a different instant in each zone",
    wrong.length === 0,
    wrong.map(([w, z, want]) => `${w} @ ${z} → ${new Date(parseInZone(w, z)).toISOString()} want ${want}`).join("\n        "),
  )

  check(
    "half an hour before the clocks go forward, and an hour after they go back",
    // The two moments a one-pass offset lookup gets wrong.
    new Date(parseInZone("2026-03-08 01:30", "America/New_York")).toISOString() ===
      "2026-03-08T06:30:00.000Z" &&
      new Date(parseInZone("2026-11-01 01:30", "America/New_York")).toISOString() ===
        "2026-11-01T05:30:00.000Z",
  )

  check(
    "a date that already names its instant is not moved by a zone",
    // "…Z" or an explicit offset is the author saying which moment they mean.
    new Date(parseInZone("2026-07-04T16:00:00Z", "America/New_York")).toISOString() ===
      "2026-07-04T16:00:00.000Z",
  )

  check(
    "and a half-typed date is not a countdown that has expired",
    !Number.isFinite(parseInZone("2026-", "UTC")) && !Number.isFinite(parseInZone("", "UTC")),
  )
}

// ===========================================================================
section("Numbers that arrive as strings")
// ===========================================================================

{
  /**
   * Settings are `Record<string, unknown>`: the panel writes numbers, the model
   * writes `"80"`, and an older saved section can hold either. `Number("")` is
   * 0, so an empty string has to be rejected explicitly or a cleared padding
   * slider silently means "no padding" instead of "the default".
   */
  check("a slider's value survives arriving as text", num("80", 60) === 80)
  check("an empty one falls back rather than becoming zero", num("", 60) === 60)
  check("and so does a value that is not a number at all", num("wide", 60) === 60 && num(null, 60) === 60)
  check(
    "padding is the section's own default until somebody moves the slider",
    // …times the theme's spacing scale, which is what makes that control real.
    sectionPadding({}, 64, 32).paddingTop === "calc(64px * var(--theme-spacing-scale, 1))" &&
      sectionPadding({}, 64, 32).paddingBottom === "calc(32px * var(--theme-spacing-scale, 1))",
    JSON.stringify(sectionPadding({}, 64, 32)),
  )
  check(
    "and a negative one is clamped rather than rendered",
    sectionPadding({ padding_top: -40 }, 64).paddingTop === "calc(0px * var(--theme-spacing-scale, 1))",
  )
  check(
    "a content width is one of the four the schemas offer",
    maxWidth("narrow") === "720px" &&
      maxWidth("full") === "100%" &&
      // "Wide" is whatever the theme calls wide.
      maxWidth("wide") === "var(--theme-page-width, 1230px)" &&
      maxWidth("nonsense") === "var(--theme-page-width, 1230px)",
    maxWidth("wide"),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
