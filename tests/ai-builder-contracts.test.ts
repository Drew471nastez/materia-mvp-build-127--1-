/**
 * Round L (AI website builder as a coding agent): the shared contract holds.
 *
 *   1. The types compile against the app's own (this file imports them all,
 *      and the suite is typechecked with the rest).
 *   2. A manifest written by manifestToSchema is a <schema> the REAL compiler
 *      and the editor's schema reader accept, with every prop drawn by a
 *      control the registry has (form_picker landed in L4).
 *   3. SQL part 401 follows the run-now conventions (one statement a line,
 *      byte copy in migrations, README row, 99 check column, server writes,
 *      owner reads) and agrees with the TypeScript lists (event kinds, job
 *      statuses, phases).
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-builder-contracts.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { controlFor } from "@/lib/storelib-theme/controls/registry"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { RUN_BUDGET_MS } from "@/lib/website-builder/ai-site/server"
import { STEPS } from "@/lib/website-builder/ai-site/job"
import {
  AGENT_EVENT_KINDS,
  AGENT_TOOL_NAMES,
  DEFAULT_JOB_BUDGET,
  START_CATEGORIES,
  componentPath,
  isAiComponentType,
  type AgentJobStatus,
  type AgentPhase,
  type ComponentManifest,
} from "@/lib/ai-builder/types"
import { TOOLS_COVERED, WRITABLE_PATH, WRITE_TOOLS } from "@/lib/ai-builder/agent-tools"
import { BINDING_CONTROL, manifestToSchema, propsToSettings } from "@/lib/ai-builder/manifest"
import { STORELIB_HOOKS, AGENT_DEFAULT_CAPABILITIES } from "@/lib/ai-builder/runtime-contract"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* Every status and phase the TypeScript side names, listed so the compiler checks the lists are complete. */
const STATUSES: Record<AgentJobStatus, true> = { queued: true, running: true, complete: true, partial: true, failed: true, cancelled: true }
const PHASES: Record<AgentPhase, true> = { brief: true, plan: true, build: true, verify: true, repair: true, finish: true }

const FITNESS_HERO: ComponentManifest = {
  type: "ai_coach_hero",
  name: "Coach hero",
  description: "A split hero for a personal trainer with a booking link.",
  category: "hero",
  runtime: "storelib",
  props: [
    { kind: "text", id: "eyebrow", label: "Eyebrow", default: "Personal training in Leeds", group: "Content" },
    { kind: "text", id: "heading", label: "Heading", default: "Get strong without living in the gym" },
    { kind: "richtext", id: "intro", label: "Intro", default: "<p>Three sessions a week, a plan that fits your job.</p>" },
    { kind: "image", id: "photo", label: "Photo", focalPoint: true },
    { kind: "link", id: "cta_url", label: "Button link", default: "/contact" },
    { kind: "text", id: "cta_label", label: "Button label", default: "Book a free call" },
    { kind: "binding", id: "program", label: "Program", binding: "product" },
    { kind: "color", id: "accent", label: "Accent", default: "#d9480f", group: "Style" },
    { kind: "color_scheme", id: "color_scheme", label: "Colour scheme", default: "white" },
    { kind: "font", id: "heading_font", label: "Heading font" },
    { kind: "select", id: "layout", label: "Layout", default: "split", options: [{ label: "Split", value: "split" }, { label: "Stacked", value: "stacked" }] },
    { kind: "boolean", id: "show_badge", label: "Show the badge", default: true },
    { kind: "number", id: "columns", label: "Columns", min: 1, max: 4, step: 1, default: 2, slider: true, responsive: true },
    { kind: "spacing", id: "padding_top", label: "Padding top", min: 0, max: 160, default: 80, group: "Spacing" },
    { kind: "animation", id: "animation", label: "Animation", default: "rise" },
  ],
  items: [{ type: "result", name: "Client result", limit: 6, props: [{ kind: "text", id: "name", label: "Name", default: "Sam" }, { kind: "textarea", id: "quote", label: "Quote", default: "Down two sizes." }] }],
  maxItems: 6,
  placement: { groups: ["body"] },
  capabilities: [],
}

const TEMPLATE = `<template>
<section class="ch" data-scheme="{{ settings.color_scheme }}" style="--ch-accent: {{ settings.accent }}; --ch-pt: {{ settings.padding_top }}px;">
  <p class="ch__eyebrow">{{ settings.eyebrow }}</p>
  <h1 class="ch__h">{{ settings.heading }}</h1>
  <div class="ch__intro">{{ settings.intro }}</div>
  {% if settings.photo %}<img src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}" width="800" height="1000">{% endif %}
  <a class="ch__cta" href="{{ settings.cta_url | default: '#' | url }}">{{ settings.cta_label }}</a>
  {% for block in section.blocks %}<blockquote class="ch__q" {{ block.shopify_attributes }}>{{ block.settings.quote }} <cite>{{ block.settings.name }}</cite></blockquote>{% endfor %}
</section>
</template>

<style scoped>
.ch { padding-top: var(--ch-pt); }
.ch__cta { color: var(--ch-accent); }
</style>
`

