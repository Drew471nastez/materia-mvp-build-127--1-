/**
 * ===========================================================================
 *  ROUND AS (track 1): THEME CARDS THAT ARE REAL PAGES, PLASTER, NO GLOW
 *  NOBODY ASKED FOR
 * ===========================================================================
 *   CARDS     every theme has a creator of its own (components/onepage/
 *             themes/preview-content): a name, a line, a portrait, three
 *             socials the icon set draws, two products with prices, a
 *             booking link, a newsletter, a plain link; the card draws them
 *             with the page's own helpers and no grey bars; the content is
 *             its own chunk, loaded with the theme page.
 *   PLASTER   the new theme: listed, named in six languages, its own
 *             structure, every colour pair readable, its cover our own SVG.
 *   GLOW      the legibility guard's outline is a hairline, no theme turns
 *             the avatar ring on by itself, the Glow animation and hover and
 *             Aero's light are faint.
 *
 * The browser half: scripts/check-onepage-theme-previews-as1.mjs (card beside
 * the live page for every theme, the grid's cost at 390 and 1440) and
 * scripts/check-onepage-glow-as1.mjs (every theme's light glows, by source).
 */
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { PREVIEW_CREATOR_IDS, artUri, creatorFor, faceUri } from "@/components/onepage/themes/preview-content"
import { LARGE_MIN, TEXT_MIN, buttonGrounds, pageGrounds, parseColor, readableTheme, worstContrast } from "@/lib/onepage/contrast"
import { coverImageOf } from "@/lib/onepage/theme-layout"
import { canonicalSocialPlatform } from "@/lib/onepage/social-url"
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
type T = Record<string, any>

console.log("\nEvery theme has its creator")
const ids = THEME_TEMPLATES.map((t) => t.id)
const missing = ids.filter((id) => !PREVIEW_CREATOR_IDS.includes(id))
check(`all ${ids.length} themes have a creator of their own`, missing.length === 0, missing.join(", "))
check("a theme added later falls back to its kind's creator", creatorFor("not-a-theme", "dark").name === creatorFor("night").name && creatorFor("x", "light").name === creatorFor("default").name && creatorFor("x", null).name === creatorFor("default").name)
const names = new Set(ids.map((id) => creatorFor(id).name))
check("no two themes share a creator", names.size === ids.length)
const BRAND = new Set(["instagram", "tiktok", "youtube", "threads", "email", "facebook", "twitter", "whatsapp", "snapchat", "discord", "github", "kick", "linkedin", "patreon", "pinterest", "soundcloud", "spotify", "applemusic", "telegram", "twitch", "website", "calendly", "etsy", "substack", "bandcamp", "bluesky", "vimeo", "reddit"])
const badSocial: string[] = []
const badContent: string[] = []
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—|stoic/i
for (const id of ids) {
  const c = creatorFor(id)
  for (const s of c.socials) if (!BRAND.has(canonicalSocialPlatform(s))) badSocial.push(`${id}:${s}`)
  if (new Set(c.socials).size !== 3) badSocial.push(`${id}: repeats`)
  const words = [c.name, c.bio, c.cta, c.link.label, c.link2, c.news.headline, c.news.desc, c.news.button, ...c.products.flatMap((p) => [p.title, p.price])]
  if (words.some((w) => !w || !w.trim())) badContent.push(`${id}: empty words`)
  if (words.some((w) => BANNED.test(w))) badContent.push(`${id}: a banned word or an em dash`)
  if (c.products.some((p) => !/^[$€£]\d+\.\d\d$/.test(p.price))) badContent.push(`${id}: a price not as the page writes it`)
  if (c.name.length > 22 || c.bio.length > 56 || c.news.button.length > 12) badContent.push(`${id}: too long for a card`)
}
check("every social is one the icon set draws, three different ones", badSocial.length === 0, badSocial.join(", "))
check("every card's words are real, short, priced as the page writes prices, and in Storelib's voice", badContent.length === 0, badContent.join("; "))

