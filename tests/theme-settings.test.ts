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
import { themeTypography, typographyStylesheet } from "@/lib/storelib-theme/typography"
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
  "lib/storelib-theme/typography.ts",
  "lib/storelib-theme/color-schemes.ts",
  "lib/website-builder/theme-metadata.ts",
  "components/website-builder/theme/ThemePage.tsx",
  "components/website-builder/theme/ThemeSocials.tsx",
  "components/website-builder/sections/_shared.tsx",
  "components/website-builder/sections/renderers/HeaderSection.tsx",
  "components/website-builder/sections/renderers/FooterSection.tsx",
  "app/(site)/w/[username]/render-site.tsx",
  "app/(marketing)/[sellername]/page.tsx",
  "components/website-builder/theme/render-product.tsx",
  /* The announcement bar's messages and timing, read for ThemePage. */
  "lib/website-builder/announcement.ts",
  /* The menus, read for every section that shows one and for the header. */
  "lib/website-builder/storefront-data.ts",
  /* `theme.*` as a section reads it (themeGlobals: badges, brand, cart, currency) and the currency code on prices. */
  "lib/storelib-theme/resolve.ts",
  "lib/storelib-theme/render.ts",
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

  /**
   * A selector may be wrapped in `:where(…)` to strip its specificity — the
   * link rule is, so that a section's own button rule outweighs it — and the
   * root is then inside the brackets. Unwrapped before the check, because
   * what this is about is whether the rule can escape the page root, and
   * `:where([data-storelib-theme] a)` cannot.
   */
  const unwrap = (sel: string) => {
    const t = sel.trim()
    return t.startsWith(":where(") && t.endsWith(")") ? t.slice(7, -1) : t
  }
  const unscoped = selectors.filter(
    (sel) => !unwrap(sel).split(",").every((part) => part.trim().startsWith(`[${THEME_ROOT_ATTRIBUTE}]`)),
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
    /**
     * A gap above the header or below the footer is not spacing, it is a page
     * that looks broken.
     *
     * AND IT HAS TO MATCH SOMETHING. This read `[data-section]+[data-section]`
     * for months, and `[data-section]` is the wrapper INSIDE each section's
     * container: two sections' wrappers are cousins, never siblings, so the
     * rule matched nothing and the Section gap setting did nothing. Counted
     * in a browser: four sections, zero adjacent pairs. The marker is on the
     * container now, which is the element that does have siblings, and the
     * selector is `~` rather than `+` because the editor puts an insert strip
     * between sections.
     */
    /\[data-section-box\]:not\(\[data-chrome\]\) ~ \[data-section-box\]:not\(\[data-chrome\]\)/.test(css),
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
  // Not the apex route: `storelib.com/<name>` is the creator's page and
  // draws no theme. The website is `<name>.storelib.com`, served by /w.
  const surfaces = [
    "app/website-builder/editor/[installId]/page.tsx",
    "app/(site)/w/[username]/render-site.tsx",
    "components/website-builder/theme/render-product.tsx",
  ]
  const sources = surfaces.map((f) => [f, readFileSync(join(root, f), "utf8")] as const)

  const notUsing = sources.filter(([, src]) => !/<ThemePage/.test(src)).map(([f]) => f)
  check("all three render the same page component", notUsing.length === 0, notUsing.join(", "))

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
  /**
   * NO EM DASHES IN ANYTHING A VISITOR READS.
   *
   * Asked for directly: the dash reads as machine-written, and it was all over
   * the shipped theme defaults — every new store started with it in their
   * hero, their sticky bar and their author bio.
   *
   * The themes are checked as DATA rather than by eye, and the agent is
   * checked for the instruction that stops it writing new ones, because the
   * agent is what fills most pages and a one-off sweep would be undone by the
   * next generated section.
   */
  const themeFiles = (function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : [],
    )
  })(join(root, "themes"))
  const offenders = themeFiles.filter((f) => readFileSync(f, "utf8").includes("\u2014"))
  check(
    "no shipped theme copy contains an em dash",
    offenders.length === 0,
    offenders.length ? `        ${offenders.length} file(s), e.g. ${offenders[0]}` : undefined,
  )
  check(
    "and the agent is told never to write one",
    /Never use an em dash/.test(
      readFileSync(join(root, "lib/website-builder/agent/house-style.ts"), "utf8"),
    ),
  )
}

