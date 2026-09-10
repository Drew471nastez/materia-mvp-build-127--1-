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

// ===========================================================================
section("The page you are editing is named, and it is in the middle")
// ===========================================================================

const switcher = readFileSync(join(root, "components/website-builder/page-switcher.tsx"), "utf8")

check(
  "the page switcher sits in the centre of the bar",
  /**
   * It was a button on a rail with a panel behind it: two clicks and a change
   * of context to answer "which page am I on". The page being edited is the
   * most important fact in an editor, so it is in the middle, named.
   */
  /<div className="flex flex-1 items-center justify-center gap-1\.5 min-w-0">[\s\S]{0,3200}<PageSwitcher/.test(editor),
)

check(
  "with the format control to its left and the live link to its right",
  (() => {
    const centre = editor.slice(
      editor.indexOf("CENTRE: WHICH PAGE, AND HOW YOU ARE LOOKING AT IT"),
      editor.indexOf("RIGHT: where the site is"),
    )
    const fmt = centre.indexOf("Switch to phone preview")
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
  /pointerdown/.test(switcher) && /e\.key === "Escape"/.test(switcher),
)

check(
  "and it grows from its trigger rather than fading in place",
  /origin-top animate-in fade-in-0 zoom-in-95/.test(switcher),
)

check(
  "reload lives inside the pill, on the page it reloads",
  // A control that acts on a thing belongs on that thing. It is a sibling of
  // the trigger, not nested in it: a button inside a button is invalid.
  /aria-label="Reload preview"/.test(switcher) && !/<button[^>]*>\s*<button/.test(switcher),
)

check(
  "the pill pre-fills the search with the current path, selected",
  // The way an address bar behaves: one keystroke replaces it.
  /searchRef\.current\?\.select\(\)/.test(switcher),
)

// ===========================================================================
section("Publish is a place, not a button")
// ===========================================================================

const publish = readFileSync(join(root, "components/website-builder/publish-panel.tsx"), "utf8")
const modeSwitch = readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8")
const themePage = readFileSync(join(root, "components/website-builder/theme/ThemePage.tsx"), "utf8")

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
    const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/publish/route.ts"), "utf8")
    return /published_at: new Date\(\)\.toISOString\(\)/.test(route) && /\/published_at\/\.test\(error\.message\)/.test(route)
  })(),
)

check(
  "the relative time reads the way somebody says it",
  (() => {
    // The function lives in its own module (the website page uses it too);
    // the panel re-exports it, so both read the same clock.
    const src = readFileSync(join(root, "lib/website-builder/relative-time.ts"), "utf8")
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
    const pm = readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8")
    return /\?embedded=1/.test(pm) && /if \(!everShown\) return null/.test(pm) && /transition-opacity/.test(pm)
  })(),
)

