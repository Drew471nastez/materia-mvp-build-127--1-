/**
 * WHOLE AI WEBSITES, DRAWN BY THE REAL ENGINE, FOR scripts/check-ai-sample-site.mjs.
 *
 * The coded components the AI builder's tests use (tests/ai-builder-bench-
 * designs.ts A to D, round L; the creative example the classic code step's
 * tests copy, round AP) composed into a home page each, header first and
 * footer last, and drawn the way the live site draws a section file: the
 * Storelib template interpreter (renderStorelibSection) with the design's
 * tokens laid over the theme's defaults as Theme settings (tokensToThemeSettings),
 * the theme stylesheet and its variables on the root. Nothing is mocked but
 * the pictures, which are empty settings as a model leaves them.
 *
 * Writes <OUT_DIR>/<design>.html and <OUT_DIR>/sources.json (the files, for
 * the anti slop evaluator). Run in Node (bundled by the check).
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, customTokenVars, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { tokensToThemeSettings } from "@/lib/ai-builder/agent/tokens"
import { CREATIVE_EXAMPLE } from "@/lib/website-builder/agent/creative-section"
import { declaredChromeKind } from "@/lib/website-builder/agent/operations"
import { schemaProblem } from "@/lib/website-builder/ai-site/gate"
import { evaluateSlop } from "@/lib/ai-builder/slop"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { A, B, C, D, type Design } from "../tests/ai-builder-bench-designs"
import { FOOTER, HEADER } from "../tests/ai-builder-agent-fixtures"

const OUT = process.env.OUT_DIR!

/* The classic job's sample (round AP): a coded header and footer around two creative sections, as tests/ai-site-free-design-ap.test.ts writes them. */
const creative = (type: string, name: string, heading: string, line: string) =>
  CREATIVE_EXAMPLE.replace('"type": "flag_feature"', `"type": "${type}"`)
    .replace(/"name": "Flag feature"/g, `"name": "${name}"`)
    .replace('"default": "A heading about this"', `"default": "${heading}"`)
    .replace('"default": "One or two sentences that say what this is."', `"default": "${line}"`)
const AP: Design = {
  label: "AP classic job, free design",
  prompt: "Fitness coach",
  concept: {},
  tokens: A.tokens,
  files: {
    "sections/ai_coach_header.storelib": HEADER,
    "sections/ns_coach_intro.storelib": creative("ns_coach_intro", "Coach intro", "Strength you can keep", "Four weeks of strength work, planned around the hours you actually have."),
    "sections/ns_programs.storelib": creative("ns_programs", "Programs", "Three ways to start", "Small group, one to one, or a written plan you follow on your own."),
    "sections/ai_coach_footer.storelib": FOOTER,
  },
  pages: [],
  compose: { home: [{ type: "ai_coach_header", group: "header" }, { type: "ns_coach_intro" }, { type: "ns_programs", settings: { color_scheme: "site_inverse" } }, { type: "ai_coach_footer", group: "footer" }] },
}

const DESIGNS: Record<string, Design> = { A, B, C, D, AP }

const defaults = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as Record<string, unknown>

/** The menu a site's header and footer read: its own pages. */
function menuFor(d: Design) {
  const links = [{ title: "Home", url: "/" }, ...d.pages.map((p) => ({ title: p.title, url: `/${p.key}` }))]
  return { "main-menu": { title: "Main menu", links: links.map((l) => ({ ...l, links: [] })) } }
}

const sources: Record<string, Record<string, string>> = {}
for (const [key, d] of Object.entries(DESIGNS)) {
  const theme = { ...defaults, ...tokensToThemeSettings(d.tokens as never, defaults).settings, menus: menuFor(d) } as unknown as ThemeSettingsValues
  const schemas = schemasFromSources(d.files)
  const parts: { html: string; css: string; type: string }[] = []
  const problems: string[] = []
  d.compose.home.forEach((c, i) => {
    const type = String(c.type)
    const schema = schemas[type]
    const fieldDefaults = Object.fromEntries((schema?.fields ?? []).filter((f) => (f as { default?: unknown }).default !== undefined).map((f) => [f.id, (f as { default?: unknown }).default]))
    const blockDefs = schema?.blocks ?? []
    const given = (c.blocks as { type: string; settings?: Record<string, unknown> }[] | undefined) ?? (blockDefs.length ? Array.from({ length: 3 }, () => ({ type: blockDefs[0].type, settings: {} })) : [])
    const blocks = given.map((b, n) => {
      const def = blockDefs.find((x) => x.type === b.type)
      const bd = Object.fromEntries((def?.fields ?? []).filter((f) => (f as { default?: unknown }).default !== undefined).map((f) => [f.id, (f as { default?: unknown }).default]))
      return { id: `${type}-${i}-b${n}`, type: b.type, settings: { ...bd, ...(b.settings ?? {}) } }
    })
    const section = { id: `${type}-${i}`, type, settings: { ...fieldDefaults, ...((c.settings as Record<string, unknown>) ?? {}) }, blocks, ...(c.group ? { group: c.group } : {}) } as unknown as SectionInstance
    const r = renderStorelibSection(section, theme, { template: "index" }, d.files, undefined, { menus: menuFor(d) } as never)
    if (r.ok === false) problems.push(`${type}: ${JSON.stringify(r).slice(0, 300)}`)
    /* Each section in its own inline-size container, as components/website-builder/sections/SectionRenderer.tsx draws it on the live site (its "@container" box). */
    else parts.push({ html: `<div data-section="" data-section-id="${section.id}" data-section-type="${type}" style="container-type:inline-size">${r.html}</div>`, css: r.css, type })
  })
  const vars = { ...themeVars(theme), ...customTokenVars(theme as unknown as Record<string, unknown>) }
  const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${d.label}</title>
<style>html,body{margin:0;padding:0}${themeStylesheet(theme)}\n${parts.map((p) => p.css).join("\n")}</style></head>
<body><div ${THEME_ROOT_ATTRIBUTE}="" style="${style}" data-design="${key}">${parts.map((p) => p.html).join("\n")}</div>
<script>window.__problems=${JSON.stringify(problems)};window.__types=${JSON.stringify(parts.map((p) => p.type))}</script></body></html>`
  writeFileSync(join(OUT, `${key}.html`), html)
  sources[key] = d.files
}
writeFileSync(join(OUT, "sources.json"), JSON.stringify(sources))

/* Each design's files through round L's anti slop evaluator and the shared gate (lib/website-builder/ai-site/gate.ts). */
const report: Record<string, unknown> = {}
for (const [key, files] of Object.entries(sources)) {
  const slop = evaluateSlop({ sources: Object.entries(files).map(([path, content]) => ({ path, content })) }, (Object.keys(DESIGNS[key].concept).length ? (DESIGNS[key].concept as never) : null))
  const gate = Object.entries(files).flatMap(([path, text]) => {
    const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
    const schema = schemasFromSources({ [path]: text })[type]
    const held = schema ? schemaProblem(schema, { role: declaredChromeKind(schema) ?? "section", menuFor: ["header"], source: text }) : null
    return held ? [`${path}: ${held.code}: ${held.message}`] : []
  })
  report[key] = { score: slop.score, counts: slop.counts, findings: slop.findings.filter((f) => f.severity !== "info").map((f) => `[${f.severity}] ${f.rule}: ${f.message}`), gate }
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2))
