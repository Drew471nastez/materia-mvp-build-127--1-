/**
 * ===========================================================================
 *  AN AGENT'S SECTION PLUGS INTO THE THEME LIKE A NATIVE ONE, OR IS REFUSED
 * ===========================================================================
 * lib/storelib-ai/integration.ts writes down what the built-in sections do:
 * colours from the scheme, type from the theme, buttons from the scheme's
 * button and hover keys, spacing as settings, every word, link and picture a
 * setting. Held here:
 *
 *   every built-in .storelib section and every docs example passes, so the
 *   rules can never refuse what Storelib itself ships or teaches;
 *
 *   a section that breaks one rule is refused for exactly that rule, with a
 *   message that says the fix;
 *
 *   the rules apply to agents (strict) and not to a person's own code editor;
 *
 *   every agent path goes through them: MCP and the agent API, GitHub,
 *   Storelib AI's writer and its code tool.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { validateSection } from "@/lib/storelib-ai/validate"
import { writeSection } from "@/lib/agent-access/operations"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A small native section, written the way the built-ins are. */
const NATIVE = `<template>
<section class="s" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-btn-hover: {{ scheme.primary_btn_hover_bg }}; --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;">
  <div class="s__in">
    {% if settings.heading %}<h2 class="s__h">{{ settings.heading }}</h2>{% endif %}
    {% if settings.button_text %}<a class="s__btn" href="{{ settings.button_url | default: '#' | url }}">{{ settings.button_text }}</a>{% endif %}
    {% if settings.image %}<img src="{{ settings.image | asset }}" alt="" width="600" height="400">{% endif %}
    {% if page.in_editor %}<p>Add a picture in the sidebar</p>{% endif %}
  </div>
</section>
</template>

<style scoped>
.s { container-type: inline-size; background: var(--s-bg); color: var(--s-text); }
.s__in { padding: var(--s-pt) 24px var(--s-pb); }
.s__h { font-size: var(--section-heading-size, 32px); font-family: var(--theme-font-heading, {{ theme.typography.heading }}), sans-serif; color: var(--s-heading); }
.s__btn { background: var(--s-btn); color: var(--s-btn-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.s__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
@container (min-width: 640px) { .s__in { display: grid; grid-template-columns: 1fr 1fr; } }
</style>

<schema>
{
  "schema_version": 1,
  "type": "native_band",
  "name": "Native band",
  "category": "text",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Made to be changed" },
    { "type": "text", "id": "button_text", "label": "Button", "default": "Shop" },
    { "type": "url", "id": "button_url", "label": "Button link", "default": "" },
    { "type": "image_picker", "id": "image", "label": "Picture", "default": "" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "default": 80, "min": 0, "max": 160, "step": 4, "unit": "px" },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "default": 80, "min": 0, "max": 160, "step": 4, "unit": "px" }
  ],
  "presets": [{ "name": "Native band" }]
}
</schema>
`

const ids = (source: string) => checkSectionIntegration(source).map((f) => f.id)

