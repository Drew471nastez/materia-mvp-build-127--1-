/**
 * ===========================================================================
 *  ROUND AR5: READABLE WORDS, ONE LOOK FOR EVERY BLOCK, THEMES THAT DIFFER,
 *  WALLPAPER EFFECTS
 * ===========================================================================
 *   CONTRAST   lib/onepage/contrast: the maths (WCAG luminance and ratio,
 *              colours of every form, gradients, see-through layers), the
 *              fallback (a colour that reads is kept, one that does not is
 *              moved just far enough, keeping its hue), and every theme x
 *              every button style x the overrides that broke pages, all
 *              readable after readableTheme.
 *   PARITY     the setting-to-style mapping is the same for the preview and
 *              the live page: both build the page through public-shape and
 *              draw it through public-onepage, which reads the theme through
 *              readableTheme and wallpaperMediaLook once.
 *   WALLPAPER  wallpaperMediaLook's CSS for each effect, on a photo and a
 *              video, with the tint and the blur; nothing per frame.
 *   THEMES     no two themes share a structure; the cards and the
 *              onboarding draw and apply them as the page does.
 *
 * The browser half: scripts/check-onepage-contrast-ar5.mjs (every text node
 * of every theme x style x override), scripts/check-onepage-settings-ar5.mjs
 * (every Design tab setting, preview against live), and
 * scripts/check-onepage-gallery-ar5.mjs (the theme gallery and the effects at
 * 390 and 1440).
 *
 * Run with:  npx tsx tests/onepage-ar5.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LARGE_MIN,
  SMALL_PRINT_ALPHA,
  TEXT_MIN,
  buttonGrounds,
  gradientColors,
  inkOn,
  pageGrounds,
  parseColor,
  ratioOf,
  readableInk,
  readableTheme,
  smallPrintAlpha,
  worstContrast,
  photoVeil,
  over,
  chipColors,
  tintGrounds,
  signupCard,
} from "@/lib/onepage/contrast"
import { WALLPAPER_EFFECTS, pixelThroughLook, wallpaperMediaLook } from "@/lib/onepage/wallpaper"
import { LOOK_RESET, lookFromTemplate, readableOn } from "@/lib/onepage/theme-apply"
import { buttonHoverVars, buttonThemeOn, onCardButtonTheme, themeButtonStripFill } from "@/lib/onepage/button-style"
import { publicOnePage, publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const c = (s: string) => parseColor(s)!
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps
/** A colour's hue in degrees, or null for a grey. */
function hsvHue(hex: string): number | null {
  const { r, g, b } = parseColor(hex)!
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 1) return null
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

