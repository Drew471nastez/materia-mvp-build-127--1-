/**
 * ===========================================================================
 *  WAVE 11 (GENERAL): THREE THEMES FOR EVERYONE, AND A VERIFIED BADGE THAT
 *  NOTHING OF THE NAME REACHES
 * ===========================================================================
 * The owner: "Create 3 more general themes ... As being from the first 6
 * themes, add 3 more, in that order. Create 1 of them with the header profile
 * image layout Hero." and "The name style, text font thing or whatever should
 * not apply to the text of the verified creator tooltip. Fully fix."
 *
 *   THEMES    Linen, Harbor and Portrait: right after the first six in All;
 *             every setting one the editor offers, fonts the page loads, plain
 *             settings (no skin); Portrait is a Hero. Every word reads at
 *             4.5:1 on what is behind it; every button at rest and on hover,
 *             a link's and a product card's (which wears the pair turned
 *             around), and the hover is a change you can see on both.
 *   NAMES     each in the six catalogs.
 *   BADGE     the verified badge is not inside the name's h1 (NameLine), so
 *             no font, case, spacing, fill, mask, filter or tilt of the name
 *             reaches it; its tooltip is written plainly in the page's font;
 *             it shows on a tap (focus) as well as a mouse's hover; a left
 *             aligned header sets the line flush left.
 *   HERO      dark words over the Hero's photo take a light halo, light words
 *             the dark shadow they always had.
 *   GUARD     the runtime legibility guard leaves a hovered button alone (it
 *             faded Fill and Pop hovers grey on grey).
 *
 * The page itself, photographed: scripts/shot-onepage-w11.mjs.
 *
 * Run with:  npx tsx tests/onepage-themes-w11.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { R40_THEMES, R42_THEMES, AP_THEMES, W8_THEMES, W9_THEMES, W10_THEMES, W11_THEMES, W11_AFTER, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, THEME_TYPE_KEYS, contrastRatio, lookFromTemplate, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover, buttonHoverVars, cardButtonTheme } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { heroWordsShadow } from "@/lib/onepage/header-style"
import { themeSkinOf } from "@/lib/onepage/theme-skin"
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

const design = read("components/onepage/tabs/design-tab.tsx")
/* The Design tab's own catalogue, id and kind, in its order. */
const base = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",\n    name: "[^"]+",\n    category: "(\w+)",/g)].map((m) => ({ id: m[1], category: m[2] }))
const older = [...base.map((b) => b.id), ...[...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES, ...W9_THEMES, ...W10_THEMES].map((t) => t.id)]

console.log("\nThree themes, right after the first six")
check(`the Design tab's catalogue was read (${base.length} themes)`, base.length >= 25)
check("three, with new ids", W11_THEMES.length === 3 && W11_THEMES.map((t) => t.id).join() === "linen,harbor,portrait" && W11_THEMES.every((t) => !older.includes(t.id)))
const all = withR40Themes(base).map((t) => t.id)
check("All opens with the six, then Linen, Harbor and Portrait, in that order", all.slice(0, 9).join() === "default,air,studio,paper,cream,riso,linen,harbor,portrait" && W11_AFTER === 6, all.slice(0, 10).join())
check("each theme once", new Set(all).size === all.length && all.length === base.length + older.length - base.length + 3)
const kindGrid = (k: string) => withR40Themes(base).filter((t) => t.category === k).map((t) => t.id)
check("in Light, after Riso; Harbor first in Dark", kindGrid("light").join().includes("riso,linen,portrait") && kindGrid("dark")[0] === "harbor", `${kindGrid("light").slice(0, 9).join()} | ${kindGrid("dark").slice(0, 2).join()}`)
check("kinds the picker lists", W11_THEMES.every((t) => ["light", "dark", "gradient", "image"].includes(t.category)))

