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

/*
  Changed on purpose (the theme swatch round): the sections "A brand new
  account", "An account with a page" and "The card" checked that every theme
  card drew the creator's own page (components/onepage/themes/preview-account
  and theme-preview). The owner asked for that to go ("get rid of our current
  ones that fetch buttons randomly or actual profile avatar"): a card is a
  swatch of the theme now and draws no account
  (components/onepage/themes/theme-swatch, tests/onepage-swatch-themes.test.ts).
  Those two modules are deleted, so their checks went with them.
*/
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
