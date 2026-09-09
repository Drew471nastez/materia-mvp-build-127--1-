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
  /<header className="relative h-12 bg-\[#171717\] text-white/.test(editor),
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
  /\{!isMobileView && \(\s*<div className="ml-2 shrink-0">\s*<PreviewModeSwitch/.test(editor) &&
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
    /setLeaving\(true\)\s*\n\s*router\.push\("\/app\/website-builder"\)/.test(editor) &&
    /\{leaving && \(\s*<div className="wb-leaving"/.test(editor) &&
    /\.wb-leaving \{[\s\S]{0,300}position: fixed/.test(css),
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
  "the code pane is a rounded card inset from the canvas on a desktop, the whole screen on a phone",
  /absolute inset-2 z-\[80\] rounded-xl/.test(modeSwitch) &&
    /fixed inset-0 z-\[120\] flex flex-col/.test(modeSwitch) &&
    /scale-\[0\.98\]/.test(modeSwitch),
)

check(
  "and the full-screen one is portalled, or 'the whole screen' quietly means 'the whole canvas'",
  // `position: fixed` is measured against the nearest ancestor carrying a
  // transform, and the canvas it is rendered inside animates one.
  /if \(!fullScreen\) return body/.test(modeSwitch) && /return createPortal\(body, document\.body\)/.test(modeSwitch),
)

check(
  "and it sits above anything a theme can stack, with the preview gone underneath, not merely covered",
  // A sticky theme header is z-60 and was drawing over the editor's corner.
  // Stacking higher is half of it; making the site invisible is the rest.
  /previewMode === "code" && "invisible pointer-events-none"/.test(editor) &&
    !/PREVIEW, OR THE CODE BEHIND IT/.test(editor) &&
    !/pointer-events-none absolute left-0 right-0 top-2 z-30/.test(editor),
)

check(
  "the preview card is a rounded card in an even inset, like the code card",
  /device === "desktop" \? "items-start p-2"/.test(editor) &&
    /\? "rounded-xl w-full"/.test(editor) &&
    /calc\(100svh - 48px - 16px\)/.test(editor),
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
    return pill > gear && pill < name
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
  // opens an empty panel is a promise the product cannot keep.
  !/Analytics|Knowledge|Skills|Backups/.test(settingsPage.slice(settingsPage.indexOf("const NAV"))),
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
    /visibility: peekHeight === 0 && !open \? "hidden" : "visible"/.test(sheetSrc) &&
    /settleVisibility\(nowOpen, ms\)/.test(sheetSrc) &&
    /willChange: "opacity"/.test(sheetSrc),
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
  "leaving shimmers on the compositor, and not at all for people who asked for less motion",
  /\.wb-leaving::before \{[\s\S]{0,500}will-change: transform/.test(css) &&
    /@keyframes wb-leaving-shimmer \{\s*to \{ transform: translateX\(300%\) skewX\(-14deg\); \}/.test(css) &&
    /prefers-reduced-motion: reduce\) \{\s*\.wb-leaving::before \{ animation: none; \}/.test(css),
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
