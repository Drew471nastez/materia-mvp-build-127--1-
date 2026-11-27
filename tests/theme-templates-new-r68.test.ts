/**
 * Two new templates, round 68:
 *
 *   LUT SHOP    Coldframe (theme-packages/materia/templates/lutshop), LUT
 *               packs and video editing assets by one colourist: before and
 *               afters under a line you drag, where a LUT goes in Premiere
 *               Pro, DaVinci Resolve, Final Cut Pro and CapCut, transitions,
 *               overlays, sound effects, bundles, a licence page
 *   CHALLENGE   Letterday (templates/challenge), a five day challenge funnel
 *               after the structure of the owner's reference: a sales page,
 *               an opt-in, an order step with an order bump, a one time
 *               offer with a no thanks link and a thank you page, each a
 *               template of the theme
 *   SETTINGS    no section of either turns on its own colours, fonts or
 *               buttons: everything reads the theme settings and its colour
 *               schemes, and every scheme a section names exists
 *   HONEST      real photographs, credited; no countdown, no fake orders, no
 *               income claims; no AI words and no em dash in the copy
 *   LISTED      both are in the marketplace (CODE_TEMPLATES, the SEO pages,
 *               covers and prerendered previews), added after the others
 *
 * Measured in Chromium on the prerendered previews by
 * scripts/check-theme-templates-new-r68.mjs (no overflow at 390, no broken
 * pictures, button contrast as drawn).
 *
 *   node scripts/run-push-tests.mjs (or the single suite runner)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { CODE_TEMPLATES, templateCoverPath, templatePhonePath } from "../lib/themes/marketplace-shared"
import { THEME_SEO, THEME_SEO_CATEGORIES } from "../lib/themes/theme-seo"
import { TEMPLATE_PREVIEW_GROUNDS } from "../lib/themes/template-preview-grounds"
import { SAMPLE_SHOPS } from "../scripts/theme-templates/shops"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`) }
}

const ROOT = process.cwd()
const BASE = join(ROOT, "theme-packages", "materia", "base")
const TEMPLATES = join(ROOT, "theme-packages", "materia", "templates")
const read = (p: string) => readFileSync(p, "utf8")
type Section = { type: string; settings?: Record<string, any>; blocks?: Record<string, { type: string; settings?: Record<string, any> }>; block_order?: string[]; disabled?: boolean }
const json = (p: string) => { const t = read(p); return JSON.parse(t.slice(t.indexOf("{"))) as Record<string, any> }
const page = (t: string, f: string) => json(join(TEMPLATES, t, "templates", f)) as { sections: Record<string, Section>; order: string[] }
const group = (t: string, f: string) => json(join(TEMPLATES, t, "sections", f)) as { sections: Record<string, Section>; order?: string[] }
const settingsOf = (t: string) => json(join(TEMPLATES, t, "config", "settings_data.json")).current as Record<string, any>
const filesOf = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesOf(join(dir, d.name)) : [join(dir, d.name)]))
const jsonFiles = (t: string) => filesOf(join(TEMPLATES, t)).filter((f) => f.endsWith(".json"))
/* Every section of a template: its pages and its header, footer and overlay groups. */
function sectionsOf(t: string): { file: string; key: string; s: Section }[] {
  return jsonFiles(t).filter((f) => !f.endsWith("settings_data.json") && !f.endsWith("menus.json")).flatMap((f) => Object.entries((json(f).sections ?? {}) as Record<string, Section>).map(([key, s]) => ({ file: f.slice(TEMPLATES.length + 1), key, s })))
}
/* Text a visitor reads: the strings with a space in them, comments (history) left out. */
const copyOf = (t: string) => jsonFiles(t).map((f) => { const x = read(f); return x.slice(x.indexOf("{")) }).join("\n")
const prose = (t: string) => (t.match(/"(?:[^"\\]|\\.)* (?:[^"\\]|\\.)*"/g) ?? []).join("\n")

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
function hue(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return { h: 0, s: 0 }
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)) }
}
const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const NEW = [{ t: "lutshop", slug: "lut-shop" }, { t: "challenge", slug: "challenge-funnel" }]
const CUSTOM = /^(enable_custom_style|enable_custom_colors|enable_custom_colours|enable_custom_typography|enable_custom_fonts|use_custom_text|use_custom_bg|custom_colors|custom_style|enable_custom_card_colors)$/