console.log("\nThe maths")
check("black on white is 21:1", near(ratioOf(c("#000"), c("#fff")), 21))
check("#767676 on white is the 4.5:1 grey", near(ratioOf(c("#767676"), c("#ffffff")), 4.54, 0.02))
check("#777777 on white is just under", ratioOf(c("#777777"), c("#ffffff")) < 4.5)
check("every colour form is read", ["#abc", "#aabbcc", "#aabbcc80", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)", "rgb(1 2 3 / 50%)", "transparent"].every((x) => parseColor(x) !== null))
check("a name or a gradient is not a colour", parseColor("red") === null && parseColor("linear-gradient(red, blue)") === null)
check("a see-through colour is read over its ground", near(worstContrast(c("#00000080"), [c("#ffffff")]), ratioOf(c("#7f7f7f"), c("#ffffff")), 0.01))
check("a gradient counts as each of its colours", gradientColors("linear-gradient(180deg, #ab5036 0%, rgba(0,0,0,.5) 55%, #5e2617 100%)").length === 3)
check("a gradient page is read on every stop", pageGrounds({ background_type: "gradient", background_color: "#fff", background_gradient: "linear-gradient(#000 0%, #fff 100%)" }).length === 2)
check("a tinted photo page counts its tint", (() => {
  const g = pageGrounds({ background_type: "image", background_color: "#ffffff", wallpaper_tint: "#000000", wallpaper_tint_strength: 50 })[0]
  return near(g.r, 127.5, 1)
})())

console.log("\nThe fallback")
check("a colour that reads is kept exactly", readableInk("#1e40af", [c("#ffffff")]) === "#1e40af")
const rescued = readableInk("#ffffff", [c("#ffffff")])
check("white on white is rescued, and reads", worstContrast(c(rescued), [c("#ffffff")]) >= TEXT_MIN, rescued)
check("its small print reads too", worstContrast({ ...c(rescued), a: SMALL_PRINT_ALPHA }, [c("#ffffff")]) >= TEXT_MIN, rescued)
const blue = readableInk("#a9c4ff", [c("#ffffff")])
check("a pale blue on white becomes a deeper blue, not black", hsvHue(blue) !== null && Math.abs((hsvHue(blue) as number) - (hsvHue("#a9c4ff") as number)) < 12 && blue !== "#111113", blue)
check("on a mid-tone ground the better of black and white is chosen", ["#111113", "#ffffff"].includes(readableInk("#888888", [c("#777777")])))
check("large text only needs 3:1", readableInk("#949494", [c("#ffffff")], LARGE_MIN) === "#949494")
check("a block's own pick wins when it reads", inkOn("#111111", "#ffffff", "#f5d0a9") === "#f5d0a9")
check("a block's own pick that vanishes is rescued", worstContrast(c(inkOn("#111111", "#ffffff", "#141414")), [c("#111111")]) >= TEXT_MIN)
check("readableOn's bar is 4.5:1 (changed on purpose, round AR)", readableOn("#ffffff", "#8a8a8a") === "#111827")
check("a hover fill with no words gets words that read on it", (() => {
  const v = buttonHoverVars({ button_style: "filled", button_color: "#000", button_text_color: "#fff", button_hover_fill: "#f0a24a" }) as Record<string, string>
  return worstContrast(c(v["--op-fill-text"]), [c("#f0a24a")]) >= TEXT_MIN
})())

console.log("\nWhat a button's words sit on")
const page = { background_type: "solid", background_color: "#ffffff", button_color: "#1a1a2e" }
check("Solid: the fill", buttonGrounds({ ...page, button_style: "filled" }).length === 1 && buttonGrounds({ ...page, button_style: "filled" })[0].r === 26)
check("Outline: the page", buttonGrounds({ ...page, button_style: "outline" })[0].r === 255)
check("Soft: a 14% tint over the page", near(buttonGrounds({ ...page, button_style: "soft" })[0].r, 255 * 0.86 + 26 * 0.14, 1))
check("Glass: frosted white over the page", near(buttonGrounds({ ...page, background_color: "#000000", button_style: "glass" })[0].r, 255 * 0.15, 1))

console.log("\nEvery theme x every button style x the overrides that broke pages")
const STYLES = [undefined, "filled", "soft", "outline", "glass"] as const
type T = Record<string, any>
const OVERRIDES: [string, (t: T) => T][] = [
  ["none", () => ({})],
  ["same ink", (t) => ({ button_text_color: t.button_color, text_color: t.background_color, secondary_text_color: t.background_color, title_color: t.background_color, button_hover_text: t.button_hover_fill ?? null })],
  ["pale", () => ({ button_color: "#fff3a6", button_text_color: "#ffffff", text_color: "#fafafa", secondary_text_color: "#f1f1f1", title_color: "#ffffff" })],
  ["dark", () => ({ background_type: "solid", background_gradient: "", background_color: "#0d0d0f", text_color: "#151517", secondary_text_color: "#202024", title_color: "#18181b", button_color: "#1a1a1d", button_text_color: "#111113" })],
]
let cases = 0
let pairs = 0
const under: string[] = []
const best = (grounds: ReturnType<typeof pageGrounds>) => Math.max(worstContrast(c("#111113"), grounds), worstContrast(c("#ffffff"), grounds))
for (const tpl of THEME_TEMPLATES) {
  for (const style of STYLES) {
    for (const [name, make] of OVERRIDES) {
      const base: T = { ...tpl.theme_config, ...(style ? { button_style: style } : {}) }
      const t = readableTheme({ ...base, ...make(base) })
      cases++
      const g = pageGrounds(t)
      const bg = buttonGrounds(t, g)
      const need = (grounds: typeof g, min: number) => Math.min(min, best(grounds))
      const items: [string, unknown, typeof g, number][] = [
        ["text", t.text_color, g, TEXT_MIN],
        ["small print colour", t.secondary_text_color, g, TEXT_MIN],
        ["title", t.title_color, g, TEXT_MIN],
        ["button words", t.button_text_color, bg, TEXT_MIN],
        ["social marks", t.social_icon_color, g, LARGE_MIN],
      ]
      for (const [what, ink, on, min] of items) {
        if (!ink) continue
        pairs++
        const r = worstContrast(c(String(ink)), on)
        if (r < need(on, min) - 0.01) under.push(`${tpl.id}/${style ?? "theme"}/${name}: ${what} ${ink} at ${r.toFixed(2)}`)
      }
      if ((t.button_hover_animation === "fill" || t.button_hover_animation === "pop") && t.button_hover_fill && t.button_hover_text) {
        pairs++
        const r = worstContrast(c(t.button_hover_text), [c(t.button_hover_fill)])
        if (r < TEXT_MIN - 0.01) under.push(`${tpl.id}/${style ?? "theme"}/${name}: hover words at ${r.toFixed(2)}`)
      }
    }
  }
}
check(`${THEME_TEMPLATES.length} themes x ${STYLES.length} button styles x ${OVERRIDES.length} overrides (${cases} pages, ${pairs} colour pairs): none under the bar`, under.length === 0, under.slice(0, 5).join("; "))
check("a theme that already reads is returned as it was (no new object)", (() => {
  const t = { background_type: "solid", background_color: "#ffffff", text_color: "#111111", button_style: "filled", button_color: "#111111", button_text_color: "#ffffff" }
  return readableTheme(t) === t
})())
check("every theme's own colours are kept where they read (Default, Air, Swiss, Ledger untouched)", ["default", "air", "swiss", "ledger"].every((id) => {
  const tc = THEME_TEMPLATES.find((x) => x.id === id)!.theme_config as T
  const r = readableTheme(tc) as T
  return r.text_color === tc.text_color && r.button_text_color === tc.button_text_color
}))
check("the small print alpha is between 0.6 and 1 for every theme", THEME_TEMPLATES.every((t) => { const a = smallPrintAlpha(readableTheme(t.theme_config as T)); return a >= 0.6 && a <= 1 }))
check("Sunset's terracotta lifts its small print", smallPrintAlpha(readableTheme(THEME_TEMPLATES.find((t) => t.id === "sunset")!.theme_config as T)) > 0.6)
check("a white page keeps the faintest small print", smallPrintAlpha({ background_type: "solid", background_color: "#ffffff", text_color: "#111111", button_color: "#111111", button_text_color: "#ffffff" }) === 0.6)

console.log("\nOne place, read by the preview and the live page")
const pub = read("components/onepage/public-onepage.tsx")
check("the page reads its theme through readableTheme", /const safeTheme = readableTheme\(mergedTheme\)/.test(pub))
check("the page writes its small print floor", /\["--op-small-print" as string\]: smallPrint/.test(pub) && (pub.match(/--op-small-print/g) ?? []).length >= 2)
const css = read("app/globals.css")
check("the small print classes are lifted to it, never below their own value", /\.onepage-live \.opacity-70 \{ opacity: max\(0\.7, var\(--op-small-print, 0\)\); \}/.test(css) && /\.onepage-live \.opacity-60 \{ opacity: max\(0\.6,/.test(css))
check("the legal links are in the page's own small print colour, not a fixed grey", pub.includes("<OnePageLegalLinks dark={isDarkBackground} color={safeTheme.secondary_text_color || safeTheme.text_color} />"))
check("the preview frame draws the same component", /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx")))
const row = { id: "p", slug: "s", title: "T", theme: { background_color: "#fff", wallpaper_effect: "duotone", wallpaper_tint: "#123456", button_style: "soft" }, published_theme: null, draft_blocks: [], settings: {} }
const fromDraft = publicOnePageFromDraft(row as never).theme
const fromLive = publicOnePage({ ...row, published_theme: row.theme } as never, { source: "published" }).theme
check("the draft and the published copy hand the page the same theme, every setting with it", JSON.stringify(fromDraft) === JSON.stringify(fromLive))
check("the theme cards draw the colours the page draws", /const c = readableTheme\(given\)/.test(read("components/onepage/themes/theme-preview.tsx")))
for (const k of ["wallpaper_effect", "wallpaper_blur", "wallpaper_tint", "wallpaper_tint_strength"]) check(`picking a theme resets ${k}`, k in LOOK_RESET)

console.log("\nEvery block's buttons are the page's buttons")
const app = read("components/onepage/app-block.tsx")
/* Changed on purpose (round AR): CardButton reads the one rule for a button on a card, onCardButtonTheme (lib/onepage/button-style), which is cardButtonTheme with the card's own surface. */
check("an app block's button is the page's button, made to read on its card", /function CardButton[\s\S]{0,900}onCardButtonTheme\(look\.theme\)[\s\S]{0,200}pressableProps\(theme, look\.still\)/.test(app) && /const out = cardButtonTheme\(theme, \{ surface, cardText: theme\.button_text_color as string \}\)/.test(read("lib/onepage/button-style.ts")) /* Changed on purpose (round AR, Classic 98): it falls back to a solid button where no words read. */)
check("it carries the page's hover", /"data-hover": press\["data-hover"\]/.test(app) && /cn\(press\.className,/.test(app))
check("it no longer turns the card's colours round by hand", !/background: ink, color: paper/.test(app))

console.log("\nWallpaper effects")
const IMG = { background_type: "image", image_brightness: 80 }
check("six effects", WALLPAPER_EFFECTS.join(",") === "none,mono,blur,halftone,grain,duotone")
check("none: brightness only, no layers", (() => { const l = wallpaperMediaLook(IMG, "image"); return l.filter === "brightness(80%)" && l.layers.length === 0 && l.scale === 1 })())
check("an old page's image blur still blurs", wallpaperMediaLook({ ...IMG, image_blur: 6 }, "image").filter === "brightness(80%) blur(6px)")
check("a video ignores the image's blur", wallpaperMediaLook({ ...IMG, image_blur: 6, video_brightness: 70 }, "video").filter === "brightness(70%)")
check("mono is greyscale", /grayscale\(1\)/.test(wallpaperMediaLook({ wallpaper_effect: "mono" }, "video").filter))
check("blur is its amount, scaled past its soft edge", (() => { const l = wallpaperMediaLook({ wallpaper_effect: "blur", wallpaper_blur: 20 }, "video"); return /blur\(20px\)/.test(l.filter) && l.scale > 1.2 })())
check("blur's default is 12px and it stops at 40", /blur\(12px\)/.test(wallpaperMediaLook({ wallpaper_effect: "blur" }, "image").filter) && /blur\(40px\)/.test(wallpaperMediaLook({ wallpaper_effect: "blur", wallpaper_blur: 99 }, "image").filter))
check("halftone is a dot screen over high contrast grey", (() => { const l = wallpaperMediaLook({ wallpaper_effect: "halftone" }, "image"); return /contrast\(1\.4\)/.test(l.filter) && l.layers[0]?.key === "halftone" && /radial-gradient/.test(String(l.layers[0].style.backgroundImage)) && l.layers[0].style.mixBlendMode === "multiply" })())
check("grain is the noise layer in overlay", (() => { const l = wallpaperMediaLook({ wallpaper_effect: "grain" }, "video"); return l.layers[0]?.key === "grain" && l.layers[0].style.mixBlendMode === "overlay" })())
check("duotone is a multiply and a screen layer in the tint", (() => {
  const l = wallpaperMediaLook({ wallpaper_effect: "duotone", wallpaper_tint: "#0c3b35" }, "image")
  return l.layers.map((x) => `${x.key}:${x.style.mixBlendMode}`).join(",") === "duotone-light:multiply,duotone-dark:screen" && l.layers[1].style.background === "#0c3b35" && l.layers[1].style.opacity === 1
})())
check("a tint is a flat colour at its strength, over any effect but duotone", (() => {
  const l = wallpaperMediaLook({ wallpaper_effect: "mono", wallpaper_tint: "#d42d17", wallpaper_tint_strength: 40 }, "video")
  return l.layers.length === 1 && l.layers[0].key === "tint" && l.layers[0].style.opacity === 0.4
})())
check("a tint at 0 draws nothing", wallpaperMediaLook({ wallpaper_tint: "#d42d17", wallpaper_tint_strength: 0 }, "image").layers.length === 0)
check("a hand edited tint cannot reach a stylesheet", wallpaperMediaLook({ wallpaper_tint: "red;}body{x", wallpaper_tint_strength: 50 }, "image").layers.length === 0)
check("the desktop surround adds its own 20px", /blur\(20px\)/.test(wallpaperMediaLook({}, "video", 20).filter))
const layers = read("components/onepage/wallpaper-layers.tsx")
const effectsFn = layers.slice(layers.indexOf("export function WallpaperEffectLayers"), layers.indexOf("THE PICTURE'S OWN DARK AND LIGHT"))
check("the layers are plain elements: no effect, no frame loop", effectsFn.length > 0 && !/use(Effect|LayoutEffect|State)|requestAnimationFrame/.test(effectsFn))
check("the photo and the video, on the phone, in the desktop card and around it, take the look", (pub.match(/filter: imageLook\.filter/g) ?? []).length === 3 && (pub.match(/filter: videoLook\.filter/g) ?? []).length === 2 && (pub.match(/filter: surroundLook\.filter/g) ?? []).length === 2 && (pub.match(/<WallpaperEffectLayers/g) ?? []).length === 6)
const design = read("components/onepage/tabs/design-tab.tsx")
check("the Design tab offers the effects for a photo and for a video", /<WallpaperEffects theme=\{theme as any\} kind="image"/.test(design) && /<WallpaperEffects theme=\{theme as any\} kind="video"/.test(design))
check("the Design tab's own picture and video show the effect", /filter: imageLook\.filter/.test(design) && /filter: videoLook\.filter/.test(design))
const fx = read("components/onepage/themes/wallpaper-effects.tsx")
check("each effect tile is drawn by the page's own function", /wallpaperMediaLook\(sample, kind\)/.test(fx) && /<WallpaperEffectLayers look=\{look\}/.test(fx))

console.log("\nA picture that would hide the words is veiled, just enough")
const fog = { dark: c("#9fb4b0"), light: c("#f4f6f5") }
const photoPage = { background_type: "image", background_color: "#22301f", text_color: "#ffffff", button_style: "glass", button_color: "#ffffff", button_text_color: "#ffffff" }
const v = photoVeil(photoPage, fog)
check("white words on white fog get a dark veil", v.alpha > 0 && v.color === "#22301f", JSON.stringify(v))
check("which makes them read on both ends of the picture", (() => {
  const page = [fog.dark, fog.light].map((g) => over({ ...c(v.color), a: v.alpha }, g))
  return worstContrast(c("#ffffff"), page) >= TEXT_MIN && worstContrast(c("#ffffff"), buttonGrounds(photoPage, page)) >= TEXT_MIN
})())
check("no veil where the picture already reads", photoVeil(photoPage, { dark: c("#101410"), light: c("#3a4a3a") }).alpha === 0)
check("no veil before the picture is read, or on a page with no picture", photoVeil(photoPage, null).alpha === 0 && photoVeil({ ...photoPage, background_type: "solid" }, fog).alpha === 0)
check("dark words on a dark photo get a light veil", photoVeil({ ...photoPage, text_color: "#111111", button_text_color: "#111111", background_color: "#101010" }, { dark: c("#050505"), light: c("#404040") }).color === "#ffffff")
check("the brightness is counted before the veil", pixelThroughLook({ r: 240, g: 240, b: 240 }, { image_brightness: 50 }, "image").r === 120)
check("mono is counted as grey", (() => { const p = pixelThroughLook({ r: 255, g: 0, b: 0 }, { wallpaper_effect: "mono" }, "image"); return p.r === p.g && p.g === p.b })())
check("the page reads its picture once and lays the veil with the effect", /usePictureEnds\(pictureSrc\)/.test(pub) && /withVeil\(wallpaperMediaLook\(safeTheme, "image"\), veil\)/.test(pub))
check("the picture is read from a small canvas, once per address", /const sampled = new Map/.test(layers) && /canvas\.width = w/.test(layers))

console.log("\nThemes that differ")
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  /* Changed on purpose (round AR, after W9): a skin (lib/onepage/theme-skin: its material and the scene behind the page) is part of a theme's structure. */
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, (t as { theme_skin?: string | null }).theme_skin || "-"].join("|")
}
const seen = new Map<string, string>()
const twins: string[] = []
for (const t of THEME_TEMPLATES) {
  const s = sig(t.theme_config as T)
  if (seen.has(s)) twins.push(`${seen.get(s)} = ${t.id}`)
  else seen.set(s, t.id)
}
check(`no two of the ${THEME_TEMPLATES.length} themes share a structure (header, cover, layout, products, alignment, button, corners, skin)`, twins.length === 0, twins.join("; "))
const kinds = (k: (t: T) => boolean) => THEME_TEMPLATES.filter((t) => k(t.theme_config as T)).length
/* Editorial, one of the four with a cover, was retired (lib/onepage/retired-themes). */
check("some open on a full-bleed Hero, some on a cover picture", kinds((t) => t.header_layout === "hero") >= 5 && kinds((t) => !!t.cover_image_url) >= 3)
check("every links layout is used by three themes or more", ["grid", "cards", "compact", "masonry"].every((l) => kinds((t) => t.block_layout === l) >= 3))
check("products as tiles and as rows, each in four themes or more", kinds((t) => t.product_layout === "grid") >= 4 && kinds((t) => t.product_layout === "rows") >= 4)
check("a Hero theme names its Hero", THEME_TEMPLATES.filter((t) => (t.theme_config as T).header_layout === "hero").every((t) => (t as T).profile_layout === "hero"))
check("a Hero the last theme set is taken back by a Classic theme", design.includes('(currentHeaderLayout !== "hero" || heroFromTheme)'))
const folio = THEME_TEMPLATES.find((t) => t.id === "folio")!
const own = { id: "p", theme: { ...folio.theme_config, template_id: "folio", cover_image_url: "https://cdn.example.com/mine.jpg" }, settings: {}, draft_blocks: [] }
check("a cover the creator chose stays through a theme change", (lookFromTemplate(own as never, THEME_TEMPLATES.find((t) => t.id === "air") as never, undefined, folio as never).theme as T).cover_image_url === "https://cdn.example.com/mine.jpg")
const onboarding = read("components/onepage/onboarding-modal.tsx")
check("the onboarding lays a theme on as the Design tab does", /applyThemeLook\(template as never, hero \? "hero" : "classic"/.test(onboarding) && !/\.\.\.template\.theme_config,\n\s*template_id: template\.id,/.test(onboarding))

console.log("\nRound AR7: the signup, the chips and the cards' own buttons read and take the page's button")
{
  const styles = ["filled", "soft", "outline", "glass"] as const
  const chipBad: string[] = []
  const signupBad: string[] = []
  const cardBad: string[] = []
  const stripBad: string[] = []
  for (const t of THEME_TEMPLATES) {
    for (const s of styles) {
      const th = readableTheme({ ...(t.theme_config as Record<string, unknown>), button_style: s } as never) as Record<string, unknown>
      /* The event date and a tip amount: the chip's words on the chip over the card (the card is the page's button). */
      const chip = chipColors(th as never)
      const onChip = buttonGrounds(th as never).map((g) => over(c(chip.background), g))
      if (worstContrast(c(chip.color), onChip) < TEXT_MIN) chipBad.push(`${t.id}/${s}`)
      /* The newsletter: its description and its button on the card tinted with the page's words. */
      /* Changed on purpose (round AR, Classic 98): the card's tint and words are chosen together (signupCard), as the live card draws them. */
      const grounds = signupCard(th as never).grounds
      const soft = readableInk(th.secondary_text_color ?? th.text_color, grounds)
      const btn = buttonThemeOn(th as never, grounds) as Record<string, unknown>
      if (worstContrast(c(soft), grounds) < TEXT_MIN || worstContrast(c(String(btn.button_text_color)), buttonGrounds(btn as never, grounds)) < TEXT_MIN) signupBad.push(`${t.id}/${s}`)
      /* A poll option, a code's Copy, a tip's Send: the page's button turned to read on the card. */
      const card = onCardButtonTheme(th as never) as Record<string, unknown>
      const words = c(String(card.button_text_color))
      const cardGrounds = buttonGrounds(card as never, buttonGrounds(th as never))
      if (worstContrast(words, cardGrounds) < TEXT_MIN) cardBad.push(`${t.id}/${s}`)
      /* A see-through Solid colour is never laid a second time by a featured link's title strip. */
      const fill = parseColor(th.button_color)
      if (s === "filled" && fill && fill.a < 1 && themeButtonStripFill(th as never) !== "transparent") stripBad.push(t.id)
    }
  }
  check("an event's date and a tip amount read on their chip, every theme x every button style", chipBad.length === 0, chipBad.join(", "))
  check("the newsletter's description and Subscribe read on its card, every theme x every button style", signupBad.length === 0, signupBad.join(", "))
  check("a card's own button (poll option, code Copy, tip Send) reads on the card, every theme x every button style", cardBad.length === 0, cardBad.join(", "))
  check("a featured link's title strip never lays a see-through Solid colour twice (Ocean, Aurora as Solid)", stripBad.length === 0, stripBad.join(", "))
  check("a Soft button over Sunset's signup card, where no words read, turns solid in its words' colour", (() => {
    const sunset = THEME_TEMPLATES.find((t) => t.id === "sunset")!
    const th = readableTheme({ ...(sunset.theme_config as Record<string, unknown>), button_style: "soft" } as never) as Record<string, unknown>
    const g = tintGrounds(th as never, th.text_color, 6)
    const b = buttonThemeOn(th as never, g) as Record<string, unknown>
    return b.button_style === "filled" && worstContrast(c(String(b.button_text_color)), [c(String(b.button_color))]) >= TEXT_MIN
  })())

  const live = read("components/onepage/public-onepage.tsx")
  const email = live.slice(live.indexOf('case "email_capture":'), live.indexOf('case "group":'))
  check("Subscribe, Download, the after-signup link and Bar's button take the page's button (pressableProps, its hover)", /const emailPress = pressableProps\(buttonThemeOn\(theme, signupGrounds\)/.test(email) && (email.match(/\{\.\.\.submitAttrs\}/g) ?? []).length === 2 && /buttonPress=\{\{ className: emailPress\.className/.test(email) && !/hover:opacity-90/.test(email))
  check("the signup's words are held to its card", /theme=\{signupTheme\}/.test(email) && /const pageInk = signupInk/.test(email))
  const data = read("components/onepage/data-blocks.tsx")
  check("poll options are the page's button made to read on the card", /const option = pressableProps\(parts\.onCard, look\.still\)/.test(data) && /className=\{cn\(option\.className/.test(data))
  check("tip amounts and Send are the page's button; nothing reads a part that is gone", /const amount = pressableProps\(parts\.onCard, look\.still\)/.test(data) && /data=\{\{ "data-tip-send": "" \}\}/.test(data) && !/parts\.(ink|paper)\b/.test(data))
  check("an event's date chip reads on the card, in both event blocks", /: parts\.chip\)/.test(data) && /\.\.\.parts\.chip/.test(read("components/onepage/app-block.tsx")))
  const shelf = read("components/onepage/storelib-blocks.tsx")
  check("a discount code's Copy is the page's button", /const copyPress = pressableProps\(onCardButtonTheme\(look\.theme\), look\.still\)/.test(shelf) && !/border-dashed border-current\/40/.test(shelf))
}

console.log("\nWords in every language")
const words = ["Effect", "Mono", "Blur", "Halftone", "Grain", "Duotone", "Tint", "Tint strength", "No tint", "Duotone colour", "Duotone strength", "Deep blue"]
const missing: string[] = []
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(root, "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  for (const w of words) if (!cat[w]) missing.push(`${lang}:${w}`)
}
check("the effect controls are named in all six languages", missing.length === 0, missing.join(", "))
check("the probe and these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-ar5.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
