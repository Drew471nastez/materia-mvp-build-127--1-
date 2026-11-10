/**
 * ===========================================================================
 *  WAVE 10 (legible): EVERY WORD READS, THE CREATOR'S DESIGN OVER A THEME, THE
 *  PRODUCT SHEET, THE SHARE SHEET, THE ROW'S TOOLS
 * ===========================================================================
 * The owner:
 *   1  "Ensure all the themes apply very well and there is no way across all of OnePage for errors like text not
 *      showing or getting hidden" (Messenger's newsletter white on white, Grunge's newsletter title invisible).
 *   2  "Themes should control things very well and allow customization in the design after applying."
 *   3  The product sheet on a phone: "display the product images there the best, keep the format square"; the Buy
 *      bar cut the Size row.
 *   4  The share sheet: "get rid of the cuts in the colours".
 *   5  "Too much horizontal space gap, inconsistent, between the analytics icon and the remove trash icon."
 *
 * In a browser, every theme in the picker × every block layout × the creator's own colours, judged on pixels:
 * scripts/check-onepage-legible-w10.mjs over scripts/render-onepage-legible-w10.tsx.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { contrast, gradientColors, haloOf, minimumFor, MIN_CONTRAST, MIN_CONTRAST_LARGE, nudgeOn, NUDGE_MARGIN, parseColor, readableOn, toHex } from "@/lib/onepage/legible"
import { SKIN_OWN_GROUPS, skinOwnOf, skinOwnRootProps, withSkinOwn } from "@/lib/onepage/skin-own"
import { LOOK_RESET, lookFromTemplate } from "@/lib/onepage/theme-apply"
import { shareBandBlend, shareBandTop } from "@/components/onepage/share-sheet"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const ratio = (a: string, b: string) => contrast(parseColor(a)!, parseColor(b)!)

console.log("\n1. The resolver: colours as a browser computes them")
{
  check("hex, short and with alpha", toHex(parseColor("#fff")!) === "#ffffff" && Math.abs(parseColor("#00000080")!.a - 0.5) < 0.01)
  check("rgb() and rgba(), commas or spaces", toHex(parseColor("rgb(13, 13, 13)")!) === "#0d0d0d" && parseColor("rgba(255, 255, 255, 0.72)")!.a === 0.72 && toHex(parseColor("rgb(1 2 3 / 50%)")!) === "#010203")
  check("color(srgb ...) (what color-mix computes to)", toHex(parseColor("color(srgb 0.878431 0.141176 0.368627 / 0.72)")!) === "#e0245e")
  check("oklch() (Tailwind's palette)", toHex(parseColor("oklch(1 0 0)")!) === "#ffffff" && toHex(parseColor("oklch(0 0 0)")!) === "#000000")
  check("transparent is no colour at all", parseColor("transparent")!.a === 0)
  check("a gradient's colours, in order", gradientColors("linear-gradient(180deg, rgb(255, 255, 255) 0%, rgba(0, 0, 0, 0) 50%, #3b9a2f 100%)").length === 3)
  check("4.5:1, and 3:1 for 24px or 18.66px bold", minimumFor(16, 400) === MIN_CONTRAST && minimumFor(24, 400) === MIN_CONTRAST_LARGE && minimumFor(19, 700) === MIN_CONTRAST_LARGE && minimumFor(19, 400) === MIN_CONTRAST)
  check("a text-shadow counts as an outline only when it is strong", !!haloOf("rgba(0, 0, 0, 0.45) 0px 1px 1px") && !haloOf("rgba(0, 0, 0, 0.1) 0px 1px 1px") && !haloOf("none"))
}

console.log("\n1. The resolver: respected while it reads, nudged when it does not")
{
  check("a colour that reads is kept exactly", readableOn("#ffffff", "#1e40af") === "#1e40af")
  const white = readableOn("#ffffff", "#ffffff")
  check("white words on a white window (the owner's Messenger) become a strong ink, not a grey that only just passes", ratio(white, "#ffffff") >= 7, white)
  const grunge = readableOn("#f4f3ee", "#f1efe8")
  check("Grunge's pale title on its paper card reads", ratio(grunge, "#f4f3ee") >= MIN_CONTRAST, grunge)
  const pink = readableOn("#ffffff", "#ff8fb1")
  const p = parseColor(pink)!
  check("a creator's pink that is too pale stays pink (only its lightness moves)", p.r > p.g && p.r > p.b && ratio(pink, "#ffffff") >= MIN_CONTRAST, pink)
  check("a colour that only just failed moves with room to spare", ratio(readableOn("#ffffff", "#8a8a8a"), "#ffffff") >= MIN_CONTRAST + NUDGE_MARGIN - 0.05)
  const onGradient = readableOn(["#0f2a55", "#e6effd"], "#7a7a7a")
  check("on a surface that is a gradient, it reads on every stop it can", Math.min(ratio(onGradient, "#0f2a55"), ratio(onGradient, "#e6effd")) >= 1, onGradient)
  check("large words need 3:1", ratio(readableOn("#000000", "#333333", { large: true }), "#000000") >= MIN_CONTRAST_LARGE)
  check("a surface it cannot read (a picture) leaves the colour as it is", readableOn("url(x.jpg)", "#ffffff") === "#ffffff")
  const ph = nudgeOn({ r: 0, g: 0, b: 0, a: 0.4 }, [parseColor("#ffffff")!])
  check("a see-through ink (a placeholder's) is made just strong enough, not solid black", ph.a < 1 && ph.a > 0.4 && contrast(ph, parseColor("#ffffff")!) >= MIN_CONTRAST, ph)
  check("nudgeOn never returns an unreadable colour while black or white can read", contrast(nudgeOn(parseColor("#777777")!, [parseColor("#777777")!]), parseColor("#777777")!) >= MIN_CONTRAST - 0.01)
}

console.log("\n1. The guarantee: on every live OnePage, its sheets too, whatever the theme")
{
  const guard = code("components/onepage/legible-guard.tsx")
  const live = code("components/onepage/public-onepage.tsx")
  const lib = code("lib/onepage/legible.ts")
  check("the live page (and the editor's preview, which is the live page in a frame) runs the guard", /<LegibleGuard \/>/.test(live))
  check("over the whole document, so a sheet in a portal is guarded too", /guardLegibility\(document\.body\)/.test(guard))
  check("before the first paint, and again on every change, on fonts, on a resize, when a sheet has risen", /useLayoutEffect/.test(guard) && /new MutationObserver\(\(records\)/.test(guard) && /document\.fonts\?\.ready/.test(guard) && /"resize"/.test(guard) && /"transitionend"/.test(guard) && /"animationend"/.test(guard))
  check("a block under content-visibility is measured as it comes into view, before it is painted", /"contentvisibilityautostatechange"/.test(guard) && /queueMicrotask/.test(guard) && /contentVisibilityAuto: true/.test(lib))
  check("motion is not a new look: only inline styles changing (a dot riding a scroll, a drag) is measured once it has rested", /r\.attributeName !== "style"\)\) soon\(\)\s*else settle\(\)/.test(guard) && /setTimeout\(soon, 250\)/.test(guard) && !/characterData/.test(guard))
  check("its own writes do not wake it (the observer is paused while it writes)", /observer\?\.disconnect\(\)[\s\S]{0,400}guardLegibility[\s\S]{0,200}takeRecords\(\)/.test(guard))
  check("it measures what is painted: backgrounds, gradients and their stops, down to the first opaque one", /function groundUnder/.test(lib) && /backgroundImage/.test(lib) && /backgroundColor/.test(lib) && /function linearStops/.test(lib))
  check("its colour wins over any skin rule (!important) and is taken back before the next measure", /setProperty\("color", toCss\(fixed\), "important"\)/.test(lib) && /releaseLegibility\(root\)\s*const found = findIllegible\(root\)/.test(lib))
  check("placeholders too (a rule, since an inline style cannot reach ::placeholder)", /::placeholder\{color:var\(/.test(lib) && /"::placeholder"/.test(lib))
  check("it knows no theme by name, so a theme added tomorrow is covered", !/aero|messenger|grunge|playful|y2k|aqua/i.test(lib.replace(/data-op-skin|data-skin-scene/g, "")))
  check("words on a photo are left to the photo's own darkening", /photo: true/.test(lib) && /if \(ground\.photo/.test(lib))
}

console.log("\n1. The browser check walks every theme in the picker, with the creator's own colours")
{
  const probe = read("scripts/check-onepage-legible-w10.mjs")
  const harness = read("scripts/render-onepage-legible-w10.tsx")
  check("the theme list is read from the picker (THEME_TEMPLATES), so another track's themes are walked too", /__themeIds = THEME_TEMPLATES\.map/.test(harness) && /globalThis\.__themeIds/.test(probe))
  check("every block layout, phone and computer", /\["list", "grid", "cards", "compact", "masonry"\]/.test(probe) && /1280/.test(probe) && /390/.test(probe))
  check("light words on a light theme, dark on a dark, an unreadable button: the creator's own colours", /\["light", "dark", "buttons"\]/.test(probe) && /o=light|override === "light"/.test(harness) && /button_color: "#e9e9e9"/.test(harness))
  check("the newsletter in every layout (Bold, the owner's two pages)", /\["bold", "pro", "cover", "minimal", "connect", "letter", "bar"\]/.test(harness))
  check("it judges pixels, not the guard's own sums: the page with its words cleared is the ground", /color:transparent !important/.test(probe) && /getImageData/.test(probe) && !/__legible\.findIllegible/.test(probe))
  check("the share sheet of every theme", /share=1/.test(probe))
}

console.log("\n2. The creator's design over a skinned theme")
{
  const skinned = { theme_skin: "grunge", button_color: "#f4f3ee" }
  const u = withSkinOwn(skinned, { button_color: "#e0245e" })
  check("a Design change on a skinned theme is remembered as the creator's own", Array.isArray(u.skin_own) && (u.skin_own as string[]).includes("button_colour"))
  check("grouped as the skin's rules are: colour, shape, shadow, border, social icons, words, typeface", ["button_colour", "button_shape", "button_shadow", "button_border", "socials", "text", "font"].every((g) => g in SKIN_OWN_GROUPS))
  check("each key in one group", withSkinOwn(skinned, { button_border_radius: 999 }).skin_own?.toString() === "button_shape" && withSkinOwn(skinned, { social_icon_style: "filled" }).skin_own?.toString() === "socials")
  check("without a skin nothing is recorded (there is nothing to win over)", !("skin_own" in withSkinOwn({ theme_skin: null }, { button_color: "#e0245e" })))
  check("the same value again records nothing", !("skin_own" in withSkinOwn(skinned, { button_color: "#f4f3ee" })))
  check("only known groups are read back, and only on a skinned theme", skinOwnOf({ theme_skin: "aero", skin_own: ["socials", "nope"] }).join() === "socials" && skinOwnOf({ theme_skin: null, skin_own: ["socials"] }).length === 0)
  check("the page's root names them", skinOwnRootProps({ theme_skin: "aero", skin_own: ["socials", "font"] })["data-sk-own"] === "socials font" && !("data-sk-own" in skinOwnRootProps({ theme_skin: "aero" })))
  check("picking a theme starts over", LOOK_RESET.skin_own === null)
  const page = { theme: { theme_skin: "aero", skin_own: ["button_colour"] }, settings: {}, draft_blocks: [] } as never
  check("lookFromTemplate clears it", (lookFromTemplate(page, { id: "x", theme_config: { theme_skin: "grunge" } }).theme as unknown as { skin_own: unknown }).skin_own === null)
  const ctx = code("lib/onepage/context.tsx")
  check("every Design change goes through it (the editor's one updateTheme)", /const own = withSkinOwn\(prev\.theme[\s\S]{0,120}theme: \{ \.\.\.prev\.theme, \.\.\.own \}/.test(ctx))
  const lib = code("lib/onepage/skin-own.ts")
  check("on the page the renderer's own values for those groups are raised over the skin's !important", /h\.style\.setProperty\(p, v, "important"\)/.test(lib) && /\[data-op-skin\]\[data-sk-own\]/.test(lib))
  check("a skin's torn-paper shape gives way to the creator's corners", /button_shape:[\s\S]{0,200}"clip-path": "none"/.test(lib))
  check("it runs before the words are measured", /honourOwnStyles\(document\.body\)\s*guardLegibility\(document\.body\)/.test(code("components/onepage/legible-guard.tsx")))
  check("both of the live page's roots carry the groups", (code("components/onepage/public-onepage.tsx").match(/\{\.\.\.skinOwnRootProps\(safeTheme\)\}/g) || []).length === 2)
}

console.log("\n3. The product sheet")
{
  const sheet = code("components/onepage/product-sheet.tsx")
  check("the gallery stays square", /const ratio = SHEET_GALLERY_RATIO/.test(sheet) && /aspectRatio:String\(ratio\)/.test(sheet))
  check("no hard line across the words over the Buy bar: a soft fade of the sheet's own surface", !/shrink-0 border-t border-\[#f0f0f3\] bg-white/.test(sheet) && /before:bg-gradient-to-t before:from-\[color-mix\(in_srgb,var\(--opk-surface,#ffffff\)_88%,transparent\)\]/.test(sheet))
  check("the words end with room to clear that fade, and the bar keeps the home indicator clear", /space-y-3 px-5 pb-8 pt-4 sm:px-6/.test(sheet) && /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/.test(sheet))
  check("thumbnails: square, a fifth of the gallery (72px at most), centred while they fit, a strip that scrolls beyond", /aspect-square w-\[calc\(\(100%-32px\)\/5\)\] max-w-\[72px\] shrink-0/.test(sheet) && /first:ml-auto last:mr-auto/.test(sheet) && /overflow-x-auto/.test(sheet))
  check("a video's thumbnail: its still with a small play mark in the corner, or the sheet's tone with it in the middle", /still \? "bottom-1 left-1" : "inset-0"/.test(sheet) && /data-product-sheet-thumb-video/.test(sheet))
}

console.log("\n4. The share sheet: one surface, no seams")
{
  check("the band's last 48px melt into the sheet's surface", shareBandBlend("#123456") === "linear-gradient(180deg, transparent calc(100% - 48px), var(--sheet-bg, #ffffff) 100%), #123456")
  check("the grip's strip wears the band's first colour, not a squeezed copy of its gradient", shareBandTop("linear-gradient(180deg, #d4e3fb 0%, #ffffff 100%)") === "#d4e3fb" && shareBandTop("#0f2a55") === "#0f2a55")
  const share = code("components/onepage/share-sheet.tsx")
  check("the words sit above the blend (56px of band under them)", /pb-14 pt-5 text-center/.test(share) && /background: shareBandBlend\(band\)/.test(share) && /phoneTop=\{shareBandTop\(band\)\}/.test(share))
  check("each target's name on one line", /whitespace-nowrap text-\[11px\]/.test(share))
  const dialog = code("components/onepage/onepage-dialog.tsx")
  check("the phone sheet is the body's own surface to its bottom edge, safe area too (no white strip)", /className=\{dark \? "bg-\[var\(--opk-surface,#18181c\)\]" : "bg-\[var\(--opk-surface,#ffffff\)\]"\}/.test(dialog))
}

console.log("\n5. The row's tools: one gap between every mark")
{
  const tab = code("components/onepage/tabs/links-tab.tsx")
  const remove = code("components/onepage/block-remove.tsx")
  check("every key 28px with its icon centred", /className="flex h-8 w-7 shrink-0 flex-row-reverse items-center justify-center/.test(tab) && /compact \? "h-7 w-7" : "h-8 w-7"/.test(remove))
  check("the numbers end on their icon (the count to its left), so the gap to the bin is the cluster's own", /flex-row-reverse[^"]*sm:w-14 sm:justify-start sm:pl-0/.test(tab))
  check("the switch carries the same room each side (8px before the more dots, whose glyph sits 2px inside its box)", /<span className="flex shrink-0 pl-1\.5 pr-2" data-row-slot="switch"><BlockToggle/.test(tab))
  check("one tight gap in the cluster, phone and computer", /className="-mr-1 flex shrink-0 items-center gap-0 sm:gap-0\.5" data-row-tools=""/.test(tab))
  check("the empty slots keep the same widths, so the columns line up", /block h-8 w-7 shrink-0 sm:w-14" data-row-slot="stats"/.test(tab) && /block h-8 w-7 shrink-0" data-row-slot="menu"/.test(tab) && /block h-8 w-7 shrink-0" data-row-slot="delete"/.test(remove))
}

check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes("tests/onepage-legible-w10.test.ts"))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
