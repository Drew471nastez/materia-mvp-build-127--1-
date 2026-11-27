/**
 * Templates, round 67, after the owner's notes on the templates of rounds 28
 * to 30:
 *
 *   OCTAVO    buttons are a deep orange (#c2410c) with white text, 5.18:1,
 *             hover darker still; headings in Schibsted Grotesk with Albert
 *             Sans for text, not Libre Baskerville and Karla; a folded page
 *             logo and a favicon; how it works is the theme's own Image with
 *             text steps beside one picture (not the three animated scenes);
 *             buyer notes on the theme's Testimonial wall; product pages add
 *             how you get it, buyer notes and FAQ pro, and lose the three
 *             checks that repeated the ones beside the price
 *   TYPE      no font is the heading of every template; the ebook is Manrope
 *             at 800, the VSL funnel Plus Jakarta Sans and Figtree; Libre
 *             Baskerville is nobody's heading; every family is one the theme's
 *             More fonts loads (snippets/font-variables.liquid)
 *   VSL       the funnel is Hablo, a Spanish course for adults: nothing on
 *             its pages, sample shop or marketplace text is about clients,
 *             referrals or Fullbook
 *   STUDIO    Digital studio's sample brand is Halfmoon: no Wren or Ren
 *             Studio in its files, sample shop, SEO text or credits
 *   COPY      none of the words CLAUDE.md bans, and no em dash, in the copy
 *             written this round
 *
 * Measured in Chromium on the prerendered previews by
 * scripts/check-theme-templates-r67.mjs.
 *
 *   npx tsx tests/theme-templates-r67.test.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { SAMPLE_SHOPS } from "../scripts/theme-templates/shops"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const ROOT = process.cwd()
const BASE = join(ROOT, "theme-packages", "materia", "base")
const TEMPLATES = join(ROOT, "theme-packages", "materia", "templates")
const read = (p: string) => readFileSync(p, "utf8")
const json = (p: string) => { const t = read(p); return JSON.parse(t.slice(t.indexOf("{"))) as Record<string, any> }
const settings = (f: string) => json(join(TEMPLATES, f, "config", "settings_data.json")).current
const folders = readdirSync(TEMPLATES).filter((d) => existsSync(join(TEMPLATES, d, "config", "settings_data.json")))
const filesOf = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesOf(join(dir, d.name)) : d.name.endsWith(".json") ? [join(dir, d.name)] : []))
/* Text a visitor reads: every string in a template's JSON, its leading comment (history) left out. */
const copyOf = (folder: string) => filesOf(join(TEMPLATES, folder)).map((f) => { const t = read(f); return t.slice(t.indexOf("{")) }).join("\n")

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

