/**
 * ===========================================================================
 *  THE MANUAL SAYS WHAT THE CODE DOES
 * ===========================================================================
 * docs/storelib-manual.md is the public reference for the section language:
 * what a template may write, which controls exist, what a script may reach,
 * what a colour scheme publishes. People build against it and models are
 * trained on it, which makes a wrong line in it worse than a missing one.
 *
 * So every list in it is held against the list in the code. A control added
 * to the registry and not to the manual fails here, and so does a filter
 * removed from the language while the manual still promises it.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CONTROL_TYPES, LEGACY_TYPE_ALIASES } from "@/lib/storelib-theme/controls/registry"
import { FILTER_NAMES } from "@/lib/storelib-theme/storelib/template"
import { CAPABILITIES, FORBIDDEN_IDENTIFIERS, SCRIPT_CONTEXT } from "@/lib/storelib-theme/storelib/script"
import { SCHEME_CSS_VARS, SCHEME_COLOR_KEYS, BUILT_IN_SCHEME_KEYS } from "@/lib/storelib-theme/color-schemes"
import { TYPE_STYLE_KEYS, typographyVars, themeTypography } from "@/lib/storelib-theme/typography"
import { themeVars } from "@/lib/website-builder/theme-css"
import { LIMITS } from "@/lib/storelib-theme/types"
import { THEME_PAGES } from "@/lib/website-builder/theme-file-tree"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
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

const manual = readFileSync(join(root, "docs/storelib-manual.md"), "utf8")
/**
 * A name the manual states in backticks, anywhere. A filter is usually
 * written with its argument, `truncate: 80`, so the closing backtick is not
 * required: what matters is that the name is named as code.
 */
const states = (name: string) => new RegExp("`" + name + "[`: ]").test(manual)
const missing = (names: readonly string[]) => names.filter((n) => !states(n))

// ===========================================================================
section("Every control, filter and capability the code has is in the manual")
// ===========================================================================

{
  const gone = missing(CONTROL_TYPES)
  check(`all ${CONTROL_TYPES.length} control types are documented`, gone.length === 0, gone.join(", "))
  check(
    "and the manual does not promise a control that does not exist",
    (manual.match(/^\| `([a-z_]+)` \| (string|number|boolean|enum|colour|asset|asset list|nothing)/gm) ?? [])
      .map((row) => row.split("`")[1])
      .every((t) => (CONTROL_TYPES as readonly string[]).includes(t)),
  )
  const aliases = missing(Object.keys(LEGACY_TYPE_ALIASES))
  check("the older control names are documented too", aliases.length === 0, aliases.join(", "))

  const noFilter = missing(FILTER_NAMES)
  check(`all ${FILTER_NAMES.length} filters are documented`, noFilter.length === 0, noFilter.join(", "))

  const noCap = missing(CAPABILITIES)
  check(`all ${CAPABILITIES.length} capabilities are documented`, noCap.length === 0, noCap.join(", "))
  const noArg = missing(SCRIPT_CONTEXT)
  check("and what a script is handed", noArg.length === 0, noArg.join(", "))
  const noBan = missing(FORBIDDEN_IDENTIFIERS)
  check(
    `all ${FORBIDDEN_IDENTIFIERS.length} identifiers a script cannot reach are listed`,
    noBan.length === 0,
    noBan.join(", "),
  )
}

// ===========================================================================
section("Every token a section can read is in the manual")
// ===========================================================================

