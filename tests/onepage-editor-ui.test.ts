/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S PICKERS, WALLPAPER AND FONTS
 * ===========================================================================
 * What the owner asked for, held to numbers:
 *
 *   COLOUR      one picker (components/onepage/color-picker) for every colour
 *               the editor asks for; hex and HSV round trips exact; a grey
 *               keeps its hue; recent colours read defensively.
 *   SCHEDULE    a day and a time on the creator's clock, in a named zone,
 *               across a daylight saving change; no datetime-local left.
 *   WALLPAPER   every pattern is a data URI tile, the colour checked before
 *               it is written into one, the same function on the preview and
 *               the live page, and no <filter id> for two layouts to share.
 *   FONTS       a bare family gets a generic fallback, so a page is never
 *               drawn in Times while its font loads; the live page no longer
 *               turns an unset title colour black.
 *
 * The browser half is scripts/check-onepage-editor.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hsvFromHex, hsvToHex, isNearWhite, normalizeHex, pushRecent, readRecent, RECENT_COLORS_MAX } from "@/lib/onepage/color"
import { from12, isoFromWall, timeLabel, to12, wallFromIso, zoneLabel, zoneOffset } from "@/lib/onepage/schedule"
import { WALLPAPER_PATTERNS, isPatternId, patternInk, patternStyle, noiseOpacity } from "@/lib/onepage/wallpaper"
import { fontStack, ONEPAGE_FONTS } from "@/lib/onepage/fonts"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