function main() {
  console.log("\nOCTAVO")
  const oct = settings("newleaf")
  const schemes = Object.entries(oct.color_schemes as Record<string, { settings: Record<string, string> }>)
  const low = schemes.flatMap(([id, s]) => [["btn_primary_background", "btn_primary_color"], ["btn_primary_hover_background", "btn_primary_hover_color"]].filter(([bg, fg]) => /^#[0-9a-f]{6}$/i.test(s.settings[bg]) && /^#[0-9a-f]{6}$/i.test(s.settings[fg]) && contrast(s.settings[bg], s.settings[fg]) < 4.5).map(([bg]) => `${id}.${bg} ${s.settings[bg]}/${s.settings[bg.replace("background", "color")]}`))
  check("every scheme's primary button, at rest and hovered, has text at 4.5:1 or more", low.length === 0, low)
  check("the default scheme's button is the deep orange with white text", oct.color_schemes.default.settings.btn_primary_background === "#c2410c" && oct.color_schemes.default.settings.btn_primary_color === "#ffffff")
  check("white on #c2410c is 5.18:1", Math.round(contrast("#c2410c", "#ffffff") * 100) === 518)
  const octFiles = filesOf(join(TEMPLATES, "newleaf")).map(read).join("\n")
  check("no orange with dark text is left anywhere in Octavo (#f0b54a)", !/f0b54a/i.test(octFiles))
  check("Octavo's headings are Schibsted Grotesk at 600, its text Albert Sans", oct.font_heading_google_family === "Schibsted Grotesk" && oct.heading_font_weight === 600 && oct.font_body_google_family === "Albert Sans", [oct.font_heading_google_family, oct.heading_font_weight, oct.font_body_google_family])
  check("Octavo has a logo with a mark and a favicon", oct.logo === "shopify://shop_images/newleaf-logo.webp" && oct.favicon === "shopify://shop_images/newleaf-mark.webp" && existsSync(join(TEMPLATES, "newleaf", "assets", "newleaf-mark.webp")))
  const home = json(join(TEMPLATES, "newleaf", "templates", "index.json"))
  check("how it works is the theme's Image with text steps, not the animated scenes", home.sections.how.type === "image-with-text-steps" && !home.order.some((k: string) => home.sections[k].type === "newleaf-steps"))
  check("how it works shows one picture of the templates and four steps", home.sections.how.settings.image === "shopify://shop_images/newleaf-how.webp" && Object.values(home.sections.how.blocks).filter((b: any) => b.type === "step").length === 4 && existsSync(join(TEMPLATES, "newleaf", "assets", "newleaf-how.webp")))
  check("the home page has buyer notes on the Testimonial wall, folded on phones", home.sections.reviews?.type === "testimonial-wall" && home.sections.reviews.settings.collapse === "mobile")
  check("the hero's ruled lines are off (a cleaner first screen)", home.sections.hero.settings.ruled === false)
  const product = json(join(TEMPLATES, "newleaf", "templates", "product.json"))
  check("a product page adds how you get it, buyer notes and questions from the theme's own sections", ["how", "reviews", "faq"].every((k) => product.order.includes(k)) && product.sections.how.type === "image-with-text-steps" && product.sections.reviews.type === "testimonial-wall" && product.sections.faq.type === "faq-pro", product.order)
  check("the three checks that repeated the ones beside the price are gone", !product.order.includes("checks"))
  const wallSchema = read(join(BASE, "sections", "testimonial-wall.liquid"))
  check("the wall's collapse value is one the section offers", /"value": "mobile"/.test(wallSchema))
  const css = read(join(TEMPLATES, "newleaf", "sections", "header-group.json"))
  check("the theme's sections line up with the shelves (16px gutters, 90% from 1025px)", css.includes(".s-image-with-text-steps .iws__inner, .section-sticky-heading-text .sht__inner, .faq7 > .faq7__inner") && home.sections.how.settings.side_padding_desktop === 0)
  check("a count keeps its final width while it counts, so its label holds still", /\.stat-counter__number::after \{ content: attr\(data-final\);[^}]*tabular-nums/.test(css))
  const faqCss = read(join(BASE, "assets", "faq-pro.css"))
  check("FAQ pro's plus stays a plus for reduced motion (its bars keep their centring transform)", !/:is\(\.faq7__a-wrap, \.faq7__icon, \.faq7__icon-plus \*, \.faq7__btn\)/.test(faqCss) && /:is\(\.faq7__icon, \.faq7__icon-plus \*\) \{ transition: none !important; \}/.test(faqCss))

  console.log("\nTYPE")
  const loadable = new Set(read(join(BASE, "snippets", "font-variables.liquid")).match(/assign mt_fonts = '([^']+)'/)![1].split("|").map((r) => r.split(":")[0]))
  const heads = folders.map((f) => ({ f, head: settings(f).font_heading_google_family, body: settings(f).font_body_google_family }))
  const counts = new Map<string, number>()
  for (const h of heads) counts.set(h.head, (counts.get(h.head) ?? 0) + 1)
  check("no heading font is every template's", [...counts.values()].every((n) => n < folders.length), Object.fromEntries(counts))
  check("Libre Baskerville is no template's heading", heads.every((h) => h.head !== "Libre Baskerville"), heads.filter((h) => h.head === "Libre Baskerville"))
  const mine = heads.filter((h) => ["newleaf", "authorbook", "vslfunnel", "digistudio"].includes(h.f))
  check("each family changed this round is one the theme loads", mine.every((h) => loadable.has(h.head) && loadable.has(h.body)), mine)
  const book = settings("authorbook")
  check("the ebook is Manrope at 800", book.font_heading_google_family === "Manrope" && book.heading_font_weight === 800 && book.font_body_google_family === "Manrope")
  const vsl = settings("vslfunnel")
  check("the VSL funnel is Plus Jakarta Sans and Figtree, in sentence case", vsl.font_heading_google_family === "Plus Jakarta Sans" && vsl.font_body_google_family === "Figtree" && vsl.heading_text_transform === "unset")
  const ours = ["Schibsted Grotesk", "Manrope", "Plus Jakarta Sans"]
  check("the three new heading families are each one template's", ours.every((f) => counts.get(f) === 1), ours.map((f) => [f, counts.get(f)]))

  console.log("\nVSL")
  const vslCopy = copyOf("vslfunnel")
  check("no page of the funnel is about clients, referrals or Fullbook", !/Fullbook|referral|freelancer|outreach|proposal/i.test(vslCopy), (vslCopy.match(/.{30}(Fullbook|referral|freelancer|outreach|proposal).{30}/i) ?? [])[0])
  check("the funnel is Hablo, a Spanish course", /Speak Spanish with real people in eight weeks/.test(vslCopy) && SAMPLE_SHOPS.vslfunnel.name === "Hablo")
  const vshop = JSON.stringify(SAMPLE_SHOPS.vslfunnel)
  check("its sample shop's products and posts are the course's", !/Fullbook|referral|freelancer|outreach|proposal|client/i.test(vshop), vshop.match(/.{30}(Fullbook|referral|freelancer|outreach|proposal|client).{30}/i)?.[0])
  const seo = read(join(ROOT, "lib", "themes", "theme-seo.ts"))
  const vslSeo = seo.slice(seo.indexOf('slug: "vsl-funnel"'), seo.indexOf("  },", seo.indexOf('slug: "vsl-funnel"')))
  check("its marketplace text is the course's", /Hablo, an eight week Spanish course/.test(vslSeo) && !/client acquisition|freelancer|referral/i.test(vslSeo))

  console.log("\nSTUDIO")
  const banned = /\bW?ren Studio\b|wrenstudio/i
  const studioFiles = [...filesOf(join(TEMPLATES, "digistudio")), join(ROOT, "lib", "themes", "theme-seo.ts"), join(ROOT, "lib", "themes", "marketplace-shared.ts"), join(TEMPLATES, "CREDITS.md"), join(ROOT, "lib", "storelib-ai", "materia", "catalogue.generated.ts")]
  const hits = studioFiles.filter((f) => banned.test(read(f)))
  check("no Wren or Ren Studio in Digital studio's files, SEO text, credits or the AI builder's catalogue", hits.length === 0, hits.map((f) => f.slice(ROOT.length)))
  check("its sample shop is Halfmoon", SAMPLE_SHOPS.digistudio.name === "Halfmoon" && /Halfmoon/.test(copyOf("digistudio")))

  console.log("\nCOPY")
  const AI = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform(s|ing)?|revolutioni[sz]e|game.?changer|leverage)\b/i
  const written = [JSON.stringify(home.sections.how), JSON.stringify(home.sections.reviews), JSON.stringify(product.sections.faq), vslCopy, vshop, vslSeo]
  /* Only the sentences: a string with a space in it (a setting such as "transform": "uppercase" is not copy). */
  const prose = (t: string) => (t.match(/"(?:[^"\\]|\\.)* (?:[^"\\]|\\.)*"/g) ?? []).join("\n")
  const ai = written.map(prose).map((t) => t.match(new RegExp(`.{0,30}${AI.source}.{0,30}`, "i"))?.[0]).filter(Boolean)
  check("no AI words in this round's copy", ai.length === 0, ai)
  check("no em dash in this round's copy", written.every((t) => !t.includes("—")))

  console.log("\nCHECKS")
  const runner = read(join(ROOT, "scripts", "run-push-tests.mjs"))
  check("this test runs with the suite", runner.includes('"tests/theme-templates-r67.test.ts"'))
  check("the Chromium measurement exists", existsSync(join(ROOT, "scripts", "check-theme-templates-r67.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