const REQUIRED = ["background_type", "background_color", "text_color", "secondary_text_color", "button_style", "button_color", "button_text_color", "button_border_radius", "button_border_width", "button_border_color", "button_shadow", "button_hover_animation", "button_hover_fill", "button_hover_text", "font_family", "title_font", "title_color", "social_icon_color", "social_icon_style", "spacing", "card_width", "header_layout", "background_pattern", "block_layout", "header_align"]
const ENUMS: Record<string, readonly unknown[]> = {
  background_type: ["solid", "gradient", "image", "video"],
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
  title_tracking: ["tight", "normal", "wide"],
  background_pattern: WALLPAPER_PATTERNS.map((p) => p.id),
}
const HEX = /^#[0-9a-f]{6}$/i
for (const t of W11_THEMES) {
  const c = t.theme_config as Record<string, any>
  const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null)
  check(`${t.name}: sets every setting a theme should`, missing.length === 0, missing.join())
  const bad = Object.entries(ENUMS).filter(([k, allowed]) => k in c && !allowed.includes(c[k])).map(([k]) => `${k}=${c[k]}`)
  check(`${t.name}: every choice is one the editor offers`, bad.length === 0, bad.join())
  const colours = Object.entries(c).filter(([k]) => /_color$|_fill$|_text$/.test(k)).filter(([, v]) => !HEX.test(String(v)))
  check(`${t.name}: every colour is a hex colour`, colours.length === 0, colours.map(([k]) => k).join())
  check(`${t.name}: fonts the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
  const single = ONEPAGE_FONTS[familyOf(c.title_font) || ""] === null
  check(`${t.name}: a one weight title face is drawn at its weight, never a fake bold`, !single || c.title_weight === 400)
  const known = new Set([...REQUIRED, ...Object.keys(LOOK_RESET), ...THEME_TYPE_KEYS])
  const stray = Object.keys(c).filter((k) => !known.has(k))
  check(`${t.name}: sets only what the next theme takes back`, stray.length === 0, stray.join())
  check(`${t.name}: plain settings, no skin (the shared button and hover rules draw it)`, !("theme_skin" in c) && themeSkinOf(c) === null)
  check(`${t.name}: its name in its own kind of hover (Fill or Pop)`, ["fill", "pop"].includes(buttonHover(c as never)))

  const bg = c.background_color as string
  check(`${t.name}: the name, words and bio read at 4.5:1`, ratio(bg, c.title_color) >= 4.5 && ratio(bg, c.text_color) >= 4.5 && ratio(bg, c.secondary_text_color) >= 4.5, `${ratio(bg, c.title_color).toFixed(2)} ${ratio(bg, c.text_color).toFixed(2)} ${ratio(bg, c.secondary_text_color).toFixed(2)}`)
  check(`${t.name}: the social icons read at 3:1`, ratio(bg, c.social_icon_color) >= 3, ratio(bg, c.social_icon_color).toFixed(2))
  check(`${t.name}: filled buttons`, buttonFill(c as never) === "filled")
  /* A link: its colour, its words. */
  check(`${t.name}: a link's words read at 4.5:1 at rest`, ratio(c.button_color, c.button_text_color) >= 4.5, ratio(c.button_color, c.button_text_color).toFixed(2))
  const hv = buttonHoverVars(c as never) as Record<string, string>
  check(`${t.name}: and on hover`, ratio(hv["--op-fill"], hv["--op-fill-text"]) >= 4.5, ratio(hv["--op-fill"], hv["--op-fill-text"]).toFixed(2))
  check(`${t.name}: the button shows on the page, or has an edge that does`, ratio(bg, c.button_color) >= 3 || (c.button_border_width >= 1 && c.button_shadow !== "none"))
  /* A product card: the card is the button's colour and its button the pair turned around (lib/onepage/button-style cardButtonTheme). */
  const cardText = c.button_text_color as string
  const cta = cardButtonTheme(c as never, { surface: c.button_color, cardText }) as Record<string, any>
  const ctaHover = buttonHoverVars(cta as never) as Record<string, string>
  check(`${t.name}: a product card's words read at 4.5:1`, ratio(c.button_color, cardText) >= 4.5)
  check(`${t.name}: its button's words at rest`, ratio(cta.button_color, cta.button_text_color) >= 4.5, ratio(cta.button_color, cta.button_text_color).toFixed(2))
  check(`${t.name}: and on hover`, ratio(ctaHover["--op-fill"], ctaHover["--op-fill-text"]) >= 4.5, ratio(ctaHover["--op-fill"], ctaHover["--op-fill-text"]).toFixed(2))
  /* A hover you can see: the hover colour is neither resting fill, so the link and the card's button both change. */
  const seen = Math.min(ratio(hv["--op-fill"], c.button_color), ratio(ctaHover["--op-fill"], cta.button_color))
  check(`${t.name}: the hover is a change you can see on a link and on a card's button`, seen >= 1.08 && hv["--op-fill"].toLowerCase() !== String(c.button_color).toLowerCase() && ctaHover["--op-fill"].toLowerCase() !== String(cta.button_color).toLowerCase(), seen.toFixed(2))
  check(`${t.name}: the picture's ring shows on the page (3:1)`, !c.avatar_border_color || ratio(bg, c.avatar_border_color) >= 3)
  check(`${t.name}: Share and Subscribe styled`, typeof t.share_style === "string" && typeof t.subscribe_style === "string")
}
const [linen, harbor, portrait] = W11_THEMES
check("Linen: warm off white, white cards with a hairline and a soft shadow, rounded", linen.category === "light" && linen.theme_config.button_color === "#ffffff" && linen.theme_config.button_border_width === 1 && linen.theme_config.button_shadow === "subtle" && linen.theme_config.button_border_radius >= 12 && linen.theme_config.header_layout === "classic")
check("Harbor: deep navy with light pills", harbor.category === "dark" && harbor.theme_config.button_border_radius === 999 && ratio(harbor.theme_config.background_color, "#000000") < 2)
check("Portrait: the Hero", portrait.theme_config.header_layout === "hero" && portrait.profile_layout === "hero")
check("only one of the three is a Hero", W11_THEMES.filter((t) => t.theme_config.header_layout === "hero").length === 1)