console.log("\nThe drawings")
const face = faceUri(creatorFor("plaster").face)
check("a portrait is a small SVG data address, drawn the same twice (one decode)", face.startsWith("data:image/svg+xml,") && face.length < 3000 && face === faceUri(creatorFor("plaster").face))
check("no portrait is a photo or a fetched file", ids.every((id) => faceUri(creatorFor(id).face).startsWith("data:image/svg+xml,")))
const arts = ids.flatMap((id) => { const c = creatorFor(id); return [c.link.art, ...c.products.map((p) => p.art)].map((a) => artUri(a, c.palette)) })
check("every product and link picture is a small drawing", arts.every((u) => u.startsWith("data:image/svg+xml,") && u.length < 4000))
const content = read("components/onepage/themes/preview-content.ts")
check("the content is a small hand written file, not a generated blob", content.length < 60_000 && !/base64/.test(content))

console.log("\nThe card")
const preview = read("components/onepage/themes/theme-preview.tsx")
check("no grey bars: the Words placeholder is gone", !/function Words|<Words /.test(preview))
check("the card reads the page's own helpers for every block", ["themeButtonStyle", "cardButtonTheme", "cardRadius", "signupCard", "buttonThemeOn", "blockLayoutOf", "themeProductLayoutOf", "avatarLook", "bioSizeClass", "titleSizeClass", "readableTheme"].every((h) => preview.includes(h)))
check("a product as the page's callout, rows or tiles; a newsletter as its Classic card", /data-tp-product="callout"/.test(preview) && /data-tp-product="row"/.test(preview) && /data-tp-product="tile"/.test(preview) && /data-email-layout="default"/.test(preview))
check("the blocks keep the page's width (no -mx-3 px-3 inside a w-full)", /w-\[calc\(100%\+24px\)\] flex-1 flex-col/.test(preview))
const loader = read("components/onepage/themes/preview-content-loader.ts")
check("the content is its own chunk, loaded with the theme page", /import\("\.\/preview-content"\)/.test(loader) && /import type \{ PreviewCreator, Slot \}/.test(preview) && !/^import \{[^}]*\} from "@\/components\/onepage\/themes\/preview-content"/m.test(preview))
const design = read("components/onepage/tabs/design-tab.tsx")
check("the Design tab asks for it as it opens, and each card names its theme", /void loadPreviewContent\(\)/.test(design) && /<ThemePreview c=\{look\} id=\{template\.id\} kind=\{template\.category\} thumb=\{themeThumbSrc\} \/>/.test(design))
check("the onboarding draws the person's own name and photo on each creator's page", /<ThemePreview c=\{look\} id=\{template\.id\} kind=\{template\.category\} name=\{name\} thumb=\{themeThumbSrc\} photo=\{photo\} \/>/.test(read("components/onepage/onboarding-modal.tsx")))
check("the cards' fonts cover the body faces and the words' letters", /PREVIEW_LETTERS/.test(design) && /familyOf\(t\.theme_config\.font_family\)/.test(design))