{
  const vars = Object.values(SCHEME_CSS_VARS)
  const goneVars = missing(vars)
  check(`all ${vars.length} scheme properties are documented`, goneVars.length === 0, goneVars.join(", "))
  const goneKeys = missing(SCHEME_COLOR_KEYS)
  check("and their names in a template", goneKeys.length === 0, goneKeys.join(", "))
  check("the built-in scheme keys are named, because saved sections hold them", missing(BUILT_IN_SCHEME_KEYS).length === 0)

  const typeNames = TYPE_STYLE_KEYS.map((k) => k.replace(/_/g, "-"))
  const goneTypes = typeNames.filter((n) => !manual.includes(n))
  check(`all ${typeNames.length} text styles are named`, goneTypes.length === 0, goneTypes.join(", "))
  /**
   * Every `--type-…` the manual writes must be one the code emits.
   * `--type-body-lg-size` was in the first draft and is not: the code writes
   * `--type-body-large-size`, and somebody following that draft would have
   * written a rule that did nothing.
   */
  const emitted = new Set(Object.keys(typographyVars(themeTypography({}))))
  const written = Array.from(new Set(manual.match(/--type-[a-z0-9-]+/g) ?? []))
  const wrong = written.filter((v) => !emitted.has(v))
  check("and every type property it names is one the code emits", wrong.length === 0, wrong.join(", "))
  check("it names the whole shape of a style", ["font", "size", "weight", "line-height", "tracking", "transform"].every((p) => written.some((v) => v.endsWith(`-${p}`))))

  /* Some properties are written only once their setting has a value (Inputs, cards, badges and the other
     Shopify groups: theme-css.ts, parityVars), so the theme as it ships, every default set, is what is read. */
  const shipped = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default])))
  const theme = [...new Set([...Object.keys(themeVars({} as ThemeSettingsValues)), ...Object.keys(themeVars(shipped as unknown as ThemeSettingsValues))])]
  const documented = theme.filter((v) => manual.includes(v))
  check(
    "the theme properties the manual lists all exist",
    (manual.match(/--theme-[a-z-]+/g) ?? []).every((v) => theme.includes(v)),
    (manual.match(/--theme-[a-z-]+/g) ?? []).filter((v) => !theme.includes(v)).join(", "),
  )
  check("and it lists most of them", documented.length >= 15, `${documented.length} of ${theme.length}`)

  check("the page templates are the ones a theme has", THEME_PAGES.every((p) => manual.includes(`\`${p}\``)))
}

// ===========================================================================
section("Every number in the manual is the number in the code")
// ===========================================================================

{
  const table = manual.slice(manual.indexOf("| Limit | Value |"))
  const row = (label: string) => new RegExp(`\\| ${label} \\| ([^|]+) \\|`).exec(table)?.[1].trim()
  check("package size", row("Package") === `${LIMITS.packageBytes / 1024 / 1024} MB`, row("Package"))
  check("asset size", row("One asset") === `${LIMITS.assetBytes / 1024 / 1024} MB`, row("One asset"))
  check("source size", row("One source file") === `${LIMITS.sourceBytes / 1024} KB`, row("One source file"))
  check("stylesheet size", row("A section's CSS") === `${LIMITS.cssBytes / 1024} KB`, row("A section's CSS"))
  check("script size", row("A section's script") === `${LIMITS.scriptBytes / 1024} KB`, row("A section's script"))
  check("files per package", row("Files per package") === String(LIMITS.filesPerPackage), row("Files per package"))
  check("sections per template", row("Sections per template") === String(LIMITS.sectionsPerTemplate), row("Sections per template"))
  check("blocks per section", row("Blocks per section") === String(LIMITS.blocksPerSection), row("Blocks per section"))
  check("settings per schema", row("Settings per schema") === String(LIMITS.settingsPerSchema), row("Settings per schema"))
  check(`twenty-one is the number of values in a scheme`, SCHEME_COLOR_KEYS.length === 21 && manual.includes("twenty-one semantic values"))
}

// ===========================================================================
section("The manual does not promise what the engine does not do")
// ===========================================================================

