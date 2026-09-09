/**
 * ===========================================================================
 *  THE THEME SETTINGS, AND WHETHER A PAGE OBEYS THEM
 * ===========================================================================
 * Storelib's theme settings are a Shopify-shaped `settings_schema`: twelve
 * groups, ninety-three controls, a panel that looks exactly like a theme
 * editor. Measured before this suite existed, FIFTY-TWO OF THEM WERE READ BY
 * NOTHING — not "by one page and not another", by nothing anywhere in the
 * repository.
 *
 *   • The entire Layout group. Max page width, side padding, section gap,
 *     spacing scale, card radius, card shadow, image radius.
 *   • The entire Animations group.
 *   • The entire Cookies group — a creator switching on a cookie banner to
 *     satisfy a legal obligation got nothing at all.
 *   • Base font size, line height, heading weight, heading transform, heading
 *     letter spacing.
 *   • Five of the seven button controls.
 *   • Nine colours.
 *   • `seo_robots`, which somebody sets to "noindex" and trusts.
 *
 * And the page itself was being assembled FOUR TIMES — the editor canvas, the
 * storefront, the seller page, the product page — each with its own
 * announcement bar and its own ordering. They had already drifted: the three
 * public routes applied the theme's background and body font and the editor
 * did not, so a creator designed on a white page in Inter and published
 * something else.
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeStylesheet, themeVars, THEME_ROOT_ATTRIBUTE } from "@/lib/website-builder/theme-css"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
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

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

/** Everything that could read a theme setting. */
const CONSUMERS = [
  "lib/website-builder/theme-css.ts",
  "lib/website-builder/theme-metadata.ts",
  "components/website-builder/theme/ThemePage.tsx",
  "components/website-builder/theme/ThemeSocials.tsx",
  "components/website-builder/sections/_shared.tsx",
  "components/website-builder/sections/renderers/HeaderSection.tsx",
  "components/website-builder/sections/renderers/FooterSection.tsx",
  "app/(marketing)/w/[username]/page.tsx",
  "app/(marketing)/[sellername]/page.tsx",
  "app/products/[slug]/page.tsx",
]
const consumed = CONSUMERS.map((f) => stripComments(readFileSync(join(root, f), "utf8"))).join("\n")

const SETTINGS = THEME_SETTINGS_GROUPS.flatMap((group) =>
  (group.fields ?? []).filter((f) => f.type !== "header" && f.type !== "paragraph"),
)

// ===========================================================================
section("Every control in the theme panel does something")
// ===========================================================================

{
  /**
   * A PROPERTY ACCESS, not a bare word — the lesson from the section audit,
   * where `\blightbox\b` matched a local variable and quietly exempted the
   * setting it was supposed to be checking.
   */
  const reads = (id: string) =>
    new RegExp(`[\\w$]+\\??\\.(?:settings\\??\\.)?${id}\\b|["']${id}["']`).test(consumed)

  const dead = SETTINGS.map((f) => f.id).filter((id) => !reads(id))
  check(
    "not one of the ninety-three is read by nothing",
    dead.length === 0,
    `${dead.length}: ${dead.join(", ")}`,
  )
}

// ===========================================================================
section("The settings reach the sections, which is what makes it a theme")
// ===========================================================================

{
  /**
   * A theme setting has no way to reach a section on its own: the sections are
   * React components with Tailwind classes, and `page_width: 1440` cannot
   * change `max-w-[1230px]`. That is WHY fifty-two settings were dead — each
   * was added to the panel, wired to nothing, and forgotten.
   *
   * The answer is Shopify's: compile the settings into CSS custom properties
   * on one root, and write the sections against those properties.
   */
  const vars = themeVars({ page_width: 1440, content_padding_x: 48, spacing_scale: 1.5 } as ThemeSettingsValues)
  check(
    "a theme compiles to custom properties",
    vars["--theme-page-width"] === "1440px" &&
      vars["--theme-padding-x"] === "48px" &&
      vars["--theme-spacing-scale"] === "1.5",
    JSON.stringify(vars["--theme-page-width"]),
  )
  check(
    "a value that arrived as text still compiles",
    // The model writes `"1440"`; the panel writes 1440. Both are the setting.
    themeVars({ page_width: "1440" } as unknown as ThemeSettingsValues)["--theme-page-width"] === "1440px",
  )
  check(
    "and an unset theme gets the defaults rather than `undefinedpx`",
    themeVars({} as ThemeSettingsValues)["--theme-page-width"] === "1280px" &&
      !JSON.stringify(themeVars({} as ThemeSettingsValues)).includes("undefined") &&
      !JSON.stringify(themeVars({} as ThemeSettingsValues)).includes("NaN"),
  )

  const renderers = join(root, "components/website-builder/sections/renderers")
  const rendererFiles = readdirSync(renderers).filter((f) => f.endsWith(".tsx"))
  const sourceOf = (f: string) => readFileSync(join(renderers, f), "utf8")

  const usingVar = rendererFiles.filter((f) => /max-w-\(--theme-page-width\)/.test(sourceOf(f)))
  check(
    "the sections take the page width from the theme, not from a literal",
    usingVar.length >= 25,
    `${usingVar.length} renderers`,
  )
  const stale = rendererFiles.filter((f) => /max-w-\[1230px\]/.test(sourceOf(f)))
  check("and not one of them still hard-codes it", stale.length === 0, stale.join(", "))

  const shared = readFileSync(join(root, "components/website-builder/sections/_shared.tsx"), "utf8")
  check(
    "section padding is a multiple of the theme's spacing scale",
    /var\(--theme-spacing-scale/.test(shared),
  )

  /**
   * The variables need a floor. A section can be rendered outside a themed
   * page — a dashboard preview card, a screenshot job — and
   * `max-w-(--theme-page-width)` with no value resolves to `max-width: none`,
   * which is a section that suddenly goes full-bleed.
   */
  const globals = readFileSync(join(root, "app/globals.css"), "utf8")
  check(
    "and they have a floor for anything rendered outside a themed page",
    /--theme-page-width:\s*\d+px/.test(globals) && /--theme-spacing-scale:\s*1/.test(globals),
  )
}

// ===========================================================================
section("The stylesheet is scoped, or it would leak into the editor")
// ===========================================================================

{
  const css = themeStylesheet({ animations_enabled: true, section_gap: 32 } as ThemeSettingsValues)
  const selectors = css
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("@"))
    .map((line) => line.split("{")[0].trim())

  const unscoped = selectors.filter(
    (sel) => !sel.split(",").every((part) => part.trim().startsWith(`[${THEME_ROOT_ATTRIBUTE}]`)),
  )
  check(
    "every rule is scoped to the page root",
    /**
     * The editor canvas shares a document with the editor's own chrome, and
     * two creators' pages can be open at once. A bare `h2 { font-weight: … }`
     * would restyle the sidebar.
     */
    unscoped.length === 0,
    unscoped.join(" | "),
  )
  check("a section gap is only ever between sections", /\[data-section\]\+\[data-section\]/.test(css))
  check(
    "the entrance animation respects a reduced-motion setting",
    /prefers-reduced-motion/.test(css),
  )
  check(
    "and there is no animation at all when the theme has not asked for one",
    !/@keyframes storelibSectionIn/.test(themeStylesheet({} as ThemeSettingsValues)),
  )
}

