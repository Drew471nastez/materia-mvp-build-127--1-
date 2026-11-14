/**
 * ===========================================================================
 *  ROUND AT (track 1): THE THEME CARDS ARE THE CREATOR'S OWN PAGE, STOICISM,
 *  DUNE
 * ===========================================================================
 *   CARDS     every theme card draws this account's page
 *             (components/onepage/themes/preview-account): the name and photo
 *             the editor holds (the monogram without one), the bio, socials,
 *             links with thumbnails, products with prices and pictures, the
 *             newsletter; plain samples fill what the page lacks; no made-up
 *             creators and no drawn portraits; nothing new is fetched; links
 *             are the page's .op-btn with the theme's hover; nothing on a
 *             card can be selected; every card shows links.
 *   STOICISM  Plaster renamed and remade: a dark stone skin, ivory tablets with
 *             an inner rule, Plaster's cover kept; a page saved on "plaster"
 *             is moved to it with the creator's own changes kept.
 *   DUNE      a new light gradient theme with fine contour lines.
 *
 * The browser half: scripts/check-onepage-theme-previews-as1.mjs (each card
 * beside the live page drawn from the same account, the grid's cost and
 * text), scripts/check-onepage-contrast-ar5.mjs, check-onepage-settings-ar5.mjs
 * and check-onepage-legible-w10.mjs.
 */
import { readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { isDefaultLabel, previewAccountOf } from "@/components/onepage/themes/preview-account"
import { slotsFor } from "@/components/onepage/themes/theme-preview"
import { THEME_GROUPS, themeGroupOf } from "@/components/onepage/themes/theme-order"
import { LARGE_MIN, TEXT_MIN, buttonGrounds, pageGrounds, parseColor, readableTheme, worstContrast } from "@/lib/onepage/contrast"
import { coverImageOf } from "@/lib/onepage/theme-layout"
import { PLASTER_LOOK, STOICISM_LOOK, isRetiredTheme, withoutRetiredTheme, withoutRetiredThemes } from "@/lib/onepage/retired-themes"
import { THEME_SKINS, themeSkinOf } from "@/lib/onepage/theme-skin"
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
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

console.log("\nA brand new account")
const empty = previewAccountOf({ title: "", bio: "", avatar_url: null, social_links: {}, draft_blocks: [] }, money)
check("the name is the editor's fallback, and there is no photo (the monogram)", empty.name === "Your name" && empty.avatar === null && empty.bio === "")
check("two sample links, two sample products, a sample newsletter, three socials", empty.links.length === 2 && empty.links.every((l) => l.sample && !l.picture) && empty.products.length === 2 && empty.products.every((p) => p.sample && !p.picture && /^\$\d+\.\d\d$/.test(p.price)) && !!empty.news.headline && !!empty.news.button && empty.socials.length === 3)
check("no account at all is the same", previewAccountOf(null, money).name === "Your name")

console.log("\nAn account with a page")
const page = {
  title: "  Mara  Okafor ",
  bio: "Ceramics and slow glazes.",
  avatar_url: "https://cdn.example.com/me.jpg",
  social_links: { instagram: "https://instagram.com/mara", youtube: "", website: "https://mara.studio" },
  draft_blocks: [
    { type: "link_button", enabled: true, data: { label: "Studio visits", url: "https://x", thumbnail_url: "https://cdn.example.com/visit.jpg" } },
    { type: "link_button", enabled: false, data: { label: "Hidden one", url: "https://x" } },
    { type: "product", enabled: true, data: { product_title: "Moon jar", product_price_cents: 12000, product_thumbnail: "https://cdn.example.com/jar.jpg", cta_text: "Order" } },
    { type: "link_button", enabled: true, data: { label: "Map", url: "https://x", link_preview: { enabled: true, image: "https://cdn.example.com/map.png" } } },
    { type: "email_capture", enabled: true, data: { headline: "Kiln notes", description: "When the kiln opens.", button_preset: "join" } },
  ],
}
const who = previewAccountOf(page, money)
check("the page's own name (tidied), bio and photo", who.name === "Mara Okafor" && who.bio === "Ceramics and slow glazes." && who.avatar === "https://cdn.example.com/me.jpg")
check("its own links first, in order, with their thumbnails (an address's preview picture too); a hidden one left out", who.links[0].label === "Studio visits" && who.links[0].picture === "https://cdn.example.com/visit.jpg" && who.links[1].label === "Map" && who.links[1].picture === "https://cdn.example.com/map.png" && !who.links.some((l) => l.label === "Hidden one") && who.links.every((l) => !l.sample))
check("its own product with its price, picture and button words, then a sample", who.products[0].title === "Moon jar" && who.products[0].price === "$120.00" && who.products[0].picture === "https://cdn.example.com/jar.jpg" && who.products[0].cta === "Order" && !who.products[0].sample && who.products[1].sample)
check("its newsletter's words, the button as the page picks it", who.news.headline === "Kiln notes" && who.news.desc === "When the kiln opens." && who.news.button === "Join Now")
check("only the socials it filled in", who.socials.join(",") === "instagram,website")
check("a free product reads Free", previewAccountOf({ draft_blocks: [{ type: "product", data: { product_title: "Zine", product_price_cents: 0 } }] }, money).products[0].price === "Free")
/* Wave 15, the owner: "in the theme previews get rid of the vague things like 'My link'". */
const defaults = previewAccountOf({ title: "Satori Studio", draft_blocks: [
  { type: "link_button", enabled: true, data: { label: "My Link", url: "https://" } },
  { type: "link_button", enabled: true, data: { label: "Mein Link", url: "https://" } },
  { type: "link_button", enabled: true, data: { label: "Link 2", url: "https://x" } },
  { type: "link_button", enabled: true, data: { label: "Shop the prints", url: "https://x" } },
  { type: "product", enabled: true, data: { product_title: "Untitled product", product_price_cents: 900 } },
] }, money)
check("a link with only the editor's default words (any language) is not drawn; the creator's own is, then specific samples", defaults.links[0].label === "Shop the prints" && !defaults.links[0].sample && defaults.links.length === 2 && defaults.links[1].sample && !defaults.links.some((l) => /link|lien|enlace/i.test(l.label)), defaults.links.map((l) => l.label).join(" | "))
check("a product with a default title is left for a sample", defaults.products.every((p) => p.sample))
check("words that only look like numbers are the creator's", isDefaultLabel("My Link") && isDefaultLabel("  ") && isDefaultLabel("mój link") && !isDefaultLabel("2024") && !isDefaultLabel("Link in bio") && !isDefaultLabel("Top 10"))
check("every card shows two links before anything else, in every layout", (() => { const s = slotsFor(empty); return s[0].kind === "link" && s[1].kind === "link" && s[2].kind === "product" && s[3].kind === "news" })())

console.log("\nThe card")
const preview = read("components/onepage/themes/theme-preview.tsx")
check("the card draws the account it is given, no made-up creator", /export function ThemePreview\(\{ c: given, who, thumb \}/.test(preview) && !/usePreviewContent|faceUri|artUri|creatorFor/.test(preview))
check("the photo is the optimizer's copy, clipped to the avatar's shape; no photo is the page's monogram", /onePageImageSrc\(face, 160\)/.test(preview) && /overflow-hidden text-2xl font-semibold shadow-lg/.test(preview) && /data-tp-monogram=""/.test(preview) && /c\.button_style === "glass" \|\| c\.button_style === "outline"/.test(preview))
check("a Hero only with a photo, as the page does", /const hero = c\.header_layout === "hero" && !!who\.avatar/.test(preview))
check("links are the page's .op-btn with the theme's hover and its variables", /"op-btn relative flex w-full items-center justify-center font-medium"/.test(preview) && /\{ \.\.\.themeButtonStyle\(theme\), \.\.\.buttonHoverVars\(theme\) \}/.test(preview) && /"data-hover": buttonHover\(theme\)/.test(preview))
check("a plain link under Cards is the page's taller row", /compact: "min-h-\[66px\] py-4", regular: "min-h-\[80px\] py-5", large: "min-h-\[96px\] py-6"/.test(preview))
/* Changed on purpose (wave 15): a tint of the theme's colours read as a grey box on plain and dark themes; a sample now has its own clean picture made of gradients. */
check("a sample picture is a clean gradient picture of its own, never a grey tint, a file or a drawing of a person", /const SAMPLE_PICTURES: readonly React\.CSSProperties\[\] = \[/.test(preview) && !/const tintOfPicture = /.test(preview) && !/data:image\/svg/.test(preview) && /p\.sample \? samplePicture\(at\)/.test(preview))
check("nothing on a card can be selected or called out", /select-none overflow-hidden text-left \[-webkit-touch-callout:none\]/.test(preview))
check("the header never shrinks under the blocks", /w-\[calc\(100%\+40px\)\] shrink-0" style=\{\{ marginTop: -heroShift \}\} data-tp-header="hero"/ /* Changed on purpose (wave 15): the shift depends on the layout (tiles are taller). */.test(preview) && /"flex w-full shrink-0 flex-col gap-3"/.test(preview))
/* Changed on purpose (wave 15): the live Hero is 8:9 on a phone (round R3), so the card is too, scrolled less; its words carry the page's halo. */
check("a Hero card is the live 8:9 Hero, scrolled so its name, socials and first link show", /export const HERO_CARD_SHIFT = 72/.test(preview) && /export const HERO_TILE_CARD_SHIFT = 116/.test(preview) && /const HERO_ASPECT = "8\/9"/.test(preview) && /aspectRatio: HERO_ASPECT, maskImage: HERO_FADE_MASK/.test(preview) && /const aspectRatio = isDesktop \? "5\/4" : "8\/9"/.test(read("components/onepage/public-onepage.tsx")) && /textShadow: hero \? `0 1px 14px \$\{halo\}/.test(preview) && !/rgba\(0,0,0,0\.4\)/.test(preview))
check("the newsletter's button is drawn at full strength", !/opacity-(50|60)/.test(preview.slice(preview.indexOf("const newsletter"), preview.indexOf("/* The blocks, in their order"))))
const design = read("components/onepage/tabs/design-tab.tsx")
check("the Design tab builds the account once from what the editor holds (no new query)", /const avatar = useShellAvatar\(onepage\?\.avatar_url, onepage\?\.owner_id\)/.test(design) && /previewAccountOf\(onepage \? \{ \.\.\.onepage, avatar_url: avatar \} : null/.test(design) && /<ThemeCard template=\{template\} who=\{who\}/.test(design) && !/loadPreviewContent/.test(design))
/* Changed on purpose (wave 15): the owner: hovering a card "must not hover the buttons inside them". The card lifts; nothing inside takes the pointer. */
/* Wave 15: the reworked Renaissance (track renaissance) draws a gilt quatrefoil rule under the name and a soft scrim under the header's words; its skin's rules reach only the live page's header, so the card draws both itself. */
check("a Renaissance card draws the gilt rule under the name, the header's scrim and the name's tight leading", /themeSkinOf\(c as never\) === "renaissance"/.test(preview) && /data-tp-rule="" className="block h-\[14px\] w-\[132px\] shrink-0"/.test(preview) && /var\(--rn-q\) center \/ 26px 14px no-repeat/.test(preview) && /\{title\}\n\s*\{quatrefoil\}\n\s*\{bio\}/.test(preview) && /data-tp-scrim=""/.test(preview) && /renaissance && !hero \? \{ lineHeight: 1\.05 \}/.test(preview))
check("a Design tab card cannot be selected, lifts on hover, and nothing inside it hovers", /cursor-pointer select-none flex-col rounded-2xl/.test(design) && /data-theme-frame="" className="relative block aspect-\[5\/7\]/.test(design) && /hover:-translate-y-0\.5 motion-reduce/.test(design) && !/data-template-frame="" className="op-demo/.test(read("components/onepage/onboarding-modal.tsx")) && /className="pointer-events-none absolute left-0 top-0 block origin-top-left/.test(preview))
const onboarding = read("components/onepage/onboarding-modal.tsx")
check("the onboarding draws the person's own name, photo and socials", /previewAccountOf\(\{ title: displayName, bio, avatar_url: avatarUrl, social_links: socials, draft_blocks: onepage\?\.draft_blocks \}/.test(onboarding) && /who=\{templateWho\}/.test(onboarding) && /cursor-pointer select-none flex-col/.test(onboarding))
const account = read("components/onepage/themes/preview-account.ts")
check("the account module fetches nothing", !/fetch\(|createClient|supabase|import\(/.test(account))

console.log("\nStoicism")
const st = THEME_TEMPLATES.find((t) => t.id === "stoicism") as T | undefined
const sc = (st?.theme_config ?? {}) as T
check("Stoicism is listed, a dark theme, Plaster is not", !!st && st.name === "Stoicism" && st.category === "dark" && !THEME_TEMPLATES.some((t) => t.id === "plaster"))
check("its skin is stone, a skin the page knows", themeSkinOf(sc) === "stoicism" && (THEME_SKINS as readonly string[]).includes("stoicism"))
check("ivory tablets: solid, square, a hairline border, a Fill hover to stone", sc.button_style === "filled" && sc.button_color === "#ece6da" && sc.button_border_radius === 0 && sc.button_border_width === 1 && sc.button_hover_animation === "fill" && sc.button_hover_fill === "#0e0e0d")
check("Plaster's cover is kept, the same file", coverImageOf(sc) === "https://storelib.com/images/onepage-themes/plaster.svg" && statSync(join(root, "public/images/onepage-themes/plaster.svg")).size < 8000)
check("an editorial serif for the name", /Instrument Serif/.test(sc.title_font) && sc.title_size === "large")
check("STOICISM_LOOK is Stoicism's own settings", JSON.stringify(Object.keys(STOICISM_LOOK).sort().map((k) => [k, STOICISM_LOOK[k]])) === JSON.stringify(Object.keys(sc).sort().map((k) => [k, sc[k]])))
const old = { ...PLASTER_LOOK, template_id: "plaster", button_color: "#ff0000" } as T
const moved = withoutRetiredTheme(old) as T
check("a page saved on Plaster opens on Stoicism, the creator's own colour kept", isRetiredTheme("plaster") && moved.template_id === "stoicism" && moved.theme_skin === "stoicism" && moved.background_color === "#0e0e0d" && moved.button_color === "#ff0000" && moved.cover_image_url === PLASTER_LOOK.cover_image_url)
check("both of its themes move (draft and published)", (withoutRetiredThemes({ theme: { template_id: "plaster" }, published_theme: { template_id: "plaster" } }) as T).published_theme.template_id === "stoicism")
const skinSrc = read("scripts/onepage-skins/stoicism.mjs")
check("stone veins, a construction, a grid and a vignette, drawn here, still", /VEINS/.test(skinSrc) && /CONSTRUCTION/.test(skinSrc) && /data-sk="grid"/.test(skinSrc) && /data-sk="vignette"/.test(skinSrc) && !/animation:/.test(skinSrc))
check("the tablet's inner rule, kept under the pointer", /const tablet = /.test(skinSrc) && /\[data-hover="fill"\], \[data-hover="pop"\]\)::after/.test(skinSrc))
check("the stylesheet is what the skins' source writes", (() => { try { execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--check"], { stdio: "pipe" }); return true } catch { return false } })())
const pairs = JSON.parse(execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--pairs"]).toString()) as { skin: string; what: string; ink: string; under: string[]; faded?: boolean }[]
const own = pairs.filter((p) => p.skin === "stoicism")
const weak = own.filter((p) => p.under.some((u) => worstContrast({ ...parseColor(p.ink)!, a: p.faded ? 0.7 : 1 }, [parseColor(u)!]) < TEXT_MIN))
check("every pair of words and paint the skin promises reads at 4.5:1 (faded to 70% where it can be)", own.length >= 6 && weak.length === 0, weak.map((p) => p.what).join(", "))
const NAMES = /seneca|aurelius|epictetus|zeno|cleanthes|chrysippus|musonius/i
check("no philosopher's name anywhere in the theme, its skin or its cover", !NAMES.test(JSON.stringify(st)) && !NAMES.test(skinSrc) && !NAMES.test(read("public/images/onepage-themes/plaster.svg")))

console.log("\nDune")
const du = THEME_TEMPLATES.find((t) => t.id === "dune") as T | undefined
const dc = (du?.theme_config ?? {}) as T
check("Dune is listed: a gradient of sand with contour lines and frosted pills", !!du && du.category === "gradient" && dc.background_type === "gradient" && dc.background_pattern === "topographic" && dc.button_style === "glass" && dc.button_border_radius === 999 && dc.product_layout === "grid")
check("it has its place in the picker", themeGroupOf("dune") === "colour" && (THEME_GROUPS.find((g) => g.id === "colour")!.ids as readonly string[]).includes("dune"))
check("Stoicism sits with the themes that have a material of their own, after Renaissance", themeGroupOf("stoicism") === "styled" && (THEME_GROUPS[4].ids as readonly string[])[1] === "stoicism")

console.log("\nBoth new looks")
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, t.theme_skin || "-"].join("|")
}
for (const [id, c] of [["stoicism", sc], ["dune", dc]] as const) {
  check(`${id}'s structure is its own`, THEME_TEMPLATES.filter((t) => t.id !== id && sig(t.theme_config as T) === sig(c)).length === 0, sig(c))
  const under: string[] = []
  for (const style of [undefined, "filled", "soft", "outline", "glass"]) {
    const t = readableTheme({ ...c, ...(style ? { button_style: style } : {}) }) as T
    const g = pageGrounds(t)
    const list: [string, string, typeof g, number][] = [["text", t.text_color, g, TEXT_MIN], ["small print", t.secondary_text_color, g, TEXT_MIN], ["title", t.title_color, g, TEXT_MIN], ["button words", t.button_text_color, buttonGrounds(t, g), TEXT_MIN], ["social", t.social_icon_color, g, LARGE_MIN]]
    for (const [what, ink, on, min] of list) { const r = worstContrast(parseColor(ink)!, on); if (r < min) under.push(`${style ?? "theme"} ${what} ${r.toFixed(2)}`) }
  }
  check(`every ${id} colour pair reads, in every button style`, under.length === 0, under.join(", "))
  if (c.button_hover_fill) check(`${id}'s hover words read on its hover fill`, worstContrast(parseColor(c.button_hover_text)!, [parseColor(c.button_hover_fill)!]) >= TEXT_MIN)
}
const names = read("components/onepage/themes/theme-names.ts")
const langs = ["es", "fr", "de", "pt-BR", "it", "pl"]
const missing = langs.filter((l) => { const w = readCatalog(join(root, "lib/i18n/catalog", `${l}.ts`)) as Record<string, string>; return !w["theme::Stoicism"] || !w["theme::Dune"] || "theme::Plaster" in w })
check("both are named in all six languages, and Plaster's name is gone", missing.length === 0 && /stoicism: \(\) => ttx\("theme", "Stoicism"\)/.test(names) && /dune: \(\) => ttx\("theme", "Dune"\)/.test(names) && !/plaster:/.test(names), missing.join(","))
check("these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-at1.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