console.log("\nPicking one")
const byId = (id: string) => W11_THEMES.find((t) => t.id === id) as unknown as ThemeTemplateLike
const plain: ThemeTemplateLike = { id: "air", category: "light", theme_config: { background_type: "solid", background_color: "#eef0f3", text_color: "#111827", button_style: "filled", button_color: "#ffffff", button_text_color: "#111827" } }
const start = { id: "p", theme: { template_id: "air", ...plain.theme_config, name_style: "chrome" }, settings: {}, draft_blocks: [] } as never
const toPortrait = lookFromTemplate(start, byId("portrait"), "hero", plain).theme as unknown as Record<string, unknown>
check("Portrait lays on all of it, the Hero with it", Object.entries(portrait.theme_config).filter(([k]) => !(THEME_TYPE_KEYS as readonly string[]).includes(k)).every(([k, v]) => toPortrait[k] === v) && toPortrait.header_layout === "hero" && toPortrait.template_id === "portrait")
check("and its type: the name tight and large", toPortrait.title_tracking === "tight" && toPortrait.title_size === "large")
check("the creator's name style stays", toPortrait.name_style === "chrome")
const toLinen = lookFromTemplate({ id: "p", theme: toPortrait, settings: {}, draft_blocks: [] } as never, byId("linen"), "classic", byId("portrait")).theme as unknown as Record<string, unknown>
check("from Portrait to Linen: Linen's type replaces Portrait's", toLinen.title_weight === 400 && toLinen.title_tracking === null && toLinen.title_size === "large" && toLinen.header_layout === "classic")
const design2 = read("components/onepage/tabs/design-tab.tsx")
check("the picker gives a Hero theme its Hero", /const wantsHeroLayout = templateLayout === "hero" \|\| \(config as any\)\.header_layout === "hero"/.test(design2))

console.log("\nEvery name in six languages")
const names = read("components/onepage/themes/theme-names.ts")
for (const t of W11_THEMES) check(`${t.name} has a line`, new RegExp(`\\n  ${t.id}: \\(\\) => ttx\\("theme", "${t.name}"\\)`).test(names))
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  const missing = W11_THEMES.filter((t) => !cat[`theme::${t.name}`]).map((t) => t.name)
  check(`${lang}: the three names`, missing.length === 0, missing.join())
}