check(
  "the framed code page drops its own header",
  /\{!embedded && \(/.test(readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")),
)

check(
  "the bar is dark, like the reference",
  // Height moved into `.wb-editor-topbar` so the status-bar inset is added in
  // one place; the colour is the part this rule is about.
  /<header className="wb-editor-topbar relative bg-\[#171717\] text-white/.test(editor),
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
  "a phone has no pill; the desktop pill is Preview / Code / Project Settings, Preview by default",
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
    /previewMode !== "code" && \(\s*<MobileEditorSheet/.test(editor) &&
    /if \(isMobileView\) \{ setMobileSidebarOpen\(false\); setAiOpen\(false\) \}/.test(editor),
)

check(
  "the desktop pill can open the product page as a real product",
  // A template with placeholder data is not what a buyer sees.
  /onSelectProduct=\{\(title\) =>/.test(editor) &&
    /handleSelectProductPage\(p\.id, p\.title\)/.test(editor) &&
    /products\.map\(\(pr\) =>/.test(switcher),
)

check(
  "the load bar has no height in the flow, so nothing shows through under the bar",
  /**
   * It was a 1.5px transparent strip between the dark bar and the canvas,
   * and the page root behind it is light: on a phone, with a dark theme
   * edge to edge, that was a white line under the bar. It overlays the bar's
   * bottom edge now.
   */
  /className="absolute inset-x-0 bottom-0 z-10 h-\[1\.5px\]/.test(editor) &&
    // Rendered INSIDE the header, as its last child.
    /<WbLoadProgressBar active=\{sectionsLoading\} \/>\s*<\/header>/.test(editor),
)


// ===========================================================================
section("The bar answers a touch, and the phone scrolls")
// ===========================================================================

const menu = readFileSync(join(root, "components/ui/responsive-action-menu.tsx"), "utf8")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

check(
  "Back is an arrow, and pressing it answers instantly with a leaving screen",
  // Going back can take a second on a phone; a second of nothing is a second
  // in which the button gets pressed again.
  /aria-label="Back"/.test(editor) &&
    // One door out, used by both exits: it asks only when there is something
    // to lose, and otherwise goes, which is what pressing Back meant.
    /onClick=\{\(\) => requestExit\("\/app\/website-builder"\)\}/.test(editor) &&
    /const requestExit = useCallback\(/.test(editor) &&
    /setLeaving\(true\)\s*\n\s*router\.push\(href\)/.test(editor) &&
    // Portalled and above every sheet, or the sheets that render into the
    // body paint over the screen that says you are leaving.
    /\{leaving && portalReady && createPortal\(\s*<div className="wb-leaving"/.test(editor) &&
    /\.wb-leaving \{[\s\S]{0,300}position: fixed/.test(css) &&
    /\.wb-leaving \{[\s\S]{0,300}z-index: 300/.test(css),
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
    /label: previewMode === "code" \? "Back to preview" : "View code"/.test(editor),
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
    /\.wb-ai-button::before \{[\s\S]{0,600}conic-gradient/.test(css) &&
    /@keyframes wb-ai-shimmer/.test(css) &&
    // Only for people who have not asked for less motion.
    /prefers-reduced-motion: no-preference\) \{\s*\.wb-ai-button::before \{ animation: wb-ai-shimmer/.test(css),
)

check(
  "the three-dots phone menu rides the editor's own sheet, with its drag physics",
  /<MobileEditorSheet open=\{sheetOpen\} onOpenChange=\{setSheetOpen\}/.test(menu) &&
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

const settingsPage = readFileSync(join(root, "components/website-builder/project-settings.tsx"), "utf8")
const publishPanel = readFileSync(join(root, "components/website-builder/publish-panel.tsx"), "utf8")
const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
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
  !/aria-label="Preview"/.test(headerSrc) &&
    !/builder_preview=1/.test(editor) &&
    /builder_preview=1&show_preview_bar=1/.test(publishPanel) &&
    />\s*<ExternalLink[^>]*\/>\s*Preview\s*<\/a>/.test(publishPanel),
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
    /seg\("settings", "Project Settings", Settings\)/.test(modeSwitch),
)

check(
  "the code pane is the whole canvas on a desktop, the whole screen on a phone, and light like the rest of the app",
  // `flex flex-col` on the card is load-bearing: the iframe's wrapper is
    // `flex-1`, which resolves to nothing in a block container, and the
    // iframe then falls back to its 150px HTML default.
    /absolute inset-0 z-\[80\] flex flex-col rounded-tl-xl/.test(modeSwitch) &&
    // A black panel inside a white builder is a second product bolted on.
    /"overflow-hidden bg-white"/.test(modeSwitch) &&
    !/bg-\[#0e0e0e\]/.test(modeSwitch) &&
    /fixed inset-0 z-\[120\] flex flex-col/.test(modeSwitch) &&
    // It rises and settles on the curve a thrown thing lands on. Longer than
    // the old 220ms, because a fast small move reads as a flicker.
    /transition-\[opacity,transform\] duration-300 ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/.test(modeSwitch) &&
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
  /previewMode === "code" && "opacity-0 pointer-events-none"/.test(editor) &&
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
    /render\(section, "header", headerTouchesTop\(theme\)\)/.test(themePage) &&
    /renderSection=\{\(section, role, atTop\) =>/.test(editor) &&
    /canvasRoundedTopPx=\{atTop \? \(device === "desktop" \? 12 : 16\) : undefined\}/.test(editor),
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
  "the surround is the bar's dark on a desktop and the sheet's own surface on a phone",
  // Matting is a desktop idea: it is what the eight pixels around an inset
  // card are for. A phone has no inset, so its only surround is the strip
  // reserved for the sheet's peek, where dark read as a black band.
  /"relative flex-1 min-w-0 overflow-hidden flex justify-center"/.test(editor) &&
    /isMobileView \? "bg-background" : "bg-\[#171717\]"/.test(editor),
)

check(
  "every row of the actions menu answers the pointer",
  // Only one of Radix's three highlight mechanisms was firing, so the menu
  // read as a list of labels rather than a list of buttons.
  /hover:bg-neutral-100 focus:bg-neutral-100 data-\[highlighted\]:bg-neutral-100/.test(menu),
)

check(
  "the page pill is as slim as the mode pill beside it",
  /flex h-7 min-w-\[220px\] max-w-\[380px\] items-center rounded-full/.test(switcher),
)

check(
  "the preview card is flush with one rounded corner, the chrome's own dark showing through the arc",
  /**
   * No surround. The only radius is the top left, where the sidebar and the
   * bar meet it, and the sliver of canvas behind that arc is the bar's own
   * dark — so the corner reads as chrome curving into the page rather than
   * as a gap around it.
   */
  /device === "desktop" \? "items-stretch p-0"/.test(editor) &&
    /\? "rounded-tl-xl w-full"/.test(editor) &&
    /isMobileView \? "bg-background" : "bg-\[#171717\]"/.test(editor) &&
    /height: "100%"/.test(editor) &&
    // and no hairline: a border beside chrome is a seam
    !/bg-white border border-neutral-200\/70/.test(editor),
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
    /Back to project/.test(settingsPage) &&
    /e\.key === "Escape"/.test(settingsPage) &&
    /method: "PATCH"/.test(settingsPage) &&
    /JSON\.stringify\(\{ name: draft\.trim\(\) \}\)/.test(settingsPage),
)

check(
  "and it only offers sections something real stands behind",
  // The reference has Analytics, Knowledge, Skills, Backups. A nav entry that
  // opens an empty panel is a promise the product cannot keep. Backups is
  // offered because it is real now: a table, two routes, a safety copy.
  !/Analytics|Knowledge|Skills/.test(settingsPage.slice(settingsPage.indexOf("const NAV"), settingsPage.indexOf("const NAV") + 400)) &&
    /\{ id: "backups", label: "Backups", Icon: History \}/.test(settingsPage),
)


// ===========================================================================
section("A phone's bar, and sheets that know which is on top")
// ===========================================================================

const sheetSrc = readFileSync(join(root, "components/website-builder/mobile-editor-sheet.tsx"), "utf8")

check(
  "sheets that open for a moment sit above the one that is always there",
  /**
   * Every sheet shared one z-index, so the last one in the tree won, and the
   * menu and Publish, which are earlier in the tree than the persistent
   * peek, opened UNDER it. A raised layer wins whatever the order.
   */
  // Inline, not a class: a utility class can be merged away by `cn`, or tie
  // with another of the same specificity and lose on source order.
  /zIndex: layer === "raised" \? 80 : 50/.test(sheetSrc) &&
    /zIndex: layer === "raised" \? 70 : 40/.test(sheetSrc) &&
    /layer="raised" peekHeight=\{0\}/.test(menu) &&
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
    /sheet\.style\.visibility = peekHeight === 0 && !openRef\.current \? "hidden" : "visible"/.test(sheetSrc) &&
    !/visibility: peekHeight === 0 && !open/.test(sheetSrc) &&
    /settleVisibility\(nowOpen, ms\)/.test(sheetSrc) &&
    /willChange: "opacity"/.test(sheetSrc),
)

check(
  "menus and the publish card are as tall as their content, never half a screen",
  // A six-row menu at 50% was clipped under the browser's toolbar; the
  // publish card at 62% floated over a band of nothing.
  /peekHeight=\{0\} fit>/.test(menu) &&
    /peekHeight=\{0\}\s*\n(?:\s*\/\/.*\n)*\s*fit\s*\n\s*>/.test(publish) &&
    /fit\?: boolean/.test(sheetSrc) &&
    /new ResizeObserver\(measure\)/.test(sheetSrc),
)

check(
  "a menu row can be a link, so 'View live site' opens a real new tab",
  /href\?: string/.test(menu) &&
    /<a\s*\n\s*href=\{item\.href\}\s*\n\s*target=\{item\.target\}/.test(menu) &&
    /label: "View live site",[\s\S]{0,200}href: websiteUrl,[\s\S]{0,80}target: "_blank"/.test(editor) &&
    !/onClick=\{\(\) => window\.open\(websiteUrl, "_blank"\)\}/.test(editor),
)

check(
  "the canvas never hands a scroll to a parent that swallows it",
  /if \(el\.scrollTop <= 0\) el\.scrollTop = 1/.test(editor) && /else if \(el\.scrollTop >= max\) el\.scrollTop = max - 1/.test(editor),
)

check(
  "the editor dissolves in and out instead of cutting",
  /wb-editor-enter/.test(editor) && /leaving && "wb-editor-leaving"/.test(editor) && /\.wb-editor-leaving \{/.test(readFileSync(join(root, "app/globals.css"), "utf8")),
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
  /import \{ createPortal \} from "react-dom"/.test(sheetSrc) &&
    /return createPortal\(\s*<>/.test(sheetSrc) &&
    /<\/>,\s*document\.body,\s*\)/.test(sheetSrc),
)

check(
  "the inspector fills and glows over a quarter second, from values that can be interpolated",
  // `fill: none` and `filter: none` cannot be animated from; transparent and
  // a zero-radius shadow can.
  /\.wb-inspector svg \{\s*fill: transparent;\s*filter: drop-shadow\(0 0 0 rgba\(139, 86, 250, 0\)\);\s*transition:\s*fill 260ms/.test(css) &&
    /\.wb-inspector \{\s*transition:\s*transform 180ms[\s\S]{0,200}box-shadow 260ms/.test(css),
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
  "the files and the code take turns rather than sharing 390 pixels",
  /**
   * A 224px explorer beside an editor works on a desktop and leaves neither
   * usable on a phone: a third of the screen is a list you are not reading,
   * the rest a column of code four words wide.
   */
  /const \[narrow, setNarrow\] = useState\(false\)/.test(codePage) &&
    /matchMedia\("\(max-width: 767px\)"\)/.test(codePage) &&
    /narrow\s*\n\s*\? showFiles\s*\n\s*\? "w-full flex-1 min-w-0"\s*\n\s*: "hidden"/.test(codePage) &&
    /narrow && showFiles && "hidden"/.test(codePage) &&
    /\/\/ On a phone, picking a file is the gesture that means "show me the code"\.\s*\n\s*setShowFiles\(false\)/.test(codePage),
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
    return !/onClick=\{saveFile\}/.test(header) && /onClick=\{saveFile\}/.test(row) && /onClick=\{revertFile\}/.test(row)
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
   */
  /fixed left-0 right-0 bottom-0 flex flex-col/.test(sheetSrc) &&
    !/viewportTop/.test(sheetSrc) &&
    /function browserChromeGap\(\): number/.test(sheetSrc) &&
    /probe\.getBoundingClientRect\(\)\.top/.test(sheetSrc) &&
    /paddingBottom: `calc\(env\(safe-area-inset-bottom, 0px\) \+ \$\{chromeGap\}px\)`/.test(sheetSrc) &&
    // and the height grows by it too, or padding just pushes content out again
    /const safe = safeAreaBottom\(\) \+ browserChromeGap\(\)/.test(sheetSrc),
)

check(
  "a content-sized sheet opens all the way up, not to a fraction of a screen it no longer fills",
  // Its stops are its own height and away; the 0.62/0.92 detents describe a
  // sheet sized to the screen and pushed a content-sized one under the bar.
  /fit && contentHeight > 0\s*\n\s*\? \/\/ One stop[\s\S]{0,80}\[0, Math\.max\(height - peek, 0\)\]/.test(sheetSrc),
)

check(
  "and the publish panel scrolls inside the sheet, so nothing in it is out of reach",
    // Not `flex-1`: a zero basis inside a content-sized `fit` wrapper measures
  // as nothing and the sheet sizes itself to an empty card.
  /min-h-0 overflow-y-auto px-5 pb-\[calc\(1rem\+env\(safe-area-inset-bottom,_0px\)\)\] pt-1/.test(publish) &&
    !/flex-1 overflow-y-auto px-5/.test(publish),
)

check(
  "the section list has a hairline between rows, drawn without waiting for a cursor",
  // There is no hover on a phone, so a hover-only divider is no divider, and
  // the list read as one block.
  /absolute inset-x-2 h-px bg-border\/50 transition-colors duration-150 group-hover:bg-foreground\/50/.test(editor),
)


// ===========================================================================
section("The website list, and the row of themes under it")
// ===========================================================================

const wbPage = readFileSync(join(root, "app/app/website-builder/website-builder-client.tsx"), "utf8")

check(
  "the explore row is inset from both edges, scroll padding included",
  /**
   * A snap container's snapport starts at its PADDING BOX, so a `snap-start`
   * card aligns to the screen edge and the row's own `px-4` is scrolled
   * straight past — which is why these cards sat flush while every other
   * block on the page was inset.
   */
  /snap-x snap-mandatory[^"]*px-4[^"]*scroll-px-4/.test(wbPage) && /sm:scroll-px-0/.test(wbPage),
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
const editorCss = readFileSync(join(root, "app/globals.css"), "utf8")
const codePageSrc = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")

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
    /<header className="wb-editor-topbar relative bg-\[#171717\]/.test(editor) &&
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
    /offsetsFor\(\{ viewport, detents: stops, peekHeight: peek \}\)/.test(sheetSrc),
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

const backupsLib = readFileSync(join(root, "lib/website-builder/backups.ts"), "utf8")
const backupsRoute = readFileSync(join(root, "app/api/website-builder/themes/[installId]/backups/route.ts"), "utf8")
const restoreRoute = readFileSync(
  join(root, "app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts"),
  "utf8",
)
const publishRoute = readFileSync(join(root, "app/api/website-builder/themes/[installId]/publish/route.ts"), "utf8")
const backupsSql = readFileSync(join(root, "supabase/sql/RUN_THEME_BACKUPS.sql"), "utf8")
const themeChat = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")

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
  /Storelib saves a backup each time it completes a task and each time you publish/.test(settingsPage) &&
    /Restore this backup\?/.test(settingsPage) &&
    /A backup of the draft you have now is saved first, so this can be undone/.test(settingsPage) &&
    /Nothing changes on your live site until you publish/.test(settingsPage) &&
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
  "a row shows one three-dots button under the pointer, and it opens the same menu a right-click does",
  !/title="Remove"/.test(editor) &&
    /aria-label=\{`Options for \$\{section\.name\}`\}/.test(editor) &&
    // The three dots are the dropdown's own trigger, so open and close are
    // its business; and the menu is the app's dropdown, with no red row.
    /<DropdownMenuTrigger asChild>\s*<button\s*type="button"\s*aria-label=\{`Options for \$\{section\.name\}`\}/.test(editor) &&
    /Duplicate\s*<\/DropdownMenuItem>/.test(editor) &&
    /Delete\s*<\/DropdownMenuItem>/.test(editor) &&
    !/text-red-500 hover:bg-red-50/.test(editor),
)

check(
  "the header and the footer carry a badge saying which piece of chrome they are",
  /structureRole="header"/.test(editor) &&
    /structureRole="footer"/.test(editor) &&
    /structureRole === "header" \? \(\s*<PanelTop/.test(editor) &&
    /<PanelBottom/.test(editor),
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
  /aria-label="Copy file content"/.test(codePage) &&
    /navigator\.clipboard\.writeText\(fileContent\)/.test(codePage) &&
    /aria-label="Download this file"/.test(codePage) &&
    /a\.download = selectedFile\.name/.test(codePage),
)


// ====================================================================section("Links stay in the builder, and loading looks like what is coming")
// ===========================================================================

const headerRenderer = readFileSync(join(root, "components/website-builder/sections/renderers/HeaderSection.tsx"), "utf8")

check(
  "a nav link inside the editor is intercepted whether or not the inspector is on",
  /**
   * Gated on `isEditing`, a nav link with the inspector off was a real anchor
   * to "/" — which in the editor's own document is storelib.com, not the
   * site being built. Home took people out of the builder.
   */
  // Four doors: the nav link, its submenu, the CTA, and the phone menu.
  !/if \(isEditing\) \{\s*e\.preventDefault\(\)/.test(headerRenderer) &&
    (headerRenderer.match(/if \(onEditorNavigate\) \{\s*e\.preventDefault\(\)\s*e\.stopPropagation\(\)\s*onEditorNavigate\(/g) ?? []).length === 4 &&
    /if \(onEditorNavigate\) onEditorNavigate\("\/cart"\)/.test(headerRenderer),
)

check(
  "a section can be dragged with a mouse, a finger or the keyboard, and the taps say when",
  /**
   * Five pixels is far enough that a short deliberate drag reads as a click
   * that did nothing. A finger cannot use a distance rule at all — it
   * competes with scrolling the list — so touch waits in place instead.
   */
  /useSensor\(PointerSensor, \{ activationConstraint: \{ distance: 3 \} \}\)/.test(editor) &&
    /useSensor\(TouchSensor, \{ activationConstraint: \{ delay: 160, tolerance: 8 \} \}\)/.test(editor) &&
    /const handleDragStart = useCallback\(\(\) => hapticTap\("medium"\), \[\]\)/.test(editor) &&
    /onDragStart=\{handleDragStart\}/.test(editor) &&
    /hapticTap\("light"\)/.test(editor) &&
    // through the one helper that reaches the iOS Taptic Engine
    /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(editor) &&
    !/navigator\.vibrate/.test(editor),
)

check(
  "the grip is drawn at rest and the menu button only under the pointer",
  /**
   * The grip earns its place at rest: it is what says the list can be
   * reordered. A column of menu buttons says nothing anybody needs to know
   * before they want one, and six of them are six more marks on the page.
   * The grab cursor stays on the handle, since over the whole row it
   * promises a drag the row does not accept.
   */
  /<GripVertical\s*\n\s*className=\{cn\("h-4 w-4 transition-opacity"/.test(editor) &&
    /aria-label=\{`Drag \$\{section\.name\} to reorder`\}/.test(editor) &&
    /flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-none/.test(editor) &&
    /cursor-grab active:cursor-grabbing/.test(editor) &&
    /isSelected \|\| contextMenuOpen \? "opacity-100" : "opacity-0 group-hover:opacity-100/.test(editor) &&
    !/!isStructure && "hover:cursor-grab"/.test(editor),
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
    /inspectorEnabled && !isMobileView && previewMode === "preview" && \(\(\) => \{/.test(editor),
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
const lockSrc = readFileSync(join(root, "components/website-builder/full-screen-lock.tsx"), "utf8")
const wbLayout = readFileSync(join(root, "app/website-builder/layout.tsx"), "utf8")

check(
  "the editor is pinned to the viewport rather than laid out in the body's flow",
  // `h-svh` is content and the body's padding sits under it. `fixed` is
  // measured against the viewport and adds no height to the document.
  /"wb-editor fixed inset-0 flex flex-col/.test(editor) &&
    !/"wb-editor h-svh/.test(editor) &&
    /<div className="fixed inset-0 overflow-hidden bg-background">/.test(wbLayout) &&
    !/h-svh overflow-hidden bg-background/.test(wbLayout),
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
  /<FullScreenLock \/>/.test(editor) &&
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
  /html:has\(\.wb-editor\),\s*\nhtml:has\(\.wb-editor\) body \{/.test(editorCss) &&
    /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{/.test(editorCss) &&
    !/html:has\(\.wb-editor\),\s*\nhtml:has\(\.wb-editor\) body,\s*\nhtml\.wb-fullscreen/.test(editorCss),
)

check(
  "the global bounce guard leaves the sheet's own drag alone",
  // It cancels touchmove at a scroller's boundary, on the document, and it
  // opts out of anything carrying this. Without it the guard and the sheet
  // fight over the same finger and the guard wins.
  /data-mobile-bottom-sheet=""/.test(sheetSrc) &&
    /data-mobile-bottom-sheet/.test(
      readFileSync(join(root, "components/platform/capacitor-bounce-guard.tsx"), "utf8"),
    ),
)

check(
  "a sheet sized to its content measures what the content wants, not what it was allowed",
  /**
   * The measurement read the wrapper's own box, and the wrapper is a flex item
   * with `min-h-0` around a scroller that is free to shrink — so the number fed
   * back into itself. Reproduced in Chromium with the real flex shape: starting
   * from a small height the old measurement returns that small height and stays
   * there for ever (120 → 120 → 120 …) however much content is inside, which is
   * a Publish card whose own buttons are below the fold. Adding back what each
   * scroller is clipping makes it converge upward instead: 120 → 542, the
   * content's real need, in one step.
   */
  /\[data-sheet-scroll\]/.test(sheetSrc) &&
    /clipped \+= Math\.max\(0, node\.scrollHeight - node\.clientHeight\)/.test(sheetSrc) &&
    /data-sheet-scroll/.test(publishPanel) &&
    /data-sheet-scroll/.test(menu),
)

check(
  "the strip behind the clock is the bar's colour, not the page's",
  // html.capacitor paints the root canvas #000 so the safe area never flashes
  // white. Over a #171717 bar that is a black line across the top, which is
  // the "it is not full screen" that was reported. Both locks set it, so it
  // holds whether or not the webview runs edge to edge.
  /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{\s*\n\s*background-color: #171717;/.test(editorCss) &&
    /html:has\(\.wb-editor\),\s*\nhtml:has\(\.wb-editor\) body \{\s*\n\s*background-color: #171717;/.test(editorCss),
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

const loaderSrc = readFileSync(join(root, "components/website-builder/builder-loader.tsx"), "utf8")
const leaveConfirm = readFileSync(join(root, "components/website-builder/leave-confirm.tsx"), "utf8")

check(
  "the builder waits behind nine staggered squares and a line of text, not a bar with nothing under it",
  // A bar says something is happening and nothing about what, and on a slow
  // connection that silence is what makes a wait feel broken.
  /\.wb-squares span \{[\s\S]{0,300}animation: wb-squares-fade 675ms ease-in-out infinite alternate/.test(css) &&
    /animation-delay: 600ms/.test(css) &&
    /<BuilderLoader/.test(editor) &&
    /lines=\{\["Leaving the builder", "Saving where you were", "Almost there"\]\}/.test(editor) &&
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
   * It was in the keyframe alone, interpolating from blur(0) to blur(14px) —
   * and `backdrop-filter` is not reliably animatable: a browser that declines
   * renders no filter for the whole animation, and with the property declared
   * nowhere else there was nothing to fall back to. That is why leaving had
   * no blur at all. Declared on the element it always applies, and fading the
   * element in brings the blur and the dimming together.
   */
  /\n\s*backdrop-filter: blur\(20px\) saturate\(1\.08\) brightness\(0\.78\);/.test(css) &&
    /-webkit-backdrop-filter: blur\(20px\) saturate\(1\.08\) brightness\(0\.78\);/.test(css) &&
    // and a pool of light under the loader, painted into the same layer
    /radial-gradient\(60% 50% at 50% 45%, rgba\(255, 255, 255, 0\.1\)/.test(css) &&
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
  /<div className="flex min-h-full flex-1 items-center justify-center bg-white">/.test(editor) &&
    !/h-\[50vh\] flex items-center justify-center bg-neutral-50\/40/.test(editor) &&
    /const showCanvasLoader = useDelayedFlag\(loading \|\| canvasLoading\)/.test(editor) &&
    /export function useDelayedFlag\(active: boolean, delay = 350\)/.test(loaderSrc) &&
    // and it clears the instant the work does, so nothing lingers
    /if \(!active\) \{\s*setShown\(false\)/.test(loaderSrc),
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
    (codePageSrc.match(/<BarTip label=/g) ?? []).length >= 5 &&
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
  /"relative overflow-hidden transition-all duration-300",[\s\S]{0,400}?\? "rounded-tl-xl w-full"\s*\n\s*: "rounded-2xl",/.test(editor) &&
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
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
