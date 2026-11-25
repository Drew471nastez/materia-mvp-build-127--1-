/**
 * ===========================================================================
 *  ROUND 36: A THEME VALUE THAT ONLY CSS READS, ON AN IMPORTED THEME
 * ===========================================================================
 * The owner: "Use CSS variables for instant color, typography, spacing, and
 * styling adjustments ... changes appear immediately". A theme setting that
 * only the layout's <style> blocks read is drawn, for each value under a
 * finger, as the layout alone (lib/storelib-theme/compat/page.ts
 * drawLayoutStyles), and the styles that changed are written into the
 * frame's rules (lib/storelib-theme/compat/theme-css.ts, compat-canvas.tsx).
 * What it does to the frames is scripts/check-compat-live-edit.ts's.
 *
 * Run with:  npx tsx --conditions=react-server tests/compat-theme-css-36.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { drawLayoutStyles, drawPage, themeOfInstall } from "@/lib/storelib-theme/compat/page"
import { isCompatSource, splitCompatFile } from "@/lib/storelib-theme/compat/theme"
import { layoutPathIn, onlyInCss, probeValues, sameButStyles, settingAt, settingUses, styleEdits } from "@/lib/storelib-theme/compat/theme-css"
import { withLeaf } from "@/lib/storelib-theme/compat/live-draw"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const plain = (s: string) => (isCompatSource(s) ? splitCompatFile(s).markup : s)

;(async () => {
  console.log("\nWHICH SETTINGS ONLY THE LAYOUT'S CSS READS, FROM THE THEME'S FILES")
  {
    const files: Record<string, string> = {
      "layout/theme.liquid": `<html><head>
{%- liquid
  assign heading_font = settings.type_header_font
-%}
{% style %}
  :root { --gap: {{ settings.gap }}px; --gap-phone: {% if settings.gap < 24 %}{{ settings.gap }}{% else %}{{ settings.gap | times: 0.7 | round }}{% endif %}px; }
  {% for scheme in settings.color_schemes %}.color-{{ scheme.id }} { --bg: {{ scheme.settings.background }}; }{% endfor %}
  {% render 'css-vars' %}
  {%- assign w = settings.page_width -%}
{% endstyle %}
<style>.x { border-radius: {{ settings['radius'] }}px; }</style>
</head><body class="{{ settings.body_class }}">{{ content_for_layout }}{% sections 'header-group' %}</body></html>`,
      "layout/password.liquid": `<body style="gap: {{ settings.other }}px">{{ content_for_layout }}</body>`,
      "snippets/css-vars.liquid": `:root { --shadow: {{ settings.shadow }}; }`,
      "snippets/card.liquid": `<div class="card color-{{ settings.color_schemes | first }}">{{ settings.card_style }}</div>`,
      "sections/hero.liquid": `{% render 'card' %}{% style %}.hero { padding: {{ settings.hero_pad }}px; }{% endstyle %}\n{% schema %}{ "name": "Hero", "settings": [{ "id": "gap", "type": "range" }] }{% endschema %}`,
      "sections/elsewhere.liquid": `<p>{{ settings.gap }}</p>`,
      "templates/index.json": "{}",
    }
    const uses = settingUses(files, "layout/theme.liquid", plain, { sections: new Set(["sections/hero.liquid"]) })
    check("a setting printed only in the layout's {% style %}, branching on its value, is read only by CSS", onlyInCss(uses, ["shopify", "gap"]), uses.by.get("gap"))
    check("so is one read as settings['radius'] in a <style> of the layout", onlyInCss(uses, ["shopify", "radius"]))
    check("so is one printed by a snippet rendered only inside the layout's CSS", onlyInCss(uses, ["shopify", "shadow"]))
    check("a setting printed in the markup (the body's class) is not", !onlyInCss(uses, ["shopify", "body_class"]))
    check("nor one assigned in the layout (it can be printed anywhere)", !onlyInCss(uses, ["shopify", "type_header_font"]) && !onlyInCss(uses, ["shopify", "page_width"]))
    check("nor one in a section's own <style> (the layout alone does not draw it)", !onlyInCss(uses, ["shopify", "hero_pad"]))
    check("a section the page does not draw is not read, nor is another layout", uses.by.get("gap")?.every((u) => u.file === "layout/theme.liquid") === true && !uses.by.has("other"))
    check("the schema's own \"settings\" is not a read", !uses.opaque)
    check("a colour of a colour scheme is read only by CSS when the markup prints a scheme only by its id", onlyInCss(uses, ["shopify", "color_schemes", "scheme-1", "settings", "background"]))
    check("the schemes as a whole are not (a scheme added or taken away changes the ids printed)", !onlyInCss(uses, ["shopify", "color_schemes"]) && !onlyInCss(uses, ["shopify", "color_schemes", "scheme-3"]))
    const all = settingUses(files, "layout/theme.liquid", plain)
    check("without the page's sections known, every section is read", !onlyInCss(all, ["shopify", "gap"]))
    const opaque = settingUses({ ...files, "snippets/dump.liquid": `{% assign k = 'gap' %}{{ settings[k] }}` }, "layout/theme.liquid", plain, { sections: new Set(["sections/hero.liquid"]) })
    check("a theme that reads a setting by a name it works out has none known from its files", opaque.opaque && !onlyInCss(opaque, ["shopify", "gap"]))
    const named = settingUses({ ...files, "snippets/args.liquid": `{% render 'card', settings: section.settings %}` }, "layout/theme.liquid", plain, { sections: new Set(["sections/hero.liquid"]) })
    check("a render's named argument `settings:` reads nothing", !named.opaque)
    check("the layout's file is found as the engine stores it", layoutPathIn({ "layout/theme.storelib": "x" }) === "layout/theme.storelib" && layoutPathIn({ "layout/theme.liquid": "x", "layout/alt.liquid": "y" }, "alt") === "layout/alt.liquid")
  }

  console.log("\nVALUES TO TRY A SETTING WITH, WHEN THE FILES DO NOT SAY")
  {
    const schema = [{ name: "Layout", settings: [{ type: "range", id: "gap", min: 0, max: 100, step: 4 }, { type: "select", id: "w", options: [{ value: "a" }, { value: "b" }, { value: "c" }] }, { type: "color_scheme_group", id: "color_schemes", definition: [{ type: "color", id: "background" }] }] }]
    check("a range: its two ends", JSON.stringify(probeValues(settingAt(schema, ["shopify", "gap"]), 40)) === "[0,100]")
    check("a select: its other options", JSON.stringify(probeValues(settingAt(schema, ["shopify", "w"]), "a")) === '["b","c"]')
    check("a scheme's colour: two colours", probeValues(settingAt(schema, ["shopify", "color_schemes", "scheme-1", "settings", "background"]), "#ffffff")?.length === 2)
    check("a setting the schema does not have: none", probeValues(settingAt(schema, ["shopify", "nope"]), 1) === null)
  }

  console.log("\nWHAT CHANGED")
  {
    check("only the styles that changed are written", JSON.stringify(styleEdits(["a", "b"], ["a", "c"])) === JSON.stringify([{ style: true, from: "b", to: "c" }]))
    check("a layout that drew another number of styles is drawn as before", styleEdits(["a"], ["a", "b"]) === null)
    check("two pages the same but for a style that changed are the same", sameButStyles({ html: "<style>:root{--g:1px}</style><p>x</p>", styles: [":root{--g:1px}"] }, { html: "<style>:root{--g:9px}</style><p>x</p>", styles: [":root{--g:9px}"] }))
    check("a page whose markup changed too is not", !sameButStyles({ html: "<style>:root{--g:1px}</style><p>x</p>", styles: [":root{--g:1px}"] }, { html: "<style>:root{--g:9px}</style><p>y</p>", styles: [":root{--g:9px}"] }))
  }

  console.log("\nTHE MATERIA FIXTURE, WITH A LAYOUT THAT PRINTS ITS SETTINGS AS VARIABLES")
  {
    const zip = new JSZip()
    const walk = (dir: string, rel: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
        else zip.file(`${rel}${n}`, readFileSync(p))
      }
    }
    walk(join(process.cwd(), "tests/fixtures/shopify-materia"), "")
    const layout = (await zip.file("layout/theme.liquid")!.async("string")).replace("</head>", `{% style %}
      :root { --accent: {{ settings.accent }}; --gap: {{ settings.spacing_sections }}px; --gap-phone: {% if settings.spacing_sections < 24 %}{{ settings.spacing_sections }}{% else %}{{ settings.spacing_sections | times: 0.7 | round }}{% endif %}px; }
    {% endstyle %}</head>`)
    zip.file("layout/theme.liquid", layout)
    const schema = JSON.parse(await zip.file("config/settings_schema.json")!.async("string")) as unknown[]
    schema.push({ name: "Layout", settings: [{ type: "range", id: "spacing_sections", min: 0, max: 100, step: 4, label: "Space", default: 0 }] })
    zip.file("config/settings_schema.json", JSON.stringify(schema))
    const r = await convertShopifyTheme(zip)
    if (!r.ok) { check("the fixture converts", false, r); process.exit(1) }
    const rows = r.theme.files as Record<string, string>
    const settings = r.theme.settings as Record<string, unknown>
    const home = r.theme.pages.find((p: { page_key: string }) => p.page_key === "home")!
    const page = { template: "index", path: "/", designMode: true, themeDesignMode: false, host: "", products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "EUR", moneyFormat: "€{{amount}}" } }
    const opts = { assetUrl: (n: string) => `/a/${n}`, assetText: () => null }
    const theme = (s: unknown) => themeOfInstall(rows, s, opts)
    const draw = (s: unknown) => drawPage(theme(s), page as never, home.sections as never, { scripts: true }).html
    const styles = (s: unknown) => drawLayoutStyles(theme(s), page as never, home.sections as never)
    const base = { html: draw(settings), styles: styles(settings)! }
    check("the layout alone draws its styles as the page holds them", base.styles.length === 1 && base.styles.every((x) => base.html.includes(x)), base.styles)
    const t = theme(settings)
    const sections = new Set<string>()
    for (const s of home.sections as { type: string }[]) for (const ext of [".storelib", ".liquid"]) sections.add(`sections/${t.typeOf(s.type)}${ext}`)
    const uses = settingUses(t.files, layoutPathIn(t.files)!, plain, { sections })
    check("its spacing and its accent are read only by CSS", onlyInCss(uses, ["shopify", "spacing_sections"]) && onlyInCss(uses, ["shopify", "accent"]))
    let same = true, right = true
    for (let v = 0; v <= 100; v += 4) {
      const s = withLeaf(settings, ["shopify", "spacing_sections"], v)
      const next = { html: draw(s), styles: styles(s)! }
      if (!sameButStyles(base, next)) same = false
      const phone = v < 24 ? v : Math.round(v * 0.7)
      if (!next.styles[0].includes(`--gap: ${v}px; --gap-phone: ${phone}px;`)) right = false
    }
    check("for every value the page drawn whole is the page on screen with the layout's styles drawn alone", same)
    check("and the layout's branch on the value is Liquid's: the phone's spacing raw below 24, reduced above", right)
    const dark = withLeaf(settings, ["shopify", "accent"], "#0b1a29")
    check("a colour too", sameButStyles(base, { html: draw(dark), styles: styles(dark)! }) && styles(dark)![0].includes("--accent: #0b1a29"))
    check("a theme made again from the same files reads them once", theme(settings).files === theme(dark).files && theme(settings).settingsSchema === theme(dark).settingsSchema)
  }

  console.log("\nTHE CANVAS")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("a value only CSS reads is written as the layout's styles that changed", /const edits = styles \? styleEdits\(plan\.shown, styles\) : null/.test(canvas) && /sendTo\(win, \{ storelib: 1, type: "edits", edits, key \}\)/.test(canvas))
    check("which settings those are is read from the files at the first value, never after a page drawn whole", /if \(uses && onlyInCss\(uses, path\)\) \{/.test(canvas) && /const plan = cached && cached\.at === at \? cached : learnCss\(/.test(canvas))
    check("a setting the files do not vouch for is tried with values in the background, one drawing a task", /sameButStyles\(ahead\.page, \{ html: pagePure\(files, values, base\.page, base\.list\), styles \}\)/.test(canvas) && /if \(r === null && steps\.length\) window\.setTimeout\(next, 0\)/.test(canvas))
    check("what the frame holds is checked before the first value is written", /!shown\.every\(\(s\) => html\.includes\(s\)\)/.test(canvas))
    check("the release's commit of a value the files vouch for keeps the page on screen as drawn", /* Changed on purpose (round ed-1022): and the committed value is said to the theme's code, storelib:settings-change. Changed on purpose (round 27): and noted for storelib:theme-change (compat-canvas.tsx noteThemeChange), so 320. */ /if \(!isLive\(\)\) \{\s*const before = drawnWith\.current\?\.settings\s*if \(commitShown\(list\)\) \{[\s\S]{0,320}return\s*\}\s*\}/.test(canvas) && /!shown\.plan\.files/.test(canvas))
    check("after the release the page is held to the committed settings until the live layer lets go", /if \(held !== props\.theme\) setHeld\(props\.theme as Record<string, unknown>\)\s*\n\s*else if \(settings === \(props\.theme as unknown\)\) setHeld\(null\)/.test(canvas))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
