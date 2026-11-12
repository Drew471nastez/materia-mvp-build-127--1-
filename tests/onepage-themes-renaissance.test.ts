/**
 * ===========================================================================
 *  EDITORIAL RETIRED, RENAISSANCE ADDED, THE PICKER IN GROUPS
 * ===========================================================================
 * The owner: "remove the Editorial theme completely", "order the themes in
 * the picker smarter, especially under All", "create a new theme called
 * Renaissance", "Aero Aquarium is a little cringe: make it cleaner".
 *
 *   EDITORIAL     gone from the picker, its name and its words; a page that
 *                 still holds it is drawn as Paper (the live page and the
 *                 editor), every setting the creator changed kept
 *                 (lib/onepage/retired-themes).
 *   RENAISSANCE   (round 3, after Shopify Editions Winter '26) every
 *                 setting a value the editor offers, a modern grotesk the
 *                 page loads, its words at 4.5:1 on its night, its sky and
 *                 its scrimmed clouds, on its buttons at rest and on hover;
 *                 its skin styles every kind of block and draws its scene,
 *                 a public domain painting served from the site itself in
 *                 AVIF and WebP within a size budget, credited; every pair
 *                 of words and paint it promises reads; named in six
 *                 languages.
 *   ORDER         All in five groups, quiet and most chosen first; every
 *                 theme placed once; the kinds keep the same order.
 *   AQUARIUM      Aero Aquarium's glass is no longer split in two, its fish
 *                 have no cartoon glint, its name is no longer Comfortaa.
 *
 * Photographed by scripts/shot-onepage-skins.mjs (THEMES=renaissance,aero2).
 *
 * Run with:  node scripts/run-push-tests.mjs (registered there)
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { RENAISSANCE_THEMES } from "@/components/onepage/themes/renaissance-theme"
import { THEME_GROUPS, orderThemes, themeGroupOf } from "@/components/onepage/themes/theme-order"
import { themeLabel } from "@/components/onepage/themes/theme-names"
import { W10_THEMES } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, THEME_TYPE_KEYS, contrastRatio, lookFromTemplate, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf, fontStack } from "@/lib/onepage/fonts"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { THEME_SKINS, skinSceneOf, themeSkinOf } from "@/lib/onepage/theme-skin"
import { EDITORIAL_LOOK, PAPER_LOOK, isRetiredTheme, withoutRetiredTheme, withoutRetiredThemes } from "@/lib/onepage/retired-themes"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0
const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
function over(top: string, share: number, under: string): string {
  const a = rgb(top), b = rgb(under)
  return "#" + a.map((v, i) => Math.round(v * share + b[i] * (1 - share)).toString(16).padStart(2, "0")).join("")
}
const LANGS = ["es", "fr", "de", "pt-BR", "it", "pl"]
const catalogs = Object.fromEntries(LANGS.map((l) => [l, readCatalog(join(process.cwd(), "lib/i18n/catalog", `${l}.ts`)) as Record<string, string>]))
const design = read("components/onepage/tabs/design-tab.tsx")
const names = read("components/onepage/themes/theme-names.ts")
const css = read("components/onepage/themes/theme-skins.css")
const ids = THEME_TEMPLATES.map((t) => t.id)
type C = Record<string, any>

console.log("\nEditorial is gone")
check("not in the picker", !ids.includes("editorial") && !THEME_TEMPLATES.some((t) => t.name === "Editorial"))
check("not in the catalogue's source", !/\n    id: "editorial",/.test(design))
check("no name line, and no words for it in any language", !/\n  editorial: /.test(names) && LANGS.every((l) => !("theme::Editorial" in catalogs[l])))
check("its id is known as retired", isRetiredTheme("editorial") && !isRetiredTheme("paper") && !isRetiredTheme(null) && !isRetiredTheme("constructor"))

console.log("\nA page still on Editorial is drawn as Paper")
const paper = THEME_TEMPLATES.find((t) => t.id === "paper")!
check("the successor's look is Paper's as the picker holds it", JSON.stringify(PAPER_LOOK) === JSON.stringify(paper.theme_config), "lib/onepage/retired-themes PAPER_LOOK drifted from design-tab")
const stored: C = { ...LOOK_RESET, ...EDITORIAL_LOOK, template_id: "editorial", cover_crop: { x: 0, y: 0, zoom: 1 } }
const moved = withoutRetiredTheme(stored) as C
check("picked up as Paper", moved.template_id === "paper")
check("every one of Paper's settings laid on", Object.entries(PAPER_LOOK).every(([k, v]) => moved[k] === v), Object.keys(PAPER_LOOK).filter((k) => moved[k] !== PAPER_LOOK[k]).join())
check("nothing of Editorial's look left: halftone, Abril capitals, the stock cover and its framing, left aligned buttons", moved.background_pattern === "paper" && !/Abril/.test(moved.title_font) && moved.title_case == null && moved.cover_image_url == null && moved.cover_crop == null && moved.button_text_align == null && moved.button_icon_position == null && moved.social_icon_style == null)
const own = withoutRetiredTheme({ ...stored, button_color: "#0f5132", title_font: "'Lora', serif", cover_image_url: "https://cdn.example.com/mine.jpg", avatar_shape: "square" }) as C
check("what the creator chose after picking it stays: their colour, their font, their own cover, their picture's frame", own.button_color === "#0f5132" && own.title_font === "'Lora', serif" && own.cover_image_url === "https://cdn.example.com/mine.jpg" && own.avatar_shape === "square" && own.template_id === "paper")
check("a partial old row (only the id) is drawn as Paper too", (withoutRetiredTheme({ template_id: "editorial" }) as C).background_color === "#f3eee4")
const air = { ...(THEME_TEMPLATES.find((t) => t.id === "air")!.theme_config as C), template_id: "air" }
check("any other theme is the same object, untouched", withoutRetiredTheme(air) === air && withoutRetiredTheme(null) === null)
check("moving twice is moving once", JSON.stringify(withoutRetiredTheme(moved)) === JSON.stringify(moved))
const page = { id: "p", theme: stored, published_theme: stored, title: "x" }
const both = withoutRetiredThemes(page)
check("the draft and the published copy both move; a page on another theme is the same object", (both.theme as C).template_id === "paper" && (both.published_theme as C).template_id === "paper" && withoutRetiredThemes({ theme: air, published_theme: air }).theme === air)
const live = publicOnePage({ id: "p", slug: "x", theme: stored, published_theme: stored, settings: {}, draft_blocks: [], published_blocks: [] } as never, { source: "published" })
check("the live page draws it as Paper", (live.theme as C).template_id === "paper" && (live.theme as C).background_pattern === "paper")
const draft = publicOnePage({ id: "p", slug: "x", theme: stored, settings: {}, draft_blocks: [] } as never, { source: "draft" })
check("and the editor's preview", (draft.theme as C).template_id === "paper")
check("the editor opens it as Paper (its first state, so it is not an unsaved change)", /const initialOnePage = useMemo\(\(\) => withoutRetiredThemes\(givenOnePage\), \[givenOnePage\]\)/.test(read("lib/onepage/context.tsx")))

console.log("\nRenaissance: valid, readable, its own")
const ren = RENAISSANCE_THEMES[0]
const c = ren.theme_config as C
check("in the picker, by its name, as a dark theme (white words on the painting's night)", ids.includes("renaissance") && ren.name === "Renaissance" && ren.category === "dark" && themeLabel(ren) === "Renaissance")
check("its own skin", c.theme_skin === "renaissance" && THEME_SKINS.includes("renaissance") && themeSkinOf(c) === "renaissance" && skinSceneOf(c) === "renaissance")
const REQUIRED = ["background_type", "background_color", "text_color", "secondary_text_color", "button_style", "button_color", "button_text_color", "button_border_radius", "button_border_width", "button_border_color", "button_shadow", "button_hover_animation", "button_hover_fill", "button_hover_text", "font_family", "title_font", "title_color", "social_icon_color", "social_icon_style", "spacing", "card_width", "header_layout", "background_pattern", "block_layout", "header_align", "theme_skin"]
const ENUMS: Record<string, readonly unknown[]> = {
  background_type: ["solid", "gradient"],
  button_style: ["filled", "outline", "glass", "soft"],
  button_shadow: ["none", "subtle", "strong", "hard"],
  button_hover_animation: ["default", "none", "lift", "fade", "zoom", "glow", "fill", "pop", "underline"],
  block_layout: ["list", "grid", "cards", "compact", "masonry"],
  header_align: ["center", "left"],
  spacing: ["compact", "normal", "comfortable"],
  card_width: ["narrow", "standard", "wide"],
  header_layout: ["classic", "hero"],
  social_icon_style: ["filled", "outline", "minimal"],
  title_size: ["small", "default", "large"],
  title_weight: [400, 500, 600, 700, 800],
  background_pattern: WALLPAPER_PATTERNS.map((p) => p.id),
  theme_skin: THEME_SKINS,
}
const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null)
check("sets every setting a theme should", missing.length === 0, missing.join())
const bad = Object.entries(ENUMS).filter(([k, allowed]) => k in c && !allowed.includes(c[k])).map(([k]) => `${k}=${c[k]}`)
check("every choice is one the editor offers", bad.length === 0, bad.join())
check("every colour is a hex colour", Object.entries(c).filter(([k]) => /_color$|_fill$|_text$/.test(k)).every(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))))
const known = new Set([...REQUIRED, ...Object.keys(LOOK_RESET), ...THEME_TYPE_KEYS])
check("sets only what the next theme takes back", Object.keys(c).every((k) => known.has(k)), Object.keys(c).filter((k) => !known.has(k)).join())
check("a border, so the skin finds every surface drawn in the button's look", c.button_border_width >= 1 && buttonFill(c as never) === "filled")
check("a modern grotesk for the name and for reading (Geist), loaded, with a sans fallback; no serif", familyOf(c.title_font) === "Geist" && familyOf(c.font_family) === "Geist" && [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f)!) && /sans-serif$/.test(fontStack(familyOf(f)))))
check("offered in the Text settings too", /name: "Geist", category: "sans"/.test(design))
check("the name confident: bold, large, set left like an editorial page", c.title_weight === 700 && c.title_size === "large" && c.header_align === "left")
const ground = c.background_color
/* Where words sit: the night, the painting's own sky continued above it (#3a507f), and its brightest cloud (#ece6d8) under the scrim's lightest (.24 of #090c18). */
const cloud = over("#090c18", 0.24, "#ece6d8")
for (const k of ["title_color", "text_color", "secondary_text_color"]) check(`${k} reads at 4.5:1 on the night, on the sky, and on a cloud with a panel over it`, ratio(ground, c[k]) >= 4.5 && ratio("#3a507f", c[k]) >= 4.5 && ratio(over("#0b0e1a", 0.6, cloud), c[k]) >= 4.5, `${ratio(ground, c[k]).toFixed(2)} ${ratio("#3a507f", c[k]).toFixed(2)}`)
check("the social icons read at 3:1", ratio(ground, c.social_icon_color) >= 3 && ratio("#3a507f", c.social_icon_color) >= 3)
check("button words at rest, 4.5:1", ratio(c.button_color, c.button_text_color) >= 4.5, ratio(c.button_color, c.button_text_color).toFixed(2))
check("and on hover (white, ink words), in its own colours", buttonHover(c as never) === "fill" && ratio(c.button_hover_fill, c.button_hover_text) >= 4.5, ratio(c.button_hover_fill, c.button_hover_text).toFixed(2))
check("no gradient buttons, no violet, no gold", !/gradient/.test(String(c.button_color)) && !Object.values(c).some((v) => /^#(8b5cf6|7c3aed|a855f7|a8843f)$/i.test(String(v))))

console.log("\nRenaissance's skin: every block, its scene, its words")
const KINDS: Record<string, string> = {
  "links": ":is(a.op-btn, [data-tp-link])",
  "product and form buttons": ":is([data-product-cta], [data-email-form] button[type=submit]",
  "cards": ":is([data-product-block], [data-tp-product], a.op-card",
  "questions": "[data-onepage-faq] .op-card",
  "the forms": ":is([data-email-layout], [data-onepage-contact])",
  "fields": ":is([data-email-form], [data-onepage-contact] form) :is(input",
  "the name": ":is([data-op-header] h1, [data-tp-title])",
  "the picture": ":is([data-page-avatar] [data-slot=avatar], [data-tp-avatar])",
  "social icons": ":is([data-op-social-icon], [data-tp-socials] > span)",
  "dividers": "[data-op-block] > .flex.items-center > .h-px:only-child",
  "pictures": "[data-op-block] div[class*='aspect-']:has(> img)",
  "countdown numbers": "[data-onepage-countdown] .grid > div",
  "headings": "[data-onepage-heading]",
  "a promo code's Copy": "[data-code-copy]",
  "the legal links": "[data-onepage-legal]",
  "any other block in the button's look": ':where([style*="background-clip: padding-box"]',
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const unstyled = Object.entries(KINDS).filter(([, sel]) => !css.includes(`[data-op-skin="renaissance"] ${sel}`) && !new RegExp(`\\[data-op-skin="renaissance"\\] :is\\([^{]*${esc(sel)}`).test(css)).map(([k]) => k)
check(`styles ${Object.keys(KINDS).length} kinds of block`, unstyled.length === 0, unstyled.join(", "))
const scene = read("components/onepage/themes/theme-skin-scene.tsx")
const pieces = [...(scene.match(/\n  renaissance: \[(.*)\],/)?.[1] ?? "").matchAll(/\["([a-z-]+)", (\d+)\]/g)].map((m) => m[1])
check(`a scene of ${pieces.length} pieces (sky, painting, scrim, frame), each drawn`, pieces.join() === "sky,painting,scrim,frame" && pieces.every((p) => css.includes(`[data-skin-scene="renaissance"] [data-sk="${p}"]`)))
check("the scene stands still: nothing in it animates", !/\[data-skin-scene="renaissance"\][^{]*\{[^}]*animation/.test(css))
const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]).filter((u) => /renaissance/.test(u))
const skinCss = css.slice(css.indexOf("RENAISSANCE: Titian"), css.indexOf("ALL SKINS"))
check("nothing fetched from another host: every picture is the site's own", !/url\("?https?:/.test(skinCss) && urls.length >= 4 && urls.every((u) => u.startsWith("/images/onepage-themes/renaissance/")), urls.join())
check("the painting in AVIF with WebP after it, for a phone and for the room around the card (by the scene's own width)", /image-set\(url\("\/images\/onepage-themes\/renaissance\/portrait\.avif"\) type\("image\/avif"\), url\("\/images\/onepage-themes\/renaissance\/portrait\.webp"\) type\("image\/webp"\)\)/.test(skinCss) && /@container \(min-width: 720px\)[\s\S]*wide\.avif/.test(skinCss))
const files = ["portrait.avif", "portrait.webp", "wide.avif", "wide.webp"].map((f) => `public/images/onepage-themes/renaissance/${f}`)
const kb = (f: string) => (existsSync(f) ? statSync(f).size / 1024 : Infinity)
check("each file there, the phone's under 120 KB and the wide one under 220 KB", files.every((f) => existsSync(f)) && kb(files[0]) < 120 && kb(files[1]) < 120 && kb(files[2]) < 220 && kb(files[3]) < 220, files.map((f) => `${f.split("/").pop()} ${Math.round(kb(f))}KB`).join(", "))
const credit = read("scripts/build-renaissance-paintings.mjs")
check("credited: the painting, the painter, the museum, public domain, and where the photograph is from", /Titian, "Bacchus and Ariadne"/.test(credit) && /The National Gallery, London/.test(credit) && /Public domain/.test(credit) && /commons\.wikimedia\.org\/wiki\/File:Titian_Bacchus_and_Ariadne\.jpg/.test(credit))
check("words never sit on the bare painting: a scrim over it, panels under the buttons", css.includes('[data-skin-scene="renaissance"] [data-sk="scrim"]') && /\[data-op-skin="renaissance"\] :is\(a\.op-btn, \[data-tp-link\]\) \{[^}]*background-color: rgba\(11,14,26,\.6\) !important/.test(css))
check("no gold anywhere in it, and thin white lines for frames", !/#a8843f|168,132,63/i.test(skinCss) && /border: 1px solid rgba\(255,255,255,\.72\) !important/.test(skinCss))
let current = true
try { execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--check"], { stdio: "pipe" }) } catch { current = false }
check("the stylesheet is what scripts/build-onepage-skins.mjs writes", current)
const pairs = (JSON.parse(execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--pairs"], { encoding: "utf8", maxBuffer: 1 << 24 })) as Array<{ skin: string; what: string; ink: string; under: string[]; faded?: boolean }>).filter((p) => p.skin === "renaissance")
check(`promises ${pairs.length} pairs of words and paint (panels, forms, fields, the white button at rest and under the pointer, legal links)`, pairs.length >= 7 && ["a panel", "the subscribe and contact forms' panel", "the white button", "the white button under the pointer", "the legal links"].every((w) => pairs.some((p) => p.what === w)))
for (const p of pairs) {
  const full = Math.min(...p.under.map((u) => ratio(u, p.ink)))
  const faded = p.faded ? Math.min(...p.under.map((u) => ratio(u, over(p.ink, 0.7, u)))) : full
  check(`${p.what}: ${full.toFixed(2)}${p.faded ? `, at 70% ${faded.toFixed(2)}` : ""}`, full >= 4.5 && faded >= 4.5)
}
check("the type knows the skin", /\| "renaissance" \| null/.test(read("lib/onepage/types.ts")))
check("the sheet stays under 260 KB", css.length < 260 * 1024, `${(css.length / 1024).toFixed(1)} KB`)

console.log("\nPicking Renaissance, and the next")
const plain: ThemeTemplateLike = { id: "air", category: "light", theme_config: { background_type: "solid", background_color: "#eef0f3", text_color: "#111827", button_style: "filled", button_color: "#ffffff", button_text_color: "#111827" } }
const start = { id: "p", theme: { template_id: "air", ...plain.theme_config }, settings: {}, draft_blocks: [] } as never
const picked = lookFromTemplate(start, ren as unknown as ThemeTemplateLike, "classic", plain)
const pt = picked.theme as unknown as C
check("every setting laid on, the skin with it", Object.entries(c).filter(([k]) => !(THEME_TYPE_KEYS as readonly string[]).includes(k)).every(([k, v]) => k === "header_layout" || pt[k] === v) && pt.template_id === "renaissance")
check("its name's weight and size, as a theme's type", pt.title_weight === 700 && pt.title_size === "large")
const after = lookFromTemplate(picked, plain, "classic", ren as unknown as ThemeTemplateLike).theme as unknown as C
check("the next theme takes the skin, the grotesk and the type back", after.theme_skin === null && after.title_font === null && after.title_weight == null && after.title_size == null)

console.log("\nRenaissance's name in six languages")
check("a name line", /\n  renaissance: \(\) => ttx\("theme", "Renaissance"\),/.test(names))
for (const l of LANGS) check(`${l}: ${catalogs[l]["theme::Renaissance"]}`, !!catalogs[l]["theme::Renaissance"])

console.log("\nThe picker's order: All in groups, the best and most chosen first")
const placed = THEME_GROUPS.flatMap((g) => g.ids as readonly string[])
check("every theme in the picker has a place, once", ids.every((id) => placed.includes(id)) && new Set(placed).size === placed.length, ids.filter((id) => !placed.includes(id)).join())
check("every place is a theme in the picker", placed.every((id) => ids.includes(id)), placed.filter((id) => !ids.includes(id)).join())
check("the picker is in that order", ids.join() === placed.join())
check("five groups: clean, dark, colour, photo, eras and styles", THEME_GROUPS.map((g) => g.id).join() === "clean,dark,colour,photo,styled")
check("All opens on the quiet ones: Default, Air, Gallery, Studio", ids.slice(0, 4).join() === "default,air,gallery,studio")
check("Clean is light themes only, Dark dark only, Photo photographs only", (["clean", "dark", "photo"] as const).every((g) => THEME_TEMPLATES.filter((t) => themeGroupOf(t.id) === g).every((t) => t.category === { clean: "light", dark: "dark", photo: "image" }[g])))
check("every skinned theme is under Eras and styles, Renaissance first", THEME_TEMPLATES.filter((t) => (t.theme_config as C).theme_skin).every((t) => themeGroupOf(t.id) === "styled") && (THEME_GROUPS[4].ids as readonly string[])[0] === "renaissance")
check("each kind keeps the same order (a filter of All)", ["light", "dark", "gradient", "image"].every((k) => { const sub = THEME_TEMPLATES.filter((t) => t.category === k).map((t) => t.id); return sub.join() === ids.filter((id) => sub.includes(id)).join() }))
check("a theme not yet placed joins the end, in the order given", orderThemes([{ id: "zz" }, { id: "default" }, { id: "yy" }, { id: "air" }]).map((t) => t.id).join() === "default,air,zz,yy" && themeGroupOf("zz") === "styled")
check("All names each group where it starts, a kind does not", /const group = kind\.id === "all" \? themeGroupOf\(template\.id\) : null/.test(design) && /data-theme-group=\{group\}/.test(design))
check("the groups' names are words of the picker, in every language", ["Clean", "Dark", "Colour", "Photo", "Eras and styles"].every((w) => design.includes(`tt("${w}")`) && LANGS.every((l) => !!catalogs[l][w])))

console.log("\nAero Aquarium, quieter")
const aero2 = W10_THEMES.find((t) => t.id === "aero2")!.theme_config as C
const aeroSrc = read("scripts/onepage-skins/aero.mjs")
const night = aeroSrc.slice(aeroSrc.indexOf("const NIGHT = {"), aeroSrc.indexOf("\n}\n", aeroSrc.indexOf("const NIGHT = {")))
check("the name in Manrope, not Comfortaa", familyOf(aero2.title_font) === "Manrope" && !/Comfortaa/.test(JSON.stringify(aero2)))
check("the glass fades evenly: no hard 50% edge in its gloss or its button", !/46%, rgba\(255,255,255,0\) 50%/.test(night) && !/50%, #[0-9a-f]{6} 51%/.test(night))
check("the goldfish have no white glint in the eye", !/fill='#fff'\/>`,\n  "0 0 92 60"/.test(aeroSrc) && /"0 0 76 40"/.test(aeroSrc))
check("its words still read on its water and its buttons", ratio(aero2.button_color, aero2.button_text_color) >= 4.5 && ratio(aero2.button_hover_fill, aero2.button_hover_text) >= 4.5 && ratio("#ff9f58", "#2e1300") >= 4.5)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