// ===========================================================================
section("One page, four surfaces")
// ===========================================================================

{
  /**
   * The editor canvas, the storefront, the seller page and the product page
   * each built a page from scratch. Two of the four did not even go through
   * the shared section list. Every setting added to one had to be remembered
   * in three others, which is why the announcement bar's link, its scrolling
   * option and its dismiss button were in the panel and on none of them.
   */
  const surfaces = [
    "app/website-builder/editor/[installId]/page.tsx",
    "app/(marketing)/w/[username]/page.tsx",
    "app/(marketing)/[sellername]/page.tsx",
    "app/products/[slug]/page.tsx",
  ]
  const sources = surfaces.map((f) => [f, readFileSync(join(root, f), "utf8")] as const)

  const notUsing = sources.filter(([, src]) => !/<ThemePage/.test(src)).map(([f]) => f)
  check("all four render the same page component", notUsing.length === 0, notUsing.join(", "))

  const ownBar = sources
    .filter(([, src]) => /announcement_bar_enabled/.test(stripComments(src)))
    .map(([f]) => f)
  check(
    "and none of them still builds its own announcement bar",
    ownBar.length === 0,
    ownBar.join(", "),
  )

  /**
   * Where the header goes is not grepped for here — it is DRIVEN, in
   * tests/section-render.test.ts, by rendering a page whose sections are
   * saved in the wrong order and asserting the header still comes out first.
   * A regular expression over four files could not tell the difference
   * between laying a page out and composing one, and the editor legitimately
   * does the second: a product page borrows the home page's header.
   */

  check(
    "the editor preview is on the theme's background, in the theme's font",
    /**
     * It was not. The three public routes set both; the canvas set neither, so
     * the preview a creator designs against was a white page in Inter whatever
     * they had chosen — and they only found out after publishing.
     */
    /background:var\(--theme-bg\)/.test(themeStylesheet({} as ThemeSettingsValues)) &&
      /font-family:var\(--theme-font-body\)/.test(themeStylesheet({} as ThemeSettingsValues)),
  )
}

// ===========================================================================
section("Robots, which is a setting somebody trusts")
// ===========================================================================

{
  const meta = (robots: string) =>
    themeMetadata({ seo_robots: robots } as ThemeSettingsValues, { title: "t", description: "d" })

  check(
    "noindex means noindex",
    /**
     * It was read by nothing, so a site set to "noindex" while it was being
     * built was indexed anyway. Parsed rather than passed through, because
     * Next takes booleans and ignores a raw string in silence — the same
     * failure a second time.
     */
    (meta("noindex, nofollow").robots as { index: boolean; follow: boolean }).index === false &&
      (meta("noindex, nofollow").robots as { follow: boolean }).follow === false,
  )
  check(
    "and the default is still indexable",
    (meta("index, follow").robots as { index: boolean }).index === true &&
      (themeMetadata({} as ThemeSettingsValues, { title: "t", description: "d" }).robots as { index: boolean })
        .index === true,
  )
  check(
    "a share image reaches both cards",
    (() => {
      const m = themeMetadata({ seo_og_image: "https://x/y.png" } as ThemeSettingsValues, {
        title: "t",
        description: "d",
      })
      return (
        JSON.stringify(m.openGraph).includes("https://x/y.png") &&
        JSON.stringify(m.twitter).includes("https://x/y.png")
      )
    })(),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
