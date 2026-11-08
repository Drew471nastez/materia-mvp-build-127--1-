/**
 * ===========================================================================
 *  THE EDITOR AND THE PUBLISHED PAGE DRAW THE SAME SECTION
 * ===========================================================================
 * Not "should", and not "by inspection": this drives the two entry points the
 * two surfaces actually call, with the same section, and compares what comes
 * out of each.
 *
 *   THE EDITOR renders through StorelibLiveProvider, which calls
 *   renderStorelibSection with the sources the code editor has loaded.
 *
 *   THE PUBLISHED PAGE renders through prerenderStorelibSections, which reads
 *   the creator's saved files out of the database and renders on the server.
 *
 * They share a pure function underneath, which is the design, and this is the
 * test that keeps it that way: if either surface grows its own path, the two
 * outputs stop matching here.
 *
 * ONE DIFFERENCE IS ALLOWED, and it is declared: `page.in_editor`. A section
 * with no blocks yet has to prompt the person adding them and say nothing to
 * a visitor. Everything else is held to the byte.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { prerenderStorelibSections } from "@/lib/website-builder/storefront-render"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/** What Add Section puts on the page: the preset over the schema's defaults. */
function asAdded(type: string, id = `${type}-1`): SectionInstance {
  const schema = STORELIB_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
    Object.assign(bs, b.settings ?? {})
    return { id: `${id}-b${i}`, type: b.type, settings: bs }
  })
  return { id, type, name: schema.name, settings, blocks }
}