function main() {
  console.log("\n1. names and paths")
  check("ai_ types only", isAiComponentType("ai_coach_hero") && !isAiComponentType("hero_split") && !isAiComponentType("ai_") && !isAiComponentType("ai_Bad"))
  check("component path is a section file", componentPath("ai_coach_hero") === "sections/ai_coach_hero.storelib" && componentPath("ai_card", "block") === "blocks/ai_card.storelib")
  check("the agent may write only ai_ files", WRITABLE_PATH.test("sections/ai_coach_hero.storelib") && !WRITABLE_PATH.test("sections/hero_split.storelib") && !WRITABLE_PATH.test("layout/theme.storelib") && !WRITABLE_PATH.test("sections/ai_x.storelib/../header.storelib"))
  check("every tool has an input and an output", TOOLS_COVERED === true && AGENT_TOOL_NAMES.length === new Set(AGENT_TOOL_NAMES).size && WRITE_TOOLS.every((t) => AGENT_TOOL_NAMES.includes(t)))
  check("host hooks are data-storelib attributes", Object.values(STORELIB_HOOKS).every((v) => /^data-storelib-[a-z-]+$/.test(v)))
  check("default script capabilities need no database or embed", !AGENT_DEFAULT_CAPABILITIES.includes("database") && !AGENT_DEFAULT_CAPABILITIES.includes("embed"))
  check("start categories match the four chips", START_CATEGORIES.length === 4 && /Fitness coach/.test(read("app/(storelib)/app/website-builder/start-website.tsx")))
  check("one invocation's budget is the runner's", DEFAULT_JOB_BUDGET.perInvocationMs === RUN_BUDGET_MS && DEFAULT_JOB_BUDGET.callReserveMs < DEFAULT_JOB_BUDGET.perInvocationMs)

  console.log("\n2. a manifest is a schema the editor and the compiler accept")
  const schema = manifestToSchema(FITNESS_HERO)
  const source = `${TEMPLATE}\n<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>\n`
  const settings = propsToSettings(FITNESS_HERO.props)
  const controls = [...settings, ...propsToSettings(FITNESS_HERO.items![0].props)].map((s) => s.type)
  const unknown = [...new Set(controls.filter((t) => !controlFor(t)))]
  check("every prop is drawn by a control the registry has", unknown.length === 0, unknown)
  check("form bindings are drawn by the form_picker control (L4)", BINDING_CONTROL.form === "form_picker" && !!controlFor("form_picker"))
  check("a picture brings its alt text and focus point", settings.some((s) => s.id === "photo_alt" && s.type === "text") && settings.some((s) => s.id === "photo_focus" && s.type === "focal_point" && s.image === "photo"))
  check("groups become panel headings", settings.filter((s) => s.type === "header").map((s) => s.label).join(",") === "Content,Style,Spacing")
  const compiled = compileSection(source, { file: "sections/ai_coach_hero.storelib", expectType: "ai_coach_hero" })
  check("the real compiler accepts it", compiled.ok, compiled.ok ? undefined : ("errors" in compiled ? compiled.errors.slice(0, 4) : null))
  const read2 = schemasFromSources({ "sections/ai_coach_hero.storelib": source })["ai_coach_hero"]
  const fieldIds = new Set((read2?.fields ?? []).map((f) => f.id))
  check("the editor's schema reader sees every prop", !!read2 && FITNESS_HERO.props.every((p) => fieldIds.has(p.id)), [...fieldIds])
  check("and the repeating items as a block", !!read2?.blocks?.some((b) => b.type === "result" && b.fields.some((f) => f.id === "quote")))
  check("responsive survives", !!read2?.fields.find((f) => f.id === "columns")?.responsive)

  console.log("\n3. SQL part 401")
  const sql = read("supabase/sql/run-now/401_ai_builder_agent.sql")
  const lines = sql.split("\n").filter(Boolean)
  check("one statement a line, a comment first", lines[0].startsWith("/*") && lines.slice(1).every((l) => l.trim().endsWith(";")))
  check("byte copy in migrations", sql === read("supabase/migrations/20271401_ai_builder_agent.sql"))
  check("README row with lines and bytes", new RegExp(`\\| \`401_ai_builder_agent\\.sql\` \\|[^\\n]*\\| ${lines.length} \\| ${Buffer.byteLength(sql).toLocaleString("en-US")} \\|`).test(read("supabase/sql/run-now/README.md")))
  check("the check after includes part 401", /as p401_ai_builder_agent/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("listed for the admin health view", /part: "401", file: "401_ai_builder_agent\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))
  check("events: owner reads, server writes", /REVOKE ALL ON public\.ai_site_job_events FROM anon, authenticated;/.test(sql) && /GRANT SELECT ON public\.ai_site_job_events TO authenticated;/.test(sql) && /ai_site_job_events_select_own/.test(sql) && !/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ai_site_job_events[^;]*authenticated/.test(sql))
  const kinds = sql.match(/kind text NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
  check("event kinds agree with AgentEvent", kinds.join(",") === AGENT_EVENT_KINDS.join(","), kinds)
  const statuses = sql.match(/ai_site_jobs_status_check CHECK \(status IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
  check("job statuses agree", statuses.sort().join(",") === Object.keys(STATUSES).sort().join(","), statuses)
  const phases = sql.match(/phase IN \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
  check("phases agree", phases.sort().join(",") === Object.keys(PHASES).sort().join(","), phases)
  const steps = sql.match(/ai_site_jobs_step_check CHECK \(step IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
  check("steps keep every classic step and add agent", STEPS.every((s) => steps.includes(s)) && steps.includes("agent"), steps)
  check("the owner is told only through part 370's sender, and never fails the insert", /to_regprocedure\('public\.storelib_tell_owner\(uuid,text,jsonb\)'\) IS NULL/.test(sql) && /EXCEPTION WHEN OTHERS THEN RETURN NULL/.test(sql))
  check("one live job per website does not fail the paste when two exist", /HAVING count\(\*\) > 1\) THEN RAISE NOTICE/.test(sql))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