console.log("\nThe verified badge is the page's, not the name's")
const live = read("components/onepage/public-onepage.tsx")
const h1s = [...live.matchAll(/<h1\b[\s\S]*?<\/h1>/g)].map((m) => m[0])
const nameH1s = h1s.filter((h) => h.includes("<NameWords"))
check("both headers (classic and Hero) set the name in an h1", nameH1s.length === 2)
check("no badge inside either h1", nameH1s.every((h) => !h.includes("VerifiedBadge")))
check("each h1 sits in a NameLine with the badge beside it", (live.match(/<NameLine badge=\{settings\?\.verified_badge_enabled \? <VerifiedBadge isDesktop=\{isDesktop\} badgeType=\{settings\?\.verified_badge_type\} \/> : null\}>/g) || []).length === 2 && (live.match(/<\/h1>\s*<\/NameLine>/g) || []).length === 2)
const badge = live.slice(live.indexOf("function VerifiedBadge("), live.indexOf("function NameLine("))
const plainWords = live.slice(live.indexOf("const PLAIN_WORDS"), live.indexOf("const BADGE_LABELS"))
check("the badge and its tooltip are written plainly", ["fontFamily: \"inherit\"", "fontStyle: \"normal\"", "letterSpacing: \"normal\"", "textTransform: \"none\"", "textShadow: \"none\"", "WebkitTextFillColor: \"currentcolor\"", "WebkitTextStroke: \"0\"", "filter: \"none\""].every((s) => plainWords.includes(s)))
check("the badge and the tooltip both wear it", (badge.match(/\.\.\.PLAIN_WORDS/g) || []).length === 2)
check("the tooltip at its own size and weight, white", /data-verified-tooltip=""/.test(badge) && /color: "#ffffff", fontSize: 12, lineHeight: "16px", fontWeight: 500/.test(badge))
check("a tap shows it too (the badge takes focus)", /tabIndex=\{0\}/.test(badge) && /group-focus:opacity-100/.test(badge) && /group-hover:opacity-100/.test(badge))
check("the badge says what it is to a screen reader, in the reader's language", /role="img"/.test(badge) && /aria-label=\{label\}/.test(badge) && /tt\("Verified Creator"\)/.test(live))
check("the badge keeps its size beside a long name", /shrink-0/.test(badge) && /min-w-0/.test(nameH1s.join("")))
const css = read("app/globals.css")
check("a left aligned header sets the name line flush left", css.includes('[data-op-align="left"] [data-op-header] > [data-name-line], [data-op-align="left"] [data-op-header] > [data-name-line] > h1 { justify-content: flex-start; text-align: left; }'))
check("a skin's title treatment still reaches only the h1", !/\[data-name-line\]/.test(read("components/onepage/themes/theme-skins.css")))

console.log("\nThe Hero's words")
check("light words keep their dark shadow", heroWordsShadow("#ffffff", "name") === "0 2px 8px rgba(0,0,0,0.4)" && heroWordsShadow("#f8fafc", "bio") === "0 1px 4px rgba(0,0,0,0.4)")
check("dark words take a light halo", heroWordsShadow("#141311", "name").includes("255,255,255") && heroWordsShadow("#48443e", "bio").includes("255,255,255"))
check("a colour that is not hex keeps the dark shadow", heroWordsShadow("rgba(0,0,0,.5)", "name") === "0 2px 8px rgba(0,0,0,0.4)" && heroWordsShadow(undefined, "bio") === "0 1px 4px rgba(0,0,0,0.4)")
check("the page and the picker card both use it", (live.match(/heroWordsShadow\(/g) || []).length === 2 && read("components/onepage/themes/theme-preview.tsx").includes('heroWordsShadow(c.title_color || text, "name")'))

console.log("\nThe legibility guard leaves a hovered button alone")
const legible = read("lib/onepage/legible.ts")
check("a button under the pointer is skipped", legible.includes('const HOVERED_BUTTON = ".op-btn:hover, .op-host:hover .op-btn, .op-demo:hover .op-btn"') && /findIllegible\(root\)\.filter\(\(f\) => !inHoveredButton\(f\.el\)\)/.test(legible))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