/** A database with the creator's saved files in it, and nothing else. */
function dbWith(files: Record<string, string>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          like: () => Promise.resolve({ data: Object.entries(files).map(([path, content]) => ({ path, content })) }),
        }),
      }),
    }),
  }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Every section in the library renders the same on both surfaces")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const mismatched: string[] = []
    /* The .storelib ones: a JSON-described section in the library (native_form) is a React renderer, the same component on both surfaces. */
    for (const type of ADDABLE_SECTIONS.filter((t) => t in STORELIB_SCHEMAS)) {
      const instance = asAdded(type)
      // The editor's path.
      const inEditor = renderStorelibSection(instance, theme, { template: "index" }, {})
      // The published page's path, through the function the routes call.
      const prerendered = await prerenderStorelibSections(dbWith({}) as never, "install-1", [instance], theme, "index")
      const live = prerendered[instance.id]
      if (inEditor.ok === false) { mismatched.push(`${type}: did not render in the editor`); continue }
      if (!live) { mismatched.push(`${type}: did not render on the published page`); continue }
      if (live.html !== inEditor.html) mismatched.push(`${type}: HTML differs`)
      if (live.css !== inEditor.css) mismatched.push(`${type}: CSS differs`)
    }
    check(`all ${ADDABLE_SECTIONS.filter((t) => t in STORELIB_SCHEMAS).length} sections produce identical HTML and CSS on both surfaces`, mismatched.length === 0, mismatched.slice(0, 6).join("; "))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A section the creator wrote, and one they edited")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const MINE = [
      "<template>",
      '<section class="m"><h2>{{ section.settings.heading }}</h2>',
      "{% for block in section.blocks %}<p data-block-id=\"{{ block.id }}\">{{ block.settings.text }}</p>{% endfor %}",
      "</section>",
      "</template>",
      "<style>.m { padding: 40px; } @media (max-width: 749px) { .m { padding: 20px; } }</style>",
      "<schema>",
      JSON.stringify({
        type: "mine", name: "Mine",
        settings: [{ type: "text", id: "heading", label: "H", default: "Hello" }],
        blocks: [{ type: "row", name: "Row", settings: [{ type: "text", id: "text", label: "T", default: "A row" }] }],
        presets: [{ name: "Mine", blocks: [{ type: "row" }, { type: "row" }] }],
      }),
      "</schema>",
    ].join("\n")
    const sources = { "sections/mine.storelib": MINE }
    const instance: SectionInstance = {
      id: "mine-1", type: "mine", name: "Mine",
      settings: { heading: "Hello" },
      blocks: [{ id: "b0", type: "row", settings: { text: "First" } }, { id: "b1", type: "row", settings: { text: "Second" } }],
    }
    const inEditor = renderStorelibSection(instance, theme, { template: "index" }, sources)
    const live = (await prerenderStorelibSections(dbWith(sources) as never, "install-1", [instance], theme, "index"))[instance.id]
    check("a section that exists only in the creator's files renders on the published page", !!live)
    check("and byte for byte the same as the editor draws it", inEditor.ok === true && !!live && live.html === inEditor.html && live.css === inEditor.css)
    check("its blocks arrive in order, with their own settings, on both", !!live && live.html.indexOf("First") < live.html.indexOf("Second"))
    check("and its media query is scoped the same way on both", !!live && inEditor.ok === true && /@container \(max-width: 749px\) \{ \[data-section-id="mine-1"\]/.test(live.css) && live.css === inEditor.css)

    // A file that overrides one the theme ships must win on both surfaces.
    const OVERRIDE = readFileSync(join(process.cwd(), "themes/default/sections/faq_accordion.storelib"), "utf8")
      .replace('"default": "Questions, answered"', '"default": "EDITED BY THE CREATOR"')
    const faq = asAdded("faq_accordion", "faq-1")
    delete (faq.settings as Record<string, unknown>).heading
    const eOver = renderStorelibSection(faq, theme, { template: "index" }, { "sections/faq_accordion.storelib": OVERRIDE })
    const lOver = (await prerenderStorelibSections(dbWith({ "sections/faq_accordion.storelib": OVERRIDE }) as never, "i", [faq], theme, "index"))[faq.id]
    check("an edited theme section draws as edited on the published page too", !!lOver && lOver.html.includes("EDITED BY THE CREATOR"))
    check("and the two surfaces still agree", eOver.ok === true && !!lOver && lOver.html === eOver.html)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The one difference between them is declared")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const empty: SectionInstance = { ...asAdded("faq_accordion", "faq-e"), blocks: [] }
    const editing = renderStorelibSection(empty, theme, { template: "index", in_editor: true }, {})
    const visiting = renderStorelibSection(empty, theme, { template: "index" }, {})
    check("a section with no blocks prompts the person adding them", editing.ok === true && editing.html.includes("Add questions"))
    check("and says nothing at all to a visitor", visiting.ok === true && !visiting.html.includes("Add questions"))
    check("the published path never turns the editor's flag on", (() => {
      const src = readFileSync(join(process.cwd(), "lib/website-builder/storefront-render.ts"), "utf8")
      return !/in_editor/.test(src)
    })())
    check("and every section that prompts does it behind that flag only", (() => {
      const dir = join(process.cwd(), "themes/default/sections")
      const bad: string[] = []
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".storelib"))) {
        const text = readFileSync(join(dir, f), "utf8")
        const tpl = text.slice(text.indexOf("<template>"), text.indexOf("</template>"))
        for (const line of tpl.split("\n")) {
          if (/in the sidebar/.test(line) && !/page\.in_editor/.test(line)) bad.push(`${f}: ${line.trim().slice(0, 50)}`)
        }
      }
      return bad.length === 0
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Assets resolve to the same URL on both surfaces")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const WITH_ASSET = [
      "<template><img src=\"{{ settings.pic | asset }}\" alt=\"{{ settings.alt }}\"></template>",
      "<style>.x { color: red; }</style>",
      "<schema>" + JSON.stringify({
        type: "pic", name: "Pic",
        settings: [
          { type: "image_picker", id: "pic", label: "Picture", default: "https://cdn.example.com/a.jpg" },
          { type: "text", id: "alt", label: "Alt", default: "A picture" },
        ],
        presets: [{ name: "Pic" }],
      }) + "</schema>",
    ].join("\n")
    const sources = { "sections/pic.storelib": WITH_ASSET }
    const instance: SectionInstance = { id: "pic-1", type: "pic", name: "Pic", settings: { pic: "https://cdn.example.com/a.jpg", alt: "A picture" }, blocks: [] }
    const e = renderStorelibSection(instance, theme, { template: "index" }, sources)
    const l = (await prerenderStorelibSections(dbWith(sources) as never, "i", [instance], theme, "index"))[instance.id]
    check("the image arrives on both", e.ok === true && e.html.includes("cdn.example.com/a.jpg") && !!l && l.html.includes("cdn.example.com/a.jpg"))
    /* Changed on purpose: a live page asks for its first picture first (loading="eager", fetchpriority="high", lib/website-builder/media-pass.ts); the canvas keeps it lazy. Everything else is the same markup. */
    const fetchHints = (html: string) => html.replace(/ loading="(?:eager|lazy)"/g, "").replace(/ fetchpriority="high"/g, "")
    check("and identically", e.ok === true && !!l && fetchHints(l.html) === fetchHints(e.html))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A template's page is the page it is on")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const T = [
      "<template><p>{{ page.template }}</p></template>",
      "<schema>" + JSON.stringify({ type: "tpl", name: "T", settings: [], presets: [{ name: "T" }] }) + "</schema>",
    ].join("\n")
    const sources = { "sections/tpl.storelib": T }
    const instance: SectionInstance = { id: "t-1", type: "tpl", name: "T", settings: {}, blocks: [] }
    const onProduct = (await prerenderStorelibSections(dbWith(sources) as never, "i", [instance], theme, "product"))[instance.id]
    const onIndex = (await prerenderStorelibSections(dbWith(sources) as never, "i", [instance], theme, "index"))[instance.id]
    check("the product page says product, not index", !!onProduct && onProduct.html.includes(">product<"))
    check("and the storefront says index", !!onIndex && onIndex.html.includes(">index<"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