function main() {
  section("Colour")
  {
    check("a code is read however it is typed", normalizeHex(" #B2846C ") === "#b2846c" && normalizeHex("fff") === "#ffffff" && normalizeHex("#00000090") === "#000000" && normalizeHex("red") === null && normalizeHex(42) === null)
    let exact = true
    for (const hex of ["#b2846c", "#1a1a2e", "#8b5cf6", "#ffffff", "#000000", "#2f6f4f", "#e4572e", "#f4efe9"]) {
      if (hsvToHex(hsvFromHex(hex)) !== hex) { exact = false; console.log(`        ${hex} -> ${hsvToHex(hsvFromHex(hex))}`) }
    }
    check("hex to HSV and back is exact", exact)
    check("a grey keeps the hue the strip was on", hsvFromHex("#808080", 210).h === 210 && hsvFromHex("#808080", 210).s === 0)
    check("white needs a hairline to be seen, ink does not", isNearWhite("#ffffff") && isNearWhite("#f8f9fa") && !isNearWhite("#1a1a2e"))
    const r = pushRecent(["#111111", "#222222"], "#222222")
    check("a recent colour goes to the front, once", r.join() === "#222222,#111111")
    check("and the list stops at its length", pushRecent(Array.from({ length: 20 }, (_, i) => `#0000${String(i).padStart(2, "0")}`), "#abcdef").length === RECENT_COLORS_MAX)
    check("a stored list that is not a list reads as empty", readRecent("{oops").length === 0 && readRecent('"x"').length === 0 && readRecent(null).length === 0 && readRecent('["#fff","nope"]').join() === "#ffffff")

    const kit = read("components/onepage/color-picker.tsx")
    check("the picker drags with pointer events and captures the pointer", /setPointerCapture/.test(kit) && /onPointerMove/.test(kit) && !/onTouchMove|onMouseDown/.test(kit))
    check("its square and strip keep the finger from the sheet", (kit.match(/data-sheet-no-drag=""/g) ?? []).length === 2 && /touch-none/.test(kit))
    check("the page changes at most once a frame while dragging", /requestAnimationFrame\(flush\)/.test(kit))
    check("the eyedropper is offered only where the browser has one", /EyeDropper/.test(kit) && /\{dropper \? \(/.test(kit))
    check("a popover on a computer, the shared sheet on a phone", /<Popover open=\{open\}/.test(kit) && /<BottomSheet\n\s*isOpen=\{open\}/.test(kit))
    check("the browser's own colour input is gone", !/type="color"\s/.test(kit) && !/type="color"\s/.test(read("components/onepage/mobile-color-picker.tsx")))

    /**
     * THE PANEL'S SIZE. On a computer the popover was built to the phone's
     * measurements — 304px wide, a 172px square, 44px rows, 28px swatches,
     * a labelled section each for Suggested and Recent — and it covered the
     * editor it was meant to sit beside. These hold the two sizes apart: the
     * numbers below are the computer's, and every one of them is checked
     * against the phone's, which does not shrink.
     */
    check("the popover on a computer is 248px wide with 12px of padding, not 304 with 16", /w-\[248px\] rounded-2xl[^"]*bg-white p-3 /.test(kit) && !/w-\[304px\]/.test(kit) && !/p-4 text-\[#1a1a2e\]/.test(kit))
    check("its saturation square is 124px tall, while the phone sheet's stays 200", /compact \? "h-\[200px\]" : "h-\[124px\]"/.test(kit))
    check("its hue row is 20px with a 10px rail, while the phone's stays 28px with a 12px rail", /compact \? "h-7" : "h-5"/.test(kit) && /compact \? "h-3" : "h-2\.5"/.test(kit))
    check("the square's handle and the hue thumb shrink with it, 14 and 16 against the phone's 18 and 22", /const handle = compact \? 18 : 14/.test(kit) && /const thumb = compact \? 22 : 16/.test(kit))
    check("the code row and the eyedropper beside it are 36px, while the phone keeps 48", /const targets = compact \? "h-12" : "h-9"/.test(kit) && /compact \? "h-12 w-12" : "h-9 w-9"/.test(kit))
    check("Suggested and Recent share one block under one hairline, each still named", /border-t border-\[#eef0f2\][\s\S]{0,260}<SwatchRow title="Suggested"[\s\S]{0,300}<SwatchRow title="Recent"/.test(kit) && !/<div className="h-px bg-\[#eef0f2\]" aria-hidden \/>/.test(kit))
    check("the swatches are tighter on a computer and untouched on a phone", /grid grid-cols-8", compact \? "gap-2\.5" : "gap-1"/.test(kit))
    check("nothing was dropped to make it smaller: square, hue, code, eyedropper, suggested, recent", ["data-color-square", "data-color-hue", "data-color-hex", "data-color-eyedropper", 'title="Suggested"', 'title="Recent"'].every((s) => kit.includes(s)))
    check("and every control still keeps its focus ring", (kit.match(/focus-visible:shadow-\[0_0_0_2px_#fff/g) ?? []).length >= 3 && /focus-within:shadow-\[0_0_0_3px/.test(kit))
    const design = read("components/onepage/tabs/design-tab.tsx")
    const links = read("components/onepage/tabs/links-tab.tsx")
    check("every colour in the Design tab is the one field", !/MobileColorPicker/.test(design) && (design.match(/<ColorRow/g) ?? []).length >= 12)
    check("and so is every colour of a product block", !/MobileColorPicker/.test(links) && (links.match(/<ColorRow/g) ?? []).length === 4)
    check("no hand made colour circles with a blue ring are left", !/ring-blue-200/.test(design) && !/ring-blue-200/.test(links))
  }

  section("Schedule")
  {
    const zone = "Europe/Bucharest"
    check("Bucharest is GMT+2 in winter and GMT+3 in summer", zoneOffset(Date.parse("2030-01-02T12:00:00Z"), zone) === 120 && zoneOffset(Date.parse("2030-07-02T12:00:00Z"), zone) === 180)
    check("6 PM on Jan 2 in Bucharest is 16:00 UTC", isoFromWall("2030-01-02", 18, 0, zone) === "2030-01-02T16:00:00.000Z")
    check("and in July it is 15:00 UTC", isoFromWall("2030-07-02", 18, 0, zone) === "2030-07-02T15:00:00.000Z")
    check("the night the clocks go back, 3:30 is read once, not twice", isoFromWall("2030-10-27", 3, 30, zone) === "2030-10-27T00:30:00.000Z" || isoFromWall("2030-10-27", 3, 30, zone) === "2030-10-27T01:30:00.000Z")
    const back = wallFromIso(isoFromWall("2030-03-31", 12, 45, zone), zone)
    check("a wall time comes back as itself", back?.ymd === "2030-03-31" && back.hour === 12 && back.minute === 45, JSON.stringify(back))
    check("New York works the same way", isoFromWall("2030-01-02", 9, 0, "America/New_York") === "2030-01-02T14:00:00.000Z")
    check("an empty or unreadable value is no time", wallFromIso(null, zone) === null && wallFromIso("soon", zone) === null)
    check("12 AM is midnight and 12 PM is noon", from12(12, false) === 0 && from12(12, true) === 12 && from12(6, true) === 18 && to12(0).hour12 === 12 && !to12(0).pm && to12(18).hour12 === 6 && to12(18).pm)
    check("times read as people say them", timeLabel(18, 5) === "6:05 PM" && timeLabel(0, 0) === "12:00 AM")
    check("the zone is named with its offset", zoneLabel(zone, Date.parse("2030-07-01T00:00:00Z")) === "Europe/Bucharest, GMT+3" && zoneLabel("Asia/Kolkata", 0) === "Asia/Kolkata, GMT+5:30" && zoneLabel("UTC") === "UTC")

    const extras = read("components/onepage/extra-blocks.tsx")
    check("no datetime-local box is left in the block settings", !/datetime-local/.test(extras))
    check("the schedule is Show from and Hide after, each a day and a time", /<DateTimeField label="Show from"/.test(extras) && /<DateTimeField label="Hide after"/.test(extras))
    check("the end knows its start, so days before it are quieter", /after=\{s\?\.start_at\}/.test(extras))
    check("the time zone is said under the fields", /Times are in \$\{zoneLabel\(zone\)\}/.test(extras))
    check("a countdown's date is the same picker", /<DateTimeField\s+label="Counts down to"/.test(extras))
    const field = read("components/onepage/date-time-field.tsx")
    check("the month is always six weeks", /while \(cells\.length < 42\)/.test(field))
    check("an empty square keeps its place, so the 1st is under its weekday", /if \(!d\) return <span key=\{i\} aria-hidden className=\{size\} \/>/.test(field))
    check("today is marked and the chosen day is dark", /aria-current=\{isToday \? "date" : undefined\}/.test(field) && /bg-\[#1a1a2e\] font-semibold text-white/.test(field))
    check("the time is typed, hour and minute, with AM and PM", /data-time-hour=""/.test(field) && /data-time-minute=""/.test(field) && /data-time-ampm=\{x\}/.test(field))
    /* Changed on purpose (round 40): the sheet has a header of its own, so its props are on lines. */
    check("a popover on a computer, the shared sheet on a phone", /<Popover open=\{open\}/.test(field) && /<BottomSheet\s+isOpen=\{open\}/.test(field))
    /* Moved on purpose: the route builds the page through lib/onepage/public-shape.ts, which leaves it out. */
    check("the live page still leaves out a block before its start",
      /publicOnePage\(onepage, \{\s*source: "published"/.test(read("lib/onepage/published-page.ts")) && /blocks\.filter\(\(b\) => isScheduledNow\(b, now\)\)/.test(read("lib/onepage/public-shape.ts")))
  }

  section("Wallpaper")
  {
    check("the old ten patterns are all still offered", ["grid", "dots", "waves", "zigzag", "diagonal", "morph", "organic", "flowmaze", "topographic", "stars"].every(isPatternId))
    check("with new textures and patterns", ["grain", "paper", "linen", "lines", "crosshatch", "checker"].every(isPatternId))
    check("none, and names nobody knows, draw nothing", patternStyle("none", "#000") === null && patternStyle("plaid", "#000") === null && patternStyle(undefined, "#000") === null)
    let all = true
    for (const p of WALLPAPER_PATTERNS) {
      if (p.id === "none") continue
      const s = patternStyle(p.id, "#00000090", "medium")
      if (!s || !s.backgroundImage.startsWith('url("data:image/svg+xml,') || !/px/.test(s.backgroundSize)) { all = false; console.log(`        ${p.id}`) }
    }
    check("every one is a data URI tile of a fixed size", all)
    check("the colour's own alpha is kept", patternInk("#ffffff90").rgb === "#ffffff" && Math.abs(patternInk("#ffffff90").alpha - 0.56) < 0.01)
    const evil = patternStyle("dots", "red'/><script>alert(1)</script>", "medium")
    check("anything but a hex colour is never written into the image", !!evil && !decodeURIComponent(evil.backgroundImage).includes("script") && decodeURIComponent(evil.backgroundImage).includes("#000000"))
    check("strengths: light, medium, strong, and bold drawn twice", patternStyle("dots", "#000", "low")!.opacity === 0.4 && patternStyle("dots", "#000", "medium")!.opacity === 0.7 && patternStyle("dots", "#000", "hard")!.opacity === 1 && patternStyle("dots", "#000", "very_hard")!.backgroundImage.split('url("').length === 3)
    check("grain strength 5 to 50 is opacity 0.1 to 1, as it was", noiseOpacity(5) === 0.1 && noiseOpacity(50) === 1 && noiseOpacity(undefined) === 0.3)

    const live = read("components/onepage/public-onepage.tsx")
    /*
      Changed on purpose: the preview frames the live page's own component
      (components/onepage/preview-document.tsx) instead of drawing its own
      copy (phone-preview.tsx), so it is held to what the live page draws
      once the frame is seen to draw it.
    */
    const framed = /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx"))
    const preview = framed ? live : read("components/onepage/phone-preview.tsx")
    check("the preview is the live page's own component, framed", framed)
    for (const [name, src] of [["the preview", preview], ["the live page", live]] as const) {
      check(`${name} draws the pattern and the grain from the shared layers`, /<WallpaperPattern theme=\{/.test(src) && /<WallpaperNoise strength=\{/.test(src))
      check(`${name} has no SVG filter or pattern ids left to collide`, !/<filter id=/.test(src) && !/<pattern id=/.test(src) && !/feTurbulence/.test(src))
    }
    check("the live page declares no overlay component inside its render", !/const NoiseOverlay = \(/.test(live) && !/const BackgroundPatternOverlay = \(/.test(live))
    check("the Design tab's thumbnails use the same function", /<WallpaperPattern pattern=\{pattern\.id\}/.test(read("components/onepage/tabs/design-tab.tsx")))
  }

  section("Fonts")
  {
    check("a bare family gets a fallback", fontStack("Inter") === "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" && fontStack(undefined) === fontStack("Inter"))
    check("a serif gets a serif, a script a cursive", /serif$/.test(fontStack("Playfair Display")) && /cursive$/.test(fontStack("Pacifico")) && /monospace$/.test(fontStack("JetBrains Mono")))
    check("a value that already has one is left alone", fontStack("'Lora', serif") === "'Lora', serif")
    check("every family the editor offers gets one", Object.keys(ONEPAGE_FONTS).every((f) => /(serif|sans-serif|cursive|monospace)$/.test(fontStack(f))))
    const live = read("components/onepage/public-onepage.tsx")
    /* The preview is the live page, framed (see the patterns above): the same fontStack calls, the same code. */
    const preview = /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx")) ? live : read("components/onepage/phone-preview.tsx")
    check("the preview and the live page both use it, body and title", (preview.match(/fontStack\(/g) ?? []).length === 4 && (live.match(/fontStack\(/g) ?? []).length === 4)
    check("no bare `|| \"Inter\"` fallback is left", !/font_family \|\| "Inter"/.test(preview) && !/font_family \|\| "Inter"/.test(live))
    const safe = live.slice(live.indexOf("const safeTheme = {"), live.indexOf("...theme, // Spread theme"))
    check("the live page no longer turns an unset title black, or its font Inter", !/title_color: "#000000"/.test(safe) && !/title_font: "Inter"/.test(safe) && !/social_icon_color: "#000000"/.test(safe))
  }

  section("The panels")
  {
    const design = read("components/onepage/tabs/design-tab.tsx")
    const kit = read("components/onepage/editor-kit.tsx")
    /* The panel drawn is `drawnSection`: the open one, the one on its way out, or the one readied under a finger. */
    check("Design opens on a list of rows, each opening a panel with a way back", /<NavRow\s+dataKey="wallpaper"/.test(design) && /<PanelHeader title=\{SECTION_LABEL\[drawnSection\]\} onBack=/.test(design))
    check("the icon rail and the chip strip are gone", !/sidebarExpanded/.test(design) && !/TooltipProvider/.test(design))
    check("a picked choice is a thin dark border, not a heavy frame or a violet ring", /border-\[#1a1a2e\] shadow-\[0_0_0_0\.5px_#1a1a2e\]/.test(kit) && !/border-2 border-foreground|ring-violet-500/.test(design))
    /*
      THE WAY BACK IS THE APP'S SQUARE, AND A PRESS IS FELT. "I don't like
      that the back icon is a circle. It needs a little more depth, and when
      I click it, it needs to feel like I clicked it." A grey circle whose
      press was one shade darker; now iconDepth's tile (hairline, a 2px shade
      in its foot, a soft shadow) in a 44px place to press, dipping 6% with a
      shade inside over 120ms, on scale and opacity only. Measured by
      scripts/check-onepage-editor-nav.mjs (back): 44x44 to press, 40x40
      tile, 1px #d9dbe0, pressed scale 0.94 and the shade at 1, `scale / 0.12s`.
    */
    const panelHeader = kit.slice(kit.indexOf("const backTile"), kit.indexOf("export function SectionTitle"))
    check("the way back is 44px to press on a phone", /data-panel-back=""/.test(panelHeader) && /group\/back[^"]*h-11 w-11/.test(panelHeader))
    check("the way back is a square with the app's depth, not a grey circle",
      /rounded-\[10px\] border border-\[#d9dbe0\] bg-white/.test(panelHeader) && /shadow-\[inset_0_-2px_0_rgba\(0,0,0,0\.07\),0_1px_2px_rgba\(15,23,42,0\.08\)\]/.test(panelHeader)
      && !/rounded-full bg-\[#f1f2f4\]/.test(panelHeader) && /<ArrowLeft /.test(panelHeader))
    check("pressed, it dips and shades over 120ms, on scale and opacity alone, and not under reduced motion",
      /transition-\[scale\] duration-\[120ms\]/.test(panelHeader) && /group-active\/back:scale-\[0\.94\]/.test(panelHeader)
      && /transition-opacity duration-\[120ms\][^"]*group-active\/back:opacity-100/.test(panelHeader) && /motion-reduce:group-active\/back:scale-100/.test(panelHeader)
      && !/transition-colors/.test(panelHeader))
    check("switches are the app's one switch, with a 44px place to press", /switchTrack\(checked\)/.test(kit) && /h-11 w-11/.test(kit) && !/theme-checkbox/.test(design))
    check("the wallpaper styles are Fill, Gradient, Image and Video", /type === "solid" \? "Fill"/.test(design))
    /*
      A PANEL IS PUSHED IN AND POPPED BACK OUT. It swapped in one frame and
      back landed at the top of the list. scripts/check-onepage-motion.mjs
      (push): 21 to 23 frames in motion, no blank frame, the page moving
      6 to 60ms after the tap, the list back where it was left.
    */
    /*
      NO SLIDE. The owner: "I still don't like the page transition. [...]
      Make sure it's smooth, not glitchy, more simple, clean, normal, NO
      SLIDE like." The push (the panel from the right, the list shifting
      left and dimming under it) is now a fade in place, on opacity only:
      the page leaving out over 90ms, the page arriving in from 50 to 200ms.
      scripts/check-onepage-motion.mjs (push) reads no sideways movement in
      any frame and no blank frame.
    */
    /*
      Changed on purpose (round 11): "I don't like the fade." The crossfade is gone: on a phone the panel rises over
      the list and drops back off it, as the app's page layer and an order do (components/app/page-layer,
      app/app/orders/order-motion), on transform; on a computer the panel is there at once and only its content lands
      (lib/ui/pill-switch). scripts/check-onepage-motion-r11.mjs (push) reads every frame: a whole page always over the
      column, never two half drawn, nothing sideways.
    */
    check("on a phone the panel rises over the list and drops off it, on the page layer's numbers; on a computer only its content lands",
      /const PUSH_MS = LAYER_MOTION_MS/.test(design) && /const POP_MS = LAYER_LEAVE_MS/.test(design) && /const MOVE_EASE = LAYER_MOTION_EASE/.test(design)
      && /panel\.animate\(\[\{ transform: `translate3d\(0, \$\{at\}px, 0\)` \}, \{ transform: `translate3d\(0, \$\{to\}px, 0\)` \}\]/.test(design)
      && /body\.animate\(\[\{ opacity: CONTENT_IN_FROM \}, \{ opacity: 1 \}\]/.test(design)
      && !/FADE_OUT_MS|FADE_IN_DELAY_MS|leaving\.animate\(/.test(design))
    check("and back returns to the place in the list that was left", /scroller\.scrollTop = move\.to === "home" \? listScroll\.current : 0/.test(design))
    /*
      "When I switch and navigate, there are glitchy, buggy page
      transitions." Recorded at 1280 on a computer: Theme stood in from the
      right as a box over a list cut off at the left, and back showed Theme
      whole again for two frames once the move had ended.
      scripts/check-onepage-design-push.mjs, every row in and back at
      1280x800 on CPU/4 with scrollbars that take room: pages 576px in a
      630px column -> exactly the column; overlap up to 576px -> the list's
      edge on the panel's edge in every frame; the page leaving drawn at
      rest after the move, 1 frame -> 0; the column scrollable sideways by
      549px -> 0; the column 630 -> 620px in a move's first frame -> never
      changes.
    */
    const editorSrc = read("components/onepage/onepage-editor.tsx")
    check("each page is the column: the editor gives Design the whole column, and the stack cuts sideways at its edges",
      /* The room under the content is the phone tab bar's own height (app/globals.css --op-tabbar-h, .op-tabbar-clearance). */
      /t === "design" \? null : "p-4 md:p-6 op-tabbar-clearance md:pb-6"/.test(editorSrc) && /* Changed on purpose (round 11): Settings is 768px wide so its seven pills fit on one row where the column allows. */ /t === "settings" \? "max-w-3xl" : t === "design" \? null : "max-w-xl"/.test(editorSrc)
      && /style=\{\{ overflowX: "clip" \}\} data-design-stack=""/.test(design) && /const readingClass = "mx-auto w-full max-w-xl p-4 op-tabbar-clearance md:p-6 md:pb-6"/.test(design))
    /* Side by side on a computer was the slide too: now no page moves sideways anywhere, and there is no shade or edge shadow ("NO SLIDE"). */
    /* Changed on purpose (round 11): the panel moves up and down on a phone (translate3d(0, y)), never sideways, and nothing dims the list. */
    check("no page moves sideways on a phone or a computer, and nothing dims the list",
      !/SIDE_QUERY|UNDER_SHIFT|UNDER_DIM|translate3d\([^0]/.test(design.slice(design.indexOf("type DesignPage"), design.indexOf("function reducedMotion(")))
      && !/data-design-dim=""/.test(design) && !/max-md:shadow-\[-1px_0_0/.test(design))
    check("the drop's last frame is held until React has drawn the page at rest, and let go before that is painted",
      /fill: push \? "backwards" : "forwards"/.test(design) && /if \(!move\) \{\s*animating\.current\.forEach\(\(a\) => a\.cancel\(\)\)/.test(design))
    check("the page underneath is cut at the bottom of the screen, so a move never makes the column scroll",
      /\.\.\.leavingStyle\(move!\.top\), height: move!\.listMin, overflow: "clip"/.test(design) && /droppingStyle\(move\.top\) : leavingStyle\(move \? move\.top : 0\)\), height: move\?\.panelMin, overflow: "clip"/.test(design)
      && /root\.style\.overflowY = "clip"/.test(design))
    check("the tab boxes keep the scrollbar's room, so a move never changes the column's width", /scrollbarGutter: "stable"/.test(editorSrc))
    /*
      ONE MOTION PER PRESS. "Themes, back, Themes again, back: a double
      refresh." The page slid in with only its title and its controls were
      built a frame later and faded in: two motions for every open, and four
      frames of an empty page on the first (scripts/check-onepage-editor-nav.mjs,
      nav: motions [2,1,2,1] before, [1,1,1,1] now; empty panel frames 4 to 0;
      Theme's cards built once in the whole walk, not on every open).
    */
    check("the panels are kept in Activity, as the editor's tabs are, and never faded in",
      /<Activity key=\{id\} mode=\{id === drawnSection \? "visible" : "hidden"\}>/.test(design) && !/function PanelBody\(/.test(design) && !/setBodyFor/.test(design))
    check("built while the page is idle, or whole on the tap that comes first",
      /requestIdleCallback\(build, \{ timeout: 2000 \}\)/.test(design) && /if \(next\) setBuilt\(\(b\) => \(b\.includes\(next\) \? b : \[\.\.\.b, next\]\)\)/.test(design))
    check("and readied under the finger, out of sight and taking no room, so the lift only moves it",
      /onPointerDown=\{onRowDown\} onPointerCancel=\{onRowCancel\}/.test(design) && /height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none"/.test(design))
    /* Android's back is the panel's back: the same pop, to the same place in the list, and not "tap again to exit". */
    const nativeBack = read("components/app/native-back-handler.tsx")
    check("Android's back closes an open panel, the same way its back button does",
      /data-native-back=\{section \? "" : undefined\}/.test(design) && /root\.addEventListener\(NATIVE_BACK_EVENT, onBack\)/.test(design)
      && /const onBack = \(\) => setSection\(null\)/.test(design)
      && /const inner = nativeBackTarget\(\)[\s\S]{0,200}inner\.dispatchEvent\(new CustomEvent\(NATIVE_BACK_EVENT\)\)/.test(nativeBack)
      && nativeBack.indexOf("nativeBackTarget()") < nativeBack.indexOf("const isRoot = isAppRootRoute"))
    /* The pull from the left edge dragged the panel sideways; it went with the slide ("NO SLIDE"). The way back is the arrow, and Android's back. */
    check("no edge pull is left: the way back is the arrow at the top of the panel", !/data-edge-back=""/.test(design) && !/onPointerMove=\{onEdgeMove\}/.test(design) && /onBack=\{\(\) => setSection\(null\)\} backLabel="Back to Design"/.test(design))
    /*
      A PICK FADES IN, THE OLD ONE OUT. The border and the check were the
      card's own classes, swapped in a frame, and on a phone or in the app
      app/globals.css took the button's own transition away. They are
      elements of their own (components/onepage/choice-marks.tsx), faded
      and scaled with opacity and the `scale` property. Measured
      (scripts/check-onepage-motion.mjs, choice): 11 frames in and 11 out,
      in the browser and with <html class="capacitor">, the label never
      changing width.
    */
    const marks = read("components/onepage/choice-marks.tsx")
    check("the picked marks move on opacity and the scale property, named as such", /transition-\[opacity,scale\]/.test(marks) && !/transition-\[opacity,transform\]/.test(marks))
    check("a card, a segment, a theme and a pattern wear the mark instead of swapping classes",
      /<ChoiceMark on=\{selected\} \/>/.test(kit) && /<ChoiceMark on=\{on\} \/>/.test(kit) && !/selected \? choiceOn : choiceOff/.test(kit)
      && /<CheckMark on=\{selected\}/.test(design) && /<CheckMark on=\{on\} small/.test(design) && !/on \? choiceOn : choiceOff/.test(design))
    /* The kinds of theme are the editor's one pill-tab row now (components/onepage/pill-tabs): one pill slides between them instead of each chip fading its own fill. */
    check("a chip's fill and a swatch's ring fade too", /<PillTabs\s+dataRow="theme-kinds"/.test(design) && /<SwatchMark on=\{theme\.background_gradient === grad\}/.test(design) && /<SwatchMark on=\{on\} className="rounded-full" \/>/.test(read("components/onepage/color-picker.tsx")))
    check("a block's size and alignment are one thumb that slides", /data-segment-thumb=""/.test(read("components/onepage/extra-blocks.tsx")) && /transition-\[translate\]/.test(read("components/onepage/extra-blocks.tsx")))
    /*
      EVERY SHEET ON A PHONE IS THE SHARED ONE. The name and bio, the
      profile picture's and video's steps, the crops, the image library, the
      streaming link and the layout questions were centred Radix dialogs on
      a phone; they are SheetDialog now (a dialog on a computer, as they
      were). scripts/check-onepage-sheets.mjs reads each one it can open.
    */
    const linksSrc = read("components/onepage/tabs/links-tab.tsx")
    check("no centred dialog is left in the Links or Design tab", !/<Dialog open=/.test(linksSrc) && !/<Dialog open=/.test(design))
    /* Round 11: every crop is the one cropper now (components/onepage/media-cropper.tsx), which carries data-sheet-no-drag itself; the tabs use it through CropUpload. */
    check("a crop keeps its finger from the sheet", /data-sheet-no-drag=""/.test(read("components/onepage/media-cropper.tsx")) && (linksSrc.match(/<CropUpload\b/g) ?? []).length >= 2 && (design.match(/<CropUpload\b/g) ?? []).length >= 4)
    check("Add block, the social link and Share are built ahead and kept, as the notifications sheet is",
      /* Round 11: the social sheet keeps one height whose top the keyboard never moves (SOCIAL_SHEET_HEIGHT), on purpose. */
      /sheet=\{\{ keepMounted: true, height: SHEET_DIALOG_MAX_HEIGHT \}\}/.test(linksSrc) && /* Changed on purpose (round 42): SOCIAL_SHEET_HEIGHT for the list only, a field sized to itself. */ /sheet=\{\{ keepMounted: true, height: selectedSocial \? undefined : SOCIAL_SHEET_HEIGHT/.test(linksSrc)
      && /title="Share your OnePage" hideFrom="md" keepMounted/.test(read("components/onepage/onepage-editor.tsx")))
    check("a block's layout, display and divider cards fade their mark, and the radio dot scales in", /* 11 since round 11: the email signup's two hand-written cards became one card drawn for each of its five layouts. */ (linksSrc.match(/<CardMark on=\{/g) ?? []).length >= 11 && !/\? "border-\[#1a1a2e\] bg-\[#f7f7f8\]"/.test(linksSrc) && /scale-0 opacity-0/.test(linksSrc))
    /* Settings' sections are the editor's one pill-tab row now: the pill slides from the press, instead of each chip fading its own fill where it stands. */
    /* Changed on purpose (round 10): one row at every width, named settings-pills. */
    /* Changed on purpose (round 11): Settings' pills are Storelib's own, each fill fading in where it is (lib/ui/pill-switch), the press a light tint. */
    check("Settings' section chips are Storelib's pills", /<PillTabs\s+dataRow="settings-pills"/.test(read("components/onepage/tabs/settings-tab.tsx")) && /cn\(PILL_FILL, on \? "opacity-100" : "opacity-0"\)/.test(read("components/onepage/pill-tabs.tsx")) && /pressPill\(e\.currentTarget\)/.test(read("components/onepage/pill-tabs.tsx")))
    check("a link's stats are asked for once its sheet has arrived on a phone, as the notifications are", /sheet=\{\{ onOpened: \(\) => setStatsSheetArrived\(true\) \}\}/.test(linksSrc) && /!isMobileStatsViewport \|\| statsSheetArrived/.test(linksSrc))
    /* Changed on purpose (round 40): named by `label` with a header that says the moment, still on the keyboard. */
    check("the day and time sheet sits on the keyboard", /<BottomSheet\s+isOpen=\{open\}\s+onClose=\{\(\) => setOpen\(false\)\}\s+label=\{label\}\s+aboveKeyboard/.test(read("components/onepage/date-time-field.tsx")))
    /*
      Changed on purpose (round 40): "the gradient adjuster (the clock ring thing) is very cheap UI". The dial is gone;
      the direction is eight painted swatches and the editor's own slider (components/onepage/themes/gradient-direction),
      which keeps its finger from the sheet itself (editor-kit RangeRow). tests/onepage-themes-r40.test.ts pins the rest.
    */
    const direction = read("components/onepage/themes/gradient-direction.tsx")
    check("the gradient's direction is swatches and a slider, not a dial", !/function DirectionDial/.test(design) && /<GradientDirection\b/.test(design) && /GRADIENT_DIRECTIONS\.map/.test(direction) && /<RangeRow\b/.test(direction))
  }

  section("The creator's picture is a circle")
  {
    /*
      "In the themes, the profile avatar is not a circle, it's oval." A box
      sized by its width and an aspect ratio, in a column the card's height
      holds, can be given less height than width by the column where it runs
      short. scripts/check-onepage-editor-nav.mjs (avatar) measures every
      one at 320, 390 and 1280: |width - height| 0.00px.
    */
    const design = read("components/onepage/tabs/design-tab.tsx")
    const card = design.slice(design.indexOf("function ThemeCard("), design.indexOf("function ThemeSection("))
    /*
      Still a tall pill on the owner's iPhone after the spacer (26 by 41,
      22% of the card's height): the size is now fixed, 28px both ways, on
      a phone and a computer, and nothing is worked out from the card.
    */
    /* Changed on purpose, round 43: 34px (nearer a page's share of the width) and in the theme's own shape, still fixed both ways. */
    check("a theme card's avatar is a fixed 34px square box that cannot be stretched or squashed",
      /data-theme-avatar=""[\s\S]{0,160}className="block h-\[34px\] min-h-\[34px\] w-\[34px\] min-w-\[34px\] flex-none aspect-square overflow-hidden"/.test(card) && !/w-\[22%\]/.test(card))
    check("the layout pictures in the Header panel are circles that cannot shrink", (design.match(/data-layout-avatar="" className="(h-7 w-7|w-10 h-10) aspect-square shrink-0 rounded-full/g) ?? []).length === 3)
    check("the live page's avatar keeps its own square box in the column", /data-page-avatar="" style=\{\{ width: avatarSize, height: avatarSize, aspectRatio: "1 \/ 1", flexShrink: 0/.test(read("components/onepage/public-onepage.tsx")))
    check("the Header panel's profile picture is a circle, as the page draws it", /aspect-square h-\[88px\] w-\[88px\] shrink-0 cursor-pointer rounded-full/.test(design) && /data-editor-avatar="" className="absolute inset-0 overflow-hidden rounded-full/.test(design))
    check("the Links tab's profile picture keeps its size beside a long name", /data-editor-avatar="" className="h-14 w-14 aspect-square shrink-0/.test(read("components/onepage/tabs/links-tab.tsx")))
    const onboarding = read("components/onepage/onboarding-modal.tsx")
    /* One card at every width now (the phone's grid and the computer's carousel were two copies of it), so one circle, sized once. */
    check("the onboarding's theme cards keep the creator's picture round", (onboarding.match(/data-theme-avatar="" className="w-10 h-10 aspect-square shrink-0 rounded-full/g) ?? []).length === 1)
  }

  section("+ Add")
  {
    /*
      "Make sure it's purple how it was before, and the plus icon has that
      rotating animation on click." It was bg-violet-500 until the editor
      went near black (3058e092); it is the app's violet primary now, on
      this button alone. The + turns 45deg into the sheet's x while the
      sheet + Add opened is up, and back as it goes, on `rotate` over 200ms,
      off under reduced motion. It turned on a `.group` before, which
      app/globals.css strips of transforms and transitions on a touch
      screen, so on a phone it never turned. Measured (add): rgb(139, 92,
      246); open 0 to 45deg over 10 frames, close 45 to 0 over 8; reduced
      motion one step each way.
    */
    const links = read("components/onepage/tabs/links-tab.tsx")
    /* Round 11: + Add is AddBlockButton (components/onepage/add-block-picker), so its open state does not render this tab; the button and its classes are here as before. */
    const add = links.slice(links.indexOf("<AddBlockButton") - 40, links.indexOf("<AddBlockButton") + 900)
    check("it is the app's violet primary (accentDepth, #8b5cf6)", /className=\{cn\(accentDepth, "h-11 w-full gap-2 rounded-xl text-\[15px\]"\)\}/.test(add) && /accentDepth =[\s\S]{0,200}bg-\[#8b5cf6\]/.test(read("components/ui/depth-button.ts")))
    check("and not inside a .group, whose transforms a touch screen loses", !/"group /.test(add) && !/\bgroup-hover:/.test(add))
    /*
      Round 11 changed this pin on purpose: "the plus icon rotates too much
      when I click Add block, and in general it rotates too much" (round 10
      turned it 360 on hover and rested it at 405). The + is AddBlockPlus
      (components/onepage/add-block-picker.tsx): never turns on a touch
      screen, a quarter turn (90) under a mouse, 135 (an x) while the sheet
      is up, 280ms on one curve, the rotate property alone, off under
      reduced motion. Measured by scripts/check-onepage-addblock-r11.mjs.
    */
    const plus = read("components/onepage/add-block-picker.tsx")
    /* Changed on purpose (round 42): "when clicked, rotate the + icon smoothly (45 degrees to an x)", for a finger as for a mouse, with a haptic tick in the apps. No hover turn, so the click is the only one. */
    check("its + turns 45 degrees to an x while the sheet is up, for every pointer, no hover turn, not under reduced motion, a tick in the apps",
      /<AddBlockButton\n\s*fromButton=\{addSheetFromButton\}/.test(add) && /<AddBlockPlus open=\{open\} \/>/.test(plus) && /const open = useAddSheetOpen\(\) && fromButton/.test(plus)
      && /transition-\[rotate\] duration-\[280ms\] ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\] motion-reduce:transition-none/.test(plus)
      && /open \? "rotate-45" : "rotate-0"/.test(plus) && !/group-hover\/add:rotate/.test(plus) && !/pointer-fine:rotate/.test(plus)
      && /if \(isNativeApp\(\)\) hapticTap\("light"\)/.test(plus)
      && /className=\{cn\("group\/add", className\)\}/.test(plus)
      && !/rotate-\[(360|405)deg\]/.test(plus)
      && /const addSheetFromButton = insertAfterId === null && addToGroupId === null/.test(links))
    check("the rest of the Links tab stays ink: this is the one violet", (links.match(/accentDepth/g) ?? []).length === 3 && !/bg-violet-500/.test(links))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