{
  /**
   * THE UNIT A CONTROL DECLARES IS THE UNIT ITS CSS MUST WRITE.
   *
   * `heading_letter_spacing` is `{ min: -2, max: 8, step: 0.5, unit: "px" }` —
   * a slider labelled and stepped in pixels — and the stylesheet wrote its
   * value in `em`. One step below zero reads as "-0.5px" in the panel and
   * emitted `-0.5em`, which at a 60px heading is thirty pixels of negative
   * tracking per letter: the headline rendered as a single white smear, and
   * the setting that caused it looked innocuous.
   *
   * This checks the whole file rather than that one line, because the fault is
   * a CLASS of fault and the next one will be a different setting.
   */
  const css = stripComments(readFileSync(join(root, "lib/website-builder/theme-css.ts"), "utf8"))
  const typography = stripComments(readFileSync(join(root, "lib/storelib-theme/typography.ts"), "utf8"))
  check(
    "heading tracking is written in the unit its control declares",
    // The control seeds the Heading 2 style's letter spacing, clamped to the
    // control's own range in the typography module, and the variable is
    // written from that style in px.
    /"--theme-heading-tracking": `\$\{typo\.styles\.h2\.letter_spacing\}px`/.test(css) &&
      /Math\.max\(-2, Math\.min\(8, num\(t\.heading_letter_spacing, 0\)\)\)/.test(typography) &&
      !/heading_letter_spacing, 0\)\}em/.test(css),
  )
  check(
    "and no theme variable is emitted in em at all",
    // Every length in this file comes from a px-declared control or is a
    // unitless multiplier. An `em` here is a unit mismatch waiting to happen.
    !/\}em`/.test(css),
  )
}

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
    "reveal-on-scroll-up works on its own, without the always-pinned toggle",
    /**
     * They were master-and-sub: with "Enable sticky header" off, turning on
     * "Sticky header on scroll up" produced a header that did not move at all
     * — the control lying about what it does. They describe two different
     * behaviours ("always pinned" versus "pinned, but out of the way until you
     * scroll up"), each complete on its own, so either one makes the header
     * sticky and the reveal follows from its own toggle alone.
     */
    /const useSticky = headerStickyEnabled \|\| headerStickyOnScrollUp/.test(source) &&
      /const revealEnabled = headerStickyOnScrollUp/.test(source) &&
      /if \(!headerStickyOnScrollUp\) \{/.test(source) &&
      !/headerStickyEnabled && headerStickyOnScrollUp/.test(source),
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
    /const revealEnabled = headerStickyOnScrollUp/.test(source) &&
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
    /apply\(hidden && mayMove, mayMove\)/.test(source) &&
      /**
       * And a HEADER'S HEIGHT of clearance, not one pixel. Un-pinning is the
       * browser's job and happens with the scroll; the transform is ours and
       * arrives on a scroll event. At the origin the two disagree for a frame,
       * the header is drawn off its own box, and the gap under it shows the
       * page background — filmed, it is a white band that grows toward the
       * announcement bar's height and snaps shut.
       */
      /**
       * The height is now READ ONCE PER MEASUREMENT rather than once per
       * scroll event — `sampleOrigin` takes it beside the origin, and is run
       * again on a resize and on a ResizeObserver of the header itself, so a
       * logo swapped or a padding slider dragged while the creator is
       * scrolled down still moves the line. The clearance is the same full
       * header's height it always was; what changed is that reading it no
       * longer happens forty times a flick.
       */
      /const settled = origin \+ height/.test(source) &&
      /height = el\.offsetHeight/.test(source) &&
      /new ResizeObserver\(sampleOrigin\)/.test(source) &&
      /const mayMove = y >= settled/.test(source) &&
      !/y >= originOf\(\) - 1/.test(source) &&
      /**
       * Measured from RECTS, not by walking `offsetParent`. That walk skips
       * ancestors which are not positioned, so inside the editor it never
       * reached the preview scroller and accumulated the editor page's own
       * offsets instead — `settled` came out enormous and the header never
       * hid at all.
       */
      /const rel = el\.getBoundingClientRect\(\)\.top - containerTop\(\)/.test(source) &&
      /if \(rel > 1 \|\| y <= 1\) origin = Math\.max\(0, y \+ rel\)/.test(source) &&
      !/let parent = el\.offsetParent/.test(source) &&
      !/y < 80/.test(source) &&
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
    !/useStickyFixed|useStickyInFlow/.test(source) &&
      /const useSticky = headerStickyEnabled \|\| headerStickyOnScrollUp/.test(source),
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
    /\[data-section-box\]:not\(\[data-chrome\]\) ~ \[data-section-box\]:not\(\[data-chrome\]\) \[data-section\]\{animation:storelibSectionIn/.test(css) &&
      !/\[data-storelib-theme\] \[data-section\]\{animation:storelibSectionIn/.test(css),
  )
  check(
    "and the first section under the header appears with the page, so no band of background shows between them on load",
    !/ \[data-section\]:not\(\[data-chrome\]\)\{animation:/.test(css),
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
    "the panel's toggle, switched off, is noindex",
    /**
     * "Allow search indexing" is a toggle and stores a boolean. Only strings
     * were read, so `false` fell through to the default and the site was
     * indexed with the switch off.
     */
    (() => {
      const off = themeMetadata({ seo_robots: false } as ThemeSettingsValues, { title: "t", description: "d" }).robots as {
        index: boolean
        follow: boolean
      }
      const on = themeMetadata({ seo_robots: true } as ThemeSettingsValues, { title: "t", description: "d" }).robots as {
        index: boolean
      }
      return off.index === false && off.follow === false && on.index === true
    })(),
  )
  check(
    "a chosen language reaches the share card, and nonsense does not",
    (() => {
      const og = (v: unknown) =>
        (themeMetadata({ site_language: v } as ThemeSettingsValues, { title: "t", description: "d" }).openGraph as {
          locale?: string
        }).locale
      return og("ro") === "ro_RO" && og("xx") === undefined && og('"><script>') === undefined && og(undefined) === undefined
    })(),
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

// ═══════════════════════════════════════════════════════════════════════
section("A section's type controls reach the section")
// ═══════════════════════════════════════════════════════════════════════
{
  /**
   * Every override used to be written `[data-heading-style] [data-section]`,
   * which asks for a section INSIDE the element carrying the style. The
   * markup is the other way about — the attribute sits on a wrapper INSIDE
   * `[data-section]` — so not one of them ever matched, and every section
   * came out at Heading 2's size whatever was picked. Measured across all
   * thirty by scripts/check-schemes.mjs: 24 had a heading, and all 24 were
   * 36px under h1, h2, h3, h4 and custom alike.
   */
  const css = typographyStylesheet("[data-theme-root]", themeTypography({}))
  for (const key of ["h1", "h3", "h4", "custom"]) {
    check(
      `a section set to ${key} is reached by the rule for it`,
      css.includes(`[data-theme-root] [data-section] [data-heading-style="${key}"],`),
    )
  }
  for (const key of ["body_large", "body_small", "custom"]) {
    check(
      `and a body set to ${key}`,
      css.includes(`[data-theme-root] [data-section] [data-body-style="${key}"],`),
    )
  }
  check(
    "the republished --section-text-* reaches it too",
    /\[data-theme-root\] \[data-section\] \[data-body-style\][^{]*\{[^}]*--section-text-size:var\(--section-body-size\)/.test(css),
  )
  /**
   * The other nesting is still written, because which wrapper carries the
   * attribute is an implementation detail of one component, and this rule
   * should not be able to fail silently again if it moves.
   */
  check("and the other nesting is kept, so moving the attribute cannot break it", css.includes(`[data-theme-root] [data-heading-style="h1"] [data-section]{`))
  /**
   * An unchosen style still inherits the theme's H2, and the override has to
   * outweigh that default (0,2,0 against 0,1,0) or picking one would do
   * nothing at all.
   */
  check("an unchosen style still falls back to the theme's H2", css.includes(`[data-theme-root] [data-section]{--section-heading-font:var(--type-h2-font)`))
}

// ═══════════════════════════════════════════════════════════════════════
section("A secondary button is painted in the scheme's own colours")
// ═══════════════════════════════════════════════════════════════════════
{
  /**
   * Every section's `.s__btn--secondary` used to read
   * `transparent / var(--s-heading) / var(--s-border)`: a stand-in for the
   * scheme's secondary-button colours rather than the colours themselves.
   * So the two Secondary button overrides in the section panel changed
   * nothing, and on a light scheme the outline was drawn in the faint
   * divider colour instead of the dark one the scheme asks for.
   *
   * "The colour schemes don't really control the buttons of the sections."
   */
  const dir = join(process.cwd(), "themes/default/sections")
  const files = readdirSync(dir).filter((f) => f.endsWith(".storelib"))
  const withSecondary = files.filter((f) => readFileSync(join(dir, f), "utf8").includes(".s__btn--secondary"))
  const standIn = withSecondary.filter((f) => /\.s__btn--secondary \{[^}]*var\(--s-heading\)/.test(readFileSync(join(dir, f), "utf8")))
  const wired = withSecondary.filter((f) => {
    const src = readFileSync(join(dir, f), "utf8")
    return /\.s__btn--secondary \{ background: var\(--s-btn2\); color: var\(--s-btn2-text\); border-color: var\(--s-btn2-border\); \}/.test(src) &&
      src.includes("--s-btn2: {{ scheme.secondary_btn_bg }}") &&
      src.includes("--s-btn2-text: {{ scheme.secondary_btn_text }}") &&
      src.includes("--s-btn2-border: {{ scheme.secondary_btn_border }}")
  })
  check(`every section with a secondary button reads the scheme's colours for it (${withSecondary.length})`, wired.length === withSecondary.length, `not wired: ${withSecondary.filter((f) => !wired.includes(f)).join(", ")}`)
  check("and none of them paints it with the heading colour any more", standIn.length === 0, standIn.join(", "))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
