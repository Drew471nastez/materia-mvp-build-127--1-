/**
 * Materia, every template (round 30). Each check guards a class of problem
 * the owner reported on one template, fixed in the base so it does not
 * happen on any:
 *
 *   POPOVERS   a row of filter dropdowns opens over the product grid. The
 *              results column is a stacking context of its own (container
 *              queries) drawn after the row, and the drawer's will-change
 *              made the row one too, so the lists opened under the cards.
 *   GLUE       Hero split media keeps 24px or more between its text and its
 *              picture when the two stack on a phone (Digital studio's buttons
 *              sat on the picture with a 0px bottom padding).
 *   HOVER      a card's second picture is drawn on the card's own
 *              background; no template swaps to a see-through second
 *              picture (Kurb Club showed a cut-out garment on the page's
 *              white); a cover never rises into the title above it on hover
 *              (Lowmoth).
 *   ICONS      Lowmoth's folders carry real icons (one shots, loops, MIDI,
 *              presets, stems, licence, audio), not an empty outlined box.
 *   GLASS      a header with Glass appearance on is not painted over by the
 *              scheme's solid fill; Lowmoth's header is glass.
 *   MOTION     each template has its own reveal from Theme settings >
 *              Animations, transform and opacity only, and the defaults an
 *              install already has are unchanged.
 *
 * Measured in Chromium on every template's preview by
 * scripts/check-theme-r30.mjs.
 *
 *   npx tsx tests/theme-r30.test.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

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
const folders = readdirSync(TEMPLATES).filter((d) => existsSync(join(TEMPLATES, d, "config", "settings_data.json")))

async function main() {
  console.log("\nPOPOVERS")
  const coll = read(join(BASE, "assets", "collection-page.css"))
  const desk = coll.slice(coll.indexOf("/* Computers: sidebar or a row of dropdowns, in the page */"))
  check("the row of filter dropdowns is lifted above the results on computers", /\.facets-panel--horizontal \{ margin-bottom: 16px; position: relative; z-index: 6; will-change: auto; \}/.test(desk))
  check("the results column is still a container (why the row must be lifted)", /\.facets__results \{[^}]*container-type: inline-size/.test(coll))
  check("the sort list is a popover (the top layer, above everything)", /popover/.test(read(join(BASE, "snippets", "facets-toolbar.liquid"))))

  console.log("\nGLUE")
  const hsm = read(join(BASE, "sections", "hero-split-media.liquid"))
  check("stacked on a phone, the text keeps 24px or more toward the picture below it", /\.hsm:not\(\[data-empty-text\]\) \.hsm__content\{padding-bottom:max\(24px,/.test(hsm))
  check("and toward the picture above it when the picture comes first", /\.hsm\[data-media-first\]:not\(\[data-empty-text\]\) \.hsm__content\{padding-top:max\(24px,/.test(hsm))

  console.log("\nHOVER")
  const card = read(join(BASE, "assets", "product-card.css"))
  check("a card's second picture is drawn on the card's own background", /\.product__media\.show_secondary > \.secondary-image \{ z-index: 1; background-color: var\(--color-background\); \}/.test(card))
  const seeThrough: string[] = []
  for (const folder of folders) {
    const st = { ...json(join(BASE, "config", "settings_data.json")).current, ...json(join(TEMPLATES, folder, "config", "settings_data.json")).current }
    if (!st.show_secondary_image) continue
    for (const p of SAMPLE_SHOPS[folder]?.products ?? []) {
      const second = (p as { images?: string[] }).images?.[0]
      if (!second) continue
      const file = [join(TEMPLATES, folder, "assets", second), join(ROOT, "scripts", "theme-templates", "products", folder, second)].find((f) => existsSync(f))
      if (!file) continue
      const stats = await sharp(file).stats()
      if (!stats.isOpaque) seeThrough.push(`${folder}: ${second}`)
    }
  }
  check("no template with Show second image on hover swaps to a see-through second picture", seeThrough.length === 0, seeThrough)
  const rail = json(join(TEMPLATES, "rail", "config", "settings_data.json")).current
  check("Redline / Kurb Club zooms its photo on hover instead of swapping to the rail's cut-out", rail.show_secondary_image === false && rail.product_hover_effect === "hover_zoom")
  const row = read(join(BASE, "sections", "soundpacks-pack-row.liquid"))
  check("a pack cover grows in place on hover, never up into its title", /\.spr__card:hover \.spr__cover img \{ transform: scale\(1\.02\); \}/.test(row) && !/\.spr__cover img \{ transform: translateY/.test(row))
  check("and keeps 14px from the title at rest", /\.spr__card \.ssp \{[^}]*margin-top: 14px;/.test(row))

  console.log("\nICONS")
  const spc = read(join(BASE, "sections", "soundpacks-contents.liquid"))
  check("folder rows draw an icon (a mask), not an empty outlined box", /\.spc__panel li::before, #shopify-section-\{\{ sid \}\} \.spc__tab::before \{[^}]*mask: var\(--spc-i\)/.test(spc) && !/li::before \{[^}]*border: 1\.5px solid currentColor/.test(spc))
  const kinds = ["one_shot", "loop", "midi", "preset", "stems", "licence", "file"]
  check("every icon kind has its picture", kinds.every((k) => spc.includes(`[data-spc-icon="${k}"] { --spc-i: url("data:image/svg+xml,`)))
  const schema = JSON.parse(spc.slice(spc.indexOf("{% schema %}") + 12, spc.indexOf("{% endschema %}")))
  const iconSetting = schema.blocks.find((b: { type: string }) => b.type === "part").settings.find((s: { id: string }) => s.id === "icon")
  check("a folder's icon is a setting, picked from its name unless chosen", iconSetting?.default === "auto" && kinds.every((k) => iconSetting.options.some((o: { value: string }) => o.value === k)))
  check("the name picks the icon: licence, MIDI, loops, stems, presets, one shots", /contains 'licen'[\s\S]*contains 'midi'[\s\S]*contains 'loop'[\s\S]*contains 'stem'[\s\S]*contains 'preset'[\s\S]*contains 'shot'/.test(spc))

  console.log("\nGLASS")
  const layout = read(join(BASE, "assets", "header-layout.css"))
  check("the sticky bar's solid fill leaves a glass header alone", /\.shopify-section-header-sticky > header\.header:not\(\.glass-enabled\):where\(/.test(layout) && !/\.shopify-section-header-sticky > header\.header:where\(header\.header:not\(\.is-pill\):not\(\[data-sticky="none"\]\)[^{]*\{\s*--header-background-opacity: 1 !important;/.test(layout))
  check("so does the bar's fill at the top of the page", /> header\.header:not\(\.transparent\):not\(\.transparent-mobile\):not\(\.glass-enabled\) \{/.test(layout))
  const lowmoth = json(join(TEMPLATES, "soundpacks", "sections", "header-group.json"))
  const glass = Object.values(lowmoth.sections.header.blocks as Record<string, { type: string; settings: Record<string, unknown> }>).find((b) => b.type === "pill_glass")!.settings
  check("Lowmoth's header is dark glass: translucent and blurred", glass.glass_enabled === true && Number(glass.glass_opacity) <= 70 && Number(glass.glass_blur) >= 16 && glass.glass_color === "#0b0b0c")

  console.log("\nMOTION")
  const anim = read(join(BASE, "assets", "animation.css"))
  const animJs = read(join(BASE, "assets", "animation.js"))
  const settingsSchema = JSON.parse(read(join(BASE, "config", "settings_schema.json"))) as { name?: string; settings?: { id?: string; default?: unknown; options?: { value: string }[] }[] }[]
  const animations = settingsSchema.find((g) => g.name === "Animations")!.settings!
  const opt = (id: string) => animations.find((s) => s.id === id)!
  const types = opt("scroll_animation").options!.map((o) => o.value)
  check("Editorial is offered as a reveal", types.includes("editorial"))
  check("the defaults an install already has are unchanged (none, 600ms, 0ms, 75ms, no zoom)", opt("scroll_animation").default === "none" && opt("animation_duration").default === 600 && opt("animation_delay").default === 0 && opt("reveal_stagger").default === 75 && opt("zoom_image").default === false)
  const baseCurrent = json(join(BASE, "config", "settings_data.json")).current
  check("the base's own settings are unchanged (Blur up, 950ms, 80ms, zoom)", baseCurrent.scroll_animation === "blur_up" && baseCurrent.animation_duration === 950 && baseCurrent.animation_delay === 80 && baseCurrent.zoom_image === true)
  check("Editorial is drawn, armed and played like the others", /\.scroll-trigger\.editorial \{ --reveal-name: revealEditorial;/.test(anim) && (anim.match(/\.split_text, \.editorial\):not\(\.reveal-parts\)/g) ?? []).length === 2)
  check("Editorial is a parts type: its section stays and its parts arrive one after another, pictures settling", /PART_TYPES = \['stagger_up', 'mask_reveal', 'split_text', 'editorial'\]/.test(animJs) && /\(type === 'mask_reveal' \|\| type === 'editorial'\) && el\.matches\(MEDIA_PART\)/.test(animJs) && /\.reveal-parts\.editorial \[data-reveal-part='media'\] \{ --reveal-part: revealEditorialMedia; \}/.test(anim))
  for (const k of ["revealEditorial", "revealPartEditorial", "revealEditorialMedia"]) {
    const body = new RegExp(`@keyframes ${k} \\{([\\s\\S]*?)\\n\\}`).exec(anim)?.[1] ?? ""
    const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1])
    check(`${k} moves transform and opacity only, from partly visible`, props.length > 0 && props.every((p) => p === "opacity" || p === "transform") && /opacity: var\(--reveal-from-opacity, 0\.2\)/.test(body))
  }
  const FILTERED = new Set(["blur_up", "blur_in", "cinematic"])
  const mine = folders.filter((f) => f !== "newleaf")
  const plan = mine.map((f) => { const c = json(join(TEMPLATES, f, "config", "settings_data.json")).current; return { f, type: c.scroll_animation, ms: c.animation_duration, delay: c.animation_delay, stagger: c.reveal_stagger, zoom: c.zoom_image } })
  check("every template has a reveal of its own (none switched off)", plan.every((p) => types.includes(p.type) && p.type !== "none"), plan.filter((p) => !types.includes(p.type) || p.type === "none"))
  check("no template's reveal uses a blur filter (transform and opacity only)", plan.every((p) => !FILTERED.has(p.type)), plan.filter((p) => FILTERED.has(p.type)))
  check("every template states its own timing (duration, delay, stagger, zoom), so none inherits the base's", plan.every((p) => typeof p.ms === "number" && p.ms >= 300 && p.ms <= 1400 && p.delay === 0 && typeof p.stagger === "number" && p.stagger <= 200 && typeof p.zoom === "boolean"), plan.filter((p) => typeof p.ms !== "number" || typeof p.stagger !== "number" || typeof p.zoom !== "boolean"))
  const keys = plan.map((p) => `${p.type}/${p.ms}/${p.stagger}/${p.zoom}`)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  check("no two templates move alike (type, duration, stagger and zoom together)", dupes.length === 0, dupes)
  check("at least nine different reveal types are in use", new Set(plan.map((p) => p.type)).size >= 9, [...new Set(plan.map((p) => p.type))])

  console.log("\nCHECKS")
  const runner = read(join(ROOT, "scripts", "run-push-tests.mjs"))
  check("this test runs with the suite", runner.includes('"tests/theme-r30.test.ts"'))
  check("the Chromium measurement exists", existsSync(join(ROOT, "scripts", "check-theme-r30.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
