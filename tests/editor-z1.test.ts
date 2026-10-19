/**
 * ===========================================================================
 *  Z1: THE CARD CHANGES SHAPE, THE PLUS KEY STAYS, APPS BESIDE THE SEARCH
 * ===========================================================================
 * The pure parts and the shape of the code for the owner's asks about the
 * website builder's editor this round. The motion and the geometry are
 * measured in Chromium by scripts/check-view-switch.mjs and
 * scripts/check-editor-details-z1.mjs; this holds what can be checked
 * without a browser:
 *
 *   SWITCH     the card's own box goes from the old look to the new one; the
 *              hidden code editor keeps its size; the sidebar's drag writes
 *              once a frame
 *   ADD KEY    the plus key of Add section has no press motion
 *   APPS       one App embeds button (Apps on a phone) with the installed
 *              apps' marks, and no Apps group in the list
 *   SCROLLBAR  a 7px thumb, one width at rest and under the pointer
 *   OUTLINE    the canvas selection is 2px everywhere it is drawn
 *
 * Run with:  npx tsx tests/editor-z1.test.ts
 */
import { readCode, readSource } from "./_source"
import { STORELIB_SECTION_APPS, installedSectionApps } from "@/lib/website-builder/app-sections"
import { CANVAS_SWITCH_MS, morphFrames } from "@/lib/website-builder/canvas-switch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

console.log("\nSWITCH: the card itself, a frame at a time")
{
  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const lib = readCode("lib/website-builder/canvas-switch.ts")
  const pane = readCode("components/website-builder/preview-mode-switch.tsx")
  check("one duration for the card and the sidebar, the editor's sheet curve", CANVAS_SWITCH_MS === 320 && /const FULL_SCREEN_MS = CANVAS_SWITCH_MS/.test(editor) && /cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(lib))
  const f = morphFrames({ width: 1134, height: 846, radius: "20px 20px 0px 0px", shadow: "none" }, { width: 390, height: 798, radius: "16px", shadow: "x" })
  check("the card's width and height are what move, the page reflowing inside", f[0].width === "1134px" && f[1].width === "390px" && f[0].height === "846px" && f[1].height === "798px")
  check("played with the Web Animations API from the live box, so a second press turns it round mid way", /card\.animate\(morphFrames\(from, to\)/.test(lib) && /const switchFrom = useRef<\{ card: CardLook \| null; fold: FoldLook \| null \} \| null>\(null\)/.test(editor))
  check("the fold animates its own width and the seam beside it, clipped; the panel slides and fades with it", /maxWidth: `\$\{r\(from\.width\)\}px`, marginRight: margin\(from\.width\), overflow: "hidden"/.test(lib) && /\{ transform: shift\(from\.width\), opacity: from\.opacity \}/.test(lib))
  check("at rest the folded sidebar is clipped and clear, so nothing of it shows when the motion ends", /overflow: fullView \? "hidden" : undefined/.test(editor) && /opacity: fullView \? 0 : 1, transform: fullView \? `translateX\(-\$\{sidebarWidth\}px\)` : undefined \}\}/.test(editor))
  check("the hidden code editor holds its size, so the canvas changes without laying its page out", /const \[held, setHeld\] = useState<\{ w: number; h: number \} \| null>\(null\)/.test(pane) && /style=\{held \? \{ right: "auto", bottom: "auto", width: held\.w, height: held\.h \} : undefined\}/.test(pane) && /\[hidden, visible, fullScreen, everShown\]/.test(pane))
  check("dragging the sidebar: pointer captured, the latest width written once a frame, flushed on release", /handle\.setPointerCapture\(e\.pointerId\)/.test(editor) && /if \(!frame\) frame = requestAnimationFrame\(write\)/.test(editor) && /if \(frame\) cancelAnimationFrame\(frame\)\s*\n\s*write\(\)/.test(editor) && !/const onMove = \(ev: PointerEvent\) => \{\s*\n\s*latest = [^\n]*\n\s*if \(sidebarRef\.current\) sidebarRef\.current\.style\.width/.test(editor))
  check("and no React render while it moves: state is set once, on release", (editor.match(/setSidebarWidth\(latest\)/g) ?? []).length === 1)
}

