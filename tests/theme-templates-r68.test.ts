/**
 * Templates, round 68, after the owner's notes:
 *
 *   BUTTONS   "the button text black on that orange button. Fix it in all
 *             the templates": in every template's colour schemes each button
 *             pair (primary and secondary, at rest and hovered) reads at
 *             4.5:1 or more, and no saturated orange or red fill carries a
 *             dark label; Wellkept's hero and header buttons too. Installed
 *             themes are fixed as they draw (lib/storelib-theme/compat/
 *             button-label.ts, run by theme.ts renderDocument): a template's
 *             old default pair becomes its new one, a label under 4.5:1 is
 *             fixed, a label that reads is left as the creator set it
 *   EBOOK     Say It Plainly: a bolder, shorter heading, a cover and book
 *             drawn by scripts/theme-templates/draw-authorbook-r68.mjs, a logo
 *             with a mark, straight edges in place of the wave dividers
 *   DIGITAL   the Digital products announcement bar is black
 *   VSL       the funnel is Kitty, an eight week money course: nothing about
 *             Spanish or Hablo, no income or savings promises
 *   AI        Digital Renaissance's hero is the new photograph, credited
 *   HALFMOON  body text in Inter, headings still Onest
 *   BROWSE    Digital products is eleventh in Browse themes, Digital studio
 *             fourth
 *   COPY      none of the words CLAUDE.md bans, and no em dash
 *
 * scripts/check-button-labels-r68.mjs measures every button of every
 * template's prerendered preview in Chromium.
 *
 *   node <runner> tests/theme-templates-r68.test.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { SAMPLE_SHOPS } from "../scripts/theme-templates/shops"
import { contrast as contrastRgb, fixButtonLabels, fixPair, saturatedOrange, LEGACY_PAIRS } from "../lib/storelib-theme/compat/button-label"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const ROOT = process.cwd()
const TEMPLATES = join(ROOT, "theme-packages", "materia", "templates")
const read = (p: string) => readFileSync(p, "utf8")
const json = (p: string) => { const t = read(p); return JSON.parse(t.slice(t.indexOf("{"))) as Record<string, any> }
const settings = (f: string) => json(join(TEMPLATES, f, "config", "settings_data.json")).current
const folders = readdirSync(TEMPLATES).filter((d) => existsSync(join(TEMPLATES, d, "config", "settings_data.json")))
const filesOf = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesOf(join(dir, d.name)) : d.name.endsWith(".json") ? [join(dir, d.name)] : []))
const copyOf = (folder: string) => filesOf(join(TEMPLATES, folder)).map((f) => { const t = read(f); return t.slice(t.indexOf("{")) }).join("\n")
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const contrast = (a: string, b: string) => contrastRgb(rgb(a), rgb(b))
const HEX = /^#[0-9a-f]{6}$/i
const PAIRS = [["btn_primary_background", "btn_primary_color"], ["btn_primary_hover_background", "btn_primary_hover_color"], ["btn_secondary_background", "btn_secondary_color"], ["btn_secondary_hover_background", "btn_secondary_hover_color"]]

function main() {
  console.log("\nBUTTONS, the template data")
  const low: string[] = []
  const orange: string[] = []
  for (const f of folders) {
    for (const [id, s] of Object.entries(settings(f).color_schemes as Record<string, { settings: Record<string, string> }>)) {
      for (const [bg, fg] of PAIRS) {
        const b = s.settings[bg], c = s.settings[fg]
        if (!HEX.test(b ?? "") || !HEX.test(c ?? "")) continue
        if (contrast(b, c) < 4.5) low.push(`${f} ${id} ${bg} ${b}/${c} ${contrast(b, c).toFixed(2)}`)
        if (saturatedOrange(rgb(b)) && contrast(c, "#000000") < contrast(c, "#ffffff")) orange.push(`${f} ${id} ${bg} ${b}/${c}`)
      }
    }
  }
  check(`every button pair in every template's schemes reads at 4.5:1 or more (${folders.length} templates)`, low.length === 0, low)
  check("no orange or red button fill has a dark label", orange.length === 0, orange)
  const ws = settings("workspace").color_schemes.default.settings
  check("Wellkept's button is deep coral with a white label", ws.btn_primary_background === "#c4482b" && ws.btn_primary_color === "#ffffff" && contrast("#c4482b", "#ffffff") >= 4.5)
  const wsHome = json(join(TEMPLATES, "workspace", "templates", "index.json"))
  check("  its hero button is the same coral", wsHome.sections.hero.settings.accent === "#c4482b" && wsHome.sections.hero.settings.accent_hover === "#a93c23")
  const hero = read(join(ROOT, "theme-packages", "materia", "base", "sections", "workspace-hero.liquid"))
  check("  and the hero's label is white on a deep accent, black on a light one", /\.wsh__btn--a \{ color: lch\(from \{\{ st\.accent \}\} clamp\(0, \(64 - l\) \* 1000, 100\) 0 0\); \}/.test(hero))
  const wsHeader = read(join(TEMPLATES, "workspace", "sections", "header-group.json"))
  check("  and its header button", /"custom_bg": "#c4482b"/.test(wsHeader) && /"custom_text": "#ffffff"/.test(wsHeader) && !/f07a5c/i.test(wsHeader))

  console.log("\nBUTTONS, installed themes")
  check("Octavo's first orange with a dark label becomes the deep orange with white", fixPair("#f0b54a", "#1b1a16")?.join() === "#c2410c,#ffffff")
  check("Wellkept's old coral with a dark label becomes the new coral with white", fixPair("#f07a5c", "#13292c")?.join() === "#c4482b,#ffffff")
  check("a label the creator set that reads is left alone (black on #f0b54a, 11:1)", fixPair("#f0b54a", "#000000") === null)
  check("yellow keeps its dark label", fixPair("#f5c518", "#0c0c0c") === null)
  const weak = fixPair("#3aa73a", "#ffffff")
  check("white on a green too light for it: the green deepens until white reads", !!weak && weak[1] === "#ffffff" && contrast(weak[0], "#ffffff") >= 4.5, weak)
  const dark = fixPair("#f0b54a", "#8a6a2a")
  check("an unreadable dark label on orange turns white on a deeper orange", !!dark && dark[1] === "#ffffff" && contrast(dark[0], "#ffffff") >= 4.5, dark)
  const grey = fixPair("#f2f2f2", "#e0201b")
  check("a red label on light grey darkens until it reads", !!grey && grey[0] === "#f2f2f2" && contrast("#f2f2f2", grey[1]) >= 4.5, grey)
  for (const [k, [b, c]] of Object.entries(LEGACY_PAIRS)) if (contrast(b, c) < 4.5) check(`legacy pair ${k} maps to a readable pair`, false, [b, c])
  const page = `<style>.color-x { --btn-primary-color: #1b1a16; --btn-primary-bg-color: #f0b54a; --btn-primary-border-color: #f0b54a; }</style><a style="--hs-cta-bg: #f07a5c; --hs-cta-fg: #13292c; --hs-cta-bd: #f07a5c;">x</a><style>#s .wsh__btn--a { background: #f07a5c; color: #13292c; } #s .wsh__btn--a:hover { background: #e4654a; } #s .wsh__h { background: #f07a5c; color: #13292c; }</style>`
  const fixed = fixButtonLabels(page)
  check("the scheme variables, the header button and a button's own rule are all fixed in the drawn page", /--btn-primary-color: #ffffff; --btn-primary-bg-color: #c2410c; --btn-primary-border-color: #c2410c;/.test(fixed) && /--hs-cta-bg: #c4482b; --hs-cta-fg: #ffffff; --hs-cta-bd: #c4482b;/.test(fixed) && /\.wsh__btn--a \{ background: #c4482b; color: #ffffff; \}/.test(fixed) && /\.wsh__btn--a:hover \{ background: #a93c23; \}/.test(fixed), fixed)
  check("  and a rule that is not a button keeps its colours", /\.wsh__h \{ background: #f07a5c; color: #13292c; \}/.test(fixed))
  check("  a page with nothing to fix comes back as it was", fixButtonLabels("<style>.a{--btn-primary-color:#fff;--btn-primary-bg-color:#111}</style>") === "<style>.a{--btn-primary-color:#fff;--btn-primary-bg-color:#111}</style>")
  const theme = read(join(ROOT, "lib", "storelib-theme", "compat", "theme.ts"))
  check("theme.ts runs it over every page an installed theme draws", /import \{ fixButtonLabels \} from "\.\/button-label"/.test(theme) && /html = fixButtonLabels\(html\)/.test(theme))

  console.log("\nEBOOK")
  const book = json(join(TEMPLATES, "authorbook", "templates", "index.json"))
  const h = book.sections.hero.blocks.section_heading_1.settings
  check("the heading is short, bold and tight", h.heading_text === "Write words people read to the end" && h.heading_weight === "800" && h.heading_font_size >= 64 && h.letter_spacing < 0)
  check("no wave dividers", !Object.values(book.sections).some((s: any) => s.type === "waves-divider"))
  check("the book, its logo and the edition pictures are drawn by the round 68 script", existsSync(join(ROOT, "scripts", "theme-templates", "draw-authorbook-r68.mjs")) && /authorbook-book\.webp/.test(read(join(ROOT, "scripts", "theme-templates", "draw-authorbook-r68.mjs"))))
  check("the cover is not the reference's", !/very good copy/i.test(read(join(ROOT, "scripts", "theme-templates", "draw-authorbook-r68.mjs"))))

  console.log("\nDIGITAL")
  const top = json(join(TEMPLATES, "digital", "sections", "header-group.json")).sections.top_bar.settings
  const barBg = settings("digital").color_schemes[top.color_scheme].settings.background
  check("the announcement bar is black with white text", luminanceOf(barBg) < 0.01 && top.custom_text_color === "#ffffff" && top.enable_custom_colors === true, barBg)

  console.log("\nVSL")
  const vslCopy = copyOf("vslfunnel")
  check("the funnel is Kitty, a money course", /Get your money in order in eight weeks/.test(vslCopy) && SAMPLE_SHOPS.vslfunnel.name === "Kitty")
  const vshop = JSON.stringify(SAMPLE_SHOPS.vslfunnel)
  check("nothing about Spanish or Hablo is left", !/Hablo|Spanish|phrase card|conversation call/i.test(vslCopy + vshop), (vslCopy + vshop).match(/.{30}(Hablo|Spanish|phrase card|conversation call).{30}/i)?.[0])
  check("no promise of income or savings", !/(earn|make|save) \$|\$\d[\d,]* (a|per) (month|year)|passive income|financial freedom|get rich|guaranteed return/i.test(vslCopy + vshop))
  check("it says it is education, not advice", /not personal financial advice/.test(vslCopy) && /not personal financial advice/.test(vshop))

  console.log("\nAI COURSE")
  const ren = json(join(TEMPLATES, "renaissance", "templates", "index.json"))
  const credits = read(join(TEMPLATES, "CREDITS.md"))
  check("the hero is the man at his screen, with its alt text", /man working late at his desk/.test(ren.sections.hero.settings.image_alt))
  check("  credited", /\| renaissance \| assets\/renaissance-hero\.webp \| https:\/\/images\.unsplash\.com\/photo-1627244714766-94dab62ed964 \| Unsplash License \|/.test(credits))

  console.log("\nHALFMOON")
  const hm = settings("digistudio")
  check("body text in Inter, headings in Onest", hm.font_body_google_family === "Inter" && hm.font_heading_google_family === "Onest")

  console.log("\nBROWSE")
  const client = read(join(ROOT, "app", "(storelib)", "app", "website-builder", "website-builder-client.tsx"))
  const first = (client.match(/export const BROWSE_THEMES_FIRST = \[([^\]]+)\]/)?.[1] ?? "").match(/"[^"]+"/g)?.map((x) => x.slice(1, -1)) ?? []
  check("Digital products is eleventh and Digital studio fourth", first[10] === "digital-products" && first[3] === "digital-studio" && first.length === 12, first)

  console.log("\nCOPY")
  const AI = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform(s|ing)?|revolutioni[sz]e|game.?changer|leverage)\b/i
  const prose = (t: string) => (t.match(/"(?:[^"\\]|\\.)* (?:[^"\\]|\\.)*"/g) ?? []).join("\n")
  /* The drawing script's words are its HTML text, not its CSS (text-transform is a property). */
  const drawn = read(join(ROOT, "scripts", "theme-templates", "draw-authorbook-r68.mjs")).replace(/[a-z-]+\s*:[^;"`]*;/g, "").replace(/<[^>]+>/g, " ")
  const written = [vslCopy, vshop, JSON.stringify(book), drawn]
  const ai = written.map((t, i) => (i === 3 ? t : prose(t))).map((t) => t.match(new RegExp(`.{0,30}${AI.source}.{0,30}`, "i"))?.[0]).filter(Boolean)
  check("no AI words in the copy written this round", ai.length === 0, ai)
  check("no em dashes", !written.some((t) => t.includes("—")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

function luminanceOf(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

main()