async function main() {
  console.log("\nWhat Storelib ships and teaches passes")
  const files = [
    ...readdirSync("themes/default/sections").filter((f) => f.endsWith(".storelib")).map((f) => `themes/default/sections/${f}`),
    ...readdirSync("content/developers/examples").filter((f) => f.endsWith(".storelib")).map((f) => `content/developers/examples/${f}`),
  ]
  const failing = files.map((f) => ({ f, found: ids(read(f)) })).filter((x) => x.found.length)
  check(`all ${files.length} built-in sections and examples pass`, files.length > 30 && failing.length === 0, failing.map((x) => `${x.f}: ${x.found.join(",")}`).join(" | "))
  check("and so does a small native section", ids(NATIVE).length === 0, ids(NATIVE).join(","))

  console.log("\nA section that breaks one rule is refused for it")
  const cases: [string, string, (s: string) => string][] = [
    ["integration-scheme", "no colour scheme", (s) => s.replace(/\{ "type": "color_scheme"[^}]*\},\n\s*/, "").replace(' data-scheme="{{ settings.color_scheme }}"', "")],
    ["integration-scheme-root", "a scheme declared and never applied", (s) => s.replace(' data-scheme="{{ settings.color_scheme }}"', "")],
    ["integration-colour", "a fixed brand colour", (s) => s.replace("color: var(--s-heading); }", "color: #6366f1; }")],
    ["integration-colour", "a fixed colour inline", (s) => s.replace('<div class="s__in">', '<div class="s__in" style="background: #f5f3ff">')],
    ["integration-font", "its own font", (s) => s.replace("font-family: var(--theme-font-heading, {{ theme.typography.heading }}), sans-serif;", "font-family: 'Inter', sans-serif;")],
    ["integration-heading", "a heading sized by hand", (s) => s.replace("font-size: var(--section-heading-size, 32px); font-family: var(--theme-font-heading, {{ theme.typography.heading }}), sans-serif;", "font-size: 40px;")],
    ["integration-button", "a button in its own colours", (s) => s.replace(/--s-btn[^;]*;\s*/g, "").replace("background: var(--s-btn); color: var(--s-btn-text);", "background: var(--s-heading); color: var(--s-bg);").replace(".s__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }", "")],
    ["integration-button-hover", "a button with no hover", (s) => s.replace(".s__btn:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }", "")],
    ["integration-spacing", "no padding settings", (s) => s.replace(/,\n\s*\{ "type": "range", "id": "padding_top"[^}]*\},\n\s*\{ "type": "range", "id": "padding_bottom"[^}]*\}/, "")],
    ["integration-spacing-use", "padding settings nobody reads", (s) => s.replace(" --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;", "")],
    ["integration-link", "a link typed into the markup", (s) => s.replace("{{ settings.button_url | default: '#' | url }}", "https://example.com/buy")],
    ["integration-image", "a picture typed into the markup", (s) => s.replace('src="{{ settings.image | asset }}"', 'src="https://cdn.example.com/hero.jpg"')],
    ["integration-image-css", "a picture in the CSS", (s) => s.replace(".s { container-type", ".s { background-image: url(https://cdn.example.com/x.jpg); container-type")],
    ["integration-text", "a heading typed into the markup", (s) => s.replace("{{ settings.heading }}</h2>", "Our amazing story</h2>")],
    ["integration-responsive", "a fixed desktop width and no phone layout", (s) => s.replace(/@container[^\n]*\n/, "").replace(".s__in { padding", ".s__in { width: 1100px; padding")],
  ]
  for (const [id, what, mutate] of cases) {
    const broken = mutate(NATIVE)
    const found = ids(broken)
    check(`${what}: ${id}`, broken !== NATIVE && found.includes(id), `found ${found.join(",") || "nothing"}`)
  }
  const msg = checkSectionIntegration(cases.find((c) => c[0] === "integration-link")![2](NATIVE))[0]?.message ?? ""
  check("the refusal says the fix", /url setting/.test(msg) && /\| url/.test(msg))
  check("editor-only prompts are not copy", ids(NATIVE).length === 0 && /Add a picture in the sidebar/.test(NATIVE))
  check("white text and a dark scrim over a picture are allowed", ids(NATIVE.replace("color: var(--s-heading); }", "color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4); }")).length === 0)
  check("a colour that is only a var() fallback is allowed", ids(NATIVE.replace("color: var(--s-heading); }", "color: var(--s-heading, color-mix(in srgb, var(--s-text) 90%, #000)); }")).length === 0)

  console.log("\nAgents are held to it, a person's own editor is not")
  const bad = NATIVE.replace("color: var(--s-heading); }", "color: #6366f1; }")
  const strict = validateSection(bad, { path: "sections/native_band.storelib", expectType: "native_band", strict: true })
  check("strict: refused, with the rule in the feedback", strict.ok === false && strict.reason === "quality" && /fixed colour/.test(strict.feedback))
  check("not strict: saved as before", validateSection(bad, { path: "sections/native_band.storelib", expectType: "native_band" }).ok === true)
  let touched = 0
  const db = { from: () => { touched++; throw new Error("the database was reached") } }
  const r = await writeSection(db, { installId: "i", tokenId: "t", name: "Claude Code", creatorId: "c" }, "sections/native_band.storelib", bad)
  check("an agent write over MCP or HTTP is refused before the database", r.ok === false && r.status === 422 && touched === 0 && /fixed colour/.test(r.error))

  console.log("\nEvery agent path goes through it")
  check("MCP and the agent API (writeSection)", /validateSection\(source, \{ path, expectType: [^}]*strict: true \}\)/.test(read("lib/agent-access/operations.ts")))
  check("storelib_create_section and storelib_edit_section", /strict: true/.test(read("lib/agent-access/project.ts")))
  check("a push from GitHub", /validateSection\(source, \{[^}]*strict: true \}\)/.test(read("lib/github-sync/sync.ts")))
  check("Storelib AI's section writer", /validateSection\(text, \{ path, expectType: type, strict: true \}\)/.test(read("lib/website-builder/agent/write-section.ts")))
  /* Checked in the loop now, before the route stages it (lib/website-builder/agent/compile-feedback.ts): the integration rules included. */
  check(
    "Storelib AI's code tool",
    /checkSectionSource\(\{[\s\S]{0,400}strict: true,/.test(read("lib/website-builder/agent/loop.ts")) &&
      /checkSectionIntegration\(text\)/.test(read("lib/website-builder/agent/compile-feedback.ts")),
  )
  check("and the person's code editor does not", !/strict/.test(read("app/api/website-builder/themes/[installId]/files/route.ts")))
  check("the writers are told the rules before they write", /INTEGRATION_CONTRACT/.test(read("lib/website-builder/agent/write-section.ts")) && /INTEGRATION_CONTRACT\]/.test(read("lib/storelib-ai/index.ts")))
  check("and so is every connected agent", /plugs into the theme like a native one/.test(read("lib/agent-rules/index.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