console.log("\nPlaster")
const plaster = THEME_TEMPLATES.find((t) => t.id === "plaster") as T | undefined
check("Plaster is in the list, a dark theme", !!plaster && plaster.category === "dark")
const pc = (plaster?.theme_config ?? {}) as T
check("black ground, chalk words, a large editorial serif, thin square rules", pc.background_color === "#0b0b0a" && /Instrument Serif/.test(pc.title_font) && pc.title_size === "large" && pc.button_style === "outline" && pc.button_border_width === 1 && pc.button_border_radius === 0)
check("its cover is our own drawing, on an https address the page accepts", coverImageOf(pc) === "https://storelib.com/images/onepage-themes/plaster.svg")
const svg = read("public/images/onepage-themes/plaster.svg")
check("the drawing is a small SVG with no picture inside it", statSync(join(root, "public/images/onepage-themes/plaster.svg")).size < 8000 && !/<image|base64|href="http/.test(svg))
check("no theme, name or word says stoic", !/stoic/i.test(JSON.stringify(plaster)) && !/stoic/i.test(svg))
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, t.theme_skin || "-"].join("|")
}
check("Plaster's structure is its own (the round AR uniqueness signature)", THEME_TEMPLATES.filter((t) => t.id !== "plaster" && sig(t.theme_config as T) === sig(pc)).length === 0, sig(pc))
const under: string[] = []
for (const style of [undefined, "filled", "soft", "outline", "glass"]) {
  const t = readableTheme({ ...pc, ...(style ? { button_style: style } : {}) }) as T
  const g = pageGrounds(t)
  const pairs: [string, string, typeof g, number][] = [["text", t.text_color, g, TEXT_MIN], ["small print", t.secondary_text_color, g, TEXT_MIN], ["title", t.title_color, g, TEXT_MIN], ["button words", t.button_text_color, buttonGrounds(t, g), TEXT_MIN], ["social", t.social_icon_color, g, LARGE_MIN]]
  for (const [what, ink, on, min] of pairs) { const r = worstContrast(parseColor(ink)!, on); if (r < min) under.push(`${style ?? "theme"} ${what} ${r.toFixed(2)}`) }
}
check("every Plaster colour pair reads, in every button style", under.length === 0, under.join(", "))
check("the hover fill's words read on it", worstContrast(parseColor(pc.button_hover_text)!, [parseColor(pc.button_hover_fill)!]) >= TEXT_MIN)
const langs = ["es", "fr", "de", "pt-BR", "it", "pl"].filter((l) => !(readCatalog(join(root, "lib/i18n/catalog", `${l}.ts`)) as Record<string, string>)["theme::Plaster"])
check("Plaster is named in all six languages", langs.length === 0 && /plaster: \(\) => ttx\("theme", "Plaster"\)/.test(read("components/onepage/themes/theme-names.ts")), langs.join(","))

console.log("\nNo glow nobody chose")
const legible = read("lib/onepage/legible.ts")
const outline = legible.slice(legible.indexOf("function outline("), legible.indexOf("export function guardLegibility"))
check("the guard's outline is a hairline, never blurred past 2px", outline.length > 0 && !/\b([3-9]|\d\d)px/.test(outline.replace(/0 0 1px|0 1px 2px/g, "")))
check("no theme turns the avatar's glowing ring on by itself", THEME_TEMPLATES.every((t) => (t.theme_config as T).laser_glow_enabled !== true))
const pub = read("components/onepage/public-onepage.tsx")
check("the ring a creator picks is tighter and has no second halo", /const glowSpread = laserGlowIntensity === "low" \? 3 : laserGlowIntensity === "hard" \? 6 : 4/.test(pub) && !/boxShadow: `0 0 \$\{glowSpread \* 2\}px/.test(pub))
const css = read("app/globals.css")
const keyframes = css.slice(css.indexOf("@keyframes onepage-glow"), css.indexOf("@keyframes onepage-swipe"))
check("the Glow animation is faint: no blur past 10px and nothing over 26%", !/\b(1[1-9]|[2-9]\d)px/.test(keyframes) && !/\) (2[7-9]|[3-9]\d)%/.test(keyframes))
check("the Glow hover is faint", /\.op-btn\[data-hover="glow"\]::before \{\s*box-shadow:\s*0 0 0 2px [^;]*14%[^;]*0 6px 16px -6px [^;]*30%/.test(css))
const skins = read("components/onepage/themes/theme-skins.css")
check("Aero's name and words keep their emboss, not a white cloud", !/0 0 22px rgba\(255,255,255,\.85\)/.test(skins) && !/0 0 14px rgba\(255,255,255,\.8\)/.test(skins) && !/0 0 34px rgba\(255,255,255/.test(skins))
check("the probes and these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-as1.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
