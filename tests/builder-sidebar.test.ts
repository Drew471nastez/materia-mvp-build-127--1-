/**
 * ===========================================================================
 *  THE BUILDER'S SIDEBAR, AS RULES
 * ===========================================================================
 * The parts of the sidebar that are decisions rather than drawing, tested as
 * the decisions they are:
 *
 *   the sidebar as it was the owner asked for the setting controls from before
 *                         the September 25 rework back: the scheme dropdown,
 *                         the browser's own selects, the black slider, the
 *                         image box, the header layout cards and the rich text
 *                         box, and nothing the rework added in their place
 *   groups that move      every group in Theme settings opens and closes by
 *                         height, with its content fading, on the iOS curve
 *   where a section goes  the library's "Between A and B", clamped the way
 *                         the editor clamps an insert
 *   bringing it on screen when the canvas scrolls to a new section, and when not
 *   a preview's markup    its pictures wait, its styles leave it, its key
 *                         holds its width
 *
 * The geometry and motion are measured in a browser instead:
 * scripts/check-sidebar-revert.mjs, check-sidebar-tabs.mjs,
 * check-add-section.mjs, check-connections.mjs.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { COLLAPSE_CLOSE_MS, COLLAPSE_OPEN_MS } from "@/components/website-builder/editor/collapse"
import { whereItGoes } from "@/lib/website-builder/insert-words"
import { arrivalScrollTarget } from "@/lib/website-builder/section-arrival"
import { lazyImages, previewKey, splitStyles } from "@/lib/website-builder/preview-markup"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const said = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + said)
    console.log(`  FAIL  ${label}${said}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const panels = read("components/website-builder/editor/design-panels.tsx")
  const slider = read("components/website-builder/editor/slider-number-control.tsx")
  const picker = read("components/website-builder/editor/image-picker.tsx")
  const chip = read("components/website-builder/editor/color-chip.tsx")
  const rich = read("components/website-builder/rich-text-field.tsx")
  const collapse = read("components/website-builder/editor/collapse.tsx")

  console.log("\nThe sidebar's controls are the ones from before the rework")
  /*
    "Revert all the things you changed in the sidebar of the website builder
    editor recently ... Full revert." Each control is pinned by something
    only the older one has, and the modules the rework added are gone.
  */
  check("a section's scheme is chosen from the dropdown painted in each scheme, with Edit on every row",
    /export function SchemePicker\(/.test(panels) && /<SchemePicker\s/.test(panels) && /onEdit\(key\)/.test(panels) && !/SchemeTiles|SchemeEditor/.test(panels))
  check("and a scheme is edited in Colors, under the list, the one opened from a section first",
    /initialActive=\{editSchemeKey\}/.test(editor) && /setExpandedSettings\("color_schemes"\)/.test(editor) && !/schemeEditing/.test(editor))
  check("a choice in a section is the browser's own select",
    /if \(kind === "select"\) \{\s*return \(\s*<div className="relative">\s*<select/.test(editor) && !/SettingSelect|SegmentedChoice/.test(editor))
  check("and a short one is the grey segmented row, a long one a select",
    /if \(opts\.length > 3\) \{/.test(editor) && /if \(options\.length > 3\) \{/.test(editor) && /"flex gap-1 p-1 bg-neutral-100 rounded-lg"/.test(editor))
  check("the slider is the black one, drawn from its own state and sending once a frame",
    /<Slider\s+value=\{\[shown\]\}/.test(slider) && /onValueCommit=\{\(\) => flush\(\)\}/.test(slider) && /className="wb-black-slider"/.test(slider) && /useFrameCommit\(onChange\)/.test(slider))
  check("the image box says Add Image, with a spinner over the picture while it uploads",
    />Add Image</.test(picker) && /Click to upload or drag &amp; drop/.test(picker) && /animate-spin/.test(picker) && !/MediaField|progressbar/.test(picker))
  /* A video file is uploaded or linked, and shown (controls/video-picker-control.tsx). */
  check("a video is uploaded or linked, and the box shows the video",
    /case "video_picker":\s*\n\s*return <VideoPickerControl/.test(read("components/website-builder/editor/controls/index.tsx")) &&
      /from\("store-builder-images"\)\.upload\(path, file/.test(read("components/website-builder/editor/controls/video-picker-control.tsx")) &&
      /<video src=\{text\}/.test(read("components/website-builder/editor/controls/video-picker-control.tsx")) &&
      !/placeholder="Paste video URL\.\.\."/.test(editor))
  check("the header's layouts are the preview row and its own panel of cards",
    /Header layout \(desktop\)/.test(editor) && /Choose header layout/.test(editor) && /Choose mobile header layout/.test(editor))
  check("rich text is the field's own editor", /contentEditable/.test(rich) && /wb-richtext/.test(rich) && !/RichTextEditor/.test(rich))
  check("the colour picker has no eyedropper and no ratio line", !/EyeDropper|Pipette|against/.test(chip) && /Don&apos;t apply any color/.test(chip))
  for (const gone of [
    "components/website-builder/editor/setting-controls.tsx",
    "components/website-builder/editor/header-layout-picker.tsx",
    "lib/website-builder/alt-pairing.ts",
  ]) check(`${gone} is gone with the rework`, !existsSync(join(process.cwd(), gone)))

  console.log("\nWhat the editor gained since is drawn with those controls")
  /*
    The new setting types, conditional settings and the header's new
    settings arrived on main after the rework, written against its controls.
    They are kept, in the controls that came back: the browser's own select,
    the fields listed one by one, the alt text as a field of its own.
  */
  check("the header's Menu on phones is the old select, under the phone layout's preview row",
    /\{mobilePreviewSummary\}[\s\S]{0,600}<WbSelect\s+label="Menu on phones"/.test(editor) && /onUpdateSetting\("mobile_menu_style", v\)/.test(editor))
  check("and Transparent on and the header's Links are the old select too",
    /<WbSelect\s+label="Transparent on"/.test(editor) && /<WbSelect\s+label="Links"/.test(editor))
  check("a section's settings are listed one by one, the ones whose visible_if holds, with its other settings beside them",
    /const visible = visibleFields\(schema\.fields, section\.settings\)/.test(editor) &&
      /<SiblingSettingsProvider settings=\{section\.settings\}>\s*<div className="px-3\.5 py-3\.5 space-y-3\.5">\s*\{clean\.map\(field => \(/.test(editor))
  check("and a block's the same way, its conditions reading the section's settings as well",
    /<SiblingSettingsProvider settings=\{block\.settings\}>\s*\{visibleFields\(def\?\.fields \?\? \[\], block\.settings, \{ fields: schema\.fields \?\? \[\], saved: section\.settings \}\)\.map\(\(field\) => \(/.test(editor))
  check("the newer controls are drawn by the controls folder first, and Insert shop data wraps every field",
    /const registered = renderRegisteredControl\(kind, field, raw, onChange\)/.test(editor) && /<DynamicSourceField field=\{props\.field\}[^>]*label=\{label\}>/.test(editor))
  {
    /* "On hover it flickers ... make it how Shopify displays that": scripts/check-dynamic-source.mjs measures it. */
    const dyn = read("components/website-builder/editor/controls/dynamic-source-field.tsx").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    check("Insert shop data is a square button at the end of the label row, named for a screen reader",
      /export const INSERT_LABEL = "Insert shop data"/.test(dyn) && /aria-label=\{INSERT_LABEL\}/.test(dyn) && /data-dynamic-label=""/.test(dyn) && /inline-flex h-\[22px\] w-\[22px\]/.test(dyn) && !/TooltipContent/.test(dyn) && /<Database /.test(dyn))
    /*
      A LITTLE DEPTH, AND A BACKGROUND OF ITS OWN. 26px now, one shade of the
      app's light-surface depth (components/ui/depth-button.ts): a hairline
      ring, a shade in its foot, one soft pixel under it, flat with the shade
      inside while it is pressed or open. `bg-white` is load-bearing beyond
      the look: globals.css clears :hover backgrounds inside the phone
      sheets, where a touch screen leaves :hover on the last thing tapped,
      and its opt-out is an element that sets its own background — without it
      the open state was erased under a thumb. Nothing may hide behind a
      `hover:shadow`, which that same block strips to none.
      scripts/check-dynamic-source.mjs measures all of it in a browser.
    */
    check("it wears a little of the app's light-surface depth, with a background of its own",
      /rounded-\[5px\] bg-white/.test(dyn) &&
        /shadow-\[inset_0_0_0_1px_rgba\(15,23,42,0\.08\),inset_0_-1px_0_rgba\(15,23,42,0\.06\),0_1px_1px_rgba\(15,23,42,0\.05\)\]/.test(dyn) &&
        /aria-expanded:shadow-\[inset_0_0_0_1px_rgba\(15,23,42,0\.10\),inset_0_1px_2px_rgba\(15,23,42,0\.12\)\]/.test(dyn) &&
        !/hover:shadow/.test(dyn) && /\[-webkit-tap-highlight-color:transparent\]/.test(dyn))
    check("and it says whether this setting reads the shop",
      /const connected = !!bound \|\| named\.length > 0/.test(dyn) && /data-connected=\{connected \? "" : undefined\}/.test(dyn))
    /* A number setting cannot hold "": the canvas would fall back to the default while the sidebar showed an empty box. */
    check("disconnecting a number puts a number back, not the empty string",
      /if \(target === "number"\) onChange\(typeof field\.default === "number" \? field\.default : 0\)/.test(dyn))
    check("and it is there at rest: nothing about it waits for a hover or fades",
      !/group-hover\/dyn|group-focus-within\/dyn|opacity-0|transition-opacity/.test(dyn))
    check("a connected field is a chip with the source's name and an x",
      /data-dynamic-bound=""/.test(dyn) && /aria-label=\{`Disconnect \$\{source\?\.label \?\? bound\}`\}/.test(dyn))
    check("sliders do not carry it", /const slider = kind === "range" && !bound/.test(dyn))
  }
  check("Theme settings' Menus is drawn by its own editor, without a second label, in both lists of groups",
    (editor.match(/field\.type === "header" \|\| field\.type === "paragraph" \|\| field\.type === "menus" \? \(/g) ?? []).length === 2)
  check("every panel the sidebar draws has the shop's facts for those controls",
    (editor.match(/<EditorFieldProvider value=\{fieldEnv\}>/g) ?? []).length === 2)

  console.log("\nA group in Theme settings opens and closes, rather than appearing")
  /*
    "Make sure that the theme settings, the tabs in the sidebar, open
    smoothly and close smoothly." Both lists of groups (the Theme tab and the
    Theme settings panel) are Collapses: the height moves from where it is to
    where it is going, so the groups under it move instead of jumping, and
    the content fades with it.
  */
  const groups = editor.match(/<Collapse open=\{expandedSettings === group\.id\}/g) ?? []
  check("both lists of groups open and close by height", groups.length === 2, groups.length)
  check("and each group says whether it is open, for the probe and a screen reader",
    (editor.match(/data-theme-group=\{group\.id\}/g) ?? []).length === 2 && (editor.match(/aria-expanded=\{expandedSettings === group\.id\}/g) ?? []).length === 2)
  check("about a quarter of a second open, a little less shut", COLLAPSE_OPEN_MS === 240 && COLLAPSE_CLOSE_MS === 200)
  check("on the iOS curve", /const EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(collapse))
  check("measured, from the height it has now: an interrupted open closes from where it got to",
    /const measured = el\.getBoundingClientRect\(\)\.height/.test(collapse) && /body\.getBoundingClientRect\(\)\.height/.test(collapse))
  /*
    Theme's Colors group is nearly 1,900px tall. On this curve a quarter of
    a second moves a quarter of any distance in its first frame, so only the
    part that can be seen is animated; the rest arrives or goes out of sight.
    scripts/check-sidebar-revert.mjs measured the biggest step the row under
    it takes in one frame: 761px before this, 245px after.
  */
  check("only what can be seen moves, and a close never makes the scroller pull its content down",
    /const \{ room, slack \} = onlyVisible \? visibleRoom\(el\)/.test(collapse) && /const target = Math\.min\(full, room\)/.test(collapse) &&
      /measured - Math\.min\(Math\.max\(0, measured - room\), slack\)/.test(collapse))
  check("and the clock starts once the frame that builds the group has been drawn, not with the press",
    /box\.pause\(\)/.test(collapse) && /content\.pause\(\)/.test(collapse) && /box\.startTime = now/.test(collapse) &&
      /if \(running\.current\[0\] !== box\) return/.test(collapse))
  check("the content fades with it", /\{ opacity: 0, transform: "translate3d\(0, -4px, 0\)" \}, \{ opacity: 1, transform: "none" \}/.test(collapse))
  check("and reduced motion gets the end state at once", /prefers-reduced-motion: reduce/.test(collapse) && /if \(reducedMotion\(\) \|\| Math\.abs\(target - from\) < 1\)/.test(collapse))
  check("a group left open is drawn open when Theme comes back, without its opening again", /if \(first\.current\) \{\s*first\.current = false\s*return/.test(collapse))
  check("the panels inside a group move the same way: Advanced colors, Page colors and each text style",
    /<Collapse open=\{customizeOpen\} onlyVisible>/.test(panels) && /<Collapse open=\{advancedOpen\} onlyVisible/.test(panels) && /<Collapse open=\{isOpen\} onlyVisible>/.test(panels))
  check("and every one of them in the sidebar moves only what is on screen",
    (editor.match(/<Collapse open=\{expandedSettings === group\.id\} onlyVisible /g) ?? []).length === 2 && (panels.match(/<Collapse [^>]*onlyVisible/g) ?? []).length === 3)
  check("while a Collapse elsewhere moves its whole height, as the Connections list expects when it scrolls a line into view",
    /onlyVisible = false/.test(collapse) && /onlyVisible \? visibleRoom\(el\) : \{ room: Infinity, slack: 0 \}/.test(collapse) &&
      !/onlyVisible/.test(read("components/website-builder/website-settings/connection-row.tsx")))
  check("and the old one frame fade is gone", !/animate-in fade-in slide-in-from-top-1/.test(editor) && !/themeGroupOpenedRef/.test(editor))

  console.log("\nThe library says where the section will go")
  const page = [
    { type: "header", name: "Header" },
    { type: "hero_centered", name: "Centered Hero" },
    { type: "features_grid", name: "Feature Grid" },
    { type: "footer", name: "Footer" },
  ]
  const name = (s: (typeof page)[number]) => s.name
  check("in a gap between two sections", whereItGoes(page, 2, name) === "Between Centered Hero and Feature Grid")
  check("above the first one", whereItGoes(page, 1, name) === "At the top, above Centered Hero")
  check("never above the header, as the editor never puts it there", whereItGoes(page, 0, name) === "At the top, above Centered Hero")
  check("and never below the footer", whereItGoes(page, 9, name) === "At the end, after Feature Grid")
  check("no gap chosen is the end of the page", whereItGoes(page, null, name) === "At the end, after Feature Grid")
  check("a page with only its header and footer is empty", whereItGoes([page[0], page[3]], 1, name) === "On the empty page" && whereItGoes<(typeof page)[number]>([], null, name) === "On the empty page")

  console.log("\nA new section is brought on screen, and only when it is not")
  check("its top already in view with room under it: no scroll", arrivalScrollTarget(300, 0, 800) === null)
  check("below the fold: scrolled to, a little under the top", arrivalScrollTarget(1500, 0, 800) === 1500 - 96)
  check("above the view: scrolled up to it", arrivalScrollTarget(100, 900, 800) === 100 - 96)
  check("its top in the last strip of the view counts as not in view", arrivalScrollTarget(740, 0, 800) !== null)
  check("a phone's sheet covering the foot of the canvas is not view", arrivalScrollTarget(600, 0, 800, 300) !== null && arrivalScrollTarget(600, 0, 800) === null)
  check("and it never scrolls above the top", arrivalScrollTarget(20, 400, 800) === 0)

  console.log("\nA preview's markup")
  check("every picture in it waits until it is near the screen", lazyImages('<div><img src="a.jpg"><IMG alt="" src="b.jpg"></div>') === '<div><img loading="lazy" decoding="async" src="a.jpg"><img loading="lazy" decoding="async" alt="" src="b.jpg"></div>')
  {
    const split = splitStyles('<style data-x>.a{color:red}</style><section class="a">Hi</section><style></style><style>.b{margin:0}</style>')
    check("its styles are taken out, the empty ones dropped", split.html === '<section class="a">Hi</section>' && split.css.join("|") === ".a{color:red}|.b{margin:0}", split)
  }
  check("and it is kept under its width and its sources", previewKey("hero", 0, 390, "") !== previewKey("hero", 0, 800, "") && previewKey("mine", 1, 800, "v2") === "mine:1:800:v2")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
