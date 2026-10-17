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

import { untt } from "./i18n-source"
import { existsSync, readFileSync, readdirSync } from "node:fs"
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
const sources = new Map(files.map((f) => [f, untt(readFileSync(join(RENDERERS, f), "utf8"))]))

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

const dispatcher = untt(readFileSync(
  join(root, "components/website-builder/sections/SectionRenderer.tsx"),
  "utf8",
), "components/website-builder/sections/SectionRenderer.tsx")

check(
  "the dispatcher wraps sections in a container",
  /* Every section but one in the Overlay group, whose `position: fixed` a container would hold inside its box. */
  /className=\{overlay \? props\.boxClassName \|\| undefined : props\.boxClassName \? `@container \$\{props\.boxClassName\}` : "@container"\}/.test(dispatcher) &&
    /const overlay = props\.section\.group === "overlay"/.test(dispatcher),
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
  // Still no @container wrapper for it, and now behind the error boundary
  // every section is behind: see SectionErrorBoundary.
  /if \(NO_CONTAINER\.has\(props\.section\.type\)\) return guard\(<Component \{\.\.\.props\} \/>\)/.test(
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

const editor = untt(readFileSync(
  join(root, "app/website-builder/editor/[installId]/page.tsx"),
  "utf8",
), "app/website-builder/editor/[installId]/page.tsx")
/* Add a section: the phone's sheet and the computer's dialog, in their own module. */
const library = untt(readFileSync(join(root, "components/website-builder/editor/section-library.tsx"), "utf8"), "components/website-builder/editor/section-library.tsx")
const sectionsList = untt(readFileSync(join(root, "components/website-builder/editor/sections-list.tsx"), "utf8"), "components/website-builder/editor/sections-list.tsx")
const libraryPhone = library.slice(library.indexOf("if (phone) {"), library.indexOf("// ── A computer"))
const nativeChromeSrc = untt(readFileSync(join(root, "components/website-builder/native-chrome.ts"), "utf8"), "components/website-builder/native-chrome.ts")
const scrollbarSrc = untt(readFileSync(join(root, "components/website-builder/canvas-scrollbar.tsx"), "utf8"), "components/website-builder/canvas-scrollbar.tsx")

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
  "and the preview offers no tablet",
  /**
   * Removed on request, and it was the right call: nobody designs to 834, a
   * layout that works at 390 and at 1280 works between them, and a breakpoint
   * that exists only in a preview is one nobody tests against. It was a third
   * choice the builder offered and did nothing with.
   *
   * NARROWED, AND THE RULE IS UNCHANGED. This used to fail on the string
   * `id: "tablet"` appearing anywhere in the file, which is about the PREVIEW
   * DEVICE SWITCH but reads as a ban on the word. A setting that holds one
   * value per breakpoint has three, because the engine has three and the
   * sections' own container queries break at 640px and at 900px: without the
   * middle one, a 700px window gets the desktop column count. That is the
   * .storelib language's business, not the preview's, so the guard now names
   * the thing it was protecting.
   */
  !/tablet: 834/.test(editor) &&
    !/DEVICE_WIDTH[\s\S]{0,120}tablet/.test(editor) &&
    !/DeviceMode = [^\n]*tablet/.test(editor) &&
    !/"desktop" \| "tablet" \| "mobile"/.test(editor) &&
    // the switch cycles desktop, phone and Large, and no tablet
    /\{ key: "mobile", label: `Phone/.test(editor) && /\{ key: "desktop", label: "Desktop"/.test(editor) && !/key: "tablet"/.test(editor),
)

check(
  "phone and desktop are one switch, and Large is no longer a stop (round 22: \"keep only mobile and desktop\")",
  /**
   * It was a toggle between two devices, with full screen as a separate
   * button parked beside it. The owner asked for full screen to be the
   * third place on the same switch ("it should be the 3rd thing of that
   * switching phone, desktop, large, not a separate icon"), because all
   * three answer one question: how am I looking at the page.
   */
  /aria-label=\{`Preview size: \$\{now\.label\}/.test(editor) && /setDevice\(key\)/.test(editor) && !/key: "full", label: "Large"/.test(editor),
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
    untt(readFileSync(join(root, "components/website-builder/sections/_shared.tsx"), "utf8"), "components/website-builder/sections/_shared.tsx"),
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

// ===========================================================================
section("The page you are editing is named, and it is in the middle")
// ===========================================================================

const switcher = untt(readFileSync(join(root, "components/website-builder/page-switcher.tsx"), "utf8"), "components/website-builder/page-switcher.tsx")

check(
  "the page switcher sits in the centre of the bar",
  /**
   * It was a button on a rail with a panel behind it: two clicks and a change
   * of context to answer "which page am I on". The page being edited is the
   * most important fact in an editor, so it is in the middle, named.
   */
  /<div className="flex flex-1 items-center justify-center gap-1\.5 min-w-0">[\s\S]{0,6000}<PageSwitcher/.test(editor),
)

check(
  "with the format control to its left and the live link to its right",
  (() => {
    const centre = editor.slice(
      editor.indexOf("CENTRE: WHICH PAGE, AND HOW YOU ARE LOOKING AT IT"),
      editor.indexOf("RIGHT: where the site is"),
    )
    const fmt = centre.indexOf("aria-label={`Preview size:")
    const sw = centre.indexOf("<PageSwitcher")
    const open = centre.indexOf("Open the live page")
    // Reload is INSIDE the pill now, asserted on the switcher below.
    return fmt > 0 && sw > fmt && open > sw && !/Reload preview/.test(centre)
  })(),
)

check(
  "and the live link is not on the bar at all",
  // Opening the live site is in the centre pill's Publish flow and in the
  // publish panel. A third copy on the right was one being in the wrong place.
  (editor.match(/aria-label="View live website"/g) ?? []).length === 0,
)

check(
  "custom pages can be deleted and built-ins cannot",
  // "Cannot" is better said by absence than by a disabled control.
  /p\.custom && onDelete && !active/.test(switcher),
)

check(
  "the panel closes on an outside press and on Escape",
  /pointerdown/.test(switcher) && /e\.key !== "Escape"/.test(switcher),
)

check(
  "and it grows from its trigger rather than fading in place",
  /**
   * From the top centre, where the pill is, by a short drop and a hair of
   * scale; kept once opened so the close plays too (globals.css).
   */
  /className="wb-pages-menu /.test(switcher) &&
    ((css) => /\.wb-pages-menu \{[\s\S]{0,120}transform-origin: 50% 0;/.test(css) && /translate3d\(0, -4px, 0\) scale\(0\.98\)/.test(css))(
      untt(readFileSync(join(root, "app/globals.css"), "utf8")),
    ),
)

check(
  "reload lives inside the pill, on the page it reloads",
  // A control that acts on a thing belongs on that thing. It is a sibling of
  // the trigger, not nested in it: a button inside a button is invalid.
  /aria-label="Reload preview"/.test(switcher) && !/<button[^>]*>\s*<button/.test(switcher),
)

check(
  "the pill opens with the cursor in an empty search and the page being edited ticked in view",
  // It pre-filled the search with the current path; in a grouped list the
  // page being edited is ticked and scrolled into view instead, and the
  // first keystroke searches rather than replacing an address.
  /autoFocus/.test(switcher) && /searchRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(switcher) &&
    /aria-current=\{active \? "page" : undefined\}/.test(switcher) && /querySelector<HTMLElement>\("\[aria-current='page'\]"\)/.test(switcher),
)

// ===========================================================================
section("Publish is a place, not a button")
// ===========================================================================

const publish = untt(readFileSync(join(root, "components/website-builder/publish-panel.tsx"), "utf8"), "components/website-builder/publish-panel.tsx")
const modeSwitch = untt(readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8"), "components/website-builder/preview-mode-switch.tsx")
const themePage = untt(readFileSync(join(root, "components/website-builder/theme/ThemePage.tsx"), "utf8"), "components/website-builder/theme/ThemePage.tsx")

check(
  "the button opens a panel that says when it last went out and what is pending",
  /Changes since published/.test(publish) && /Publish changes/.test(publish) && /Not published yet/.test(publish),
)

check(
  "on a phone it is the editor's own bottom sheet, with its drag physics",
  // A second implementation of detents, velocity and the keyboard is a second
  // set of bugs.
  /<MobileEditorSheet/.test(publish) && /detents=\{\[/.test(publish),
)

check(
  "and the editor wires it to the real publish action",
  /<PublishPanel/.test(editor) && /onPublish=\{\(\) => \{ void handleSave\(\) \}\}/.test(editor),
)

check(
  "publishing stamps the time, and the route survives the column being absent",
  (() => {
    const route = untt(readFileSync(join(root, "app/api/website-builder/themes/[installId]/publish/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/publish/route.ts")
    return /published_at: new Date\(\)\.toISOString\(\)/.test(route) && /\/published_at\/\.test\(error\.message\)/.test(route)
  })(),
)

check(
  "the relative time reads the way somebody says it",
  (() => {
    // The function lives in its own module (the website page uses it too);
    // the panel re-exports it, so both read the same clock.
    const src = untt(readFileSync(join(root, "lib/website-builder/relative-time.ts"), "utf8"), "lib/website-builder/relative-time.ts")
    return /if \(s < 45\) return "just now"/.test(src) && /minute\$\{m === 1 \? "" : "s"\} ago/.test(src)
  })(),
)

// ===========================================================================
section("The code is where the preview is")
// ===========================================================================

check(
  "the code editor is reached from a switch over the canvas, not a button on the bar",
  /<PreviewModeSwitch/.test(editor) && /<CodePane\s*\n\s*installId=\{installId\}/.test(editor) && !/aria-label="Edit code"/.test(editor),
)

check(
  "and it loads in place, once, and fades in",
  (() => {
    const pm = untt(readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8"), "components/website-builder/preview-mode-switch.tsx")
    return /\?embedded=1/.test(pm) && /if \(!everShown\) return null/.test(pm) && /transition-opacity/.test(pm)
  })(),
)

check(
  "the framed code page drops its own header",
  /\{!embedded && \(/.test(untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx")),
)

check(
  "the bar is dark on a desktop, like the reference, and reads its colours from one place",
  /**
   * Height moved into `.wb-editor-topbar` so the status-bar inset is added in
   * one place; the colour is the part this rule is about. The colour is now
   * a set of tokens on `.wb-editor`, dark by default, so the bar's markup
   * names no white-on-dark utility of its own and a phone can flip the whole
   * bar to light UI by adding one class.
   */
  /<header className="wb-editor-topbar relative bg-\[var\(--wb-chrome-bg\)\] text-\[var\(--wb-chrome-fg\)\]/.test(editor) &&
    /\.wb-editor \{[\s\S]{0,600}?--wb-chrome-bg: #171717;/.test(untt(readFileSync(join(root, "app/globals.css"), "utf8"))) &&
    /\.wb-editor\.wb-chrome-light \{\s*--wb-chrome-bg: #ffffff;/.test(untt(readFileSync(join(root, "app/globals.css"), "utf8"))) &&
    // and nothing in the bar still says white-on-dark by hand
    !/<header className="wb-editor-topbar[\s\S]*?text-white\/[78]0[\s\S]*?<\/header>/.test(editor),
)

check(
  "the bar is dark on a phone too, because its own tiles need a surface",
  /**
   * The phone's bar was light for a round. On a light bar the editor's tiles
   * are grey on grey, and Undo and Redo are the worst of it: they are
   * disabled most of the time, disabled means faded, and faded grey on light
   * grey is two blank squares. The owner asked for the dark back.
   *
   * The hook stays rather than the call sites being unwound, because there
   * is a real decision in it for whenever a light bar is tried again: in the
   * native shell the status bar is drawn by iOS OVER the page and its text
   * colour is not the page's to choose, so a light bar has to negotiate with
   * the clock first. Today it answers dark without asking.
   *
   * A desktop bar was white for one round, on the argument that the surround
   * has to be the panels' own colour for the corner at the seam to open onto
   * anything that belongs there, and that the bar should match it. Only the
   * first half was true: the surround is still white, and the bar is a
   * surface ABOVE the row with its own edge, which nothing at the seam opens
   * onto. So there is one answer again, and it is dark.
   */
  /const chromeTone = usePhoneChromeTone\(isMobileView\)/.test(editor) &&
    /<FullScreenLock tone=\{chromeTone\} fromFirstPaint \/>/.test(editor) /* fromFirstPaint: the lock is set before the editor paints, in place of an html:has() */ &&
    /export function usePhoneChromeTone\(_phone: boolean\): ChromeTone \{\s*\n\s*return "dark"\s*\n\}/.test(nativeChromeSrc) &&
    /root\.style\.backgroundColor = tone === "light" \? "#ffffff" : "#171717"/.test(untt(readFileSync(join(root, "components/website-builder/full-screen-lock.tsx"), "utf8"), "components/website-builder/full-screen-lock.tsx")) &&
    /live \? "bg-\[#8B56FA\] text-white hover:bg-\[#7b46ec\]"/.test(editor),
)


// ===========================================================================
section("On a phone the bar is a phone's bar")
// ===========================================================================

check(
  "the page pill is a desktop control; on a phone the Pages tab is the switcher",
  // A 220px pill in a 390px bar is what crushed the AI button into the
  // chevron. The bottom sheet already has a Pages tab that lists every page.
  /\{!isMobileView && \(\s*<PageSwitcher/.test(editor),
)

check(
  "a phone has no pill; the desktop pill is Preview / Code / Website Settings, Preview by default",
  // A 3-segment pill in a 390px bar is what the user called not a good idea
  // on a phone. Code and Settings are reached from the menu there.
  // It follows the project's name and menu, so the row reads left to right as
  // which project, what to do with it, then how you are looking at it.
  (() => {
    const header = editor.slice(editor.indexOf("<header"), editor.indexOf("</header>"))
    const name = header.indexOf("{install?.name}")
    const menu = header.indexOf("<ResponsiveActionMenu")
    const pill = header.indexOf("<PreviewModeSwitch")
    return name > 0 && menu > name && pill > menu
  })() &&
    /\{!isMobileView && \(\s*<div className="ml-1\.5 shrink-0">\s*<PreviewModeSwitch/.test(editor) &&
    !/isMobileView && \(\s*<PreviewModeSwitch/.test(editor) &&
    /useState<PreviewMode>\("preview"\)/.test(editor),
)

check(
  "the code pane is not gated to desktop, and on a phone it is a page with a way back",
  // A card inset in a canvas is a desktop shape; at 390px the canvas IS the
  // screen, so the code takes the screen and carries its own Back.
  /<CodePane\s*\n\s*installId=\{installId\}\s*\n\s*visible=\{previewMode === "code"\}\s*\n\s*fullScreen=\{isMobileView\}\s*\n\s*onClose=\{\(\) => setPreviewMode\("preview"\)\}/.test(editor) &&
    !/!isMobileView && <CodePane/.test(editor) &&
    /aria-label="Back to the editor"/.test(modeSwitch),
)

check(
  "the peek stays put under Publish; only the code pane sends it away",
  /**
   * Publish used to UNMOUNT the persistent Sections / Pages / Settings peek
   * and remount it on close, which is a peek that pops back into existence
   * on top of the sheet still sliding away. Now it stays, dimmed under the
   * raised sheet's overlay, and opening Publish still closes the AI and the
   * sidebar first.
   */
  !/!publishOpen && previewMode/.test(editor) &&
    // And the project settings page, which covers the screen from the body
    // and would otherwise have the sheet printed across it.
    /previewMode !== "code" && !projectSettingsOpen && \(\s*<MobileEditorSheet/.test(editor) &&
    /if \(isMobileView\) \{ setMobileSidebarOpen\(false\); setAiOpen\(false\) \}/.test(editor),
)

check(
  "the desktop pill can open the product page as a real product",
  // A template with placeholder data is not what a buyer sees.
  /onSelectProduct=\{selectProductById\}/.test(editor) &&
    /handleSelectProductPage\(p\.id, p\.title\)/.test(editor) &&
    /* Drawn as a row of the group it belongs to, on the menu's indent grid. */
    /productRow\(row\.product, collapsible\)/.test(switcher),
)

check(
  "the load bar has no height in the flow, so nothing shows through under the bar",
  /**
   * It was a 1.5px transparent strip between the dark bar and the canvas,
   * and the page root behind it is light: on a phone, with a dark theme
   * edge to edge, that was a white line under the bar. It overlays the bar's
   * bottom edge now.
   */
  /className="absolute inset-x-0 bottom-0 z-10 h-\[2px\]/.test(editor) &&
    // Rendered INSIDE the header, as its last child, and driven by every
    // canvas wait rather than only by a page switch.
    /<WbLoadProgressBar active=\{sectionsLoading \|\| canvasBusy\} \/>\s*<\/header>/.test(editor),
)


// ===========================================================================
section("The bar answers a touch, and the phone scrolls")
// ===========================================================================

const menu = untt(readFileSync(join(root, "components/ui/responsive-action-menu.tsx"), "utf8"), "components/ui/responsive-action-menu.tsx")
const css = untt(readFileSync(join(root, "app/globals.css"), "utf8"))
/* The Going back screen, its own root on <body> since V3 (so it outlives the editor and holds EXIT_MIN_MS). */
const exitScreenSrc = untt(readFileSync(join(root, "components/website-builder/exit-screen.tsx"), "utf8"), "components/website-builder/exit-screen.tsx")

check(
  "Back is an arrow, and pressing it answers instantly with a leaving screen",
  // Going back can take a second on a phone; a second of nothing is a second
  // in which the button gets pressed again.
  /aria-label="Back"/.test(editor) &&
    // One door out, used by both exits: it asks only when there is something
    // to lose, and otherwise goes, which is what pressing Back meant.
    /onClick=\{\(\) => requestExit\("\/app\/website-builder"\)\}/.test(editor) &&
    /const requestExit = useCallback\(/.test(editor) &&
    // One door out, and it cannot hang: the soft navigation first, the
    // address loaded for real if this page is still here. See
    // lib/website-builder/navigate-ceiling.ts.
    /leaveFor\(href\)/.test(editor) &&
    /navigateWithCeiling\(\s*\n\s*\(\) => router\.push\(href\),\s*\n\s*\(\) => window\.location\.assign\(href\)/.test(editor) &&
    // On <body> and above every sheet, or the sheets that render into the
    // body paint over the screen that says you are leaving. Its own root
    // since V3, so it stays up after the editor is gone.
    /exitScreen\.start\(\)/.test(editor) &&
    /document\.body\.appendChild\(node\)/.test(exitScreenSrc) &&
    /\.wb-exit-screen \{[\s\S]{0,300}position: fixed/.test(css) &&
    /\.wb-exit-screen \{[\s\S]{0,300}z-index: 400/.test(css),
)

check(
  "undo and redo are on the bar at every size, not only in the three-dots menu",
  // One pair, defined once, placed twice: the phone's centre and the
  // desktop's right. Two definitions would drift.
  (() => {
    const pair = editor.slice(editor.indexOf("const undoRedo = ("), editor.indexOf("// ── Main editor layout"))
    const header = editor.slice(editor.indexOf("<header"), editor.indexOf("</header>"))
    return (
      /onClick=\{handleUndo\}/.test(pair) &&
      /onClick=\{handleRedo\}/.test(pair) &&
      // A phone puts them next to the menu; a desktop on the right.
      /\{isMobileView && undoRedo\}/.test(header) &&
      /\{!isMobileView && undoRedo\}/.test(header)
    )
  })(),
)

check(
  "the compact mode pill is off the phone bar, and Code lives in the three-dots menu",
  !/<PreviewModeSwitch\s+compact/.test(editor) &&
    /const inCode = previewMode === "code"/.test(editor) && /label: inCode \? "Back to preview" : "View code"/.test(editor),
)

check(
  "the inspector is on the bar at every size, with depth, and not hidden in a menu",
  (() => {
    const at = editor.indexOf('aria-label={inspectorEnabled ? "Disable section inspector"')
    const cls = editor.slice(at - 1200, at)
    return (
      at > 0 &&
      !/\{!isMobileView && \(\s*<Tooltip>[\s\S]{0,400}wb-inspector/.test(cls) &&
      /"wb-depth wb-inspector h-8 w-8 flex items-center justify-center rounded-lg/.test(cls) &&
      !/label: inspectorEnabled \? "Turn inspector off"/.test(editor)
    )
  })(),
)

check(
  "the AI button has depth and a shimmer, and no hairline border",
  /wb-ai-button h-8 w-8 flex/.test(editor) &&
    !/aiOpen\s*\?\s*"border-foreground bg-muted"/.test(editor) &&
    /<span aria-hidden className="wb-ai-ring">\s*<span className="wb-ai-ring-spin" \/>/.test(editor) &&
    /\.wb-ai-ring-spin \{[\s\S]{0,300}conic-gradient\(\s*from 0deg/.test(css) &&
    // Turned by transform, which the compositor runs; the custom property
    // it used to animate cost a style pass and a repaint every frame.
    /@keyframes wb-ai-turn \{\s*to \{ transform: rotate\(360deg\); \}/.test(css) &&
    !/\.wb-ai-button::before/.test(css) &&
    // Only for people who have not asked for less motion, and never in a hidden tab.
    /prefers-reduced-motion: no-preference\) \{\s*\.wb-ai-ring-spin \{ animation: wb-ai-turn/.test(css) &&
    /html\[data-tab-hidden\] \.wb-ai-ring-spin \{ animation-play-state: paused; \}/.test(css),
)

check(
  "the three-dots phone menu rides the app's shared sheet, with its drag physics",
  /**
   * It rode the editor's own sheet; it is the shared sheet now
   * (components/ui/bottom-sheet.tsx), which every other phone sheet in the
   * app already uses, so the menu opens, drags and closes like them. Still
   * one implementation of the drag, never a hand-rolled second one.
   */
  /<BottomSheet isOpen=\{sheetOpen\} onClose=\{\(\) => setSheetOpen\(false\)\}/.test(menu) &&
    /from "@\/components\/ui\/bottom-sheet"/.test(menu) &&
    !/enableDragToClose/.test(menu) &&
    !/data-drag-handle/.test(menu),
)

check(
  "the phone preview card owns its touch scrolling",
  // A vertical drag on the card is a scroll and nothing else, and reaching the
  // end stays in the card rather than bouncing the page.
  /touchAction: "pan-y",\s*\n\s*overscrollBehavior: "contain"/.test(editor),
)


// ===========================================================================
section("A dark bar stays dark, and settings is a page")
// ===========================================================================

const settingsPage = untt(readFileSync(join(root, "components/website-builder/project-settings.tsx"), "utf8"), "components/website-builder/project-settings.tsx")
/** The nine pages of Website Settings live beside the shell, one file each. */
const settingsFiles = ["types.ts", "general.tsx", "backups.tsx"].map((f) =>
  untt(readFileSync(join(root, "components/website-builder/website-settings", f), "utf8")),
)
const settingsAll = [settingsPage, ...settingsFiles].join("\n")
const publishPanel = untt(readFileSync(join(root, "components/website-builder/publish-panel.tsx"), "utf8"), "components/website-builder/publish-panel.tsx")
const codePage = untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx")
const headerSrc = editor.slice(editor.indexOf("<header className"), editor.indexOf("</header>"))

check(
  "no view-live surface remains on the bar or in its menu",
  // Opening the live site lives in the centre and in Publish. A third and a
  // fourth copy is two of them being in the wrong place.
  !/aria-label="View live website"/.test(headerSrc) && !/label: "View Live"/.test(headerSrc),
)

check(
  "the right of the bar runs undo, redo, inspector, AI, Publish — the two builder tools together",
  (() => {
    const pair = editor.slice(editor.indexOf("const undoRedo = ("), editor.indexOf("// ── Main editor layout"))
    const u = pair.indexOf('aria-label="Undo"')
    const r = pair.indexOf('aria-label="Redo"')
    const placed = headerSrc.indexOf("{!isMobileView && undoRedo}")
    const insp = headerSrc.indexOf('aria-label={inspectorEnabled ? "Disable section inspector"')
    const ai = headerSrc.indexOf('aria-label="Ask Storelib"')
    const pub = headerSrc.indexOf("const live = install?.status")
    const left = headerSrc.indexOf("Desktop: sidebar mode toggles")
    return (
      u > 0 &&
      r > u &&
      placed > left &&
      insp > placed &&
      ai > insp &&
      pub > ai &&
      /wb-depth h-8 w-8[^"]*"\s*\n\s*onClick=\{handleUndo\}/.test(pair) &&
      /wb-depth h-8 w-8[^"]*"\s*\n\s*onClick=\{handleRedo\}/.test(pair)
    )
  })(),
)

check(
  "the Preview button is off the bar and inside the publish panel",
  // Two buttons for one decision. The panel is where "what am I about to
  // publish" is answered, so looking at it belongs there.
  // The evidence moved, the rule did not. Preview used to be a link with
  // `builder_preview=1` on it, which nothing ever read: it showed drafts
  // only because the public pages were serving drafts to everybody. It now
  // goes through a real preview token, so what proves it is in the panel is
  // the press that asks for one.
  !/aria-label="Preview"/.test(headerSrc) &&
    !/builder_preview=1/.test(editor) &&
    // the URL, not the paragraph explaining why it is gone
    !/builder_preview=1&show_preview_bar=1/.test(publishPanel) &&
    /onClick=\{\(\) => void openPreview\(\)\}/.test(publishPanel) &&
    /Preview\s*<\/button>/.test(publishPanel),
)

check(
  "and the panel leaves the way it came",
  /const \[present, setPresent\] = useState\(open\)/.test(publishPanel) &&
    /animate-out fade-out-0 zoom-out-95 slide-out-to-top-1 fill-mode-forwards/.test(publishPanel) &&
    /if \(!present\) return null/.test(publishPanel),
)

check(
  "the inspector has depth by default and glows through its icon when on, not a white button",
  /wb-depth wb-inspector h-8 w-8[^"]*"[\s\S]{0,60}inspectorEnabled && "wb-inspector-on"/.test(headerSrc) &&
    !/bg-white border-white text-neutral-900/.test(headerSrc) &&
    /\.wb-inspector-on svg \{\s*fill: currentColor/.test(css),
)

check(
  "nothing on the bar can flash light when pressed",
  /**
   * The bar is dark and every control on it used the light theme's hover and
   * active classes, so pressing anything flashed a white tile. That is the
   * "it becomes white, it is cheap" complaint as a class of fault.
   */
  !/hover:bg-muted/.test(headerSrc) &&
    !/text-muted-foreground/.test(headerSrc) &&
    !/"bg-muted text-foreground"/.test(headerSrc) &&
    !/border border-border/.test(headerSrc) &&
    !/bg-neutral-100 text-neutral-900/.test(headerSrc),
)

check(
  "the mode pill is one bubble that slides, measured from rects",
  // Three buttons swapping backgrounds say "something changed somewhere";
  // one bubble that travels says where from and where to.
  /data-seg=\{m\}/.test(modeSwitch) &&
    /getBoundingClientRect\(\)/.test(modeSwitch) &&
    /transform: `translateX\(\$\{bubble\.left\}px\)`/.test(modeSwitch) &&
    /seg\("settings", "Website Settings", Settings\)/.test(modeSwitch),
)

check(
  "the code pane is the whole canvas on a desktop, the whole screen on a phone, and light like the rest of the app",
  // `flex flex-col` on the card is load-bearing: the iframe's wrapper is
    // `flex-1`, which resolves to nothing in a block container, and the
    // iframe then falls back to its 150px HTML default.
    /absolute inset-0 z-\[80\] flex flex-col rounded-t-\[20px\]/.test(modeSwitch) &&
    // A black panel inside a white builder is a second product bolted on —
    // so the pane is the EDITOR'S surface, whichever of the two that is,
    // rather than a fixed white with a dark panel dropped into it.
    /"overflow-hidden transition-colors duration-200",\s*\n\s*dark \? "bg-\[#0e0e0e\]" : "bg-white",/.test(modeSwitch) &&
    // The dark is #0e0e0e and ONLY under `dark`: the pane never picks a
    // surface of its own, it takes whichever one the editor is set to. A
    // literal dark anywhere else here would be a second opinion about it.
    !/(?<!dark \? )"bg-\[#0e0e0e\]"(?! : "bg-white")/.test(modeSwitch) &&
    /fixed inset-0 z-\[120\] flex flex-col/.test(modeSwitch) &&
    /**
     * It rises and settles on the curve a thrown thing lands on. Longer than
     * the old 220ms, because a fast small move reads as a flicker.
     *
     * `translate` and `scale`, not `transform`: this said `transform` for
     * several rounds and the rise never ran. Tailwind v4 compiles
     * `translate-y-3` and `scale-[0.995]` to the standalone properties of
     * those names, so the transition named one the element never sets, and
     * what shipped was a cut with a fade over it. Measured with
     * `Element.getAnimations()`: naming `transform` starts one transition,
     * naming these starts three. See scripts/check-section-toolbar.mjs.
     */
    /transition-\[opacity,translate,scale\] duration-300 ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/.test(modeSwitch) &&
    /pointer-events-none translate-y-3 scale-\[0\.995\] opacity-0/.test(modeSwitch),
)

check(
  "and the full-screen one is portalled, or 'the whole screen' quietly means 'the whole canvas'",
  // `position: fixed` is measured against the nearest ancestor carrying a
  // transform, and the canvas it is rendered inside animates one.
  /if \(!fullScreen\) return body/.test(modeSwitch) && /return createPortal\(body, document\.body\)/.test(modeSwitch),
)

check(
  "the canvas is its own stacking context, so a theme's header cannot climb over the editor",
  /**
   * A theme header is `sticky z-[60]` and the editor's bar is `z-50`. While
   * the canvas card created no stacking context those two numbers were
   * compared in the same place, so a site's header won and painted across the
   * editor's own menus — which is what covered the page switcher's panel.
   */
  /"relative isolate bg-white/.test(editor) &&
    !/PREVIEW, OR THE CODE BEHIND IT/.test(editor) &&
    !/pointer-events-none absolute left-0 right-0 top-2 z-30/.test(editor),
)

check(
  "handing over to the code fades rather than cuts",
  // `invisible` removed the site between one frame and the next, which is the
  // flash. Opacity hands over on a curve and keeps the scroll position.
  // Desktop only. On a phone the code pane is a full-screen opaque page and
  // the fade bought nothing but a WebKit scroller that stopped taking touch
  // after animating opacity — see tests/canvas-scroll.test.ts.
  /previewMode === "code" && !isMobileView && "opacity-0 pointer-events-none"/.test(editor) &&
    !/previewMode === "code" && "invisible/.test(editor),
)

check(
  "the selection ring only curves where the card actually curves",
  // With an announcement bar above it the header is a square band in the
  // middle of the page, and a rounded ring there curves the corners of
  // nothing.
  // And the question is answered by whoever draws the chrome, not by the
  // editor reading theme flags — that is how the bar came to exist four times.
  /export function headerTouchesTop\(theme: ThemeSettingsValues\): boolean/.test(themePage) &&
    /render\(section, "header", i === 0 && headerTouchesTop\(theme\)\)/.test(themePage) &&
    /renderSection=\{\(section, role, atTop\) =>/.test(editor) &&
    /canvasRoundedTopPx=\{atTop && canvasRadiusPx \? canvasRadiusPx : undefined\}/.test(editor),
)

check(
  "the preview reserves no column for a scrollbar; on a light code editor a slim one is invisible",
  /**
   * `::-webkit-scrollbar` rules are what turn a platform's OVERLAY scrollbar
   * into a classic one, and a classic one reserves a column of layout. On the
   * preview card that column was painted in the card's own white while the
   * site inside it was dark: the white strip down the right of the builder,
   * caused by styling the scrollbar rather than by failing to.
   */
  // Every scrollbar property, `scrollbar-width` and `scrollbar-color`
  // included, opts an element out of the platform's overlay bar and into a
  // classic one that reserves a column. So: none at all, on either.
  // The preview card holds a page of the creator's own colours, so a
  // reserved white column beside a dark site is a white stripe. The code
  // editor is a light panel throughout, so the slim bar sits in it unseen.
  // Still true, and the rounded corner did not cost it: the corner is fixed
  // by clipping the bar from outside, not by styling it. See "the preview
  // canvas keeps its rounded corners on the scrollbar side" below.
  /"relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden/.test(editor) &&
    !/wb-thin-scroll|wb-slim-scroll|wb-canvas-scroll|scrollbar-width|scrollbar-color|webkit-scrollbar/.test(
      editor.slice(editor.indexOf('id="wb-preview-root"'), editor.indexOf('id="wb-preview-root"') + 1400),
    ) &&
    (codePage.match(/wb-slim-scroll/g) ?? []).length === 3 &&
    !/\.wb-thin-scroll/.test(css) &&
    // And no stylesheet reintroduces one on the canvas by class either.
    !/wb-canvas-scroll/.test(css),
)

check(
  "the surround is one light tone, and on a phone it is the sheet's own surface",
  // The canvas is the page being worked on, not chrome. A near-black field
  // around it makes the builder read as two products with a hole between
  // them, and in a phone preview the hole is most of the screen. A phone has
  // no surround at all beyond the strip reserved for the sheet's peek, which
  // takes the sheet's own colour so a one-pixel disagreement is a seam.
  //
  // ONE tone, for both jobs it has on a desktop: the shelf the panels stand
  // on, seen in the gaps and around their top corners, and the surface a
  // device preview stands on. It was briefly white, to match a briefly white
  // bar; a gap of the panels' own colour cannot be seen, which is the whole
  // reason the shelf has a tone.
  /"relative flex-1 min-w-0 overflow-hidden flex justify-center"/.test(editor) &&
    /isMobileView \? "bg-background" : "bg-\[#eef1f5\]",/.test(editor),
)

check(
  "every row of the actions menu answers the pointer",
  // Only one of Radix's three highlight mechanisms was firing, so the menu
  // read as a list of labels rather than a list of buttons.
  /hover:bg-\[#f1f2f4\] focus:bg-\[#f1f2f4\] data-\[highlighted\]:bg-\[#f1f2f4\]/.test(menu),
)

check(
  "the page pill is as slim as the mode pill beside it",
  /flex h-7 min-w-\[220px\] max-w-\[380px\] items-center rounded-full/.test(switcher),
)

check(
  "nothing below the bar is dark, and a device preview is a card with an edge of its own",
  /**
   * This guard used to say the panels were FLUSH, and it said so because a
   * mat had been tried and reported: eight pixels of the bar's dark on every
   * side of every panel, which is not enough to read as a frame and reads
   * instead as a gutter that failed to close.
   *
   * There is a mat again, and the two facts are not in conflict. What failed
   * was eight pixels of DARK, on four sides. What is here is eight pixels of
   * the builder's own light grey, on three, with the fourth left open so
   * there is no band under the page. The shape of that claim is in
   * "the panels stand on a shelf"; what survives here is the part that was
   * never about the gap, which is that nothing below the bar is dark and a
   * device preview carries its own edge because the dark is not there to
   * give it one.
   */
  !/bg-\[#171717\] p-2 gap-2/.test(editor) &&
    !/: "bg-\[#171717\]"/.test(editor) &&
    // a device preview is a card floating on that surround, so it is drawn
    // with the edge and the lift the dark used to give it for free
    /"rounded-2xl ring-1 ring-black\/\[0\.06\] shadow-\[0_18px_50px_-20px_rgba\(15,23,42,0\.28\)\]"/.test(editor) &&
    /height: "100%"/.test(editor),
)

check(
  "every change to the page records itself, so Undo goes back one step and not three",
  /**
   * `pushUndo` closed over `sections` and `settingsDraft`, so it was a new
   * function on every keystroke, and a handler that wanted to call it had to
   * list it as a dependency or capture an old one that would snapshot an old
   * page. Three handlers did neither and simply never called it: hiding a
   * section, dragging one, and nudging one up or down. Undo skipped straight
   * past those to whatever edit had last bothered to record itself, which is
   * worse than not offering it.
   *
   * Reading the latest values out of refs makes pushUndo, handleUndo and
   * handleRedo all stable, so a mutation can record itself without dragging a
   * dependency chain behind it.
   */
  /const snapshotNow = useCallback\(/.test(editor) &&
    /sectionsRef\.current = sections/.test(editor) &&
    /settingsRef\.current = settingsDraft/.test(editor) &&
    /const pushUndo = useCallback\(\(\) => \{\s*\n\s*setUndoStack\(prev => \[\.\.\.prev\.slice\(-30\), snapshotNow\(\)\]\)/.test(editor) &&
    // the three that were missing
    /pushUndo\(\)\s*\n\s*\/\*[^*]*\*\/\s*\n\s*setSections\(prev => toggleShown\(prev, sectionId, kindOfType\)\)/.test(editor) &&
    /if \(from === -1 \|\| to < 0 \|\| to >= body\.length\) return\s*\n\s*pushUndo\(\)/.test(editor) &&
    /if \(fromId === toId\) return\s*\n[\s\S]{0,180}?pushUndo\(\)/.test(editor) &&
    // and both handlers read the stack from a ref rather than a stale closure
    /const stack = undoRef\.current/.test(editor) &&
    /const stack = redoRef\.current/.test(editor),
)

check(
  "the header and the footer can be brought back, because the eye is a button",
  /**
   * A hidden header with no way back was a one-way door. The eye is a button
   * on every row, drawn at rest on a hidden one, and the header and footer
   * rows are given the handler. Every row is handed a name resolved from the
   * schema (lib/website-builder/section-name.ts), never the stale copy.
   */
  /label=\{hidden \? `Show \$\{displayName\}` : `Hide \$\{displayName\}`\}/.test(sectionsList) &&
    /shown=\{hidden \|\| isSelected\}/.test(sectionsList) &&
    /onToggleHide=\{\(\) => onToggleHide\(s\.id\)\}[\s\S]{0,400}?chrome=\{chrome\}/.test(sectionsList) &&
    /onToggleHide=\{toggleSectionHidden\}/.test(editor) &&
    /nameOf=\{\(s\) => sectionDisplayName\(s, librarySchemas\)\}/.test(editor),
)

check(
  "the insert line is the page's colour, not the brand's",
  /**
   * A purple rule drawn across the middle of somebody's page is the editor
   * talking over the thing it is meant to be showing. The line has to be
   * findable, not loud; the only strong mark is the button that says what it
   * does, and near-black says it without claiming the page.
   */
  /h-\[2px\] origin-center scale-x-0 bg-\[#d4d7dd\]/.test(editor) &&
    /rounded-full bg-\[#1a1a2e\] text-white opacity-0/.test(editor) &&
    !/bg-\[#8B56FA\] opacity-0 transition-\[opacity,scale\]/.test(editor),
)

check(
  "the canvas's insert affordance costs the page no height",
  /**
   * It was `h-6 w-full` in flow, which is 24px of nothing inserted between
   * every pair of sections on the page. The canvas is meant to show what the
   * site looks like, and it was showing a site with a gutter between every
   * section that the published page does not have; designing against that is
   * designing against the wrong page.
   *
   * Zero pixels in flow now, with the hit area hanging off it across the
   * boundary: 12px, six either side. Big enough to find, small enough that a
   * click meant for a section almost never lands in it. Both the line and the
   * button stay `pointer-events-none`, so the band is the only hover target
   * and a button taller than its band cannot flicker the hover the way the
   * sidebar's divider once did.
   *
   * Measured: 0px between the sections against 24px before, with a 12px band.
   * `node scripts/check-canvas-insert.mjs`
   */
  /* `wb-ring`: it fades with the inspector's rings and takes no press while they do. */
  /<div className="wb-ring relative isolate z-20 h-0 w-full">/.test(editor) &&
    /className="group absolute inset-x-0 -top-1\.5 flex h-3 cursor-pointer select-none items-center justify-center"/.test(editor) &&
    !/group relative isolate z-20 flex h-6 w-full/.test(editor) &&
    // the visible parts never take the pointer, so the band owns the hover
    /pointer-events-none absolute inset-x-0 h-\[2px\]/.test(editor) &&
    /pointer-events-none relative z-10 flex h-6 w-6/.test(editor),
)

check(
  "the panels stand on a shelf",
  /**
   * Twelve rounds went into the seam between the sidebar and the canvas. A
   * hairline down it. A corner drawn on the arc the canvas turns on, filled
   * five different ways. Then no corner at all and a gap of the panels' own
   * white, which settled what to draw and opened a smaller question: a gap
   * you cannot see is not a gap, and on a white page the sidebar, the space
   * and the canvas were one undifferentiated field.
   *
   * So the space has a tone. The panels are cards now, inset 6px and rounded
   * 20px on BOTH top corners, standing on the light grey the builder already
   * uses for the surface a device preview sits on. One tone below the bar,
   * doing both jobs, rather than two.
   *
   * AND IT IS A DESKTOP IDEA. On a phone the canvas is not a card on a
   * surface, it IS the surface: nothing beside it to be separated from, and
   * six pixels of grey around a 390px screen is six pixels taken from the
   * page and given to nothing. Flush and square there.
   *
   * THAT GREY IS WHY THIS WORKS WHERE EVERY EARLIER VERSION DID NOT, and the
   * difference is worth stating exactly, because it was got wrong five times.
   * A sliver of a third colour between one ROUNDED panel and one FLUSH one is
   * a wedge. The same sliver between two panels that both curve away from it,
   * with the same surface running behind both, is a channel. The tone was
   * never the fault on its own; the tone with only one side curving was.
   *
   * Open at the bottom. Padding on three sides is a shelf; padding on four is
   * a frame, and a band of grey under the page is the gutter that failed to
   * close, which is what was reported when this was tried in the bar's dark.
   *
   * The BAR is not part of any of it. It is dark, it sits above the row with
   * its own edge, and nothing at the seam opens onto it.
   *
   * Measured: 6 pixels between the page and each panel and 6 more around the
   * outside, against 0 and 0 flush; the gap 17 away from the panels either
   * side, against 0 for a gap of their own white, and uneven by 0 down its
   * whole height, against 18 with a hairline crossing it; all three arcs
   * travelling 16px, which is what 20px travels read once per row at the
   * pixel's centre, against 0 with the radii off; 0 pixels of the root at any
   * of the four screen corners.
   * `node scripts/check-workspace-corners.mjs`
   */
  // the shelf, and the cards standing on it
  /"wb-editor fixed inset-0 flex flex-col bg-\[#eef1f5\] overflow-hidden wb-editor-enter"/.test(editor) &&
    /"relative flex flex-1 min-h-0 overflow-hidden bg-\[#eef1f5\]",\s*\n[\s\S]{0,240}?!isMobileView && "gap-1\.5 px-1\.5 pt-1\.5",/.test(editor) &&
    // open at the bottom: a shelf, not a frame
    !/pt-1\.5 pb-1\.5/.test(editor) &&
    // both top corners, on all three: a card with one square top corner and
    // one round one reads as a mistake
    /className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-t-\[20px\]"/.test(editor) &&
    // Ask Storelib is no longer the third card on the shelf: on a computer
    // it floats over the canvas as a pill (theme-chat.tsx, variant "dock")
    !/<div className="h-full overflow-hidden bg-white rounded-t-\[20px\]">/.test(editor) &&
    /<ThemeChat\s*\n\s*variant="dock"/.test(editor) &&
    /!isMobileView && "rounded-t-\[20px\]",/.test(editor) &&
    /\? "rounded-t-\[20px\] w-full"/.test(editor) &&
    // one tone below the bar, for the shelf and for a device's surface alike
    /isMobileView \? "bg-background" : "bg-\[#eef1f5\]",/.test(editor) &&
    // nothing is drawn at either seam any more
    !/wb-seam-fill|wb-seam-divider|wb-seam-top/.test(editor) &&
    !/bg-white border-r border-\[#e5e7eb\]/.test(editor) &&
    // and the bar stays dark, which is not this rule's business but is what
    // the surround was briefly changed to match
    /const chromeTone = usePhoneChromeTone\(isMobileView\)/.test(editor) &&
    ((css) => !/\.wb-seam-(fill|divider|top) \{/.test(css))(untt(readFileSync(join(root, "app/globals.css"), "utf8"))),
)

check(
  "the selection ring is cut to the card it sits in",
  /**
   * The ring on the top section took a literal 12px radius while the canvas
   * card's own corners went 16, then 22, then 20. A 12px corner inside a 20px
   * one pushes past the card's curve, and the card's `overflow: hidden` takes
   * a bite out of it: a blue corner with a piece missing, which is what was
   * reported with the header selected.
   *
   * The card's own number is passed in now, so there is one place it is
   * decided. Zero on a phone, where the preview card is `rounded-none` and a
   * rounded ring would curve the corners of nothing.
   */
  /canvasRadiusPx=\{isMobileView \? 0 : device === "desktop" \? 20 : 16\}/.test(editor) &&
    /canvasRoundedTopPx=\{atTop && canvasRadiusPx \? canvasRadiusPx : undefined\}/.test(editor) &&
    !/canvasRoundedTopPx=\{atTop \? \(device === "desktop" \? 12 : 16\) : undefined\}/.test(editor),
)

check(
  "the builder reaches the top of the screen on a phone",
  /**
   * `html.capacitor::before` is a FIXED, PURE BLACK layer at z-9999 over the
   * safe area, and every ordinary page wants it: their headers are black, so
   * it continues them and no gap can open above one.
   *
   * The builder's bar is #171717, and z-9999 beats anything the editor can
   * paint. So the bar padded itself to `env(safe-area-inset-top)`, painted
   * that strip its own colour, and the shield painted over it in a darker
   * one — a black band under the clock with the editor starting below it,
   * which is the "not full screen, cut at the top" reported more than once.
   *
   * Stood down while the editor is up, in TWO RULES rather than a selector
   * list: one selector a browser cannot parse throws away the whole rule, so
   * sharing a list would cost an iOS without `:has()` the class-based
   * fallback as well. Either alone is enough.
   */
  ((css) =>
    /html\.capacitor\.wb-fullscreen::before \{\s*\n\s*display: none;/.test(css) &&
    // Changed on purpose: the `html.capacitor:has(.wb-editor)::before` twin is
    // gone. The class is set before the editor paints (FullScreenLock,
    // fromFirstPaint), and a :has() on <html> restyled the whole document
    // whenever text anywhere was replaced (scripts/check-app-sheets-frames.mjs).
    !/html\.capacitor:has\(\.wb-editor\)/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    // and the bar still pays for the strip it now owns
    /\.wb-editor-topbar \{[\s\S]{0,120}?padding-top: var\(--wb-safe-top\);/.test(css))(
      untt(readFileSync(join(root, "app/globals.css"), "utf8")),
    ) && /<FullScreenLock tone=\{chromeTone\} fromFirstPaint \/>/.test(editor) /* fromFirstPaint: the lock is set before the editor paints, in place of an html:has() */,
)

check(
  "no field in the code editor is small enough to make iOS zoom the page",
  /**
   * iOS zooms when a text field under 16px takes focus, and it does not zoom
   * back: the bar ends up wider than the screen and the editor sits scrolled
   * sideways with no way back from inside the page. The code area already
   * knew this — 16px on a phone, 12 from `md` up — and the three fields
   * around it did not: the file filter at 11.5px and two path fields at 12.
   *
   * Both halves matter. 16px on a phone, and BACK DOWN above `md`, or the
   * explorer is 16px text in a 224px column.
   * `node scripts/check-code-mobile.mjs`
   */
  ((code) =>
    /py-1\.5 pl-7 pr-6 text-\[16px\] md:py-1 md:text-\[11\.5px\]/.test(code) &&
    // The new-file field, a row at the top of the explorer, and the one the
    // rename and duplicate row uses.
    /h-9 w-full min-w-0 rounded border[^"]*text-\[16px\] md:h-7 md:text-\[11\.5px\]/.test(code) &&
    /h-10 min-w-0 flex-1 rounded-md border[^"]*text-\[16px\] md:h-7 md:text-\[12px\]/.test(code) &&
    // the code itself was always right, and stays the pattern the rest follow
    /const CODE_TEXT = "text-\[16px\] leading-6 md:text-\[12px\] md:leading-5"/.test(code) &&
    // and the legend is desktop furniture
    /border-t border-\[var\(--code-border\)\] space-y-1", narrow && "hidden"/.test(code))(
      untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx"),
    ),
)

check(
  "Add Section is the same sheet as Publish, not a second one that moves differently",
  /**
   * It was Radix's `Sheet` with `enableDragToClose`: a different thing
   * wearing the same shape. It opened and closed on its own curve, its drag
   * was a gesture handler bolted to a static panel, and it sat beside a sheet
   * — the publish card, the menu, the AI — that does all of that properly.
   * Two bottom sheets in one product that do not move alike is something you
   * feel before you can name it.
   *
   * `MobileEditorSheet` is that other one: the drag writes `transform`
   * imperatively while the finger is down, so the sheet is under the thumb on
   * the same frame; the release settles to a detent; and the whole of it is a
   * compositor transform that keeps running when the main thread is busy,
   * which is exactly the moment a section is being added.
   *
   * NO CLOSE BUTTON. The handle is the affordance, dragging down is the
   * gesture, the scrim takes a tap. An X is a third way to do what two
   * gestures already do, and the one needing a 44px target in the corner
   * furthest from the thumb.
   *
   * CLOSE FIRST, ADD ON THE NEXT FRAME. Adding a section mounts a section's
   * worth of DOM and scrolls to it. In the same tick as the close, the
   * browser may never commit the sheet's starting style — and a transition
   * whose start is not committed does not run, so the sheet vanishes instead
   * of sliding. One frame hands it to the compositor first.
   */
  /<MobileEditorSheet\s*\n\s*open=\{open\}\s*\n\s*onOpenChange=\{onOpenChange\}/.test(libraryPhone) &&
    /openFull\s*\n\s*detents=\{\[0\.92\]\}/.test(libraryPhone) &&
    /layer="raised"\s*\n\s*peekHeight=\{0\}/.test(libraryPhone) &&
    // the sheet brings its own handle, and nothing brings a close button
    !/aria-label="Close"/.test(libraryPhone) &&
    !/\n\s*enableDragToClose\n/.test(library) &&
    /onOpenChange\(false\)\s*\n\s*requestAnimationFrame\(\(\) => onAddSection\(type, presetIndex\)\)/.test(library) &&
    // and its search field does not zoom the page out from under the sheet
    /pl-9 pr-9 text-\[16px\][^"]*md:h-9 md:text-sm/.test(library),
)

check(
  "the category chips settle, and pressing one lays out nothing",
  /**
   * `transition-all duration-200` on a chip. Tailwind v4 compiles
   * `active:scale-95` to the standalone `scale:` property, so `all` does
   * cover it — and covers `width` with it, which means pressing one chip
   * transitions the width of every chip and re-lays-out the row mid-press.
   *
   * Named properties instead: two colours and a transform, none of which
   * forces layout. Measured from `getComputedStyle().transitionProperty`,
   * which is what the browser resolved: [background-color, color, scale]
   * against [all] before. And the row snaps by proximity, so a throw that
   * was nearly at a chip finishes there rather than leaving one cut in half
   * at the edge — proximity and not mandatory, which refuses to stop between
   * stops and makes a small deliberate nudge feel like an argument.
   * `node scripts/check-mobile-sheets.mjs`
   */
  /"wb-chip shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap"/.test(library) &&
    /"transition-\[background-color,color\] duration-150 ease-out"/.test(library) &&
    !/transition-all/.test(libraryPhone) &&
    /className="wb-chip-row shrink-0 overflow-x-auto px-4 pb-3"/.test(library) &&
    // a category changes which cards show and nothing else: no fade of the list on a pill or a keystroke
    /THE LIST STARTS AT ITS TOP, IN THE SAME FRAME, AND THAT IS ALL\./.test(library) &&
    !/categoryChanged/.test(library) &&
    ((css) => /\.wb-chip-row \{[\s\S]{0,200}?scroll-snap-type: x proximity;/.test(css))(
        untt(readFileSync(join(root, "app/globals.css"), "utf8")),
      ),
)

check(
  "Hide, Duplicate and Delete stay on screen at any sheet height",
  /**
   * On a desktop this row is the last child of a column that fills the
   * sidebar, so it has always been at the bottom of it. On a phone the same
   * panel goes inside the sheet's own scroller, and the sheet can be at any
   * height its detents allow: at anything short of full the row was below the
   * fold, and reaching Hide, Duplicate or Delete meant dragging the sheet all
   * the way up and then scrolling a settings panel to its end. Three
   * destructive-adjacent controls that far from where the section was
   * selected is how somebody deletes the wrong one.
   *
   * `sticky`, not `fixed`: it belongs to the panel, so it leaves with the
   * panel when you go back to the list, and it is bounded by the panel's box
   * rather than the viewport, so there is nothing to undo when another sheet
   * opens over it. It costs nothing where the column already fits, since an
   * element already at the bottom of its scrollport has nowhere to stick to.
   *
   * Measured with the sheet at 50% and the panel scrolled to the top: 67 of
   * the row's 67 pixels inside the sheet, against 0 of 67 without it — the
   * control's row starting 607px below the sheet's bottom edge.
   * `node scripts/check-mobile-sheets.mjs`
   */
  /<div className="sticky bottom-0 z-10 shrink-0 border-t border-\[#e5e7eb\] bg-white px-3 pt-3 pb-3\.5 flex gap-2">/.test(editor),
)

check(
  "the code editor's bar wears the code editor's theme, and carries the switch",
  /**
   * On a phone the code editor is a full-screen page with a bar of its own,
   * and that bar belongs to the BUILDER: it is outside the frame the editor
   * runs in. So it was `bg-neutral-50` whatever the editor was set to — a
   * white bar with a back button sitting on a #0e0e0e editor, one seam
   * straight across the top of the screen. The frame's own background and
   * the pane behind it had the same problem: white, always.
   *
   * Same origin, so the two just talk. The page inside the frame stays the
   * source of truth — it owns the setting and its storage — and says so over
   * the channel it already uses for the dirty flag. The bar reads storage
   * once for the first paint (same origin, same key, so it is the value the
   * frame is about to report) and follows the frame after that. The switch
   * asks the frame to change rather than changing a copy of its own, so
   * there is nothing that can drift.
   *
   * The switch is RIGHT-ALIGNED and 36px. On a phone this is the only way to
   * reach the setting: the editor's own icon row is behind an overflow menu
   * at that width. The two ends of a bar are where a thumb reaches, and
   * everything between them here is a label.
   *
   * Measured: the bar 5 points from the light editor's surface and 7 from
   * the dark one, against 250 for a bar that ignored the theme.
   * `node scripts/check-code-bar.mjs`
   */
  ((mode) =>
    /const \[codeTheme, setCodeTheme\] = useState<"light" \| "dark">\("light"\)/.test(mode) &&
    /data\.type !== "storelib:code-theme"/.test(mode) &&
    /type: "storelib:set-code-theme", theme: next/.test(mode) &&
    /if \(e\.origin !== window\.location\.origin\) return/.test(mode) &&
    // the bar, both themes, and the switch pushed to the end of it
    /dark \? "border-white\/10 bg-\[#151515\] text-white" : "border-neutral-200 bg-neutral-50 text-neutral-900"/.test(mode) &&
    /"ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg/.test(mode) &&
    // and nothing behind it flashes white on a dark editor
    /dark \? "bg-\[#0e0e0e\]" : "bg-white"/.test(mode))(modeSwitch) &&
    ((code) =>
      /type: "storelib:code-theme", theme: codeTheme/.test(code) &&
      /data\.type !== "storelib:set-code-theme"/.test(code))(
        untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx"),
      ),
)

check(
  "the path row wraps rather than squeezing, and clears the keyboard",
  /**
   * "Duplicate as", a field and two buttons on one line. The label does not
   * shrink, the buttons do not shrink, and with the gaps and the padding that
   * is about 250px committed before the field has a pixel. Measured in a
   * 320px viewport: the field collapses to 68px, which is not a path field.
   *
   * It stacks instead — label and field on one line, the actions on their own
   * and each half the width so both are a real target — and is one row again
   * from `md` up. Measured: 220px of field at 320, 290 at 390, and one line
   * at 900.
   *
   * AND IT CLEARS WHAT IS UNDER IT. The field autofocuses, so the keyboard is
   * up the moment the row appears, and the page is `height: 100%` inside a
   * document that does not scroll — iOS never moves it, so the row was simply
   * behind the keyboard. `visualViewport` reports the covered strip, inside a
   * frame as well, and it is added to the safe-area inset as PADDING rather
   * than a transform, so the row grows into the gap instead of floating over
   * the editor.
   *
   * The iframes in the check are not incidental: headless Chromium refuses a
   * window under 500px, so both phone widths were quietly being measured at
   * 500 — where the row fits, and the control passed while proving nothing.
   * `node scripts/check-code-bar.mjs`
   */
  ((code) =>
    /className="flex flex-col gap-2 border-t border-\[var\(--code-border\)\] bg-\[var\(--code-panel\)\] px-3 py-2 md:flex-row md:items-center md:px-4"/.test(code) &&
    /paddingBottom: `calc\(env\(safe-area-inset-bottom, 0px\) \+ 8px \+ \$\{keyboardInset\}px\)`/.test(code) &&
    // both actions are a real target on a phone and go back to bar size after.
    // The solid one is near-black now, at the owner's request: this row is a
    // file dialog, and the violet accent is for the product's own actions.
    /"h-10 flex-1 rounded-md bg-\[#111114\][^"]*md:h-7 md:flex-none/.test(code) &&
    /"h-10 flex-1 rounded-md border border-\[var\(--code-border\)\][^"]*md:h-7 md:flex-none/.test(code) &&
    // and the inset is measured, not guessed
    /const covered = window\.innerHeight - vv\.height - vv\.offsetTop/.test(code) &&
    /vv\.addEventListener\("resize", measure\)/.test(code))(
      untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx"),
    ),
)

check(
  "nothing keeps the editor disabled once you are back in it",
  /**
   * Pressing Back puts two things over the builder: `.wb-editor-leaving`,
   * which is `pointer-events: none` on the whole editor, and `.wb-leaving`, a
   * fixed scrim at z-index 300 with no pointer-events rule at all. Both are
   * right for the second between the press and the next page arriving — a
   * second press on a control already on its way out is how you get two of
   * whatever it does.
   *
   * `leaving` was set and never cleared. The only thing that ever un-set it
   * was the component being destroyed, which is fine exactly as long as the
   * navigation happens AND this editor is thrown away. Neither is guaranteed:
   * back out of the pushed page and the browser may restore this one from its
   * back/forward cache with every piece of React state as it was, and a push
   * that is cancelled or refused leaves the editor under its own blocker with
   * nothing to lift it. Either way the editor is alive, looks nearly normal,
   * and takes no input — the canvas will not scroll and nothing in it can be
   * pressed.
   *
   * Three ways back, covering different failures. `pageshow` with `persisted`
   * is the bfcache restore and is the specific one. `popstate` is any
   * in-history return. The watchdog is the general answer to "the navigation
   * did not happen": a push that works takes this component with it, so still
   * being here after three seconds means it did not.
   *
   * Measured: with the scrim up a touch in the middle of the canvas reaches
   * the scrim and the canvas does not move; with only the class, it reaches
   * BODY and still does not; with both lifted it reaches the page and
   * scrolls. `node scripts/check-leaving-revive.mjs`
   */
  /window\.addEventListener\("pageshow", onPageShow\)/.test(editor) &&
    /window\.addEventListener\("popstate", revive\)/.test(editor) &&
    // Changed on purpose (round 23): the watchdog revives the editor long
    // after the push could have landed. It used to load the address with
    // location.assign at three seconds, the very moment the router's own push
    // started, which turned most Backs into full page loads.
    /const watchdog = window\.setTimeout\(revive, LEAVING_SEEN_MS \+ NAVIGATE_CEILING_MS \+ 2000\)/.test(editor) &&
    /if \(e\.persisted\) revive\(\)/.test(editor) &&
    // it clears BOTH, or the confirm reopens the moment anything sets it again
    /setLeaving\(false\)\s*\n\s*setPendingExit\(null\)/.test(editor) &&
    // and the effect only exists while there is something to undo
    /useEffect\(\(\) => \{\s*\n\s*if \(!leaving\) return/.test(editor),
)

check(
  "a preview on a phone is the phone's layout, not the desktop's shrunk",
  /**
   * Sections ask about the width they are IN, not the width of the window:
   * `@[768px]:grid-cols-3` is a container query and the section's own wrapper
   * is what it measures. So the width a preview is rendered at is not a
   * detail of the scaling — it is the QUESTION being put to the section, and
   * 800px asks "what do you look like on a desktop" wherever it is asked.
   *
   * A phone card therefore showed the desktop answer, shrunk: three columns
   * at a third of their size, a split hero with two unreadable halves. A
   * picture of a layout the person holding the phone will never see, offered
   * as the thing they are about to add.
   *
   * The header is passed `deviceMode` as well. It is the one section kept out
   * of the container-query wrapper — it positions things `fixed`, and
   * containment would make an ancestor their containing block — so it is the
   * one section that cannot work the width out for itself.
   *
   * AND THE WIDTH IS PART OF THE CACHE KEY. The markup a section produces at
   * 390 is a different document from the one it produces at 800; keying on
   * type alone would hand a phone whichever was drawn first that session.
   *
   * Measured: 3 columns and a side-by-side split at 800, 1 column and a
   * stacked split at 390, in a box that is 240px rather than 160.
   * `node scripts/check-preview-width.mjs`
   */
  /export const PREVIEW_RENDER_WIDTH_MOBILE = 390/.test(library) &&
    /* Taller than wide on a phone: a phone's layout is a column, and its first screen is what is shown. */
    /export const PREVIEW_RATIO_MOBILE = 1\.22/.test(library) &&
    /const renderWidth = phone \? PREVIEW_RENDER_WIDTH_MOBILE : PREVIEW_RENDER_WIDTH/.test(library) &&
    /export const previewKey = \(type: string, presetIndex: number, width: number, sourcesTag: string\) =>\s*`\$\{type\}:\$\{presetIndex\}:\$\{width\}:\$\{sourcesTag\}`/.test(untt(readFileSync(join(root, "lib/website-builder/preview-markup.ts"), "utf8"), "lib/website-builder/preview-markup.ts")) &&
    /const scale = width > 0 \? width \/ renderWidth : 0\.3/.test(library) &&
    /deviceMode=\{job\.width <= PREVIEW_RENDER_WIDTH_MOBILE \? "mobile" : "desktop"\}/.test(library),
)

check(
  "a preview is drawn once and is markup after that",
  /**
   * Every card mounted a live `SectionRenderer`: a full React tree per
   * section, with its hooks, its effects and its reconciliation, thirty of
   * them in one modal. Opening the library built all thirty; picking a
   * category rebuilt whatever the new list held. On a phone that is the
   * freeze, the lag and the glitch on close — the main thread is building
   * sections while the sheet is trying to animate, and the sheet loses.
   *
   * Nothing in a preview is live for any reason. They are
   * `pointer-events: none`, scaled to a third of their size, and nothing
   * about them changes after they are drawn. So each is drawn ONCE, its
   * markup is taken, and the card is that markup from then on.
   *
   * EXACTLY 1:1, which is why it is done this way rather than by drawing
   * pictures of the sections: the markup comes from the real renderer with
   * the real theme, so a preview cannot drift from the section it stands
   * for. Same pixels, without the machinery that made them.
   *
   * `useLayoutEffect`, not `useEffect`: the markup is read and the renderer
   * dropped before the browser paints, so there is no frame where both
   * exist. And the cache is MODULE-LEVEL, outliving the modal — which is
   * exactly the case that used to rebuild everything.
   */
  /*
    Now drawn off screen, in a root of its own that is never in the
    document, in idle time before the library is opened
    (components/website-builder/editor/section-library.tsx): the markup is
    kept in a module-level map, and a card reads its own entry.
  */
  /const MARKUP = new Map<string, string>\(\)/.test(library) &&
    /flushSync\(\(\) => \{\s*\n\s*root!\.render\(/.test(library) &&
    /MARKUP\.set\(/.test(library) &&
    /useSyncExternalStore\(/.test(library) &&
    /* The markup handed to React as the same object while it is the same
       string: React 19 compares the object, so an inline one rewrote every
       card's preview on every render of the library. */
    /const html = useMemo\(\(\) => \(markup \? \{ __html: markup \} : null\), \[markup\]\)/.test(library) &&
    /dangerouslySetInnerHTML=\{html\}/.test(library),
)

check(
  "the category chips cannot be flipped by a class on an ancestor",
  /**
   * They were `bg-foreground` / `bg-muted`: the app's semantic tokens, which
   * are defined twice, once on `:root` and once under `.dark`. The builder is
   * a light surface by decision — everything else in it is a literal,
   * `#1a1a2e` and `#f3f4f6` and the rest — but these chips asked the document
   * what "foreground" meant. Under a dark root the selected chip becomes
   * near-white ON near-white: a pill you cannot read and cannot see you have
   * selected, which is what was reported as the pill going white.
   *
   * Nothing here needs to be relative to anything.
   */
  /on \? "bg-\[#1a1a2e\] text-white" : "bg-\[#f3f4f6\] text-\[#4b5563\]"/.test(library) &&
    !/\? "bg-foreground text-background"/.test(library) &&
    ((css) => /\.wb-chip-row \{[\s\S]{0,400}?-webkit-tap-highlight-color: transparent;/.test(css))(
      untt(readFileSync(join(root, "app/globals.css"), "utf8")),
    ),
)

check(
  "Add section in each group: the Header group's, the end of the page, the Footer group's",
  /**
   * The owner asked for it the way a shop's theme editor has it: one under
   * the Header group, which adds at the top of the page, and one at the foot
   * of the Template group, which adds at the end. On a phone the top one is
   * where the thumb already is, which is what the old phone-only button at
   * the top of the sheet was for.
   */
  /**
   * Then the owner asked for Shopify's section groups: the Header group's
   * Add section offers what goes there (an announcement bar, a header), and
   * the Footer group has its own. The top of the page is the insert line
   * above the first section.
   */
  /<GroupLabel>\{GROUP_LABELS\.header\}<\/GroupLabel>[\s\S]{0,240}?<AddSectionButton onClick=\{\(\) => onAdd\(null, "header"\)\} \/>/.test(sectionsList) &&
    /data-section-drag-list=""[\s\S]*?\n\s*\)\}\s*\n\s*<AddSectionButton onClick=\{\(\) => onAdd\(null, "template"\)\} \/>/.test(sectionsList) &&
    /<AddSectionButton onClick=\{\(\) => onAdd\(null, "footer"\)\} \/>/.test(sectionsList) &&
    /<InsertSectionDivider onClick=\{\(\) => onAdd\(0, "template"\)\} \/>/.test(sectionsList) &&
    /* The Overlay group, when the theme has a floating section, has the fourth. */
    (sectionsList.match(/<AddSectionButton /g) ?? []).length === 4 &&
    /\{overlayAddable && <AddSectionButton onClick=\{\(\) => onAdd\(null, "overlay"\)\} \/>\}/.test(sectionsList) &&
    /setPendingInsertIndex\(at === null \|\| group !== "template" \? null : splitGroups\(sections\)\.header\.length \+ at\)/.test(editor),
)

check(
  "the bounce guard does not police the builder, which polices itself",
  /**
   * `CapacitorBounceGuard` listens on the document and cancels touchmove to
   * stop WKWebView rubber-banding. Its last branch is the one that mattered:
   * when the DOCUMENT is not scrollable it prevents every vertical move, in
   * both directions, reasoning that a page which fits on screen has nothing
   * to scroll so any movement is a bounce.
   *
   * The builder's document is NEVER scrollable. That is deliberate — it is a
   * fixed screen and html and body are locked to the viewport — so any touch
   * inside it that did not find a scrollable ancestor on the way up had its
   * gesture cancelled outright. A canvas showing a page shorter than itself,
   * a canvas mid-layout, a touch landing between two scrollers: all of them
   * came out as "the preview is frozen, it will not scroll", which is what
   * was reported after closing the code editor or project settings over it.
   *
   * So it opts out, the way the bottom sheets already do. Everything the
   * guard would do there is already done by that surface: html and body
   * locked with `overscroll-behavior: none`, the canvas `touch-action: pan-y`
   * with `overscroll-behavior: contain`, and a nudge off either end at
   * touchdown.
   *
   * Measured with real touch events at a locked document: cancelled with no
   * opt-out, left alone with it, and still cancelled outside the builder —
   * so it is an opt-out and not an off switch.
   * `node scripts/check-bounce-guard.mjs`
   */
  ((guard) =>
    /target\?\.closest\("\[data-wb-no-bounce-guard\]"\)/.test(guard) &&
    // the branch that did the damage is still there for everywhere else
    /Page fits on screen — prevent rubber-band in both directions/.test(guard))(
      untt(readFileSync(join(root, "components/platform/capacitor-bounce-guard.tsx"), "utf8"), "components/platform/capacitor-bounce-guard.tsx"),
    ) && /data-wb-no-bounce-guard=""/.test(editor),
)

check(
  "the header and the footer wear a dark grey badge, because they are the two rows that are different",
  /"bg-\[#4d5058\] text-white"/.test(sectionsList) && !/bg-\[#1a1a2e\] text-white/.test(sectionsList),
)

check(
  "only the segment you are on says its name, and the name grows in rather than appearing",
  /gridTemplateColumns: named \? "1fr" : "0fr"/.test(modeSwitch) &&
    /const named = active && !compact/.test(modeSwitch) &&
    /transition: `grid-template-columns \$\{MS\}ms \$\{EASE\}/.test(modeSwitch),
)

check(
  "the pill is in the bar beside the sidebar icons, not floating over the canvas",
  (() => {
    const pill = headerSrc.indexOf("<PreviewModeSwitch")
    const gear = headerSrc.indexOf('title="General Settings"')
    const name = headerSrc.indexOf("{install?.name}")
    // Beside the sidebar icons still, but after the project's own name and
    // menu: which project, what to do with it, then how you are looking at it.
    return pill > gear && pill > name
  })(),
)

check(
  "the accent is Storelib purple: Publish, the inspector glow, the bubble. No blue beside the mark.",
  /bg-\[#8B56FA\]/.test(headerSrc) &&
    /bg-\[#8B56FA\]/.test(publishPanel) &&
    /bg-\[#8B56FA\]\/25 ring-1 ring-inset ring-\[#8B56FA\]\/60/.test(modeSwitch) &&
    /\.wb-inspector-on \{[\s\S]{0,300}rgba\(139, 86, 250/.test(css) &&
    !/2f5cff/i.test(editor + publishPanel + modeSwitch) &&
    !/47, 92, 255/.test(css),
)

check(
  "the code editor is black, not navy",
  !/#1a1a2e|#12121e|#13131f/i.test(codePage),
)

check(
  "project settings is a full page over the builder, closed by Back or Escape, and it can rename",
  /<ProjectSettings/.test(editor) &&
    /fixed inset-0 z-\[150\]/.test(settingsPage) &&
    /Back to editor/.test(settingsPage) &&
    /e\.key === "Escape"/.test(settingsPage) &&
    /method: "PATCH"/.test(settingsAll) &&
    /JSON\.stringify\(\{ name: draft\.trim\(\) \}\)/.test(settingsAll),
)

check(
  "and it only offers sections something real stands behind",
  // The reference has Analytics, Knowledge, Skills, Backups. A nav entry that
  // opens an empty panel is a promise the product cannot keep. Backups is
  // offered because it is real now: a table, two routes, a safety copy.
  (() => {
    const types = settingsFiles[0]
    const list = types.slice(types.indexOf("SETTINGS_SECTIONS = ["), types.indexOf("] as const"))
    // Changed on purpose: the list is grouped (Website, Content, Going live,
    // Code), so Backups and Navigation sit under their own headings.
    // Changed on purpose: Apps and integrations joined Content (the store's installed ones, each to its own page).
    return !/Analytics|Knowledge|Skills/.test(list) && /\{ id: "backups", label: "Backups & Versions", group: "live" \}/.test(list) &&
      /\{ id: "navigation", label: "Navigation", group: "content" \}/.test(list) &&
      /\{ id: "apps", label: "Apps and integrations", group: "content" \}/.test(list) &&
      (list.match(/\{ id: "/g) ?? []).length === 11
  })(),
)


// ===========================================================================
section("A phone's bar, and sheets that know which is on top")
// ===========================================================================

const sheetSrc = untt(readFileSync(join(root, "components/website-builder/mobile-editor-sheet.tsx"), "utf8"), "components/website-builder/mobile-editor-sheet.tsx")

check(
  "sheets that open for a moment sit above the one that is always there",
  /**
   * Every sheet shared one z-index, so the last one in the tree won, and the
   * menu and Publish, which are earlier in the tree than the persistent
   * peek, opened UNDER it. A raised layer wins whatever the order.
   */
  // Inline, not a class: a utility class can be merged away by `cn`, or tie
  // with another of the same specificity and lose on source order.
  /* Round 17: an optional zIndex (the community's composer, over an opened post) wins where it is given. */
  /zIndex: (zIndex \?\? \()?layer === "raised" \? 80 : 50/.test(sheetSrc) &&
    /zIndex: (zIndex !== undefined \? zIndex - 1 : )?layer === "raised" \? 70 : 40/.test(sheetSrc) &&
    // The menu is the shared sheet, which is portalled to the body at 200:
    // above the raised layer, whatever the order in the tree.
    /<BottomSheet isOpen=\{sheetOpen\}/.test(menu) &&
    /"fixed inset-0", zIndex == null && "z-\[200\]"/.test(untt(readFileSync(join(root, "components/ui/bottom-sheet.tsx"), "utf8"), "components/ui/bottom-sheet.tsx")) &&
    /layer="raised"\s*\n\s*peekHeight=\{0\}/.test(publish) &&
    /<MobileEditorSheet open=\{aiOpen\}[\s\S]{0,120}layer="raised" peekHeight=\{0\}/.test(editor),
)

check(
  "a sheet with no peek is hidden once it has gone and shown before it comes back",
  // Off screen should mean not painted and not casting a shadow up onto the
  // bottom edge; and the open animation must never be skipped.
  /const settleVisibility = \(isOpen: boolean/.test(sheetSrc) &&
    // Set once on mount, never from the render: an inline `visibility` that
    // followed `open` hid the sheet in the same commit that asked it to
    // slide down, so every raised sheet vanished instead of closing.
    /sheet\.style\.visibility = peekHeight === 0 && !openRef\.current (&& !primedWaiting\.current )?\? "hidden" : "visible"/.test(sheetSrc) &&
    !/visibility: peekHeight === 0 && !open/.test(sheetSrc) &&
    /settleVisibility\(nowOpen, ms\)/.test(sheetSrc) &&
    /willChange: "opacity"/.test(sheetSrc),
)

check(
  "menus and the publish sheet are as tall as what is in them, capped",
  /**
   * A six-row menu at 50% was clipped under the browser's toolbar, so the
   * menu sizes to its rows. The publish card was pinned to a flat 40% for a
   * round, and forty percent of a phone does not hold a status line, a URL,
   * its visibility note and a security line: it arrived already scrolled,
   * with everything under the URL below the fold. It measures its content
   * too now, capped at 88% so it can never become a page, with the actions
   * still pinned under a body that scrolls if a small screen makes it.
   */
  // The menu is the shared sheet, which has no fixed height: it is its rows,
  // capped at min(86dvh, 720px), and scrolls past that.
  /<BottomSheet isOpen=\{sheetOpen\}(?![^>]*height=)[^>]*>/.test(menu) &&
    /maxHeight = "min\(86dvh, 720px\)"/.test(untt(readFileSync(join(root, "components/ui/bottom-sheet.tsx"), "utf8"), "components/ui/bottom-sheet.tsx")) &&
    /fit\s*\n\s*detents=\{\[0\.88\]\}/.test(publish) &&
    !/detents=\{\[0\.4\]\}/.test(publish) &&
    /<Body \{\.\.\.props\} pinActions active=\{open\} \/>/.test(publish) &&
    // and the measurement it uses is the one below, which reads the content's
    // own height rather than the height the sheet happens to be at
    /data-sheet-scroll/.test(publish) &&
    /<div data-sheet-content>\{content\}<\/div>/.test(publish) &&
    /fit\?: boolean/.test(sheetSrc) &&
    /new ResizeObserver\(measure\)/.test(sheetSrc),
)

check(
  "a menu row can be a link, so 'View live site' opens a real new tab",
  /href\?: string/.test(menu) &&
    /<a\s*\n\s*href=\{item\.href\}\s*\n\s*target=\{item\.target\}/.test(menu) &&
    /label: "View live site",[\s\S]{0,200}href: ownOpen\(websiteUrl\),[\s\S]{0,80}target: "_blank"/.test(editor) &&
    !/onClick=\{\(\) => window\.open\(websiteUrl, "_blank"\)\}/.test(editor),
)

check(
  "the canvas never hands a scroll to a parent that swallows it",
  /if \(el\.scrollTop <= 0\) el\.scrollTop = 1/.test(editor) && /else if \(el\.scrollTop >= max\) el\.scrollTop = max - 1/.test(editor),
)

check(
  "the editor dissolves in and out instead of cutting",
  /wb-editor-enter/.test(editor) && /leaving && "wb-editor-leaving"/.test(editor) && /\.wb-editor-leaving \{/.test(untt(readFileSync(join(root, "app/globals.css"), "utf8"))),
)

check(
  "the phone's AI sheet stays mounted, so closing it is a slide and not a vanish",
  /const \[aiMounted, setAiMounted\] = useState\(false\)/.test(editor) &&
    /\{isMobileView && aiMounted && \(/.test(editor) &&
    // Anchored on the brace: `!isMobileView && aiOpen` is the desktop column.
    !/\{isMobileView && aiOpen && \(/.test(editor),
)

check(
  "on a phone the bar reads Back, menu, undo, redo on the left, then inspector, AI, Publish",
  (() => {
    const header = editor.slice(editor.indexOf("<header"), editor.indexOf("</header>"))
    const menu = header.indexOf("<ResponsiveActionMenu")
    const left = header.indexOf("{isMobileView && undoRedo}")
    const insp = header.indexOf('aria-label={inspectorEnabled ? "Disable section inspector"')
    const ai = header.indexOf('aria-label="Ask Storelib"')
    const pub = header.indexOf("const live = install?.status")
    return menu > 0 && left > menu && insp > left && ai > insp && pub > ai
  })(),
)

check(
  "a sheet renders into the body, so the layer it declares is the layer it gets",
  /**
   * z-index only compares inside one stacking context. The publish sheet is
   * rendered next to the button that opens it, inside a `relative z-50`
   * header — so its z-[80] was measured against the header's own children,
   * and the header at z-50 still lost to the persistent peek at z-50 later in
   * the tree. No number fixes that from inside; the sheet has to leave.
   */
  /import \{ createPortal(, flushSync)? \} from "react-dom"/.test(sheetSrc) &&
    /return createPortal\(\s*<>/.test(sheetSrc) &&
    /<\/>,\s*document\.body,\s*\)/.test(sheetSrc),
)

check(
  "the inspector fills and glows over a quarter second, from values that can be interpolated",
  // `fill: none` and `filter: none` cannot be animated from; transparent and
  // a zero-radius shadow can.
  /\.wb-inspector svg \{\s*fill: transparent;\s*filter: drop-shadow\(0 0 0 rgba\(139, 86, 250, 0\)\);\s*transition:\s*fill 260ms/.test(css) &&
    /* The press is on `scale` (Tailwind 4 writes scale, not transform), so the transition names scale. */
    /\.wb-inspector \{\s*-webkit-tap-highlight-color: transparent;\s*transition:\s*scale 160ms[\s\S]{0,200}box-shadow 260ms/.test(css) &&
    /\.wb-inspector:active:not\(:disabled\) \{ scale: 0\.92; \}/.test(css),
)

check(
  "the leaving background does not shimmer; only the bar moves",
  // A whole screen that shimmers reads as the page loading badly rather than
  // as the page leaving.
  !/\.wb-leaving::before/.test(css) &&
    !/wb-leaving-shimmer/.test(css) &&
    /\.wb-leaving-bar::after \{[\s\S]{0,300}animation: wb-leaving-sweep/.test(css),
)


// ===========================================================================
section("The code editor, on a phone")
// ===========================================================================

check(
  "the files are a drawer over the code, not the whole of a 390px screen",
  /**
   * A 224px explorer beside an editor works on a desktop and leaves neither
   * usable on a phone: a third of the screen is a list you are not reading,
   * the rest a column of code four words wide.
   *
   * Taking turns was the first answer and it had a dead end in it. The way
   * back to the list lives on the bar that only exists while a file is open,
   * so closing the last tab left an empty editor, no files, and nothing to
   * press. A drawer is always reachable and never takes the code away.
   */
  /const \[narrow, setNarrow\] = useState\(false\)/.test(codePage) &&
    /matchMedia\("\(max-width: 767px\)"\)/.test(codePage) &&
    /absolute inset-y-0 left-0 z-40 w-\[86%\] max-w-\[320px\]/.test(codePage) &&
    /showFiles \? "translate-x-0" : "-translate-x-full"/.test(codePage) &&
    // one property, on the compositor, for the whole of the movement, on the
    // same curve and duration as the builder's bottom sheet
    /transition-transform duration-\[360ms\] ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/.test(codePage) &&
    // and three ways to close it: the backdrop, its own button, and Escape
    /aria-label="Close the file list"/.test(codePage) &&
    /if \(e\.key === "Escape"\) setShowFiles\(false\)/.test(codePage) &&
    /\/\/ On a phone, picking a file is the gesture that means "show me the code"\.\s*\n\s*setShowFiles\(false\)/.test(codePage),
)

check(
  "and the code column is never hidden behind it, so there is no dead end",
  !/narrow && showFiles && "hidden"/.test(codePage) &&
    // with no file open, the empty state carries the way back to the list
    /Browse files/.test(codePage),
)

check(
  "New file is a row in the file list, and fits the column it is in",
  /**
   * It has been three things. A one-row form in the explorer (a label, a
   * field and two buttons, about 250px before the field had a pixel, so on a
   * phone it ran off both edges). Then a centred dialog, which fixed the fit
   * by taking the whole screen for a question with one short answer. Now a
   * row in the list, stacked — field on its own line, buttons under it —
   * which is a shape that fits 240px on a desktop and the full width of the
   * drawer on a phone.
   */
  /aria-label="New file"[\s\S]{0,200}FilePlus/.test(codePage) &&
    // in the list, not over it
    !/aria-label="Name the new file"/.test(codePage) &&
    /label="Name of the new section"/.test(codePage) &&
    // 16px on a phone is what stops iOS zooming the page on focus
    /label="Name of the new section"[\s\S]{0,200}text-\[16px\]/.test(codePage),
)

check(
  "and there is a way back to the list once a file is open",
  /onClick=\{\(\) => setShowFiles\(true\)\}/.test(codePage) && /Files\s*\n\s*<\/button>/.test(codePage),
)

check(
  "Save and Revert are on the file, not on a bar that disappears when the editor frames the page",
  // `!embedded` hides the top bar, which took Save and Revert with it — and a
  // phone has no Cmd-S, so there was no way to save at all.
  (() => {
    const header = codePage.slice(codePage.indexOf("{!embedded && ("), codePage.indexOf("</header>"))
    const row = codePage.slice(codePage.indexOf("{selectedFile && ("), codePage.indexOf("{/* Code area */}"))
    /**
     * Revert is one of the actions the bar declares once and draws either as
     * an icon with a tooltip or as a row in the overflow menu, so it is
     * `onClick: revertFile` now rather than a prop. Save is still its own
     * button, because it is the one thing that never moves behind a menu.
     */
    return !/onClick=\{saveFile\}/.test(header) && /onClick=\{saveFile\}/.test(row) && /onClick: revertFile/.test(row)
  })(),
)

check(
  "the code is 16px on a phone, so tapping it does not zoom the page",
  // Safari zooms when a field with text under 16px takes focus. Both layers
  // read one constant, or the caret drifts from its character.
  /const CODE_TEXT = "text-\[16px\] leading-6 md:text-\[12px\] md:leading-5"/.test(codePage) &&
    (codePage.match(/CODE_TEXT/g) ?? []).length >= 4,
)

check(
  "file rows and tab closes are big enough for a finger",
  /narrow \? "py-2\.5" : "py-1"/.test(codePage) && /narrow \? "h-7 w-7 -mr-1\.5" : "h-4 w-4"/.test(codePage),
)


// ===========================================================================
section("A sheet ends where the screen ends, not where the page does")
// ===========================================================================

check(
  "a sheet stays on `bottom: 0` and lifts its content clear of the browser's bar by measuring it",
  /**
   * Positioning the sheet by `top` from `visualViewport.offsetTop + height`
   * was WRONG and shipped once: Safari already keeps a bottom-anchored fixed
   * element above its toolbar, so the correction was a second one and the
   * publish card went further under the bar. What is correct is to measure
   * the overlap with a probe and pad past it — zero where there is no
   * overlap, so it is safe on every browser.
   *
   * The keyboard goes through the same number rather than getting a second
   * mechanism: both are "something is covering the bottom of this sheet",
   * and a sheet that corrected for them in two places would eventually
   * correct twice for one of them.
   *
   * It is ONE number but it is not a SUM, which is the part that was wrong.
   * The three things that can cover the bottom of a sheet overlap: a
   * keyboard is drawn over the home indicator and over the browser's bar.
   * Adding them reserved the same strip up to three times, and Cancel and
   * Save sat a band of empty sheet above the keyboard. sheetBottomReserve
   * picks what is actually there.
   */
  /fixed left-0 right-0 bottom-0 flex flex-col/.test(sheetSrc) &&
    !/viewportTop/.test(sheetSrc) &&
    /function browserChromeGap\(\): number/.test(sheetSrc) &&
    /probe\.getBoundingClientRect\(\)\.top/.test(sheetSrc) &&
    /paddingBottom: (?:composerKeys \? sheetBottomReserve\(chromeGap, 0\) : )?sheetBottomReserve\(chromeGap, keyboardInset, visibleTop > 0\)/.test(sheetSrc) &&
    // and the height grows by it too, or padding just pushes content out again
    /const safe = safeAreaBottom\(\) \+ browserChromeGap\(\)/.test(sheetSrc),
)

check(
  "a content-sized sheet opens all the way up, not to a fraction of a screen it no longer fills",
  // Its stops are its own height and away; the 0.62/0.92 detents describe a
  // sheet sized to the screen and pushed a content-sized one under the bar.
  //
  // `detentHeight` is that height. It is not `height`, which is the same
  // number GROWN BY THE KEYBOARD — and the closed position is how far the
  // sheet travels to be gone, which a keyboard has nothing to do with. Using
  // the grown one here would leave a keyboard's height of sheet on screen
  // after a dismissal.
  /fit && contentHeight > 0\s*\n\s*\? \/\/ One stop[\s\S]{0,400}\[0, Math\.max\(detentHeight - peek, 0\)\]/.test(sheetSrc),
)

check(
  /**
   * A KEYBOARD TAKES THE SHEET'S ROOM, SO THE SHEET TAKES IT BACK.
   *
   * The sheet pads itself by the keyboard's height, and that padding comes
   * out of its own height — so a 60% sheet with a 336px keyboard up had
   * 170px left for a header, a form and two buttons, and the field being
   * typed into was not on screen at all.
   */
  "a sheet grows by the keyboard, up to a ceiling that keeps its top edge out from under the status bar",
  /const ceiling = keyboardCeiling\(\{ viewport, tallestHeight: natural, safeTop, visibleTop, barBottom: barEdge \}\)/.test(sheetSrc) &&
    /const height = (?:composerKeys \? detentHeight : )?sheetHeightWithKeyboard\(detentHeight, keyboardInset, ceiling\)/.test(sheetSrc),
)

check(
  "and the field being typed into is brought into the sheet's own scroller",
  /\[data-sheet-scroll\]/.test(sheetSrc) && /keyboardInset <= 0\) return/.test(sheetSrc),
)

check(
  "and the publish panel scrolls inside the sheet, so nothing in it is out of reach",
    // Not `flex-1`: a zero basis inside a content-sized `fit` wrapper measures
  // as nothing and the sheet sizes itself to an empty card.
  /<div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1">/.test(publish) &&
    // and the actions sit under it, outside the scroll, so Publish is never
    // the thing that scrolled away
    /<div className="shrink-0 border-t border-white\/10 px-5 pb-3 pt-3 text-white">\{actions\}<\/div>/.test(publish),
)

check(
  "the section list has an insert line between rows, and the three groups are ruled apart",
  // A thin line between two rows that adds a section there, under the pointer;
  // and a hairline between Header, Template and Footer drawn at rest, so on a
  // phone, where nothing hovers, the list still reads as three parts.
  /data-insert-section=""/.test(sectionsList) &&
    /group-hover\/ins:bg-\[#8b5cf6\]\/60/.test(sectionsList) &&
    /* Header, page, Footer, and the Overlay group when it shows. */
    (sectionsList.match(/<div className="mx-1 my-2 h-px bg-\[#eceef1\]" aria-hidden \/>/g) ?? []).length === 3,
)


// ===========================================================================
section("The website list, and the row of themes under it")
// ===========================================================================

const wbPage = untt(readFileSync(join(root, "app/app/website-builder/website-builder-client.tsx"), "utf8"), "app/app/website-builder/website-builder-client.tsx")

check(
  "the theme row sits on the page's gutters like every other block",
  /**
   * It was a row of cards scrolled sideways, which needed scroll padding to
   * keep off the screen edge. With one theme on offer it is one full-width
   * row in the card style, inside the section's own padding.
   */
  /data-explore-row=""/.test(wbPage) && !/snap-x snap-mandatory/.test(wbPage),
)

check(
  "no row in the library is labelled Offline or Draft",
  // Both name the same ordinary thing, a site you have not published, in
  // language that sounds like a fault.
  (() => {
    const rows = wbPage.slice(wbPage.indexOf("aria-label={`Edit ${i.name}`}"))
    return !/<StatusDot status=\{i\.status\}/.test(rows) && (wbPage.match(/<StatusDot /g) ?? []).length === 1
  })(),
)


check(
  "the mode pill is slim, and the bar does not narrate the save",
  // At h-8 in a p-1 track it was a 40px slab on a 48px bar. And a sentence of
  // grey text pushed the project's name away from the switcher it belongs to,
  // to say what the Publish button already says.
  /flex h-7 items-center rounded-full px-2\.5 text-\[12\.5px\]/.test(modeSwitch) &&
    /rounded-full border border-white\/10 bg-white\/\[0\.05\] p-0\.5/.test(modeSwitch) &&
    /absolute top-0\.5 h-7 rounded-full/.test(modeSwitch) &&
    !/"Not published yet" : "Unsaved changes"/.test(editor),
)

// ===========================================================================
//  THE EDITOR INSIDE A NATIVE SHELL
// ===========================================================================
// Capacitor loads the web layer from storelib.com into a viewport-fit:cover
// webview, so y=0 is under the status bar and the Dynamic Island. The editor
// is the one screen with no app chrome above it, so its own 48px bar sat
// entirely inside a 59pt inset: on an iPhone the whole top row — Back, the
// menu, undo, redo, Publish — was behind the clock, and the first pixels of
// the preview under it too.
//
// It cannot be fixed natively. The native shell only loads a URL; a Swift or
// Gradle change would need an App Store release, while everything below ships
// with the next deploy. So the insets are read in CSS, from env(), where they
// are real on iOS, zero in a browser, and zero on Android until that app goes
// edge-to-edge — no branch, no user-agent test, no plugin.
const editorCss = untt(readFileSync(join(root, "app/globals.css"), "utf8"))
const codePageSrc = untt(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8"), "app/website-builder/code/[installId]/page.tsx")

check(
  "the editor's geometry comes from env(), in one place",
  /\.wb-editor \{[\s\S]*?--wb-safe-top: env\(safe-area-inset-top, 0px\)/.test(editorCss) &&
    /--wb-chrome-top: calc\(var\(--wb-topbar\) \+ var\(--wb-safe-top\)\)/.test(editorCss) &&
    // The peek is NOT among them. It is published on <html> in pixels by the
    // sheet that leaves it; declaring it on `.wb-editor` too would shadow the
    // real one for the whole subtree, which is the bug it exists to prevent.
    !/--wb-sheet-peek:/.test(editorCss),
)

check(
  "the top bar is as tall as the bar plus the strip above it, and pads rather than moves",
  // Padded, not offset: the bar's own background then paints the inset, so a
  // dark editor does not show a notch of page colour above it.
  /\.wb-editor-topbar \{\s*height: var\(--wb-chrome-top\);\s*padding-top: var\(--wb-safe-top\);/.test(editorCss) &&
    /<header className="wb-editor-topbar relative bg-\[var\(--wb-chrome-bg\)\]/.test(editor) &&
    !/<header className="relative h-12 bg-\[#171717\]/.test(editor),
)

check(
  "the root declares the geometry the bar and the canvas both read",
  /"wb-editor fixed inset-0 flex flex-col/.test(editor),
)

check(
  "nothing sizes itself against the bar's nominal height any more",
  // This is the first bug, written down: a canvas sized against 48px is a
  // canvas that overlaps the bar by the inset. The heights are now taken
  // from the box the editor was given, and the inset lives in the two
  // custom properties the bar and the sheet's reservation read.
  !/calc\(100svh - 48px/.test(editor) &&
    !/calc\(100vh - 96px\)/.test(editor) &&
    // The inset now lives in the two custom properties the bar's height and
    // the sheet's reservation read, rather than in a `calc` per card.
    /--wb-chrome-top: calc\(var\(--wb-topbar\) \+ var\(--wb-safe-top\)\)/.test(editorCss) &&
    /paddingBottom: "var\(--wb-sheet-peek, 72px\)"/.test(editor),
)

check(
  "the sheet leaves the same peek the canvas reserves",
  // 72px of sheet on every phone: the CSS adds the inset to the number the
  // canvas subtracts, and the sheet adds the measured one to what it shows.
  // A sheet that only padded would have shown 38px of a 72px tab row.
  /const peek = peekHeight > 0 \? peekHeight \+ peekInset : 0/.test(sheetSrc) &&
    /setPeekInset\(safeAreaBottom\(\)\)/.test(sheetSrc) &&
    // And measured on rotation only. visualViewport's scroll fires per frame
    // on iOS, and the probe forces a layout every time it runs; a home
    // indicator cannot change mid-scroll, so it does not belong on that path.
    /window\.addEventListener\("orientationchange", measure\)/.test(sheetSrc) &&
    !/setChromeGap\(browserChromeGap\(\)\)\s*\n\s*setPeekInset/.test(sheetSrc) &&
    /offsetsFor\(\{ viewport, detents: stops, peekHeight: peek, safeTop, barBottom: barEdge \}\)/.test(sheetSrc),
)

check(
  "a raised sheet still means gone, inset or not",
  // `peekHeight={0}` is the menu, Publish and the AI. Growing that by the home
  // indicator would leave a 34px sliver of every one of them on screen.
  /peekHeight > 0 \? peekHeight \+ peekInset : 0/.test(sheetSrc),
)

check(
  "everything else that pins itself to the top clears the inset too",
  // The editor's toast, and the code page's bar when it is opened on its own
  // rather than inside the editor's frame.
  /style=\{\{ paddingTop: "env\(safe-area-inset-top, 0px\)" \}\}/.test(editor) &&
    /style=\{\{ paddingTop: "env\(safe-area-inset-top, 0px\)" \}\}/.test(codePageSrc) &&
    /box-content/.test(codePageSrc),
)


// ===========================================================================
section("Backups: every task, every publish, and a way back that is never one-way")
// ===========================================================================

const backupsLib = untt(readFileSync(join(root, "lib/website-builder/backups.ts"), "utf8"), "lib/website-builder/backups.ts")
const backupsRoute = untt(readFileSync(join(root, "app/api/website-builder/themes/[installId]/backups/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/backups/route.ts")
const restoreRoute = untt(readFileSync(
  join(root, "app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts"),
  "utf8",
), "app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts")
const publishRoute = untt(readFileSync(join(root, "app/api/website-builder/themes/[installId]/publish/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/publish/route.ts")
const backupsSql = untt(readFileSync(join(root, "supabase/sql/RUN_THEME_BACKUPS.sql"), "utf8"))
const themeChat = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")

check(
  "a backup is the editor's own view of the project: the draft where there is one",
  /draft_settings \?\? settingsRow\?\.settings/.test(backupsLib) && /p\.draft_sections \?\? p\.sections/.test(backupsLib),
)

check(
  "an identical state is not stored twice in a row, and only the newest thirty survive",
  // Publishing the same draft three times is one backup, not three; and a
  // long day of work is a fraction of a megabyte, not a table that grows
  // for ever.
  /latest\.fingerprint === fingerprint/.test(backupsLib) &&
    /export const BACKUPS_TO_KEEP = 30/.test(backupsLib) &&
    /\.range\(BACKUPS_TO_KEEP, BACKUPS_TO_KEEP \+ 200\)/.test(backupsLib),
)

check(
  "restoring writes the DRAFT, never the live site, and leaves pages the copy did not know about",
  /update\(\{ draft_settings: snapshot\.settings \}\)/.test(backupsLib) &&
    /update\(\{ draft_sections: page\.sections \}\)/.test(backupsLib) &&
    !/update\(\{ sections: page\.sections/.test(backupsLib) &&
    /Pages that exist now but were not in the snapshot are left alone/.test(backupsLib),
)

check(
  "both routes prove the caller owns the install, and a restore is scoped to it",
  // A backup id from one website cannot be restored into another even by
  // its owner.
  /\.eq\("creator_id", creator\.id\)/.test(backupsRoute) &&
    /\.eq\("creator_id", creator\.id\)/.test(restoreRoute) &&
    /\.eq\("id", backupId\)\s*\n\s*\.eq\("install_id", installId\)/.test(restoreRoute),
)

check(
  "a restore takes a safety copy of the draft it replaces, before it writes",
  (() => {
    const safety = restoreRoute.indexOf('source: "restore"')
    const apply = restoreRoute.indexOf("await applySnapshot(")
    return safety > 0 && apply > safety && /if \(safety\.error\) return/.test(restoreRoute)
  })(),
)

check(
  "a client may claim only the two sources that are its to claim",
  // "publish" and "restore" are written by the server from the routes that
  // do those things.
  /source: z\.enum\(\["ai", "manual"\]\)\.optional\(\)/.test(backupsRoute),
)

check(
  "the list never carries the snapshots, and says plainly when the table is not set up",
  /\.select\("id, label, source, created_at"\)/.test(backupsRoute) &&
    /Run RUN_THEME_BACKUPS\.sql/.test(backupsRoute) &&
    /status: missing \? 503 : 500/.test(backupsRoute),
)

check(
  "publishing takes a backup, and a backup that fails cannot fail the publish",
  /await takeBackup\(admin, installId, \{ label: "Published", source: "publish" \}\)/.test(publishRoute) &&
    /try \{\s*await takeBackup\(admin/.test(publishRoute),
)

check(
  "Storelib AI finishing a task takes one, labelled with what was asked, after the draft has been saved",
  /onRunEnd\?: \(prompt: string\) => void/.test(themeChat) &&
    /if \(snapshotTaken\) onRunEnd\?\.\(prompt\)/.test(themeChat) &&
    /onRunEnd=\{backupAfterTask\}/.test(editor) &&
    /window\.setTimeout\(\(\) => \{\s*void fetch\(`\/api\/website-builder\/themes\/\$\{installId\}\/backups`/.test(editor) &&
    /source: "ai", label: prompt/.test(editor),
)

check(
  "the table is owned through the same chain as every other theme table, and indexed for the one query it gets",
  /references public\.store_theme_installs\(id\) on delete cascade/.test(backupsSql) &&
    /check \(source in \('ai', 'publish', 'manual', 'restore'\)\)/.test(backupsSql) &&
    /on public\.store_theme_backups \(install_id, created_at desc\)/.test(backupsSql) &&
    /stb_select_own/.test(backupsSql) && /stb_insert_own/.test(backupsSql) && /stb_delete_own/.test(backupsSql) &&
    /enable row level security/.test(backupsSql),
)

check(
  "the Backups page lists moments with a Load, asks before restoring, and says what will and will not happen",
  /A backup is saved automatically each time Storelib AI finishes a task and each time you publish/.test(settingsAll) &&
    /Restore this backup\?/.test(settingsAll) &&
    /A backup of the draft you have now is saved first, so this can be undone/.test(settingsAll) &&
    /Nothing changes on your live site until you publish/.test(settingsAll) &&
    /onRestored=\{\(\) => window\.location\.reload\(\)\}/.test(editor),
)

check(
  "and its hooks all sit above the early return",
  // A hook after `if (!open) return null` runs a different number of times
  // depending on `open`, which React will not tolerate.
  (() => {
    const after = settingsPage.slice(settingsPage.indexOf("if (!open) return null"))
    return !/\buse(State|Effect|Callback)\(/.test(after)
  })(),
)

// ===========================================================================
section("The sidebar: one menu per row, badges for the chrome, and a width you set")
// ===========================================================================

check(
  "a row shows Hide, Delete and three dots under the pointer, and the dots open the same menu a right-click does",
  !/title="Remove"/.test(sectionsList) &&
    /aria-label=\{`More for \$\{displayName\}`\}/.test(sectionsList) &&
    /<DropdownMenuTrigger asChild>\s*<button\s*type="button"\s*aria-label=\{`More for \$\{displayName\}`\}/.test(sectionsList) &&
    /<DropdownMenu open=\{menuOpen\} onOpenChange=\{setMenuOpen\} modal=\{false\}>/.test(sectionsList) &&
    /onContextMenu=\{\(e\) => \{\s*\n\s*e\.preventDefault\(\)\s*\n\s*setMenuOpen\(true\)/.test(sectionsList) &&
    /Duplicate\s*<\/DropdownMenuItem>/.test(sectionsList) &&
    /Move up\s*<\/DropdownMenuItem>/.test(sectionsList) &&
    /Delete\s*<\/DropdownMenuItem>/.test(sectionsList) &&
    /label=\{`Delete \$\{displayName\}`\}/.test(sectionsList) &&
    !/text-red-500 hover:bg-red-50/.test(sectionsList),
)

check(
  "the header and the footer carry a badge saying which piece of chrome they are",
  /* The Overlay group's rows are never the header or the footer. */
  /const chrome = role !== "overlay" && isKind\(s, role, kindOfType\) \? role : undefined/.test(sectionsList) &&
    /\{groupRows\("header"\)\}/.test(sectionsList) &&
    /\{groupRows\("footer"\)\}/.test(sectionsList) &&
    /chrome === "header" \? <PanelTop/.test(sectionsList) &&
    /<PanelBottom/.test(sectionsList),
)

check(
  "the sidebar resizes from its right edge, clamped, written to the element while dragging, remembered after",
  /onPointerDown=\{startSidebarResize\}/.test(editor) &&
    /const SIDEBAR_MIN = 240/.test(editor) &&
    /const SIDEBAR_MAX = 560/.test(editor) &&
    /sidebarRef\.current\.style\.width = `\$\{latest\}px`/.test(editor) &&
    /localStorage\.setItem\("wb:sidebar-width"/.test(editor) &&
    /cursor-col-resize touch-none/.test(editor),
)

// ===========================================================================
section("The code editor: its document is dark and still, and a file can leave")
// ===========================================================================

check(
  "framed, the code page's own document does not scroll, and its surface is a theme the reader picks",
  // And its surface is named once rather than written out twenty times, or a
  // second theme means twenty conditionals and the nineteenth is forgotten.
  /html\.style\.overflow = "hidden"/.test(codePage) &&
    /const surface = codeTheme === "dark" \? "#0e0e0e" : "#ffffff"/.test(codePage) &&
    /\}, \[embedded, codeTheme\]\)/.test(codePage) &&
    /data-code-theme=\{codeTheme\}/.test(codePage) &&
    /\.wb-code \{[\s\S]{0,400}--code-bg: #ffffff/.test(css) &&
    /\.wb-code\[data-code-theme="dark"\] \{[\s\S]{0,400}--code-bg: #0e0e0e/.test(css) &&
    !/bg-\[#0e0e0e\]|bg-\[#141414\]|border-white\//.test(codePage),
)

check(
  "a file can be copied and downloaded, as it is in the editor now",
  // The label is the action's, and it is what the icon's `aria-label` and its
  // tooltip and its row in the overflow menu are all drawn from.
  /label: copied \? "Copied" : "Copy file content"/.test(codePage) &&
    /navigator\.clipboard\.writeText\(fileContent\)/.test(codePage) &&
    /label: "Download this file"/.test(codePage) &&
    /aria-label=\{a\.label\}/.test(codePage) &&
    /a\.download = selectedFile\.name/.test(codePage),
)


// ====================================================================section("Links stay in the builder, and loading looks like what is coming")
// ===========================================================================

const headerRenderer = untt(readFileSync(join(root, "components/website-builder/sections/renderers/HeaderSection.tsx"), "utf8"), "components/website-builder/sections/renderers/HeaderSection.tsx")

check(
  "a nav link inside the editor is intercepted whether or not the inspector is on",
  /**
   * Gated on `isEditing`, a nav link with the inspector off was a real anchor
   * to "/" — which in the editor's own document is storelib.com, not the
   * site being built. Home took people out of the builder.
   */
  // Four doors: the nav link, its submenu, the CTA, and the phone menu.
  // The fifth was the cart, which is gone: there was never a cart behind it.
  //
  // WHAT IS BEING COUNTED IS THE INTERCEPTION, not what follows it. All four
  // still cancel the anchor, which is the thing that used to take people out
  // of the builder. Three of them call `onEditorNavigate` on the spot. The
  // fourth is the phone menu, which cancels unconditionally and then closes
  // before it changes the page, the same order the published branch uses,
  // because changing the page under an open menu is a tap that looks like it
  // did nothing. The menu's own half is pinned in nav-drawer.test.ts.
  !/if \(isEditing\) \{\s*e\.preventDefault\(\)/.test(headerRenderer) &&
    (headerRenderer.match(/if \(onEditorNavigate\) \{\s*e\.preventDefault\(\)\s*e\.stopPropagation\(\)\s*onEditorNavigate\(/g) ?? []).length === 3 &&
    /const go = onEditorNavigate\s*\n\s*\? \(\) => \{ onEditorNavigate\(href, true\) \}/.test(headerRenderer) &&
    /window\.setTimeout\(go, CLOSE_MS\)/.test(headerRenderer),
)

check(
  "and the account and wishlist links open their pages in the canvas, not the builder window",
  /**
   * They are links to the website's own pages now (lib/website-builder/
   * account-pages): Sign in (/account/login) or, once signed in, Account
   * (/account), and the Wishlist. So in the builder they do what a nav link
   * does: cancel the browser's navigation and open that page in the canvas.
   * The icon row's two call `onEditorNavigate` with the path; the phone
   * drawer's (the account link and the two wishlist slots) go through
   * `handleLinkClick`, like every other link in the menu.
   *
   * One icon still only cancels: search in the icon row, which is a real
   * anchor to /search and would otherwise take the builder away.
   *
   * `handleLinkClick` is six now: a nav link on the menu's root pane and
   * one on its submenu pane, the call to action, the account link and the
   * two wishlist slots. There is no Create account any more: signing in
   * with a new email makes the account. The phone's Search row is matched
   * on its own because it is a conditional (see below).
   */
  (headerRenderer.match(/onClick=\{onEditorNavigate \? \(e\) => e\.preventDefault\(\) : undefined\}/g) ?? []).length === 1 &&
    /onEditorNavigate \? \(e\) => \{ e\.preventDefault\(\); onEditorNavigate\(account\.href, true\) \}/.test(headerRenderer) &&
    /onEditorNavigate \? \(e\) => \{ e\.preventDefault\(\); onEditorNavigate\(WISHLIST_PATH, true\) \}/.test(headerRenderer) &&
    (headerRenderer.match(/onClick=\{handleLinkClick\(/g) ?? []).length === 6 &&
    !/Create account/.test(headerRenderer.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /: handleLinkClick\("\/search"\)/.test(headerRenderer) &&
    /* Nothing leaves for the platform from the header any more. */
    !/goToPlatform|platformUrl/.test(headerRenderer),
)

check(
  "the cart drawer takes its frame from the same module the menu does",
  /HeaderCartDrawer/.test(headerRenderer) &&
    (headerRenderer.match(/useDrawerFrame\(open/g) ?? []).length === 2,
)

check(
  "a section can be dragged with a mouse, a finger or the keyboard, and the taps say when",
  /**
   * The page's sections use the drag blocks and menu links use
   * (controls/use-reorder.ts): the grip owns its finger, the row follows it
   * exactly, the taps come from that one place, and the editor only hears
   * which section took whose place.
   */
  /import \{ useReorder \} from "\.\/controls\/use-reorder"/.test(sectionsList) &&
    /dragHandleProps=\{gripProps\(i\)\}/.test(sectionsList) &&
    /data-reorder-row=""/.test(sectionsList) &&
    !/@dnd-kit/.test(sectionsList) &&
    /dnd=\{\{ onReorder: reorderSection \}\}/.test(editor) &&
    /const reorderSection = useCallback\(\(fromId: string, toId: string\) =>/.test(editor) &&
    !/useSensor\(TouchSensor/.test(editor) &&
    /hapticTap\("light"\)/.test(untt(readFileSync(join(root, "components/website-builder/editor/controls/use-reorder.ts"), "utf8"), "components/website-builder/editor/controls/use-reorder.ts")) &&
    /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(editor) &&
    !/navigator\.vibrate/.test(editor),
)

check(
  "the canvas is its own memoised component, so a toast does not re-render forty sections",
  /**
   * The site's sections were rendered inline in the editor's own render, so
   * every one of them re-rendered whenever ANY editor state changed: a
   * toast, the publish sheet, the width of the sidebar, which row the
   * pointer is over, where the section toolbar measured itself to on the
   * last scroll frame. A long page is thirty or forty renderers, several of
   * them carousels and grids, so on a mid-range phone that was thirty or
   * forty renders of real work to move a toolbar four pixels.
   *
   * A component with props rather than a useMemo with a dependency array, on
   * purpose: a prop it needs and does not get is a compile error, where a
   * missing dependency is a canvas that quietly stops updating. Its two
   * callbacks are built once in the parent, since a memoised component
   * handed a fresh arrow function every render is not memoised at all.
   */
  /const EditorCanvasPage = memo\(function EditorCanvasPage\(/.test(editor) &&
    /**
     * `canvasThemeSettings`, which is `useDeferredValue(activeThemeSettings)`.
     * Memoising it stopped an unrelated state change re-rendering the page;
     * deferring it stops a RELATED one doing it inside the touch that caused
     * it. Same rule, one step further. See tests/control-frames.test.ts.
     */
    /* Changed on purpose (the owner: currency in the builder like the live site): the deferred settings, in the language and market previewed, memoised from them. */
    (/<EditorCanvasPage\s*\n\s*theme=\{canvasThemeSettings\}/.test(editor) || (/<EditorCanvasPage\s*\n\s*theme=\{canvasThemeShown\}/.test(editor) && /const canvasThemeShown = useMemo\(\(\) => \{\s*const localized = previewMap \? \(localizeTheme\(canvasThemeSettings/.test(editor))) &&
    /const canvasThemeSettings = useDeferredValue\(activeThemeSettings\)/.test(editor) &&
    /const selectSectionFromCanvas = useCallback\(/.test(editor) &&
    /const openAddSection = useCallback\(\(\) => \{\s*\n\s*setAddGroup\("template"\)\s*\n\s*setAddSectionOpen\(true\)\s*\n\s*\}, \[\]\)/.test(editor) &&
    // Still one stable callback from the parent, now carrying which block
    // was clicked as well as which section, and which field the click was
    // for (tests/builder-click-edit.test.ts): see selectSectionFromCanvas.
    /onClick: inspectorEnabled\s*\n\s*\? \(e: React\.MouseEvent<HTMLElement>\) => \{/.test(editor) &&
    /onSelectSection\(section\.id, field \? field\.block : path\.length \? pathKey\(path\) : null, field\)/.test(editor),
)

check(
  "the grip is drawn at rest, and Hide, Delete and the menu only under the pointer",
  /**
   * The grip earns its place at rest: it says the list can be reordered.
   * Hide, Delete and the three dots wait for the pointer, and they wait
   * `hidden`, not transparent, so a touch on a row's name can never land on
   * an invisible bin. scripts/check-builder-sidebar.mjs measures it.
   */
  /<GripVertical className=\{cn\("h-3\.5 w-3\.5"/.test(sectionsList) &&
    /aria-label=\{`Drag \$\{displayName\} to reorder`\}/.test(sectionsList) &&
    /* One mark column, 20px wide, the width every row's mark takes; the grab area grows past it without moving the grid. */
    /relative flex h-6 w-5 shrink-0 touch-none cursor-grab items-center justify-center rounded transition-colors active:cursor-grabbing/.test(sectionsList) &&
    /* To the right only, so it never sits over the chevron beside it. */
    /after:absolute after:left-0 after:-right-1\.5 after:-inset-y-1/.test(sectionsList) &&
    /shown \? "flex" : "hidden group-hover\/row:flex group-focus-within\/row:flex"/.test(sectionsList) &&
    /isSelected \|\| menuOpen \? "flex" : "hidden group-hover\/row:flex group-focus-within\/row:flex"/.test(sectionsList) &&
    !/opacity-0 group-hover/.test(sectionsList),
)

check(
  "a selected section carries its own toolbar in the canvas, positioned by measurement",
  /**
   * Selecting a section told you it was selected and then made you go back to
   * the sidebar to do anything about it. Nesting the toolbar inside the
   * section would mean threading five callbacks through forty renderers and
   * inheriting the theme's own font and colour, so it lives in the canvas and
   * reads the section's rectangle instead.
   */
  /function SectionToolbar\(/.test(editor) &&
    /document\.getElementById\(`wb-section-\$\{sectionId\}`\)/.test(editor) &&
    /scroller\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(editor) &&
    /if \(!frame\) frame = requestAnimationFrame\(measure\)/.test(editor) &&
    /<SectionToolbar/.test(editor) &&
    /* What the canvas draws trails the switch by one fade (toggleInspector). Not in full screen, which is the site alone (scripts/check-full-screen.mjs). */
    /canvasInspecting && !fullView && !isMobileView && previewMode === "preview" && \(\(\) => \{/.test(editor),
)

check(
  "and it offers move, duplicate, hide and delete — with the chrome offered only what applies to it",
  // The header and the footer cannot be reordered, duplicated or removed.
  /label="Move up"/.test(editor) &&
    /label="Move down"/.test(editor) &&
    /label="Duplicate"/.test(editor) &&
    /label=\{hidden \? "Show" : "Hide"\}/.test(editor) &&
    /label="Delete"/.test(editor) &&
    /\{!isChrome && \(/.test(editor) &&
    /const moveSectionBy = useCallback\(\(sectionId: string, step: -1 \| 1\)/.test(editor),
)

// ===========================================================================
//  AND THE DOCUMENT BEHIND IT DOES NOT SCROLL
// ===========================================================================
// Padding the bar for the status bar was half the fix. The other half is that
// the editor was CONTENT in the body's flow, and globals.css gives every body
// `min-height: 100svh` plus `padding-bottom: env(safe-area-inset-bottom)`.
// Border-box makes those the same screen for an empty page — but the editor's
// own root was 100svh of content, so content plus padding was one screen plus
// the home indicator. Measured in Chromium at 390x844 with a 34px inset:
// document 791, viewport 757, scrollable by exactly 34.
//
// Those 34px were every remaining symptom at once. Drag anywhere and the
// whole editor slid up by them, putting the top bar back under the clock;
// what showed underneath was the html canvas, black on Capacitor — the band
// above the sections sheet, which is pinned to the viewport and so stayed
// put. With the fix the same measurement reads 0, and the canvas meets the
// sheet with a gap of exactly 0 both with the inset and without it.
const lockSrc = untt(readFileSync(join(root, "components/website-builder/full-screen-lock.tsx"), "utf8"), "components/website-builder/full-screen-lock.tsx")
const wbLayout = untt(readFileSync(join(root, "app/website-builder/layout.tsx"), "utf8"), "app/website-builder/layout.tsx")
const readRoot = (p: string) => untt(readFileSync(join(root, p), "utf8"))

check(
  "the editor is pinned to the viewport rather than laid out in the body's flow",
  // `h-svh` is content and the body's padding sits under it. `fixed` is
  // measured against the viewport and adds no height to the document.
  /"wb-editor fixed inset-0 flex flex-col/.test(editor) &&
    !/"wb-editor h-svh/.test(editor) &&
    /<EditorFrame>/.test(wbLayout) && /className="fixed inset-0 overflow-hidden bg-\[#eef1f5\]"/.test(readRoot("components/website-builder/editor-frame.tsx")) &&
    !/h-svh overflow-hidden bg-background/.test(wbLayout),
)

/* "Sometimes going into the website builder flashes the whole screen white."
   The editor fades in over whatever is under it; both of its addresses now
   put the editor's own frame there, and the canonical one its toaster too. */
check(
  "both editor addresses draw the editor's frame under it (its surround and its dark bar), never white",
  /bg-\[#171717\]/.test(readRoot("components/website-builder/editor-frame.tsx"))
    && /<EditorFrame>/.test(readRoot("app/store/[creatorSlug]/themes/[installId]/editor/layout.tsx"))
    && /<EditorToaster \/>/.test(readRoot("app/store/[creatorSlug]/themes/[installId]/editor/layout.tsx")),
)

check(
  "and the body cannot put the scroll back while it is mounted",
  /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{[\s\S]*?overflow: hidden;/.test(editorCss) &&
    /html\.wb-fullscreen body \{[\s\S]*?padding-bottom: 0;/.test(editorCss) &&
    /root\.classList\.add\("wb-fullscreen"\)/.test(lockSrc) &&
    /root\.classList\.remove\("wb-fullscreen"\)/.test(lockSrc),
)

check(
  "the lock is scoped to the two full-screen surfaces and undone on the way out",
  // Every other page wants that padding — it is what holds a footer above
  // the home indicator — so this cannot be a global rule.
  /<FullScreenLock tone=\{chromeTone\} fromFirstPaint \/>/.test(editor) /* fromFirstPaint: the lock is set before the editor paints, in place of an html:has() */ &&
    /<FullScreenLock \/>/.test(codePageSrc) &&
    /return \(\) => \{\s*\n\s*root\.classList\.remove\("wb-fullscreen"\)/.test(lockSrc),
)

check(
  "the canvas is the room it was given, not a sum of viewport units",
  // `100svh` and the box a native webview actually hands the editor are not
  // reliably the same number, and every pixel of difference was a gap of
  // black. The sheet's peek is reserved as padding on `main`, so the card is
  // simply what is left and the two cannot disagree.
  /paddingBottom: "var\(--wb-sheet-peek, 72px\)"/.test(editor) &&
    !/calc\(100svh - var\(--wb-chrome-top\)/.test(editor) &&
    !/calc\(100svh - 48px/.test(editor),
)

check(
  "the canvas reserves the number the sheet actually leaves showing",
  // Two computations of one number — 72 plus the inset, once in CSS and once
  // in JS — did not agree on a real phone, and every pixel of difference was
  // a strip of canvas the sheet did not cover. There is one number now, in
  // pixels, measured on the device, published by the sheet that leaves it.
  /root\.style\.setProperty\("--wb-sheet-peek", `\$\{peek\}px`\)/.test(sheetSrc) &&
    /if \(peek <= 0\) return/.test(sheetSrc) &&
    /root\.style\.removeProperty\("--wb-sheet-peek"\)/.test(sheetSrc),
)

check(
  "the lock holds from the first paint, and its own parse failure cannot take the other down",
  // `:has()` matches the moment the editor's root exists; the class waits for
  // an effect. Kept in SEPARATE rules because a selector list is not
  // forgiving: one selector an older iOS cannot parse throws away the whole
  // rule, and sharing a list would mean losing the class lock too.
  //
  // Changed on purpose: the first paint is now held by the class itself, not
  // by an `html:has(.wb-editor)` copy of the rules. The editor's server HTML
  // runs a one line script as the first thing inside its root, and a client
  // mount sets the class in a layout effect, before that commit paints. A
  // :has() whose subject is <html> restyled every element in the document
  // whenever text anywhere was replaced, on every page, editor or not
  // (scripts/check-app-sheets-frames.mjs: "Copy" to "Copied" 2866 elements).
  /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{/.test(editorCss) &&
    !/html:has\(\.wb-editor\)/.test(editorCss.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /<FullScreenLock tone=\{chromeTone\} fromFirstPaint \/>/.test(editor) &&
    /useLayoutEffect\(\(\) => \{\s*\n\s*const root = document\.documentElement\s*\n\s*root\.classList\.add\("wb-fullscreen"\)/.test(lockSrc) &&
    /classList\.add\("wb-fullscreen"\)/.test(lockSrc.match(/const LOCK_NOW = `[^`]*`/)?.[0] ?? "") &&
    /return fromFirstPaint && !onClient \? <script dangerouslySetInnerHTML=\{\{ __html: LOCK_NOW \}\} \/> : null/.test(lockSrc),
)

check(
  "the global bounce guard leaves the sheet's own drag alone",
  // It cancels touchmove at a scroller's boundary, on the document, and it
  // opts out of anything carrying this. Without it the guard and the sheet
  // fight over the same finger and the guard wins.
  /data-mobile-bottom-sheet=""/.test(sheetSrc) &&
    /data-mobile-bottom-sheet/.test(
      untt(readFileSync(join(root, "components/platform/capacitor-bounce-guard.tsx"), "utf8"), "components/platform/capacitor-bounce-guard.tsx"),
    ),
)

check(
  "the publish action is one box, whatever it says",
  /**
   * Four labels — Publish, Publish changes, Published, Publishing — and the
   * button was sized by whichever one it was showing, with `transition-all`
   * animating the change. Measured: 102, 178, 123 and 153px, so pressing it
   * started a 51px width animation in the same moment its contents were
   * replaced, inside a sheet that is a `contain: paint` layer being
   * transformed. What came out of that on a phone was a slab of purple
   * painted for one width with the spinner and the word stranded beside it.
   *
   * A 180px floor is wider than the widest state, so the geometry never
   * changes and there is nothing to tear. The row wraps rather than squeezes
   * on a 320px phone, where Preview and the button cannot share a line.
   * Colours still transition; nothing about the box does.
   *
   * `node scripts/check-publish-button.mjs`
   */
  /min-w-\[180px\] shrink-0 items-center justify-center gap-2 rounded-xl px-5/.test(publishPanel) &&
    /bg-\[#8B56FA\] transition-colors duration-150 hover:bg-\[#7b46ec\]/.test(publishPanel) &&
    // and the width no longer animates: `transition-all` on a button whose
    // label changes is a width tween nobody asked for
    !/font-semibold text-white transition-all/.test(publishPanel) &&
    /<div className="flex flex-wrap items-center gap-3">/.test(publishPanel) &&
    // busy is not disabled-looking: a button that fades the instant you use
    // it reads as one that did not take the press
    /aria-busy=\{busy\}/.test(publishPanel) &&
    /busy \? "cursor-default" : "disabled:cursor-default disabled:opacity-40"/.test(publishPanel),
)

check(
  "while a finger is on a sheet, the finger is the truth",
  /**
   * The drag writes `transform` straight to the element once per frame and
   * turns the transition off while it does. React was writing the same two
   * properties from state on every render, so ANY re-render landing mid-drag
   * put the sheet back where state believed it was and switched the 360ms
   * transition back on: a sheet that jumps out from under the finger and
   * then eases after it.
   *
   * Re-renders land there constantly on a phone. iOS fires
   * `visualViewport.scroll` while a sheet is being dragged, the content-fit
   * measurement can resolve at any moment, the browser chrome gap is
   * re-probed on resize. None of them have anything to do with the gesture.
   *
   * So the rendered values mirror the drag rather than compete with it:
   * mid-gesture React writes exactly what the imperative path already wrote.
   */
  /const dragging = drag\.current\.active/.test(sheetSrc) &&
    /**
     * `settledY`, not `openY`. The rest of this assertion is about the
     * `dragging ?` half and is unchanged; the other half now names where the
     * sheet was last LEFT rather than where it opens, because a sheet that
     * has been dragged is not at its opening stop and a render that put it
     * back there is what made it "become half at random". See
     * tests/sheet-rest.test.ts for that half.
     */
    /* `held` is `dragging` or a release still settling; see tests/sheet-rest.test.ts. */
    /const held = dragging \|\| settle\.current\.active/.test(sheetSrc) &&
    /const renderY = (waiting \? settledY : )?held \? drag\.current\.currentY : open \? settledY : closedY/.test(sheetSrc) &&
    /*
      The invariant is the `dragging ? "none"` half: while a finger is on the
      sheet there is no transition at all, so the imperative per-frame write
      is the only thing moving it. What the other half transitions has grown
      — `height` and `padding-bottom` joined `transform` so the keyboard
      arriving and leaving is a move rather than a snap — and pinning the
      exact string made a guard that fails on an unrelated addition while
      protecting nothing extra.
    */
    /const motion = dragging\s*\n?\s*\? "none"/.test(sheetSrc) &&
    /transform \$\{(?:SNAP_DURATION_MS|moveMs)\}ms \$\{SNAP_EASING\}/.test(sheetSrc) &&
    /transform: `translateY\(\$\{renderY\}px\)`/.test(sheetSrc) &&
    /transition: motion,/.test(sheetSrc) &&
    /opacity: renderOpacity,/.test(sheetSrc) &&
    /transition: fade,/.test(sheetSrc) &&
    // and the imperative path still owns the frame-by-frame write. The
    // curve is a parameter now, defaulting to the house one, because a
    // release picks its own so the sheet leaves at the finger's speed.
    /const value = on \? `transform \$\{ms\}ms \$\{easing\}` : "none"/.test(sheetSrc) &&
    /easing: string = SNAP_EASING/.test(sheetSrc) &&
    /rafId\.current = requestAnimationFrame/.test(sheetSrc),
)

check(
  "a sheet sized to its content takes a measurement that cannot depend on the answer",
  /**
   * Two attempts at this got stuck, and both got stuck the same way: the
   * number was read from boxes whose size the number itself decides. The
   * sheet took the height it measured, that squeezed the scroller inside it,
   * the next measurement came back smaller.
   *
   * "Add back whatever the scroller is currently clipping" was meant to make
   * that converge upward, and it does — but only while the scroller is the
   * thing being clipped. Where the squeeze lands elsewhere, or where the
   * scroller has been given MORE room than it needs, the correction is zero
   * and every height is self-consistent: any starting height is a fixed
   * point, including a bad one. Measured in Chromium at four sheet heights
   * with the real flex shape, it answered 441, 441, 441, 740 — agreeing with
   * a 420px sheet and with a 760px one, and therefore leaving neither.
   *
   * The property that fixes it is not "converges" but "does not depend on
   * the answer". A scroller contributes the height of its CONTENT, read from
   * a box inside it that the scroller cannot squeeze, corrected by the
   * difference against what that scroller was actually given. Same four
   * heights: 427, 427, 427, 427.
   *
   * `node scripts/check-sheet-fit.mjs`
   */
  /function naturalScrollHeight\(scroller: HTMLElement\): number/.test(sheetSrc) &&
    /const inner = scroller\.querySelector<HTMLElement>\("\[data-sheet-content\]"\)/.test(sheetSrc) &&
    /if \(scroller\) h \+= naturalScrollHeight\(scroller\) - scroller\.clientHeight/.test(sheetSrc) &&
    // and it is taken again when the sheet opens: a ResizeObserver reports a
    // box that CHANGED, and content laid out once presents nothing to report
    /\}, \[fit, mounted, chromeGap, open\]\)/.test(sheetSrc) &&
    // the sheet that uses it marks the box to measure (the action menu moved
    // to the shared sheet, which sizes to its content without measuring)
    /data-sheet-content/.test(publishPanel),
)

check(
  "the strip behind the clock is the bar's colour, not the page's",
  // html.capacitor paints the root canvas #000 so the safe area never flashes
  // white. Over a #171717 bar that is a black line across the top, which is
  // the "it is not full screen" that was reported. Both locks set it, so it
  // holds whether or not the webview runs edge to edge.
  // (One rule now, on the class: it is set from the first paint, see "the lock
  // holds from the first paint" above.)
  /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{\s*\n\s*background-color: #171717;/.test(editorCss),
)

check(
  "the code bar's buttons state their own colours rather than borrow a variant",
  /**
   * `variant="ghost"` hovers to `bg-accent` / `text-accent-foreground`, both
   * LIGHT tokens: on the near-black bar this editor used to have, Copy and
   * Download became white pills with white glyphs, invisible at the moment of
   * use. The editor is a light surface now and the fix still holds, because
   * what fixed it was stating the colours for the surface rather than
   * borrowing a variant that assumes a different one.
   */
  (() => {
    // Comments in this file explain the ghost variant; only the code counts.
    const code = codePageSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    return (
      /hover:bg-\[var\(--code-hover\)\] hover:text-\[var\(--code-text\)\]/.test(code) &&
      !/variant="ghost"/.test(code) &&
      // and every surface in it is asked for by name, so both themes get it
      !/bg-\[#0e0e0e\]|bg-\[#141414\]|border-white\//.test(code)
    )
  })(),
)


// ===========================================================================
section("Waiting: nine squares, words that change, and a code pane already warm")
// ===========================================================================

const loaderSrc = untt(readFileSync(join(root, "components/website-builder/builder-loader.tsx"), "utf8"), "components/website-builder/builder-loader.tsx")
const leaveConfirm = untt(readFileSync(join(root, "components/website-builder/leave-confirm.tsx"), "utf8"), "components/website-builder/leave-confirm.tsx")

check(
  "the builder waits behind nine staggered squares and a line of text, not a bar with nothing under it",
  // A bar says something is happening and nothing about what, and on a slow
  // connection that silence is what makes a wait feel broken.
  /\.wb-squares span \{[\s\S]{0,300}animation: wb-squares-fade 675ms ease-in-out infinite alternate/.test(css) &&
    /animation-delay: 600ms/.test(css) &&
    /<BuilderLoader/.test(editor) &&
    // "Going back" rather than "Leaving the builder": it names where you are
    // headed instead of what you are quitting, and it is what the overlay's
    // own aria-label already said. The rule that owns this copy is "going
    // back says so, in words you can read on the glass", below.
    /lines=\{\["Going back"\]\}/.test(exitScreenSrc) &&
    /"Loading the editor", "Fetching your sections", "Just a moment"/.test(editor),
)

check(
  "the lines advance and then stop, rather than looping",
  // A message that comes back round says the work started over.
  /setIndex\(\(i\) => \(i >= lines\.length - 1 \? i : i \+ 1\)\)/.test(loaderSrc) &&
    // keyed by the text, so the fade runs on every change and not just once
    /key=\{line\}/.test(loaderSrc),
)

check(
  "leaving the builder actually blurs, because the blur is declared rather than animated",
  /**
   * It was in the keyframe alone, interpolating from blur(0) to blur(14px),
   * and `backdrop-filter` is not reliably animatable: a browser that declines
   * renders no filter for the whole animation, and with the property declared
   * nowhere else there was nothing to fall back to. Declared on the element
   * it always applies, and fading the element in brings the blur and the
   * dimming together.
   *
   * 14px, not 20: at 20 the sidebar, the canvas and the bar melt into one
   * field and there is nothing behind the glass left to recognise. Saturation
   * up and brightness down does the darkening while the colour survives,
   * which is the difference between glass over a page and grey laid on it.
   */
  /-webkit-backdrop-filter: blur\(14px\) saturate\(1\.5\) brightness\(0\.55\);/.test(css) &&
    // and a pool of light under the loader, painted into the same layer
    /radial-gradient\(58% 46% at 50% 44%, rgba\(255, 255, 255, 0\.12\)/.test(css) &&
    /@keyframes wb-leaving-in \{\s*from \{ opacity: 0 \}\s*to \{ opacity: 1 \}\s*\}/.test(css) &&
    !/backdrop-filter: blur\(0px\)/.test(css) &&
    /prefers-reduced-motion: reduce\) \{\s*\.wb-leaving \{ animation: none \}/.test(css),
)

check(
  "the code pane is warmed while the browser is idle, and never on a phone",
  /**
   * Fetching a whole page in a frame at the moment somebody presses Code is a
   * second of empty card every time. Mounting it WITH the editor would make
   * it compete for bandwidth with the thing being looked at, so it waits for
   * idle — and not at all on a phone, where the code is its own screen and a
   * frame nobody asked for is a page load on a mobile connection.
   */
  /if \(everShown \|\| fullScreen\) return/.test(modeSwitch) &&
    /requestIdleCallback/.test(modeSwitch) &&
    /window\.setTimeout\(warm, 1500\)/.test(modeSwitch),
)


check(
  "a loading canvas is one surface with the loader in the middle of it, and only after a wait worth showing",
  /**
   * It was three stacked blocks in three tints, which drew a hard edge across
   * the canvas wherever one ended — the cut between the white and the grey.
   * A page that is loading is one empty page.
   */
  /className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"/.test(editor) &&
    !/h-\[50vh\] flex items-center justify-center bg-neutral-50\/40/.test(editor) &&
    /* Half a second, the wait every Storelib loader keeps, and over an imported theme until its first page has painted. */
    /const canvasLoaderUp = canvasBusy \|\| compatFirstPaint/.test(editor) &&
    /const showCanvasLoader = useDelayedFlag\(canvasLoaderUp, SPINNER_WAIT_MS\)/.test(editor) &&
    /export function useDelayedFlag\(active: boolean, delay = 350\)/.test(loaderSrc) &&
    // and it clears the instant the work does, so nothing lingers
    /if \(!active\) \{\s*setShown\(false\)/.test(loaderSrc),
)

check(
  "and when the page arrives the loader fades over it and the page rises in, rather than swapping in one frame",
  /**
   * The surface is kept for a beat after the work ends so it can fade, and
   * the page rises in when it mounts.
   *
   * NOT KEYED BY THE PAGE ANY MORE. It was, so that "each arrival rises in",
   * and the cost of that was the whole canvas being thrown away and rebuilt
   * on every page change: a frame with nothing in it, then a 360ms rise-in
   * of the entire page. That is the flash that was reported three times.
   * Measured with scripts/check-page-switch.mjs: 1 remount with the key, 0
   * without. The rise-in still plays exactly once, when this mounts as the
   * editor finishes loading, which is the arrival worth animating.
   */
  /const canvasLoaderLingers = useLinger\(canvasLoaderUp, 280\)/.test(editor) &&
    /\(canvasLoaderUp \|\| canvasLoaderLingers\) && \(/.test(editor) &&
    /data-leaving=\{!canvasLoaderUp\}/.test(editor) &&
    /<div className="wb-canvas-in flex w-full flex-1 flex-col">/.test(editor) &&
    !/key=\{currentPage\} className="wb-canvas-in/.test(editor) &&
    /export function useLinger\(active: boolean, ms = 280\)/.test(loaderSrc) &&
    /\.wb-canvas-loader\[data-leaving="true"\] \{\s*opacity: 0;/.test(editorCss) &&
    /@keyframes wb-canvas-in/.test(editorCss),
)

check(
  "switching the code editor's theme is a cross-fade, not a cut",
  // Every surface reads its colour from a variable, and a custom property
  // only animates where it is registered — so the properties that READ them
  // are what travel, and the whole editor turns over together.
  /\.wb-code,\s*\n\s*\.wb-code \* \{\s*transition:\s*background-color 200ms ease/.test(css) &&
    /\.wb-code textarea,[\s\S]{0,80}transition: none/.test(css) &&
    /prefers-reduced-motion: reduce\) \{\s*\.wb-code,/.test(css),
)


check(
  "every icon on the code bar says what it is, in the app's own tooltip",
  /**
   * A native `title` waits a second and a half, arrives as an OS box in the
   * OS's own font, and cannot be styled or timed. On a row of unlabelled
   * icons that is the difference between a control you can identify and one
   * you have to click to find out.
   */
  /function BarTip\(\{ label, children \}/.test(codePageSrc) &&
    /<Tooltip delayDuration=\{300\}>/.test(codePageSrc) &&
    /**
     * The icons are one list now, each entry carrying its own name, and the
     * wide bar wraps every one of them in a BarTip. Counting the names is
     * counting the icons; counting `<BarTip label=` would count the two that
     * are still written out by hand and call the other seven unlabelled.
     */
    /<BarTip key=\{a\.id\} label=\{a\.label\}>/.test(codePageSrc) &&
    (codePageSrc.match(/^\s+label: /gm) ?? []).length >= 5 &&
    // and the disabled Save still explains itself: Radix cannot hear a
    // pointer over a disabled button, so the trigger wraps a span that can
    /<TooltipTrigger asChild>\s*<span className="inline-flex">/.test(codePageSrc) &&
    !/title="Copy file content"|title="Download this file"/.test(codePageSrc),
)


check(
  "the builder asks about unsaved work in its own words, and only when there is some",
  /**
   * `window.confirm` was doing this, and the browser's dialog is the one part
   * of a product nobody can design: the OS's font, "storelib.com says", and no
   * way to name what is unsaved. And a confirmation that appears every time is
   * one people learn to dismiss without reading, which is when it stops
   * protecting anything.
   */
  !/window\.confirm\("You have unsaved changes/.test(editor) &&
    /<LeaveConfirm/.test(editor) &&
    /export function hasSomethingToLose/.test(leaveConfirm) &&
    /if \(reason\.busy\) lines\.push/.test(leaveConfirm) &&
    /if \(reason\.code\) lines\.push/.test(leaveConfirm) &&
    /if \(reason\.draft\) lines\.push/.test(leaveConfirm),
)

check(
  "and it hears the code editor's unsaved state from its own origin only",
  // The frame is our own page, and nothing else may tell the builder what
  // its unsaved state is.
  /if \(e\.origin !== window\.location\.origin\) return/.test(editor) &&
    /data\?\.type === "storelib:code-dirty"/.test(editor) &&
    /code: codeDirty/.test(editor),
)

check(
  "the preview canvas keeps its rounded corners on the scrollbar side",
  /**
   * A scrollbar is laid out and painted inside the scroll container's own
   * box, and it is NOT held inside that box's border-radius. So while the
   * preview card was itself the scroller, the bar painted a square column
   * straight through both right-hand arcs: measured in Chromium, all 44 of
   * the pixels the radius should have cut away were painted, at the top
   * corner and at the bottom one.
   *
   * The fix is not to style the bar — see the rule above, that is what
   * reserves a white column. It is to clip it: the radius lives on a wrapper
   * that does not scroll, `overflow: hidden` cuts everything outside the arc,
   * and the scroller is a square box filling it. Same measurement after: 0 of
   * 44 at the top, 1 at the bottom, that one the arc's own antialiasing.
   *
   * `node scripts/check-canvas-corner.mjs` renders both shapes side by side,
   * and the unwrapped one is a control that must still fail.
   */
  // The wrapper carries the shape and the clip...
  // The window between the two strings holds the wrapper's class list and
  // the paragraph explaining why the fade is desktop-only; it was 700 and
  // that paragraph is what pushed it past.
  /"(?:wb-canvas-frame )?relative overflow-hidden transition-all duration-300",[\s\S]{0,1600}?\? "rounded-t-\[20px\] w-full"/.test(editor) &&
    // ...and the scroller inside it is square and fills it, so nothing it
    // paints can reach a corner.
    /"relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"/.test(
      editor,
    ) &&
    // The id stays on the scroller: the sticky header portals into it and
    // listens to it for scroll.
    /id="wb-preview-root"/.test(editor),
)

check(
  "on a desktop the canvas draws its own scrollbar over the card, and the native one is hidden",
  /**
   * The reference has a thin grey pill inset from the card's edge. A native
   * bar cannot be that: styled, it becomes a classic bar that reserves a
   * column (the white strip beside a dark site, see above); unstyled, it is
   * whatever the platform draws and it runs through the corners. So the
   * native bar is hidden and CanvasScrollbar draws a thumb over the scroller,
   * six pixels in and eight short of either end. Nothing in the layout
   * changes and no column exists. A phone keeps its native bar.
   */
  /!isMobileView && "wb-canvas-hidebar"/.test(editor) &&
    /\{!isMobileView && <CanvasScrollbar targetId="wb-preview-root" \/>\}/.test(editor) &&
    /\.wb-canvas-hidebar \{\s*scrollbar-width: none;/.test(editorCss) &&
    /\.wb-canvas-hidebar::-webkit-scrollbar \{\s*display: none;/.test(editorCss) &&
    /const INSET_END = 8/.test(scrollbarSrc) &&
    /const INSET_SIDE = 6/.test(scrollbarSrc) &&
    // measured once per frame, not once per event
    /if \(!frame\.current\) frame\.current = requestAnimationFrame\(measure\)/.test(scrollbarSrc) &&
    // and it can be grabbed
    /onPointerDown=\{\(e\) => \{/.test(scrollbarSrc),
)

check(
  "and the card is sized once, on the wrapper, not again on the scroller inside it",
  /**
   * Computing the same size twice, once out here and once in there, is where
   * the editor's black bands came from. The wrapper is the card: it holds the
   * device width, the 900px cap and the desktop full height. The scroller is
   * `w-full h-full` of it and states no size of its own.
   */
  /width: `\$\{DEVICE_WIDTH\[device\]\}px`,\s*\n\s*maxWidth: "100%",\s*\n\s*height: "min\(900px, 100%\)",\s*\n\s*flex: "0 1 auto",/.test(
    editor,
  ) &&
    // The scroller keeps only what is about touch, not about size.
    /touchAction: "pan-y",\s*\n\s*overscrollBehavior: "contain",\s*\n\s*WebkitOverflowScrolling: "touch",\s*\n\s*\}\s*\n\s*: undefined/.test(
      editor,
    ),)
// ===========================================================================
section("Chrome is not a document, buttons are buttons, and the sheet costs one layout a frame")
// ===========================================================================

check(
  "nothing in the editor's chrome can be selected, and everything typed into still can",
  /**
   * A long press on a label that selects it is the surest sign of a web page
   * pretending to be an app. Selection stays on for inputs, textareas and
   * anything contenteditable, and on the code page for the code itself.
   */
  /\.wb-editor,\s*\n\.wb-code \{\s*-webkit-user-select: none;\s*user-select: none;\s*-webkit-touch-callout: none;/.test(editorCss) &&
    /\.wb-editor input,\s*\n\.wb-editor textarea,\s*\n\.wb-editor select,\s*\n\.wb-editor \[contenteditable="true"\],/.test(editorCss) &&
    /\.wb-code textarea,\s*\n\.wb-code input,\s*\n\.wb-code pre,\s*\n\.wb-code code \{\s*-webkit-user-select: text;\s*user-select: text;/.test(editorCss),
)

check(
  "Hide, Duplicate and Delete fit the sidebar they live in",
  /* Measured in scripts/check-section-actions.mjs: no icons, columns as wide as their words, 40px on a phone and 36px on a computer. */
  /"flex-auto min-w-0 h-10 md:h-9 px-1\.5 flex items-center justify-center rounded-lg text-\[13px\] font-semibold transition-colors duration-150",/.test(editor) &&
    /flex-auto min-w-0 h-10 md:h-9 px-1\.5 flex items-center justify-center rounded-lg bg-\[#f3f4f6\][^"]*"\s*\n\s*onClick=\{\(\) => duplicateSection\(section\.id\)\}/.test(editor) &&
    /hover:bg-\[#fee2e2\] hover:text-\[#dc2626\] active:bg-\[#fecaca\] active:text-\[#b91c1c\]"\s*\n\s*onClick=\{\(\) => removeSection\(section\.id\)\}/.test(editor) &&
    !/<Copy className="h-4 w-4" strokeWidth=\{2\} \/>\s*\n\s*Duplicate/.test(editor) &&
    !/py-2 text-xs text-red-400 hover:text-red-600 border border-border/.test(editor),
)

check(
  "leaving the builder does not fade the builder the glass is meant to frost",
  /**
   * The leaving screen carried a real backdrop-filter and still did not look
   * like glass, because `.wb-editor-leaving` set `opacity: 0.35` on the whole
   * builder at the same moment. A backdrop filter samples what is painted
   * beneath it; blurring a page washed out to a third of itself gives a flat
   * pale sheet. Measured over a builder-shaped page, the spread of luminance
   * behind the glass was 8.9 faded against 24.7 solid, which is the
   * difference between a grey sheet and something you can read through.
   *
   * `node scripts/check-leaving-glass.mjs`
   */
  /* Round 23: and it no longer shrinks under it either: it takes no presses while it goes, and that is all. */
  /\.wb-editor-leaving \{\s*\n\s*pointer-events: none;\s*\n\}/.test(editorCss) &&
    !/\.wb-editor-leaving \{\s*\n\s*opacity:/.test(editorCss) &&
    // The minifier collapses a prefixed/unprefixed pair down to the prefix
    // alone for these targets, which leaves Firefox with no blur at all.
    // Named as the condition of an @supports, the standard property survives.
    /@supports \(backdrop-filter: blur\(1px\)\) \{\s*\n\s*\.wb-leaving \{ backdrop-filter: blur\(14px\) saturate\(1\.5\) brightness\(0\.55\); \}/.test(editorCss) &&
    /@supports \(backdrop-filter: blur\(1px\)\) \{\s*\n\s*\.wb-leave-scrim \{ backdrop-filter: blur\(14px\) saturate\(1\.5\) brightness\(0\.6\); \}/.test(editorCss),
)

check(
  "the confirmation goes into the body, like everything else that has to cover the sheets",
  /**
   * A z-index is only compared inside one stacking context and the sheets
   * render into the body, so from inside the editor's tree this could not be
   * put above them whatever number it carried. The same move also keeps its
   * glass safe: `backdrop-filter` samples the nearest backdrop root, and any
   * ancestor with an opacity, a filter or a transform creates one.
   */
  /import \{ createPortal \} from "react-dom"/.test(untt(readFileSync(join(root, "components/website-builder/leave-confirm.tsx"), "utf8"), "components/website-builder/leave-confirm.tsx")) &&
    /return createPortal\(\s*\n\s*<div/.test(untt(readFileSync(join(root, "components/website-builder/leave-confirm.tsx"), "utf8"), "components/website-builder/leave-confirm.tsx")),
)

check(
  "the sheet measures the viewport once per frame, not once per event, and paints on its own",
  /**
   * `visualViewport.scroll` fires every frame of a keyboard animation and
   * each measurement is a synchronous layout of the whole editor. Coalesced
   * into a rAF there is one per painted frame. `contain: paint` keeps the
   * sheet's repaints to itself; not `layout`, which would pull fixed menus
   * out of the viewport.
   */
  /let frame = 0\s*\n\s*const update = \(\) => \{\s*\n\s*if \(frame\) return\s*\n\s*frame = requestAnimationFrame\(\(\) => \{\s*\n\s*frame = 0\s*\n\s*measureViewport\(\)/.test(sheetSrc) &&
    /if \(frame\) cancelAnimationFrame\(frame\)\s*\n\s*window\.removeEventListener\("resize", update\)/.test(sheetSrc) &&
    /contain: "paint",/.test(sheetSrc) &&
    !/contain: "layout/.test(sheetSrc),
)

check(
  "the section toolbar arrives and leaves rather than blinking, and all three properties travel",
  /**
   * It returned `null` the moment it had nowhere to point, so the one piece
   * of chrome that follows the pointer around appeared in one frame and
   * vanished in one. An element removed from the tree cannot animate its
   * departure, so it stays mounted for the length of the fade and is
   * unmounted after.
   *
   * `translate` and `scale` are named, NOT `transform`, for the reason given
   * on the code pane above. Measured by scripts/check-section-toolbar.mjs,
   * which counts the transitions the browser actually starts.
   */
  /const \[mounted, setMounted\] = useState\(false\)/.test(editor) &&
    /const \[visible, setVisible\] = useState\(false\)/.test(editor) &&
    /const id = window\.setTimeout\(\(\) => setMounted\(false\), TOOLBAR_FADE_MS\)/.test(editor) &&
    // faded in on the frame AFTER it is in the tree, or there is nothing to
    // interpolate from and the fade is a cut with extra steps
    /const id = requestAnimationFrame\(\(\) => setVisible\(true\)\)/.test(editor) &&
    // and it draws at its last known place while it leaves
    /const draw = box \?\? lastBox\.current/.test(editor) &&
    /if \(!mounted \|\| !draw\) return null/.test(editor) &&
    !/if \(!sectionId \|\| !box\) return null/.test(editor) &&
    /"transition-\[opacity,translate,scale\] duration-200 ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\] motion-reduce:transition-none"/.test(
      editor,
    ) &&
    // deaf while it leaves: a toolbar nobody can see is not one anybody
    // should be able to press
    /"pointer-events-none -translate-y-1 scale-\[0\.97\] opacity-0"/.test(editor),
)

check(
  "no transition in the builder names `transform` while animating translate or scale",
  /**
   * The trap that produced the two fixes above, kept shut. Tailwind v4
   * compiles `translate-*` and `scale-*` to the standalone `translate:` and
   * `scale:` properties; a transition naming `transform` therefore animates
   * nothing and the movement snaps, silently, with the fade still running so
   * it half looks right.
   *
   * Scoped to the builder's own surfaces, which is what has been measured.
   * The same pattern exists elsewhere in the app and is not this rule's to
   * claim without measuring it.
   */
  [editor, modeSwitch].every((src) => {
    for (const m of src.matchAll(/transition-\[[^\]]*transform[^\]]*\]/g)) {
      const around = src.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 400)
      if (/\btranslate-[xy]?-?\[?[\d.]/.test(around) || /\bscale-\[?[\d.]/.test(around)) return false
    }
    return true
  }),
)

check(
  "Delete is a button like the other two until the pointer is on it",
  // identical at rest: the same surface and the same near-black label
  /flex-auto min-w-0 h-10 md:h-9 px-1\.5 flex items-center justify-center rounded-lg bg-\[#f3f4f6\] text-\[13px\] font-semibold text-\[#1a1a2e\][^"]*"\s*\n\s*onClick=\{\(\) => removeSection\(section\.id\)\}/.test(
    editor,
  ) &&
    // and red only under the pointer, never as a resting state
    !/text-\[#dc2626\] transition-colors/.test(editor) &&
    !/bg-\[#fee2e2\] text-/.test(editor),
)

check(
  "going back says so, in words you can read on the glass",
  /**
   * The overlay shown while the editor is being left is dark glass: a near
   * black veil at brightness 0.55 over a blur of the builder. The loader on
   * it was given `tone="light"` — which names the surface it is drawn ON,
   * not the colour of the ink — so it painted neutral grey onto near black.
   * There was text the whole time and nobody could read it.
   *
   * Measured by scripts/check-leaving-overlay.mjs, which locates the words
   * from the browser's own layout and scores them against the glass they sit
   * on: 155 points of luma now, against 15 before.
   */
  /*
   * V3: the builder's own Going back screen is the canvas loader's look now
   * (the owner: "a clean branded Going back screen"), dark ink on white, so
   * it is readable by construction (components/website-builder/exit-screen.tsx).
   * The glass below is still what the page editors leave through.
   */
  /<BuilderLoader tone="light" lines=\{\["Going back"\]\} \/>/.test(exitScreenSrc) &&
    /\.wb-exit-screen \{[\s\S]{0,500}background: #ffffff;/.test(editorCss) &&
    // white and lit, scoped to this surface, two classes so it wins inside
    // the utilities layer where Tailwind's own colour also lives
    /\.wb-leaving \.wb-squares \{\s*color: #ffffff;\s*filter: drop-shadow\(/.test(editorCss) &&
    /\.wb-leaving \.wb-loading-line \{\s*color: #ffffff;/.test(editorCss) &&
    // the words settle in after the glass rather than arriving flat with it
    /\.wb-leaving-content \{\s*animation: wb-leaving-content 380ms[^}]*60ms both;/.test(editorCss) &&
    /@keyframes wb-leaving-content \{\s*from \{ opacity: 0; translate: 0 6px \}/.test(editorCss),
)

// ===========================================================================
section("The Website page: one address, one primary action, labelled buttons")
// ===========================================================================


check(
  "the site's address is a link under the title, not a box you cannot type into",
  /**
   * It was a bordered field with an icon in it and a second square button
   * welded to its right, which is the shape of a text input — so the first
   * thing the page offered was somewhere to type that takes no typing.
   */
  /function SiteAddress\(\{ url, display \}/.test(wbPage) &&
    !/function CopyUrlPill/.test(wbPage) &&
    // no border, no card, no field: an anchor, a mark, and a copy button
    /<a\s*\n\s*href=\{ownOpen\(url\)\}\s*\n\s*target="_blank"[\s\S]{0,200}?text-\[14px\] text-\[#6b7280\]/.test(wbPage) &&
    !/inline-flex h-9 max-w-full items-stretch overflow-hidden rounded-lg border/.test(wbPage),
)

check(
  "one way to reach the theme catalogue, not two with different names",
  /**
   * The header carried "Browse themes" and the Library heading carried "Add
   * theme". Same href, two labels, and the header's wore a plus, which is the
   * mark for adding rather than browsing.
   */
  (wbPage.match(/href="\/app\/website-builder\/themes"/g) ?? []).length === 2 &&
    // one button, one "see all" link — and the section is named for it
    /<SectionHeading title="Browse themes">/.test(wbPage) &&
    !/Browse themes\s*\n\s*<\/Link>/.test(wbPage),
)

check(
  "the live website's actions say what they are",
  /**
   * This was five identical bordered squares with a glyph in each and no
   * words anywhere. Four of the five opened something that was also a row of
   * the menu standing beside them, so the row was the menu again, drawn
   * wider and without its labels — and a tooltip was the only thing that
   * ever named them, which on a phone is nothing at all.
   */
  /Edit website\s*\n\s*<\/Button>/.test(wbPage) &&
    // View website is a labelled button beside the title, not a menu row
    /aria-label="View website" data-control="view" className=\{HEADER_BUTTON\}>\s*<ViewLabel \/>/.test(wbPage) && /<span className="hidden sm:inline">View website<\/span>/.test(wbPage) && !/label: "View website"/.test(wbPage) &&
    // Settings is the gear square at every width, as the owner asked, named
    // for a screen reader and in a tooltip on a pointer
    /aria-label="Settings"/.test(wbPage) && /<TooltipContent side="top" sideOffset=\{6\} className=\{TOOLTIP\}>\s*Settings/.test(wbPage) &&
    /aria-label=\{`More actions for \$\{live\.name\}`\}/.test(wbPage) &&
    // the icon-square component is gone, not merely unused
    !/function IconAction\(/.test(wbPage) &&
    // and View site is not also a row of the menu beside it
    /items=\{menuFor\(live\)\}/.test(wbPage) &&
    !/menuFor\(live, \{ preview: true \}\)/.test(wbPage),
)

check(
  "the theme's name is not printed twice when it is also the site's name",
  // A website starts out named after the theme it was built from, so for
  // anybody who has not renamed theirs this printed the same words twice,
  // one line apart, in two sizes of grey.
  /\{live\.theme && live\.theme\.name !== live\.name && \(/.test(wbPage),
)

check(
  "the library says how much room is left, rather than showing a fraction that can read as broken",
  // The limit came in after some libraries were already over it, so the
  // counter could say "5/3" — not a count anybody reads as a count.
  /* A count of websites against the limit, with the rule behind it, and
     never "5 of 3" for a library from before the limit. */
  /slotsUsed > THEME_INSTALL_LIMIT \? `\$\{slotsUsed\} websites` : `\$\{slotsUsed\} of \$\{THEME_INSTALL_LIMIT\} websites`/.test(wbPage) &&
    /title=\{LIBRARY_RULE_TITLE\}/.test(wbPage) && !/two drafts/.test(wbPage) &&
    !/\{slotsUsed\}\/\{THEME_INSTALL_LIMIT\}/.test(wbPage),
)

check(
  "the page's blocks are marked so their gutters can be measured, and no skeleton stands in for them",
  /**
   * Geometry claims are measured, not asserted: scripts/check-website-page.mjs
   * renders this page at 390 and at 1280 and checks that nothing scrolls
   * sideways, that all three blocks sit on the same two gutters, and that
   * every button is a 44px touch target at touch widths.
   *
   * The route's skeleton had to match the page, or a slow load showed one
   * layout and then jumped to another. The owner asked for no skeleton on
   * a phone at all, and nothing rendered it any more, so it is gone: the
   * server hands over the page whole and the app's stage covers a slow one.
   */
  // Matched where it is USED, closing bracket and all. Counting the bare
  // word found four: the three sections, and the comment above them naming
  // the attribute. An assertion that reads its own documentation is an
  // assertion that passes when the code is deleted and the comment stays.
  /* Changed on purpose: the Library block takes a dropped theme, so its attributes run on after the mark (9a60d8790). Still matched as an attribute of a <section>, never the comment's word. */
  (wbPage.match(/<section\b[^>]*\sdata-page-block(?=[\s>])/g) ?? []).length === 3 &&
    !existsSync(join(root, "app/app/website-builder/skeleton.tsx")) &&
    !existsSync(join(root, "app/app/website-builder/loading.tsx")),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
