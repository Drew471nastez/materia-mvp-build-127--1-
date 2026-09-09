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
  check(
    "a section gap is only ever between sections, and never around the chrome",
    // A gap above the header or below the footer is not spacing, it is a page
    // that looks broken.
    /\[data-section\]:not\(\[data-chrome\]\)\+\[data-section\]:not\(\[data-chrome\]\)/.test(css),
  )
  check(
    "one long word cannot push the page sideways",
    /**
     * MEASURED, in Chromium at 390px with the real compiled stylesheet — see
     * scripts/check-responsive.mjs. With the shipped demo copy all fifty
     * sections were clean. With ONE unbreakable string in a text field — a
     * long product name, a pasted URL, an email address — THIRTY-FIVE of them
     * pushed the page into horizontal scroll, by up to 866px.
     *
     * `anywhere`, not `break-word`: only `anywhere` shrinks an element's
     * min-content width, and it is the min-content width that makes a flex or
     * grid child refuse to get narrower than its longest word. `break-word`
     * wraps the text and leaves the blowout exactly where it was.
     */
    /\[data-section\]\{overflow-wrap:anywhere/.test(css),
  )
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
section("The header, the announcement bar, and the space between them")
// ===========================================================================

/**
 * Reported from a published site, with a screenshot of the editor next to it
 * showing the same page correct:
 *
 *   • The announcement bar did not appear, and a band of empty background sat
 *     under the header instead.
 *   • Scrolling back to the top slid the header down OVER the bar.
 *
 * Both came from one decision. The live site rendered the sticky header as
 * `position: fixed; top: 0` plus an in-flow spacer, on the grounds that the
 * marketing layout's `overflow-x: clip` "kills position: sticky". That is true
 * of `overflow: hidden` and NOT of `clip` — not creating a scroll container is
 * the entire reason `clip` exists, and it was measured in Chromium against the
 * real layout before this changed.
 *
 * A header fixed at top:0 covers whatever is above it, and the spacer reserves
 * its height a second time. A fixed header also has no natural position to
 * return to, so coming back to the top it animates down across the bar.
 *
 * The behaviour itself is measured by scripts/check-sticky-header.mjs, in a
 * browser, in all three configurations. What is pinned here is that the two
 * things that caused it cannot come back.
 */
{
  const header = readFileSync(
    join(root, "components/website-builder/sections/renderers/HeaderSection.tsx"),
    "utf8",
  )
  const source = stripComments(header)

  check(
    "the header is sticky rather than fixed",
    /**
     * Both halves matter, and a break test is why. The first version only
     * looked for the literal `className="fixed top-0 left-0 right-0`, so
     * moving the same classes inside a `cn(…)` call put the bug straight back
     * with the suite still green.
     *
     * `fixed top-0 right-0` is left alone deliberately: that is the mobile
     * navigation drawer, which is supposed to be fixed.
     */
    !/fixed top-0 left-0|fixed inset-x-0 top-0/.test(source) &&
      /"sticky top-0 z-\[60\]/.test(source),
  )
  check(
    "and there is no spacer standing in for the space it no longer takes",
    !/In-flow spacer/.test(header) && !/height: measuredH \|\| undefined/.test(source),
  )
  check(
    "it is not promoted to a compositor layer for an animation it never runs",
    /**
     * `header_sticky_on_scroll_up` defaults to FALSE, so on almost every site
     * the header never moves — and it was still shipping `transform:
     * translateY(0)`, a transition and `will-change: transform` on every
     * render.
     *
     * An identity transform is not nothing. With `will-change` beside it, it
     * promotes the header to its own compositor layer permanently. The layout
     * stays correct — measured in Chromium in all four configurations, the
     * next section's top and the header's bottom land on the same pixel — but
     * a permanently promoted `position: sticky` element inside an
     * `overflow-x: clip` ancestor is exactly where a stale tile shows through
     * as a band under the header. It explains the two things a layout bug
     * cannot: why it appeared only after scrolling, and why it came and went.
     *
     * Guarded at the SOURCE as well as in scripts/check-sticky-header.mjs,
     * because that probe needs a production build and does not run on push —
     * so this is the copy that actually bites when somebody edits this file.
     */
    /const revealEnabled = headerStickyEnabled && headerStickyOnScrollUp/.test(source) &&
      // The promotion is conditional on it.
      /revealEnabled && "will-change-transform"/.test(source) &&
      // And the class list no longer carries the promotion unconditionally.
      !/"sticky top-0 z-\[60\] will-change-transform/.test(source),
  )
  check(
    "it can never be translated while it is unpinned",
    /**
     * The reveal slides the header in from `translateY(-100%)`. That is right
     * while it is PINNED. At the top of the page it is wrong: up there the
     * header's own box sits BELOW the announcement bar, so -100% starts it
     * above itself — on top of the bar — and the transition walks it back down
     * across the bar. That is the reported overlap, and it only happens on the
     * way home.
     */
    /**
     * `hidden && pinned` is the value APPLIED, not `hidden`. That is the
     * difference between a gate on when the hidden flag may change and a
     * guarantee that an unpinned header is never translated — the first still
     * leaves a frame where a stale flag paints the broken state.
     */
    /apply\(hidden && pinned, pinned\)/.test(source) &&
      // The gate is the header's OWN position, not a magic number. `y < 80`
      // let it hide while still unpinned whenever the bar was taller than 80px.
      /const pinned = y >= originOf\(\) - 1/.test(source) &&
      !/y < 80/.test(source) &&
      // Read from offsetTop, because the rect is displaced by the very
      // transform this decides whether to apply.
      /let top = el\.offsetTop/.test(source) &&
      // And it is written to the node, not to React state — a render is a
      // reconcile and a commit after the scroll that caused it, and those
      // frames are the white flash.
      /el\.style\.transform = hide \?/.test(source) &&
      !/setStickyVisible|setUnpinned/.test(source),
  )
  check(
    "the editor and the published page take the same branch",
    /**
     * They took different ones — `useStickyFixed` versus `useStickyInFlow` —
     * which is exactly why the bug was invisible in the editor.
     */
    !/useStickyFixed|useStickyInFlow/.test(source) && /const useSticky = headerStickyEnabled/.test(source),
  )
  check(
    "a transparent header overlays without waiting for JavaScript",
    /**
     * The overlay is a negative margin of the header's own height, and that
     * height comes from a layout effect — which does not run on the server. A
     * bare `-measuredH` made the header take full space in the first paint and
     * jump on hydration.
     */
    /var\(--storelib-header-h, 72px\)/.test(source),
  )

  const css = themeStylesheet({ animations_enabled: true, section_gap: 24 } as ThemeSettingsValues)
  check(
    "the call to action can be long without taking the page with it",
    /**
     * `shrink-0` on a nowrap label fixes a flex item at whatever its text
     * needs, for ever. Measured at 834px with a forty-character button label —
     * somebody's real button copy — the header ran 104px past the edge of the
     * page and took the document into horizontal scroll.
     *
     * The theme's `overflow-wrap: anywhere` cannot reach it: an item that is
     * not allowed to shrink never gets down to its min-content width at all.
     */
    /"ml-1 min-w-0 max-w-\[160px\] truncate font-semibold/.test(source),
  )
  check(
    "and the entrance animation leaves the chrome alone",
    /**
     * Measured: with the animation on every section a sticky header sat 16px
     * low — `translateY(16px)` is the from-state of "fade up", and the
     * header's own `transform` is what slides it away on scroll, so the two
     * were fighting over one property.
     */
    /\[data-section\]:not\(\[data-chrome\]\)\{animation:storelibSectionIn/.test(css) &&
      !/\[data-section\]\{animation:storelibSectionIn/.test(css),
  )
  check(
    "which means the header and the footer have to say they are chrome",
    /isChrome/.test(header) &&
      /isChrome/.test(
        readFileSync(join(root, "components/website-builder/sections/renderers/FooterSection.tsx"), "utf8"),
      ),
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