console.log("\nADD KEY: the plus does not move on the press")
{
  const parts = readCode("components/website-builder/editor/tree-parts.tsx")
  const row = parts.slice(parts.indexOf("export function TreeAddRow"), parts.indexOf("export function TreeInsertLine"))
  check("no translate, scale or swapped shadow on the key while pressed", /data-add-key=""/.test(row) && !/group-active\/add:(translate|scale|shadow)/.test(row) && !/transition-\[[^\]]*translate/.test(row))
  check("the row's own grey is the press", /active:bg-\[#eceef1\]/.test(row))
}

console.log("\nAPPS: one button beside the search, with the installed apps' marks")
{
  const all = new Set(STORELIB_SECTION_APPS.map((a) => a.id))
  check("nothing known yet: no marks, never a guess", installedSectionApps(all, null).length === 0)
  const on = installedSectionApps(all, { "storelib-reviews": "on", "storelib-email-marketing": "on", "storelib-bundles": "setup" })
  check("the apps the integrations directory says are on, in the registry's order", on.map((a) => a.id).join() === "reviews,email", on.map((a) => a.id))
  check("an app turned off is not shown", installedSectionApps(all, { "storelib-reviews": "off", "storelib-email-marketing": "on" }).map((a) => a.id).join() === "email")
  check("three at the most", installedSectionApps(all, { "storelib-reviews": "on", "storelib-email-marketing": "on", "storelib-bundles": "on" }, 2).length === 2 && installedSectionApps(all, { "storelib-reviews": "on", "storelib-email-marketing": "on", "storelib-bundles": "on" }).length === 3)
  check("only apps whose sections this library has", installedSectionApps(new Set(["email"]), { "storelib-reviews": "on", "storelib-email-marketing": "on" }).map((a) => a.id).join() === "email")
  check("a part of every store with no entry of its own (Wishlist) is never an installed app", !STORELIB_SECTION_APPS.find((a) => a.id === "wishlist")?.markId && STORELIB_SECTION_APPS.filter((a) => a.id !== "wishlist").every((a) => !!a.markId))

  const lib = readCode("components/website-builder/editor/section-library.tsx")
  check("no Apps group in the categories, on a computer or a phone", !/group: "apps"/.test(lib) && !/data-library-group/.test(lib) && !/\.\.\.apps,/.test(lib))
  check("App embeds on a computer, Apps on a phone", /const embedsLabel = phone \? "Apps" : "App embeds"/.test(lib))
  check("beside the search on both", /\{embedsButton\}\s*<div className="w-\[260px\] max-w-full shrink-0">\{search\}<\/div>/.test(lib) && /<div className="min-w-0 flex-1">\{search\}<\/div>\s*\{embedsButton\}/.test(lib))
  check("the button only where the library has app sections", /const embedsButton = embedCount > 0 \? \(/.test(lib))
  check("the marks are Settings › Integrations' own tiles, drawn, a fixed 20px each, overlapping", /import \{ hasBuiltInArt, StorelibTile \} from "@\/components\/app\/settings\/integration-mark"/.test(lib) && /const MARK_PX = 20/.test(lib) && /marginLeft: i === 0 \? 0 : -6/.test(lib) && /<StorelibTile id=\{app\.markId\} size=\{MARK_PX\} mini \/>/.test(lib))
  check("a grey circle where an app has no tile", /rounded-full bg-\[#e5e7eb\]/.test(lib))
  check("asked for with the library's warm-up, so the marks are there when it opens", /useAppStates\(hasApps && \(open \|\| built\)\)/.test(lib))
  check("pressed state and a name that says which apps, for a screen reader", /aria-pressed=\{embedsOn\}/.test(lib) && /aria-label=\{installed\.length \? `\$\{embedsLabel\}: \$\{installed\.map\(\(a\) => a\.name\)\.join\(", "\)\}` : undefined\}/.test(lib))
  check("no sentence explaining the apps row", !/Sections from your apps/.test(lib))
}

console.log("\nSCROLLBAR: a little wider, one width")
{
  const rail = readCode("components/website-builder/editor/slim-scroll-rail.tsx")
  const css = readSource("app/globals.css")
  check("the drawn thumb is 7px, 2px in from the edge, the same width under the pointer", /export const THUMB_PX = 7/.test(rail) && /const THUMB_INSET = 2/.test(rail) && /translate3d\(\$\{box\.right - THUMB_PX - THUMB_INSET\}px/.test(rail) && !/hover:w-\[/.test(rail))
  check("the platform's bar where it is drawn: 8px with a clear border, a 6px rounded thumb", /\.wb-slim-scroll::-webkit-scrollbar \{\s*width: 8px;/.test(css) && /\[data-wb-sidebar-scroll\]::-webkit-scrollbar \{\s*width: 8px;/.test(css) && /border: 1px solid transparent;\s*background-clip: padding-box;\s*border-radius: 999px;/.test(css))
}

console.log("\nOUTLINE: 2px everywhere the canvas selection is drawn")
{
  const shared = readCode("components/website-builder/sections/_shared.tsx")
  const css = readSource("app/globals.css")
  const bridge = readCode("lib/storelib-theme/compat/canvas-bridge.ts")
  const hover = readCode("components/website-builder/canvas-hover.tsx")
  check("the section's ring and hover ring", /inset 0 0 0 2px #3b82f6/.test(shared) && /inset 0 0 0 2px rgba\(59, 130, 246, 0\.5\)/.test(shared) && !/1\.5px/.test(shared.slice(shared.indexOf("Hover ring"), shared.indexOf("Selected"))))
  check("the hover outline over a part", /\.wb-hover-outline \{[\s\S]{0,200}box-shadow: 0 0 0 2px rgba\(59, 130, 246, 0\.85\)/.test(css))
  check("an imported theme's boxes", /\[data-sl-box=hover\]\{border:2px solid/.test(bridge) && /\[data-sl-box=section\]\{border:2px solid #3b82f6\}/.test(bridge) && /\[data-sl-box=block\]\{border:2px solid #3b82f6/.test(bridge))
  check("and the cut around a panel keeps the thicker ring", /const o = 3/.test(hover))
}

console.log("\nCOPY")
{
  const files = ["lib/website-builder/canvas-switch.ts", "scripts/check-view-switch.mjs", "scripts/check-editor-details-z1.mjs", "tests/editor-z1.test.ts", "components/website-builder/editor/slim-scroll-rail.tsx", "lib/website-builder/app-sections.ts"]
  const banned = new RegExp(["\\u2014", "un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(readSource(f)))
  check("no em dash and no banned word in the files this round wrote", bad.length === 0, bad)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
