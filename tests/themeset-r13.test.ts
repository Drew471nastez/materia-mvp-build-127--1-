/**
 * ===========================================================================
 *  ROUND 13 THEMESET: TEN NEW FONTS, AND A SWATCH CHOICE SHOWN AT ONCE
 * ===========================================================================
 * 1. The owner: "add more fonts, more creative, more clean, more different:
 *    10 more". Fraunces, Newsreader, Bodoni Moda, Bricolage Grotesque,
 *    Geist, Manrope, Figtree, Fredoka, Geist Mono and Big Shoulders, in
 *    every font picker (Theme settings › Typography's three, a section's
 *    font setting, an imported theme's font settings, the OnePage Design
 *    tab's two), loaded the way the others are, and the picker's previews
 *    fetched only for the rows in view.
 * 2. The owner: "Variant swatches, swatch fill between colour and variant
 *    image, doesn't update in real time in the canvas". A choice (select,
 *    radio, checkbox) of an imported theme's settings is drawn at once: no
 *    wait for the changes to stop before the page is drawn again behind
 *    (a setting the theme's start-up script reads), and a section whose
 *    script reads a changed data- attribute is started again on the next
 *    frame, not 700ms later.
 *
 * Measured in a real browser by scripts/check-themeset-r13.mjs.
 *
 * Run with:  npx tsx tests/themeset-r13.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ACCENT_FONT_OPTIONS, BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/website-builder/font-options"
import { OFFERED_FAMILIES, fontStylesheetHref } from "@/lib/website-builder/font-link"
import { ONEPAGE_FONTS, fontStack, onePageFontHref } from "@/lib/onepage/fonts"
import { fontObject, fontLinks } from "@/lib/storelib-theme/compat/objects"
import { THEME_FONT_OPTIONS, fontHandle } from "@/components/website-builder/editor/controls/font-picker-control"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const NEW = ["Fraunces", "Newsreader", "Bodoni Moda", "Bricolage Grotesque", "Geist", "Manrope", "Figtree", "Fredoka", "Geist Mono", "Big Shoulders"]
const SERIF = ["Fraunces", "Newsreader", "Bodoni Moda"]

console.log("\nTen new families, in every picker\n")
{
  const values = (list: { value: unknown }[]) => list.map((o) => o.value)
  check("Theme settings › Typography: in the heading, body and accent lists", NEW.every((f) => values(HEADING_FONT_OPTIONS).includes(f) && values(BODY_FONT_OPTIONS).includes(f) && values(ACCENT_FONT_OPTIONS).includes(f)))
  check("  none of them was there before (ten more, not renamed ones)", HEADING_FONT_OPTIONS.length === 25 && BODY_FONT_OPTIONS.length === 19 && ACCENT_FONT_OPTIONS.length === 20, [HEADING_FONT_OPTIONS.length, BODY_FONT_OPTIONS.length, ACCENT_FONT_OPTIONS.length])
  check("  each list names a family once", [HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS, ACCENT_FONT_OPTIONS].every((l) => new Set(values(l)).size === l.length))
  check("a section's font setting offers them (THEME_FONT_OPTIONS, the offered families)", NEW.every((f) => OFFERED_FAMILIES.has(f) && THEME_FONT_OPTIONS.some((o) => o.value === f)))
  check("an imported theme's font setting offers them as handles, weight kept", fontHandle("Bodoni Moda", "n7") === "bodoni_moda_n7" && fontHandle("Big Shoulders", "i4") === "big_shoulders_i4")
  const design = code("components/onepage/tabs/design-tab.tsx")
  const bodyList = design.slice(design.indexOf("const FONTS = ["), design.indexOf("// Display fonts for Title customization"))
  const titleList = design.slice(design.indexOf("const TITLE_FONTS = ["), design.indexOf("const FONT_SAMPLE_HREF"))
  check("the OnePage Design tab: in the page font and the title font lists", NEW.every((f) => bodyList.includes(`name: "${f}"`) && titleList.includes(`name: "${f}"`)))
  check("  Geist Mono under a Mono kind of its own", /name: "Geist Mono", category: "mono"/.test(bodyList) && /\{ id: "mono", get label\(\) \{ return tt\("Mono"\) \} \}/.test(design))
}

console.log("\nLoaded the way the others are\n")
{
  const bad = NEW.filter((f) => fontStylesheetHref({ font_heading: f }) !== `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`)
  check("a website asks Google for each at 400 to 700 with swap, only when chosen", bad.length === 0 && fontStylesheetHref({ font_heading: "Inter" }) === null, bad)
  check("a OnePage has each on its allow-list, 400 to 700", NEW.every((f) => ONEPAGE_FONTS[f] === "400;500;600;700" && (onePageFontHref(f) ?? "").includes(`family=${f.replace(/ /g, "+")}:wght@400;500;600;700`)))
  check("  with the right generic family behind it while it loads", SERIF.every((f) => fontStack(f).endsWith("Georgia, serif")) && fontStack("Geist Mono").endsWith("monospace") && fontStack("Fredoka").endsWith("sans-serif"))
  const o = fontObject("bodoni_moda_n7")!
  check("an imported theme set to one: its font object names it, bold kept, serif behind it", o.family === "Bodoni Moda" && o.weight === "700" && o.fallback_families === "serif")
  check("  Geist Mono falls back to monospace", fontObject("geist_mono_n4")!.fallback_families === "monospace")
  const dm = fontObject("dm_sans_n4")!
  check("  a family with capitals in its name (DM Sans, EB Garamond) is asked for by its own name, not \"Dm Sans\"", dm.family === "DM Sans" && fontObject("eb_garamond_i4")!.family === "EB Garamond" && fontLinks([dm])[0].includes("family=DM+Sans:"), [dm.family, fontLinks([dm])])
  check("  a family of the theme's own keeps the name its handle spells", fontObject("work_sans_n4")!.family === "Work Sans")
}

console.log("\nThe picker stays light with thirty families\n")
{
  const picker = code("components/website-builder/editor/font-preview-picker.tsx")
  check("its previews ask for the regular weight every family has (500 dropped Lato and Bebas Neue)", /family=\$\{encodeURIComponent\(f\)\.replace\(\/%20\/g, "\+"\)\}`\)\.join\("&"\)/.test(picker) && !/wght@500/.test(picker))
  check("  cut to the letters drawn (text=), display swap", /&text=\$\{encodeURIComponent\(letters\)\}&display=swap/.test(picker))
  check("a row takes its face once near the list's edge and loaded, not on open", /new IntersectionObserver\(/.test(picker) && /\{ root: box, rootMargin: "120px 0px" \}/.test(picker) && /document\.fonts\.load\(/.test(picker) && /fontFamily: facesShown\.has\(o\.value\) \? faceOf\(o\.value\) : undefined/.test(picker))
  check("  faces arriving together redraw the list once a frame", /frame = requestAnimationFrame\(\(\) => \{/.test(picker) && /cancelAnimationFrame\(frame\)/.test(picker))
  check("  the new kinds are named beside their rows", /get Fredoka\(\) \{ return tt\("Rounded"\) \}/.test(picker) && /get "Geist Mono"\(\) \{ return tt\("Mono"\) \}/.test(picker) && /get "Big Shoulders"\(\) \{ return tt\("Condensed"\) \}/.test(picker))
}

console.log("\nA swatch choice in Theme settings shows at once (imported themes)\n")
{
  const canvas = code("components/website-builder/compat/compat-canvas.tsx")
  const bridge = code("lib/storelib-theme/compat/canvas-bridge.ts")
  check("a choice is a select, a radio, a checkbox (and a scheme, a font, an alignment)", /const DISCRETE_SETTINGS = new Set\(\["select", "radio", "checkbox", "color_scheme", "font_picker", "text_alignment"\]\)/.test(canvas))
  check("  read from the theme's schema for the one setting that changed, never under a finger", /const told = settingsBefore && !isLive\(\) \? oneChange\(settingsBefore, drawnWith\.current!\.settings\) : null/.test(canvas) && /const choice = !!told && DISCRETE_SETTINGS\.has\(String\(settingAt\(compatTheme\.settingsSchema, told\.path\)\?\.type \?\? ""\)\)/.test(canvas))
  check("a choice a start-up script reads draws the page behind now, not after the 400ms wait", /if \(plan\.scripts && !isLive\(\) && \(scriptsDue\.current \|\| choice\)\) \{/.test(canvas))
  check("  said to the page on screen first (storelib:settings-change), for a theme that applies it itself", /\(scriptsDue\.current \|\| choice\)\) \{\s*scriptsDue\.current = false\s*window\.clearTimeout\(scriptsTimer\.current\)\s*\/\*[^*]*\*\/\s*tell\(win, false\)\s*loadBehind\(html, docKey, list\)/.test(canvas))
  check("  typed words still wait for the changes to stop", /scriptsTimer\.current = window\.setTimeout\(settle, SCRIPTS_SETTLE_MS\)\s*\}/.test(canvas))
  check("a section swapped for a choice is told so", /type: "section", id: sw\.id, html: sw\.html, prev: now\.shape\.sections\.get\(sw\.id\), \.\.\.\(choice \? \{ now: true \} : \{\}\)/.test(canvas))
  /* Changed on purpose (countdown round): morph's and written's two timers are one now, restartLater (which starts a countdown's own element again in place, else swaps the section), and both call it while restartIn is still the change's. */
  check("  and the frame starts its scripts again on the next frame, not 700ms later", /restartIn = m\.now \? 0 : 700;/.test(bridge) && (bridge.match(/\}, restartIn\);/g) ?? []).length === 1 && /var restartLater = function \(id, html, els\) \{\s*clearTimeout\(settleTimers\[id\]\);\s*settleTimers\[id\] = setTimeout\(/.test(bridge) && /if \(ops\.restart\) restartLater\(id, html, /.test(bridge) && /if \(restart\) restartLater\(id, html, /.test(bridge) && !/\}, 700\);/.test(bridge))
  check("  put back for the next change", /if \(!done\) try \{ done = morph\(m\.id, m\.html, m\.prev\); \} catch \(err\) \{ done = false; \}\s*restartIn = 700;/.test(bridge))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