function main() {
  console.log("\nLISTED")
  const at = (slug: string) => CODE_TEMPLATES.findIndex((c) => c.slug === slug)
  for (const { t, slug } of NEW) {
    const c = CODE_TEMPLATES.find((x) => x.slug === slug)
    check(`${slug} is a marketplace template from ${t}`, c?.template === t)
    check(`  it has an SEO page, a category that lists it and preview grounds`, THEME_SEO.some((s) => s.slug === slug) && THEME_SEO_CATEGORIES.some((g) => g.members.includes(slug)) && !!TEMPLATE_PREVIEW_GROUNDS[slug])
    check(`  its cover, phone cover and prerendered home page are written`, existsSync(join(ROOT, "public", templateCoverPath(t))) && existsSync(join(ROOT, "public", templatePhonePath(t))) && existsSync(join(ROOT, "public", "theme-previews", slug, "index.html")))
    check(`  its sample shop has products, each with a picture on disk`, (SAMPLE_SHOPS[t]?.products.length ?? 0) >= 3 && SAMPLE_SHOPS[t].products.every((p) => [p.image, ...(p.images ?? [])].every((i) => !i || existsSync(join(ROOT, "scripts", "theme-templates", "products", t, i)))))
  }
  check("both are added after every earlier template, so the order of the others is unchanged", at("lut-shop") > at("notion-template-shop") && at("challenge-funnel") === at("lut-shop") + 1)

  console.log("\nSETTINGS")
  const loadable = new Set(read(join(BASE, "snippets", "font-variables.liquid")).match(/assign mt_fonts = '([^']+)'/)![1].split("|").map((r) => r.split(":")[0]))
  const folders = readdirSync(TEMPLATES).filter((d) => existsSync(join(TEMPLATES, d, "config", "settings_data.json")))
  for (const { t } of NEW) {
    const st = settingsOf(t)
    const schemes = st.color_schemes as Record<string, { settings: Record<string, string> }>
    const all = sectionsOf(t)
    const missingTypes = [...new Set(all.map((x) => x.s.type))].filter((type) => !existsSync(join(BASE, "sections", `${type}.liquid`)))
    check(`${t}: every section is one of the theme's own`, missingTypes.length === 0, missingTypes)
    const own = all.flatMap(({ file, key, s }) => [
      ...Object.entries(s.settings ?? {}).filter(([k, v]) => CUSTOM.test(k) && v === true).map(([k]) => `${file} ${key}.${k}`),
      ...Object.entries(s.blocks ?? {}).flatMap(([b, blk]) => Object.entries(blk.settings ?? {}).filter(([k, v]) => (CUSTOM.test(k) && v === true) || (k === "use_theme_button" && v === false)).map(([k]) => `${file} ${key}.${b}.${k}`)),
      ...Object.entries(s.settings ?? {}).filter(([k, v]) => k === "use_theme_button" && v === false).map(([k]) => `${file} ${key}.${k}`),
    ]).filter((x) => !x.includes("overlay-group"))
    check(`  no section or block turns on its own colours, fonts or buttons`, own.length === 0, own)
    const named = [...new Set(all.map((x) => x.s.settings?.color_scheme).filter(Boolean))] as string[]
    check(`  every colour scheme a section names is one of the theme's (${Object.keys(schemes).length})`, named.every((n) => n in schemes), named.filter((n) => !(n in schemes)))
    const low = Object.entries(schemes).flatMap(([id, s]) => [["btn_primary_background", "btn_primary_color"], ["btn_primary_hover_background", "btn_primary_hover_color"], ["background", "text_color"], ["background", "heading_color"]]
      .filter(([a, b]) => contrast(s.settings[a], s.settings[b]) < 4.5).map(([a, b]) => `${id} ${a}/${b} ${contrast(s.settings[a], s.settings[b]).toFixed(2)}`))
    check(`  text and primary buttons in every scheme are 4.5:1 or more`, low.length === 0, low)
    check(`  its fonts are ones the theme loads (${st.font_heading_google_family}, ${st.font_body_google_family})`, loadable.has(st.font_heading_google_family) && loadable.has(st.font_body_google_family))
    check(`  its heading font is no other template's`, folders.filter((f) => settingsOf(f).font_heading_google_family === st.font_heading_google_family).length === 1)
    const pics = [...new Set((copyOf(t).match(/shopify:\/\/shop_images\/[A-Za-z0-9._-]+/g) ?? []).map((u) => u.split("/").pop()!))]
    check(`  every picture a page names is in its assets (${pics.length})`, pics.every((p) => existsSync(join(TEMPLATES, t, "assets", p))), pics.filter((p) => !existsSync(join(TEMPLATES, t, "assets", p))))
    check(`  a logo and a favicon of its own`, existsSync(join(TEMPLATES, t, "assets", String(st.logo).split("/").pop()!)) && existsSync(join(TEMPLATES, t, "assets", String(st.favicon).split("/").pop()!)) && String(st.logo).includes(t))
  }

  console.log("\nLUT SHOP")
  const lut = page("lutshop", "index.json")
  const sliders = lut.order.map((k) => lut.sections[k]).filter((s) => s.type === "before-and-after-slider-2")
  check("the home page opens on a before and after you drag", lut.sections[lut.order[0]].type === "before-and-after-slider-2")
  check("  four before and afters, each a log frame against a graded one", sliders.length === 4 && sliders.every((s) => { const b = Object.values(s.blocks!).find((x) => x.type === "slider")!.settings!; return /-before\.webp$/.test(b.before_image) && /-after\.webp$/.test(b.after_image) && b.before_label === "Log" }))
  const apps = JSON.stringify(lut.sections.apps)
  check("it says where a LUT goes in Premiere Pro, DaVinci Resolve, Final Cut Pro and CapCut", ["Premiere Pro", "DaVinci Resolve", "Final Cut Pro", "CapCut"].every((a) => apps.includes(a)))
  const lshop = SAMPLE_SHOPS.lutshop
  check("the shop sells LUT packs, transitions, overlays, sound effects, a free LUT and a bundle", ["LUTs", "Transitions", "Overlays", "Sound Effects"].every((w) => lshop.products.some((p) => p.title.includes(w))) && lshop.products.some((p) => p.price === "$0.00") && lshop.products.some((p) => !!p.compare))
  const handles = new Set((lshop.collections ?? []).map((c) => c.handle))
  const kinds = Object.values(lut.sections.kinds.blocks!).filter((b) => b.type === "collection").map((b) => b.settings!.collection)
  check("  the four kinds link to collections the shop has", kinds.length === 4 && kinds.every((k) => handles.has(k)))
  const menuLinks = JSON.stringify(json(join(TEMPLATES, "lutshop", "menus.json"))).match(/\/collections\/[a-z-]+/g) ?? []
  check("  every collection the menus link to exists", menuLinks.every((l) => l === "/collections/all" || handles.has(l.split("/").pop()!)))
  const pd = JSON.stringify(lut.sections.kit)
  check("  the bundles name products the shop has", ["the-full-kit", "teal-hour-luts"].every((h) => pd.includes(h) && lshop.products.some((p) => slugOf(p.title) === h)))
  check("a licence page, and the product page says instant download and the apps", existsSync(join(TEMPLATES, "lutshop", "templates", "page.licence.json")) && /Instant download/.test(JSON.stringify(page("lutshop", "product.json"))) && /CapCut/.test(JSON.stringify(page("lutshop", "product.json"))))
  const lSettings = settingsOf("lutshop")
  check("it is dark like a grading suite: the default scheme's background is near black", luminance(lSettings.color_schemes.default.settings.background) < 0.01)

  console.log("\nCHALLENGE")
  const ch = (f: string) => page("challenge", f)
  for (const f of ["index.json", "page.free-lesson.json", "product.json", "page.one-time-offer.json", "page.thank-you.json"]) check(`the funnel step ${f} is a template of the theme`, existsSync(join(TEMPLATES, "challenge", "templates", f)))
  const sales = ch("index.json")
  const types = sales.order.map((k) => sales.sections[k].type)
  check("the sales page runs: video, problem, what you learn, the days, bonuses, host, testimonials, price, guarantee, questions, last call",
    JSON.stringify(types) === JSON.stringify(["vslfunnel-video", "comparison-cards", "Image-and-video-text", "feature-timeline", "text-columns", "Image-and-video-text", "testimonials", "featured-product", "guarantee-banner", "faq", "banner3"]), types)
  const days = Object.values(sales.sections.days.blocks!).filter((b) => b.type === "item")
  check("  five days, Day 1 to Day 5, each with a photograph", days.length === 5 && days.every((d, i) => d.settings!.label === `Day ${i + 1}` && /^shopify:\/\/shop_images\/challenge-day-\d\.webp$/.test(d.settings!.image)))
  check("  three bonuses", Object.values(sales.sections.bonuses.blocks!).filter((b) => b.type === "column" && /^Bonus \d$/.test(b.settings!.label)).length === 3)
  const ctas = JSON.stringify(sales).match(/"(?:button_link|link)":"[^"]*"/g) ?? []
  const toOffer = ctas.filter((l) => l.includes("/#shopify-section-offer"))
  check("  the calls to action go to the offer, repeated down the page, and none to a product a store may not have", toOffer.length >= 4 && !/\/products\//.test(JSON.stringify(sales)), ctas)
  check("  the price stack is the challenge itself (its picture and price are the product's), with the order bump and buy buttons", sales.sections.offer.type === "featured-product" && sales.sections.offer.settings!.product === "the-first-issue-challenge" && Object.values(sales.sections.offer.blocks!).some((b) => b.type === "product_addon" && b.settings!.addon_product === "subject-line-swipe-file") && Object.values(sales.sections.offer.blocks!).some((b) => b.type === "buy_buttons"))
  const cshop = SAMPLE_SHOPS.challenge
  const has = (h: string) => cshop.products.some((p) => slugOf(p.title) === h)
  check("  the products the funnel sells exist: the challenge, the bump, the one time offer", ["the-first-issue-challenge", "subject-line-swipe-file", "the-issue-library"].every(has))
  const optin = ch("page.free-lesson.json")
  check("the opt-in page has a video and an email form", optin.order.some((k) => optin.sections[k].type === "vslfunnel-video" && optin.sections[k].settings!.show_video) && optin.order.some((k) => optin.sections[k].type === "newsletter-split"))
  const order = ch("product.json").sections.main
  const bump = Object.values(order.blocks!).find((b) => b.type === "product_addon")
  check("the order step has an order bump: a ticked box that adds the subject line file", !!bump && bump.settings!.addon_product === "subject-line-swipe-file" && has(bump.settings!.addon_product))
  const blocks = order.block_order!.map((k) => order.blocks![k].type)
  check("  the bump sits under what you get and above the buy buttons", blocks.indexOf("whats_included") < blocks.indexOf("product_addon") && blocks.indexOf("product_addon") < blocks.indexOf("buy_buttons"))
  const row = Object.values(order.blocks!).find((b) => b.type === "guarantee_row")!.settings!
  check("  its guarantee row is about a download, not delivery or returns", row.title_1 && !/delivery|returns/i.test(JSON.stringify(row)))
  const oto = JSON.stringify(ch("page.one-time-offer.json"))
  const otoPage = ch("page.one-time-offer.json")
  check("the one time offer sells the Issue Library with its own buy buttons, and has a no thanks link to the thank you page", otoPage.order.some((k) => otoPage.sections[k].type === "featured-product" && otoPage.sections[k].settings!.product === "the-issue-library") && (oto.match(/No thanks, take me to my order/g) ?? []).length >= 2 && /\/pages\/thank-you/.test(oto))
  const ty = ch("page.thank-you.json")
  check("the thank you page lists next steps", Object.values(ty.sections.next.blocks!).filter((b) => b.type === "step").length === 3)
  const cs = settingsOf("challenge").color_schemes as Record<string, { settings: Record<string, string> }>
  const purple = Object.entries(cs).flatMap(([id, s]) => Object.entries(s.settings).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).filter(([, v]) => { const { h, s: sat } = hue(v); return h >= 250 && h <= 320 && sat > 0.15 }).map(([k, v]) => `${id}.${k} ${v}`))
  check("not purple: no scheme colour is a violet or a purple", purple.length === 0, purple)
  check("  Fraunces headings over DM Sans", settingsOf("challenge").font_heading_google_family === "Fraunces" && settingsOf("challenge").font_body_google_family === "DM Sans")

  console.log("\nHONEST")
  const credits = read(join(TEMPLATES, "CREDITS.md"))
  for (const { t } of NEW) {
    const assets = readdirSync(join(TEMPLATES, t, "assets"))
    const uncredited = assets.filter((a) => !credits.includes(`assets/${a}`))
    check(`${t}: every picture is credited in CREDITS.md (${assets.length})`, uncredited.length === 0, uncredited)
    check(`  and every product picture folder is too`, credits.includes(`scripts/theme-templates/products/${t}/`))
    const urgency = sectionsOf(t).filter(({ s }) => /countdown|timer|fake-order|stock-countdown|spin-wheel/i.test(s.type) && !s.disabled).map(({ file, key }) => `${file} ${key}`)
    check(`  no countdown, timer, spin wheel or made up order popup is switched on`, urgency.length === 0, urgency)
    const blockTimers = sectionsOf(t).filter(({ s }) => !s.disabled).flatMap(({ key, s }) => Object.entries(s.blocks ?? {}).filter(([, b]) => /countdown|offer_timer|stock_countdown|low_stock|stock_pulse/.test(b.type)).map(([b]) => `${key}.${b}`))
    check(`  no countdown or low stock block in a section that is switched on either`, blockTimers.length === 0, blockTimers)
  }
  const funnelCopy = prose(copyOf("challenge")) + JSON.stringify(SAMPLE_SHOPS.challenge)
  const claims = funnelCopy.match(/.{0,30}\b(income|revenue|earn(ed|ing)?|make money|six figures|passive|per month in sales|guaranteed results)\b.{0,30}/i)
  check("the funnel makes no income or results claims", !claims, claims?.[0])
  check("  and says the next round starts on the first Monday, not a date that runs out", /first Monday/.test(funnelCopy) && !/\b(midnight|ends tonight|only \d+ spots|hurry|last chance)\b/i.test(funnelCopy))

  console.log("\nCOPY")
  const AI = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform(s|ing|ation)?|revolutioni[sz]e|game.?changer|leverage|unleash|empower)\b/i
  const seo = read(join(ROOT, "lib", "themes", "theme-seo.ts"))
  const seoOf = (slug: string) => seo.slice(seo.indexOf(`slug: "${slug}"`), seo.indexOf("\n  },", seo.indexOf(`slug: "${slug}"`)))
  const written = [...NEW.map(({ t }) => prose(copyOf(t))), JSON.stringify(SAMPLE_SHOPS.lutshop), JSON.stringify(SAMPLE_SHOPS.challenge), seoOf("lut-shop"), seoOf("challenge-funnel")]
  const ai = written.map((t) => t.match(new RegExp(`.{0,30}${AI.source}.{0,30}`, "i"))?.[0]).filter(Boolean)
  check("no AI words in the two templates, their sample shops or their marketplace text", ai.length === 0, ai)
  check("no em dash in any of it", written.every((t) => !t.includes("—")), written.map((t) => t.match(/.{0,30}—.{0,30}/)?.[0]).filter(Boolean))

  console.log("\nPREVIEWS")
  for (const p of ["index.html", "pages/free-lesson.html", "pages/one-time-offer.html", "pages/thank-you.html", "products/the-first-issue-challenge.html"]) check(`challenge-funnel/${p} is prerendered`, existsSync(join(ROOT, "public", "theme-previews", "challenge-funnel", p)))
  for (const p of ["index.html", "pages/licence.html", "products/teal-hour-luts.html", "collections/lut-packs.html"]) check(`lut-shop/${p} is prerendered`, existsSync(join(ROOT, "public", "theme-previews", "lut-shop", p)))

  console.log("\nCHECKS")
  const runner = read(join(ROOT, "scripts", "run-push-tests.mjs"))
  check("this test runs with the suite", runner.includes('"tests/theme-templates-new-r68.test.ts"'))
  check("the Chromium measurement exists", existsSync(join(ROOT, "scripts", "check-theme-templates-new-r68.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
