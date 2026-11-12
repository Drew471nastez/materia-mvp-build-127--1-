/**
 * ===========================================================================
 *  ROUND 3 OF THE ONEPAGE DESIGN WORK: WEIGHTS, TIP STYLES, WORDS ON A FADE
 * ===========================================================================
 * The name's Heavy drew Bold's letters (no face above 700 was loaded) and a
 * face with one weight was smeared into a faux bold; the bio's weights are
 * Regular, Medium and Bold; a Storelib tips block has four styles and takes
 * its Layout tab's settings on its own card; an image block can lay each
 * picture's title, caption and button on a smooth fade in the page's colours.
 *
 * scripts/check-onepage-design-r3.mjs measures them in headless Chromium.
 *
 * Run: npx tsx tests/onepage-design-r3.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ONEPAGE_FONTS, fontWeightsOf, onePageFontHref, realWeight } from "@/lib/onepage/fonts"
import { BIO_WEIGHTS, bioTypeStyle, drawnTitleWeight, titleTypeStyle } from "@/lib/onepage/header-style"
import { nameStyleCss } from "@/lib/onepage/name-style"
import { TIP_STYLES, tipNext, tipStyleOf } from "@/lib/onepage/tips"
import { blockSurfaceOf } from "@/lib/onepage/block-presentation"
import { fadeColours, fadeGradient, imageStyleOf } from "@/lib/onepage/image-fade"
import { contrastOf } from "@/lib/onepage/name-style"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(t: string) {
  console.log(`\n${t}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

section("1. Every weight a face really has, and the nearest one drawn")
{
  check("every family lists weights from 400, lightest first, within 400 to 900", Object.keys(ONEPAGE_FONTS).every((f) => {
    const w = fontWeightsOf(f)!
    return w[0] === 400 && w.every((x, i) => x >= 400 && x <= 900 && x % 100 === 0 && (i === 0 || x > w[i - 1]))
  }))
  check("Heavy loads for the faces that have it (Inter, Playfair Display, Merriweather)", ["Inter", "Playfair Display", "Merriweather"].every((f) => (onePageFontHref(f) ?? "").includes(";800")))
  check("no face is asked for a weight it does not have (Lato 400, 700, 900; Crimson Text 400, 600, 700)", ONEPAGE_FONTS.Lato === "400;700;900" && ONEPAGE_FONTS["Crimson Text"] === "400;600;700")
  check("the nearest real weight: Lato's Heavy is its 900, its Medium its 400", realWeight("Lato", 800) === 900 && realWeight("Lato", 500) === 400)
  check("a tie goes to the heavier (Crimson Text's Medium is its 600)", realWeight("Crimson Text", 500) === 600)
  check("a face with one weight draws it for every option", [400, 500, 700, 800].every((w) => realWeight("Bebas Neue", w) === 400))
  check("a family not on the list is asked for the weight as it is", realWeight("Comic Sans MS", 800) === 800 && fontWeightsOf("Comic Sans MS") === null)
}

section("2. The name and the bio")
{
  check("nothing chosen on Inter writes no style (an old page's markup is unchanged)", Object.keys(titleTypeStyle({ font_family: "Inter" })).length === 0 && Object.keys(bioTypeStyle({ font_family: "Inter" })).length === 0)
  const heavy = titleTypeStyle({ font_family: "'Inter', sans-serif", title_weight: 800 })
  check("Heavy on Inter is 800, with synthesis off", heavy.fontWeight === 800 && heavy.fontSynthesisWeight === "none", JSON.stringify(heavy))
  check("Heavy on Lato is its 900", titleTypeStyle({ font_family: "'Lato', sans-serif", title_weight: 800 }).fontWeight === 900)
  check("the title font decides, not the page's", drawnTitleWeight({ font_family: "'Inter', sans-serif", title_font: "'Lato', sans-serif", title_weight: 800 }) === 900)
  const bebas = titleTypeStyle({ font_family: "'Inter', sans-serif", title_font: "'Bebas Neue', sans-serif" })
  check("a Bebas Neue name is drawn at its own 400, never a faux bold of it", bebas.fontWeight === 400 && bebas.fontSynthesisWeight === "none", JSON.stringify(bebas))
  check("the bio takes Bold, and keeps a Semibold saved before", (BIO_WEIGHTS as readonly number[]).includes(700) && bioTypeStyle({ font_family: "Inter", bio_weight: 700 }).fontWeight === 700 && bioTypeStyle({ font_family: "Inter", bio_weight: 600 }).fontWeight === 600)
  check("Spaced caps follow a chosen weight, and stay semibold otherwise", nameStyleCss("spaced", { font_family: "Inter", title_weight: 800 }).fontWeight === 800 && nameStyleCss("spaced", { font_family: "Inter" }).fontWeight === 600 && nameStyleCss("spaced", { font_family: "'Bebas Neue', sans-serif" }).fontWeight === 400)
  const design = read("components/onepage/tabs/design-tab.tsx")
  check("the bio offers Regular, Medium and Bold", /weights=\{\[\{ id: "400", label: tt\("Regular"\) \}, \{ id: "500", label: tt\("Medium"\) \}, \{ id: "700", label: tt\("Bold"\) \}\]\}/.test(design))
  check("the Design tab offers only the weights the face draws, and says so for a face with one", /realWeight\(family, Number\(w\.id\)\)/.test(design) && /tt\("This font has one weight"\)/.test(design) && /options=\{offered\}/.test(design))
}

section("3. The tips block")
{
  check("four styles, the card for every block saved before", TIP_STYLES.join() === "card,pills,button,amount" && tipStyleOf({}) === "card" && tipStyleOf({ tip_style: "pills" }) === "pills" && tipStyleOf({ tip_style: "nope" }) === "card")
  check("Big amount steps through the presets when visitors only pick one", tipNext(500, 1, [500, 1000, 2000], false, "usd") === 1000 && tipNext(2000, 1, [500, 1000, 2000], false, "usd") === 2000 && tipNext(500, -1, [500, 1000, 2000], false, "usd") === 500)
  check("and on the sheet's grid when they may choose", tipNext(1000, 1, [500], true, "usd") === 1100 && tipNext(2500, 1, [500], true, "usd") === 3000)
  const tips = (d: Record<string, unknown>) => ({ type: "app", data: { provider: "tips", ...d } }) as never
  check("a Storelib tips block draws its own card (no panel round it); a tip link and other blocks do not", blockSurfaceOf(tips({ tip_mode: "storelib" })) === "card" && blockSurfaceOf(tips({})) === "card" && blockSurfaceOf(tips({ url: "https://ko-fi.com/x" })) === "panel" && blockSurfaceOf({ type: "faq", data: {} } as never) === "panel" && blockSurfaceOf({ type: "link_button", data: {} } as never) === "own")
  const view = read("components/onepage/tip-block.tsx")
  check("each style drawn, marked for the probe", ['tipStyle === "pills"', 'tipStyle === "button"', 'tipStyle === "amount"'].every((s) => view.includes(s)) && /"data-tip-style": tipStyle/.test(view))
  check("the Layout tab's alignment, background, corners, shadow and padding are read on the card", /presentationOf\(block\)/.test(view) && /pres\.align/.test(view) && /pres\.background/.test(view) && /pres\.radius/.test(view) && /pres\.shadow/.test(view) && /pres\.padding/.test(view))
  check("the description's size reaches the tip's own line", /var\(--op-block-subtitle-size/.test(view))
  const editor = read("components/onepage/app-block-editor.tsx")
  check("a Storelib tips block's Layout shows its styles, not a tip link's layouts", /provider\.id === "tips" && tipModeOf\(data\) === "storelib" \? \(/.test(editor) && /<TipStylePicker data=\{data\} update=\{update\} \/>/.test(editor))
  const settings = read("components/onepage/block-settings.tsx")
  check("corners, shadow and padding are offered on it from the start", /const panel = blockSurfaceOf\(block\) === "panel"/.test(settings))
  const css = read("app/globals.css")
  check("the shared rules leave the tip card's own buttons alone", /\[data-block-padding\]:not\(\[data-block-surface="card"\]\) \.op-btn/.test(css) && /\[data-block-align="left"\]:not\(\[data-block-surface="card"\]\)/.test(css))
}

section("4. An image block's words on a fade")
{
  check("plain unless chosen", imageStyleOf({}) === "plain" && imageStyleOf({ image_style: "fade" }) === "fade")
  const light = fadeColours({ background_color: "#f6f4ef", text_color: "#1a1a2e" })
  check("a light page fades into its own colour, its words on it", light.ground === "#f6f4ef" && contrastOf(light.ink, light.ground) >= 4.5 && contrastOf(light.muted, light.ground) >= 4.5, JSON.stringify(light))
  const dark = fadeColours({ background_color: "#121216", text_color: "#f4efe9" })
  check("a dark page into its dark", dark.ground === "#121216" && contrastOf(dark.ink, dark.ground) >= 4.5)
  const mid = fadeColours({ background_color: "#7aa6b4", text_color: "#ffffff" })
  check("a mid-tone page under light words fades into black", mid.ground === "#000000" && contrastOf(mid.ink, mid.ground) >= 4.5)
  const gradient = fadeGradient("#ffffff", 56)
  check("the fade is many stops, clear to solid", (gradient.match(/color-mix/g) ?? []).length === 8 && /0%, transparent\) 0px/.test(gradient) && /#ffffff 100%\)$/.test(gradient))
  const page = read("components/onepage/public-onepage.tsx")
  check("one picture, a grid and a carousel all draw it", /<FadeWords/.test(page) && /fadeSizeFor\(shownAs/.test(page) && /arrowsHigh=\{faded\}/.test(page) && /\{!faded && data\.show_captions && img\.title/.test(page))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the editor: Text, Below or On the picture, and a caption and a button's words per picture", /\{ id: "fade", label: tt\("On the picture"\) \}/.test(tab) && /data-image-caption-input/.test(tab) && /data-image-button-input/.test(tab))
}

section("5. Words in every language")
{
  const words = ["This font has one weight", "Pills", "Big amount", "Below", "On the picture", "Title, caption and a button on a fade at the bottom of each picture."]
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    check(`${lang}: every new sentence`, words.every((w) => cat.includes(`${JSON.stringify(w)}:`)), words.filter((w) => !cat.includes(`${JSON.stringify(w)}:`)).join(", "))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
