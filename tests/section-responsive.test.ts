/**
 * ===========================================================================
 *  THE PREVIEW HAS TO TELL THE TRUTH
 * ===========================================================================
 * The theme editor does not render its preview in an iframe. It renders the
 * real section components inline, in the editor's own document, inside a card
 * that is 390px wide when you press the phone button.
 *
 * A Tailwind `md:` class is a VIEWPORT media query — it asks how wide the
 * browser WINDOW is, and the window is 1440px whatever size that card is. So
 * every `md:grid-cols-4` stayed on and the phone preview showed a four-column
 * grid crushed into 390px: not what a phone shows, not what anything shows.
 * Measured in Chromium before the fix, a stats section and a team section
 * reported [4, 3] columns at 390px, 834px and 1200px alike. After it, [2, 1],
 * [4, 2] and [4, 3].
 *
 * The fix is container queries — `@[768px]:` asks about the CARD — and the
 * thing that can quietly undo it is somebody adding a section, or a line to an
 * existing one, with a `md:` in it. It would look right on the live site and
 * be dead in the editor, which is the failure that was already there in
 * forty-eight of the fifty sections. These checks are what makes that loud.
 *
 * Run with:  npm run test:push
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const RENDERERS = join(root, "components/website-builder/sections/renderers")

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

const files = readdirSync(RENDERERS).filter((f) => f.endsWith(".tsx"))
const sources = new Map(files.map((f) => [f, readFileSync(join(RENDERERS, f), "utf8")]))

/**
 * The header is the one section that is NOT inside a container, on purpose:
 * it is the only one that positions anything `fixed` — its mobile drawer and
 * its sticky bar — and an ancestor with containment can become the containing
 * block for fixed descendants. It implements `deviceMode` by hand instead.
 */
const EXCLUDED = "HeaderSection.tsx"

// ===========================================================================
section("No section reaches for the viewport")
// ===========================================================================

/**
 * A prefix at a class boundary: start of string, or after a space, a quote, a
 * backtick or a brace. Deliberately NOT after a `[`, so the container syntax
 * `@[640px]:` cannot match itself, and not after `-`, so `text-sm` is left
 * alone — `sm:` is only a breakpoint when it starts a class.
 */
const VIEWPORT_PREFIX = /(^|[\s"'`{(])(sm|md|lg|xl|2xl):[a-z[]/

{
  const offenders: string[] = []
  for (const [file, src] of sources) {
    if (file === EXCLUDED) continue
    for (const [i, line] of src.split("\n").entries()) {
      // Comments talk about `md:` constantly; they do not ship any CSS.
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "")
      if (VIEWPORT_PREFIX.test(code)) offenders.push(`${file}:${i + 1}`)
    }
  }
  check(
    "every renderer but the header uses container queries, not media queries",
    offenders.length === 0,
    offenders.length ? `viewport prefixes at ${offenders.slice(0, 8).join(", ")}` : undefined,
  )
}

check(
  "the sections do use container queries — this is not passing because they are all unstyled",
  [...sources]
    .filter(([f]) => f !== EXCLUDED)
    .filter(([, src]) => /@\[\d+px\]:/.test(src)).length >= 25,
)

// ===========================================================================
section("The container exists, and the header is out of it")
// ===========================================================================

const dispatcher = readFileSync(
  join(root, "components/website-builder/sections/SectionRenderer.tsx"),
  "utf8",
)

check(
  "the dispatcher wraps sections in a container",
  /className="@container"/.test(dispatcher),
)

check(
  "a container query without a container matches nothing, so the wrapper is not conditional on the editor",
  !/insideEditor[^\n]*@container|@container[^\n]*insideEditor/.test(dispatcher),
)

check(
  "the header is excluded by name, in one place",
  /const NO_CONTAINER = new Set\(\["header"\]\)/.test(dispatcher) &&
    /NO_CONTAINER\.has\(props\.section\.type\)/.test(dispatcher),
)

check(
  "and the exclusion is a refusal to wrap, not a refusal to render",
  /if \(NO_CONTAINER\.has\(props\.section\.type\)\) return <Component \{\.\.\.props\} \/>/.test(
    dispatcher,
  ),
)

// ===========================================================================
section("No class is assembled at runtime")
// ===========================================================================

/**
 * Tailwind builds its stylesheet by SCANNING THE SOURCE for whole class names.
 * A name assembled from a variable — `grid-cols-${cols}` — is a name that was
 * never compiled: the class lands in the DOM and no rule matches it. It is a
 * silent failure, and TrustBadges had one, so its grid stayed at two columns
 * however many badges it had.
 */
const INTERPOLATED = new RegExp(
  "(?:" +
    [
      "grid-cols", "col-span", "row-span", "gap", "gap-x", "gap-y",
      "p", "px", "py", "pt", "pb", "pl", "pr",
      "m", "mx", "my", "mt", "mb", "ml", "mr",
      "w", "h", "min-w", "max-w", "min-h", "max-h",
      "text", "font", "leading", "tracking",
      "bg", "border", "rounded", "shadow", "opacity", "z",
      "flex", "basis", "order", "space-x", "space-y",
    ].join("|") +
    ")-\\$\\{",
)

{
  const offenders: string[] = []
  for (const [file, src] of sources) {
    for (const [i, line] of src.split("\n").entries()) {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "")
      if (INTERPOLATED.test(code)) offenders.push(`${file}:${i + 1}`)
    }
  }
  check(
    "no renderer builds a Tailwind class name out of a variable",
    offenders.length === 0,
    offenders.length ? `interpolated class names at ${offenders.join(", ")}` : undefined,
  )
}