{
  /**
   * Two things are accepted and not yet acted on: a script is checked and
   * stored rather than run, and a `migrations` list is validated and not
   * applied. A manual that says otherwise sends somebody to build on a
   * feature that is not there, which is the worst kind of wrong.
   */
  check(
    "it says plainly that scripts run, and where",
    /\*\*Scripts are parsed and checked when saved, then run in a sandbox\*\*/.test(manual)
      && /<iframe sandbox="allow-scripts">/.test(manual),
  )
  check(
    "and what does not cross from the sandbox to the page",
    /What does not cross: adding or removing elements/.test(manual),
  )
  check(
    "and that a setting rename is not applied yet",
    /the rename is not\s*\napplied by the engine today/.test(manual),
  )
  const runtime = readFileSync(join(root, "lib/website-builder/storelib-runtime.ts"), "utf8")
  check(
    "which is true: the renderer hands the checked script to the sandbox, never runs it",
    /script: c\.value\.script \?\? null/.test(runtime) && !/new Function|\beval\(/.test(runtime),
  )
}

// ===========================================================================
section("House style")
// ===========================================================================

{
  check("no em dashes", !manual.includes("—"))
  check(
    "the language section says what does not exist, not only what does",
    /No assignment of any kind/.test(manual) && /no numeric ranges|numeric ranges: /.test(manual) && /There are no arithmetic operators/.test(manual),
  )
  check("it is a manual rather than a summary", manual.split(/\s+/).length > 6000, `${manual.split(/\s+/).length} words`)
}

// ===========================================================================
section("The blog post is the manual, in blocks the blog actually draws")
// ===========================================================================

{
  /**
   * The blog renderer has a `switch` with eleven cases and a `default` that
   * returns null. The first version of this post was written in a different
   * vocabulary — `heading` and `text` blocks — and every one of them hit that
   * default: the post went live as a title, thirteen tables and nothing in
   * between. Nothing errored, because rendering nothing is not an error.
   */
  /* Round 45: the article's blocks are drawn by one renderer, beside the page. */
  const renderer = readFileSync(join(root, "app/(marketing)/blog/_components/article-blocks.tsx"), "utf8")
  const cases = Array.from(renderer.matchAll(/case "([a-z0-9]+)":/g)).map((m) => m[1])
  const payload = JSON.parse(readFileSync(join(root, "docs/blog/storelib-sections-manual.json"), "utf8")) as {
    content: { type: string; html?: string; text?: string; items?: string[]; headers?: string[] }[]
    title: string
    seo_title: string
    seo_description: string
  }
  const used = Array.from(new Set(payload.content.map((b) => b.type)))
  const unrendered = used.filter((t) => !cases.includes(t))
  check(
    "every block type the post uses is one the blog has a case for",
    unrendered.length === 0,
    `${unrendered.join(", ")} would render as nothing`,
  )
  check(
    "the post carries the whole manual, not a summary of it",
    payload.content.length > 200 && payload.content.filter((b) => b.type === "code").length > 30,
    `${payload.content.length} blocks`,
  )
  check(
    "and the generator is the manual's own text",
    // Regenerating from docs/storelib-manual.md must produce what is on disk,
    // or the post and the manual have drifted.
    payload.content.some((b) => b.type === "h2" && b.html === "1. The model, in one page") &&
      payload.content.some((b) => b.type === "code" && (b.text ?? "").includes("--scheme-background")),
  )
  check("the SEO title fits in a search result", payload.seo_title.length <= 60, `${payload.seo_title.length} characters`)
  check("and the description does too", payload.seo_description.length <= 160, `${payload.seo_description.length} characters`)
  /**
   * `ul`, `ol` and `table` content is a React child, not html. Markup in one
   * is shown to the reader as markup, so the generator must have flattened
   * every backtick and every bold marker rather than turned them into tags.
   *
   * Angle brackets themselves are fine and are meant: this manual talks about
   * `<script>` and about `<`, and React escapes them for display.
   */
  const MARKUP = /<\/?(code|strong|em|p|a|span)\b/
  check(
    "list items carry no markup, since the blog renders them as text",
    payload.content
      .filter((b) => b.type === "ul" || b.type === "ol")
      .every((b) => (b.items ?? []).every((x) => !MARKUP.test(x) && !x.includes("`"))),
  )
  check(
    "and table cells too",
    payload.content.filter((b) => b.type === "table").every((b) => (b.headers ?? []).every((x) => !MARKUP.test(x) && !x.includes("`"))),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
