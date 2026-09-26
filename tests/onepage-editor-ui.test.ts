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

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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
    check("a popover on a computer, the shared sheet on a phone", /<Popover open=\{open\}/.test(field) && /<BottomSheet isOpen=\{open\}/.test(field))
    check("the live page still leaves out a block before its start", /\.filter\(\(b\) => isScheduledNow\(b\)\)/.test(read("app/(marketing)/l/[slug]/page.tsx")))
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

    const preview = read("components/onepage/phone-preview.tsx")
    const live = read("components/onepage/public-onepage.tsx")
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
    const preview = read("components/onepage/phone-preview.tsx")
    const live = read("components/onepage/public-onepage.tsx")
    check("the preview and the live page both use it, body and title", (preview.match(/fontStack\(/g) ?? []).length === 4 && (live.match(/fontStack\(/g) ?? []).length === 4)
    check("no bare `|| \"Inter\"` fallback is left", !/font_family \|\| "Inter"/.test(preview) && !/font_family \|\| "Inter"/.test(live))
    const safe = live.slice(live.indexOf("const safeTheme = {"), live.indexOf("...theme, // Spread theme"))
    check("the live page no longer turns an unset title black, or its font Inter", !/title_color: "#000000"/.test(safe) && !/title_font: "Inter"/.test(safe) && !/social_icon_color: "#000000"/.test(safe))
  }

  section("The panels")
  {
    const design = read("components/onepage/tabs/design-tab.tsx")
    const kit = read("components/onepage/editor-kit.tsx")
    /* The panel drawn is `shownSection` since panels are pushed and popped: the open one, or the one on its way out. */
    check("Design opens on a list of rows, each opening a panel with a way back", /<NavRow\s+dataKey="wallpaper"/.test(design) && /<PanelHeader title=\{SECTION_LABEL\[shownSection\]\} onBack=/.test(design))
    check("the icon rail and the chip strip are gone", !/sidebarExpanded/.test(design) && !/TooltipProvider/.test(design))
    check("a picked choice is a thin dark border, not a heavy frame or a violet ring", /border-\[#1a1a2e\] shadow-\[0_0_0_0\.5px_#1a1a2e\]/.test(kit) && !/border-2 border-foreground|ring-violet-500/.test(design))
    check("the way back is 44px on a phone", /h-11 w-11[^"]*sm:h-10 sm:w-10/.test(kit))
    check("switches are the app's one switch, with a 44px place to press", /switchTrack\(checked\)/.test(kit) && /h-11 w-11/.test(kit) && !/theme-checkbox/.test(design))
    check("the wallpaper styles are Fill, Gradient, Image and Video", /type === "solid" \? "Fill"/.test(design))
    /*
      A PANEL IS PUSHED IN AND POPPED BACK OUT. It swapped in one frame and
      back landed at the top of the list. scripts/check-onepage-motion.mjs
      (push): 21 to 23 frames in motion, no blank frame, the page moving
      6 to 60ms after the tap, the list back where it was left.
    */
    check("a panel slides in over the list by transform, the list shifting under it",
      /panel\.animate\(\[\{ transform: at\(panelFrom\) \}, \{ transform: at\(panelTo\) \}\], timing\)/.test(design) && /list\.animate\(\[\{ transform: under\(panelFrom\) \}, \{ transform: under\(panelTo\) \}\], timing\)/.test(design))
    check("and back returns to the place in the list that was left", /scroller\.scrollTop = move\.to === "home" \? listScroll\.current : 0/.test(design))
    check("the page moves on the tap, its controls built a frame later and faded in", /startTransition\(\(\) => setBodyFor\(section\)\)/.test(design) && /function PanelBody\(/.test(design))
    check("a finger from the left edge takes the panel back, on a strip that owns its touch", /data-edge-back=""/.test(design) && /touchAction: "none"/.test(design) && /onPointerMove=\{onEdgeMove\}/.test(design))
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
    check("a chip's fill and a swatch's ring fade too", /<ChipFill on=\{filter === f\} \/>/.test(design) && /<SwatchMark on=\{theme\.background_gradient === grad\}/.test(design) && /<SwatchMark on=\{on\} className="rounded-full" \/>/.test(read("components/onepage/color-picker.tsx")))
    check("a block's size and alignment are one thumb that slides", /data-segment-thumb=""/.test(read("components/onepage/extra-blocks.tsx")) && /transition-\[translate\]/.test(read("components/onepage/extra-blocks.tsx")))
    check("the dial turns with pointer events and keeps its rotation on a touch screen", /function DirectionDial[\s\S]{0,2400}setPointerCapture[\s\S]{0,2400}data-keep-transform=""/.test(design))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