check(
  "TrustBadges spells its columns out, so the ones it uses actually exist",
  /1: "@\[640px\]:grid-cols-1"/.test(sources.get("TrustBadgesSection.tsx") ?? "") &&
    !/grid-cols-\$\{/.test((sources.get("TrustBadgesSection.tsx") ?? "").replace(/^\s*\*.*$/gm, "")),
)

// ===========================================================================
section("Two devices, and each one changes what renders")
// ===========================================================================

const editor = readFileSync(
  join(root, "app/website-builder/editor/[installId]/page.tsx"),
  "utf8",
)

check(
  "the phone is a real phone's width",
  /**
   * 390 is iPhone 14/15/16 and the Pro — the commonest width there is, and
   * narrow enough that what survives it survives a 375px phone too. A preview
   * at a width no phone has is a preview that lies.
   */
  /mobile: 390/.test(editor),
)

check(
  "and there is no tablet",
  /**
   * Removed on request, and it was the right call: nobody designs to 834, a
   * layout that works at 390 and at 1280 works between them, and a breakpoint
   * that exists only in a preview is one nobody tests against. It was a third
   * choice the builder offered and did nothing with.
   */
  !/tablet: 834/.test(editor) &&
    !/id: "tablet"/.test(editor) &&
    !/"desktop" \| "tablet" \| "mobile"/.test(editor),
)

check(
  "and the two that remain are one toggling control, not a segmented group",
  // Two opposites are a toggle. The icon shows where you are; the tooltip says
  // what pressing it does.
  /setDevice\(device === "desktop" \? "mobile" : "desktop"\)/.test(editor),
)

/**
 * The card has to be set to the device's width for any of this to mean
 * anything: the sections measure the card, so a card that is always full width
 * is three buttons that do nothing.
 */
check(
  "the preview card is sized from the device, not hard-coded",
  /width: `\$\{DEVICE_WIDTH\[device\]\}px`/.test(editor),
)

check(
  "a narrow canvas shrinks the card rather than clipping it",
  /width: `\$\{DEVICE_WIDTH\[device\]\}px`,\s*\n\s*maxWidth: "100%"/.test(editor),
)

check(
  "the sections are told which device it is, for the header's sake",
  /deviceMode\?: "desktop" \| "tablet" \| "mobile"/.test(
    readFileSync(join(root, "components/website-builder/sections/_shared.tsx"), "utf8"),
  ),
)

/**
 * Stats used to force the mobile layout by hand off `deviceMode`. Two
 * mechanisms for one decision is how they end up disagreeing — at tablet, the
 * hand-written one says "not mobile" and the container says 834px, and only
 * one of them is looking at the actual width.
 */
check(
  "Stats has one mechanism, not two",
  !/forceMobile/.test(sources.get("StatsSection.tsx") ?? "") &&
    /@\[768px\]:grid-cols-4/.test(sources.get("StatsSection.tsx") ?? ""),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
