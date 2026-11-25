/**
 * ===========================================================================
 *  ASK STORELIB EDITS THE SECTION THAT IS OPEN, AND NEVER LEAVES IT BROKEN
 * ===========================================================================
 * What the owner asked for, held here:
 *
 *   1. With a section selected, a change is made to THAT section: its
 *      settings, its own code file, or an editable copy of a built in one.
 *      The server works out which section it is from the page and this
 *      install's files, and only after the install is proved to be the
 *      creator's.
 *   2. A code write that does not compile is refused with the compiler's
 *      findings in plain numbered lines, and the model tries again, up to
 *      three times per file.
 *   3. A run's code is saved all together at the end or not at all: a save
 *      that fails puts back every file already saved, and a failed run saves
 *      nothing.
 *   4. Every tool call is shown to the creator in plain words, never as the
 *      tool's name.
 *
 * Run with:  npx tsx tests/ask-section-edit.test.ts   (or npm run test:push)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { resolveSelectedSection, describeSelectedCode } from "@/lib/website-builder/agent/selected-section"
import { checkSectionSource, MAX_CODE_ATTEMPTS, plainCompileErrors } from "@/lib/website-builder/agent/compile-feedback"
import { CodeJournal } from "@/lib/website-builder/agent/code-journal"
import { makeCodedCopy } from "@/lib/website-builder/agent/coded-copy"
import { COMPILE_CHECK_LABEL, toolStepLabel, type StepNames } from "@/lib/website-builder/agent/step-labels"
import { applyOp } from "@/lib/website-builder/agent/operations"
import { EMPTY_ACTIVITY, reduceActivity, timelineRows } from "@/lib/website-builder/ask-activity"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, AgentTurn, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

/* ── a scripted model, and the page it works on ─────────────────────────── */

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

function scripted(script: Scripted[], seen?: AgentTurn[][]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      seen?.push(request.turns)
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `call_${turn}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2 },
        stop: toolCalls.length > 0 ? "tool_calls" : "done",
      }
    },
  }
}

const make = (id: string, type: string, name?: string): SectionInstance => ({
  id,
  type,
  name: name ?? SECTION_SCHEMAS[type]?.name ?? type,
  settings: {},
  blocks: [],
})

/* The creator's own section: Storelib's FAQ copied under a type of their own, the way copy_section_to_code makes one. */
const SHIPPED_FAQ = DEFAULT_THEME_SOURCES["sections/faq_accordion.storelib"]
const own = makeCodedCopy({ type: "faq_accordion", source: SHIPPED_FAQ, takenTypes: new Set(Object.keys(SECTION_SCHEMAS)), takenNames: new Set() })
if (own.ok === false) throw new Error(own.error)
const OWN_TYPE = own.type
const OWN_PATH = own.path
const OWN_SOURCE = own.source

function codeStub(files: Record<string, string>) {
  const writes: { type: string; source: string; create?: boolean }[] = []
  const code = {
    read: (type: string) => files[`sections/${type}.storelib`] ?? DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ?? null,
    origin: (type: string) =>
      (`sections/${type}.storelib` in files ? "own" : DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ? "builtin" : "product") as "own" | "builtin" | "product",
    async write(type: string, source: string, opts?: { create?: boolean }) {
      writes.push({ type, source, create: opts?.create })
      files[`sections/${type}.storelib`] = source
      return { ok: true as const }
    },
  }
  return { code, writes }
}

async function run(opts: {
  script: Scripted[]
  sections: SectionInstance[]
  selected?: string
  lock?: boolean
  files?: Record<string, string>
  seen?: AgentTurn[][]
}) {
  const files = { ...(opts.files ?? {}) }
  const stub = codeStub(files)
  const events: ThemeAgentEvent[] = []
  const loop = themeAgent({
    provider: scripted(opts.script, opts.seen),
    model: "test",
    prompt: "make this section feel calmer",
    state: { sections: opts.sections, settings: {} },
    page: "home",
    addable: ADDABLE_SECTIONS,
    sources: { ...files },
    code: stub.code,
    selectedSectionId: opts.selected,
    lockToSelection: opts.lock,
    maxReviews: 0,
    newId: (type) => `${type}-new`,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done) return { events, result: step.value, writes: stub.writes }
    events.push(step.value as ThemeAgentEvent)
  }
}

type Step = Extract<ThemeAgentEvent, { type: "step" }>
const stepsOf = (events: ThemeAgentEvent[]) => events.filter((e): e is Step => e.type === "step")
const outputsOf = (turns: AgentTurn[][]) =>
  turns.flatMap((t) => t).flatMap((t) => (t.role === "tool" ? t.results.map((r) => r.output) : []))

const page = [make("header-1", "header"), make("hero-1", "hero"), make("faq-1", OWN_TYPE, "Questions"), make("footer-1", "footer")]

async function main() {
// ---------------------------------------------------------------------------
section("1. The open section is what changes, worked out by the server")
// ---------------------------------------------------------------------------
{
  const origin = (type: string) => (type === OWN_TYPE ? "own" : DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ? "builtin" : "product") as "own" | "builtin" | "product"
  const mine = resolveSelectedSection(page, "faq-1", origin)
  check(
    "a selected section of the creator's own carries its id, type, name, settings and file",
    !!mine && mine.id === "faq-1" && mine.type === OWN_TYPE && mine.name === "Questions" && mine.file === OWN_PATH && mine.origin === "own",
    JSON.stringify(mine),
  )
  const hero = resolveSelectedSection(page, "hero-1", origin)
  check("a built in section is read only, and says so", hero?.origin === "builtin" && /never add a new section/i.test(describeSelectedCode(hero!)) && /copy_section_to_code/.test(describeSelectedCode(hero!)))
  check("the header is settings only", resolveSelectedSection(page, "header-1", origin)?.origin === "chrome" && resolveSelectedSection(page, "header-1", origin)?.file === null)
  check("an id that is not on the page is dropped, not trusted", resolveSelectedSection(page, "someone-elses-section", origin) === null)
  check(
    "a type that could climb out of sections/ is never a file",
    resolveSelectedSection([make("x", "../templates/index")], "x", () => "own")?.file === null,
  )

  const seen: AgentTurn[][] = []
  await run({ script: [{ text: "Done." }], sections: page, selected: "faq-1", files: { [OWN_PATH]: OWN_SOURCE }, seen })
  const first = seen[0]?.[0]
  const text = first && first.role === "user" ? first.content : ""
  check(
    "the model is told the open section, that a change is to it and not a new one, and where its code is",
    /SELECTED AND OPEN/.test(text) && /\[faq-1\]/.test(text) && /not a new section/i.test(text) && text.includes(OWN_PATH),
  )

  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  const ownership = route.indexOf('.eq("creator_id", (creator as { id: string }).id)')
  check(
    "the install is proved to be the signed in creator's before the body is read",
    ownership > 0 && ownership < route.indexOf("await request.json()") && /if \(!install\) return NextResponse\.json\(\{ error: "Theme not found\." \}, \{ status: 404 \}\)/.test(route),
  )
  check(
    "the selection is resolved on the server from the page and the install's files, and the lock needs a real section",
    /const selected = resolveSelectedSection\(body\.sections as never, body\.selectedSectionId, origin\)/.test(route) &&
      /selectedSectionId: selected\?\.id,/.test(route) &&
      /lockToSelection: body\.lockToSelection === true && !!selected,/.test(route),
  )
  check(
    "a section's code is read and written only by a type that is a file name, through the agent rule",
    /if \(!SECTION_TYPE\.test\(sectionType\)\) return null/.test(route) && /const allowed = agentMayWrite\(path\)/.test(route),
  )
  check(
    "the files the assistant sees are read through the creator's own client, under row level security",
    /* Changed on purpose (round 27): the same columns through fileCols (plus the reference column when shared theme files are on, lib/website-builder/theme-file-refs.ts), still on the creator's own client. */
    /await supabase\s*\n\s*\.from\("store_theme_custom_files"\)\s*\n\s*\.select\(await fileCols\("path, content, draft_content"\)\)\s*\n\s*\.eq\("install_id", installId\)/.test(route),
  )

  /* A built in section is copied, not rewritten, and the open section moves onto the copy with everything it had. */
  const heroPage = [make("header-1", "header"), { ...make("hero-1", "hero"), settings: { heading: "Kept" } }, make("footer-1", "footer")]
  const copied = await run({
    script: [{ calls: [["copy_section_to_code", { id: "hero-1" }]] }, { text: "Made the hero editable." }],
    sections: heroPage,
    selected: "hero-1",
    lock: true,
  })
  const opAt = copied.events.findIndex((e) => e.type === "op")
  const codeAt = copied.events.findIndex((e) => e.type === "code")
  const op = copied.events[opAt] as Extract<ThemeAgentEvent, { type: "op" }> | undefined
  check(
    "copy_section_to_code writes a new file (never the shipped one) and switches the open section to it",
    copied.writes.length === 1 && copied.writes[0].create === true && copied.writes[0].type === "hero_custom" && op?.op.kind === "set_section_type",
    JSON.stringify(copied.writes.map((w) => w.type)),
  )
  check("the file is sent before the switch, so the canvas can draw it at once", codeAt >= 0 && codeAt < opAt)
  const after = op ? applyOp({ sections: heroPage, settings: {} }, op.op).sections.find((s) => s.id === "hero-1") : undefined
  check("same id, same settings, new type", after?.type === "hero_custom" && after?.settings.heading === "Kept")
  check("and the copy compiles as a section of its own", compileSection(copied.writes[0]?.source ?? "", { file: "sections/hero_custom.storelib", expectType: "hero_custom" }).ok === true)
  check(
    "a built in file is never written in place",
    (await run({ script: [{ calls: [["write_section_code", { sectionType: "hero", source: SHIPPED_FAQ }]] }, { text: "x" }], sections: heroPage })).writes.length === 0,
  )
}

// ---------------------------------------------------------------------------
section("2. A write that does not compile is retried with the errors in plain words")
// ---------------------------------------------------------------------------
{
  const broken = { find: "{% endfor %}", replace: "" }
  const fine = { find: '<p class="s__eyebrow">', replace: '<p class="s__eyebrow s__eyebrow--calm">' }
  const seen: AgentTurn[][] = []
  const { events, writes, result } = await run({
    script: [
      { calls: [["edit_section_code", { sectionType: OWN_TYPE, edits: [broken] }]] },
      { calls: [["edit_section_code", { sectionType: OWN_TYPE, edits: [fine] }]] },
      { text: "Calmed the questions." },
    ],
    sections: page,
    selected: "faq-1",
    files: { [OWN_PATH]: OWN_SOURCE },
    seen,
  })
  const outputs = outputsOf(seen)
  const refusal = outputs.find((o) => /did not compile/.test(o)) ?? ""
  check("the first write is refused and nothing of it is kept", refusal !== "" && writes.every((w) => w.source.includes("{% endfor %}")))
  check(
    "the model reads the compiler's findings as numbered plain lines with the line of the file",
    /^1\. Line \d+: /m.test(refusal) && !/"stage"|\{"/.test(refusal) && /Fix exactly that and send it again/.test(refusal),
    refusal.slice(0, 300),
  )
  check("the second try is kept, and the run succeeds", writes.length === 1 && writes[0].source.includes("s__eyebrow--calm") && result.status === "succeeded" && result.wroteCode === true)
  const steps = stepsOf(events)
  const checks = steps.filter((s) => s.label === COMPILE_CHECK_LABEL)
  check(
    "each try is shown as checking it compiles, the first failed and the second done",
    checks.filter((s) => s.state === "failed").length === 1 && checks.filter((s) => s.state === "done").length === 1,
    JSON.stringify(checks.map((s) => s.state)),
  )
  check(
    "and the second try is named as fixing the file",
    steps.some((s) => s.label === `Fixing ${OWN_TYPE}.storelib` && s.state === "done"),
    JSON.stringify(steps.map((s) => s.label)),
  )
  check(
    "the steps that write a section name the sections the canvas should shimmer",
    steps.some((s) => s.label === COMPILE_CHECK_LABEL && s.sections?.includes("faq-1")),
  )
  check("the canvas is handed the file it can draw now", events.some((e) => e.type === "code" && e.path === OWN_PATH))

  const spent = await run({
    script: [
      ...Array.from({ length: MAX_CODE_ATTEMPTS + 1 }, () => ({ calls: [["edit_section_code", { sectionType: OWN_TYPE, edits: [broken] }]] as Array<[string, Record<string, unknown>]> })),
      { text: "I could not change the code." },
    ],
    sections: page,
    files: { [OWN_PATH]: OWN_SOURCE },
    seen: [],
  })
  check(`after ${MAX_CODE_ATTEMPTS} refusals the file is left as it was`, spent.writes.length === 0)
  check(
    "and the run stops trying",
    /* One compile check per try that was allowed, each failed; the try after them is refused without one. */
    stepsOf(spent.events).filter((s) => s.label === COMPILE_CHECK_LABEL && s.state === "failed").length === MAX_CODE_ATTEMPTS &&
      stepsOf(spent.events).filter((s) => s.label === COMPILE_CHECK_LABEL && s.state === "running").length === MAX_CODE_ATTEMPTS,
  )

  check(
    "plain errors quote the line they are about",
    plainCompileErrors([{ line: 2, message: "unknown filter  `shout`" }], "a\n{{ x | shout }}\nc") === "1. Line 2: unknown filter `shout`\n   {{ x | shout }}",
  )
  const throws = checkSectionSource({ path: OWN_PATH, type: OWN_TYPE, source: OWN_SOURCE, before: OWN_SOURCE, instances: [make("faq-1", OWN_TYPE)] })
  check("a file that compiles and draws with the page's settings passes", throws.ok === true, JSON.stringify(throws))
}

// ---------------------------------------------------------------------------
section("3. The run's code is kept together, or put back")
// ---------------------------------------------------------------------------
{
  const db: Record<string, string> = { "sections/a.storelib": "A1", "sections/b.storelib": "B1" }
  const kept: string[] = []
  const journal = new CodeJournal((path) => db[path] ?? null)
  journal.stage("sections/a.storelib", "A2")
  journal.stage("sections/a.storelib", "A3")
  journal.stage("sections/b.storelib", "B2")
  const result = await journal.commit({
    async save(path, source) {
      if (path === "sections/b.storelib") return { ok: false, error: "the database went away" }
      db[path] = source
      return { ok: true }
    },
    async keep(path, previous) {
      kept.push(`${path}=${previous}`)
    },
    async restore(path, previous) {
      db[path] = previous
      return { ok: true }
    },
  })
  check("a save that fails halfway reports which file", result.ok === false && result.failed === "sections/b.storelib")
  check(
    "and the file already saved goes back to what it was before the run, not to the run's first try",
    db["sections/a.storelib"] === "A1" && result.ok === false && result.restored.includes("sections/a.storelib"),
    JSON.stringify(db),
  )
  check("the version before the run was kept in the history first", kept.includes("sections/a.storelib=A1"))
  check("the file that failed is untouched", db["sections/b.storelib"] === "B1")

  let saves = 0
  const dropped = new CodeJournal(() => "OLD")
  dropped.stage("sections/c.storelib", "NEW")
  dropped.discard()
  await dropped.commit({ save: async () => ((saves++), { ok: true }), restore: async () => ({ ok: true }) })
  check("a failed run saves nothing", saves === 0)

  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check(
    "the route stages writes and saves them only when the run succeeded, and discards them otherwise",
    /journal\.stage\(path, source\)/.test(route) &&
      /* Changed on purpose (w5 aifix): the slow-save flag sits between the check and the commit. */
      /if \(result\.status === "succeeded"\) \{\s*\n\s*let slowSave = false\s*\n\s*const committed = await journal\.commit\(/.test(route) &&
      /\} else \{\s*\n\s*journal\.discard\(\)/.test(route),
  )
  check(
    "a commit that failed is said in one plain sentence and the canvas reloads what is stored",
    /* Changed on purpose (w5 aifix): a commit lost to a slow database says to send it again (commit-retry SLOW_SAVE_MESSAGE). */
    /result\.error = codeLostSlow \? SLOW_SAVE_MESSAGE : "The section's code could not be saved, so it is back to how it was\. Try again\."/.test(route) && /if \(result\.wroteCode \|\| codeLost\) send\(\{ type: "sources-changed" \}\)/.test(route),
  )
  const writer = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
  check(
    "Code a section has a time limit of its own, stops before it, and finishes when the tab closes",
    /* Changed on purpose (rel-jobs): the deadline counts from the request's start and leaves room for the save (loopDeadlineMs), instead of fifteen seconds from after the reads and uploads. */
    /export const maxDuration = 300/.test(writer) && /const loopMs = loopDeadlineMs\(\{ requestStartedAt, maxDurationS: maxDuration \}\)\s*const deadline = AbortSignal\.timeout\(loopMs\)/.test(writer) && /signal: deadline,/.test(writer) && !/signal: request\.signal/.test(writer),
  )
}

// ---------------------------------------------------------------------------
section("4. Every step is said in plain words")
// ---------------------------------------------------------------------------
{
  const names: StepNames = { section: (id) => ({ "hero-1": "Hero", "faq-1": "Questions" })[id] ?? null, type: (t) => SECTION_SCHEMAS[t]?.name ?? t }
  const TOOLS: Array<[string, Record<string, unknown>]> = [
    ["read_section", { id: "hero-1" }],
    ["update_section", { id: "hero-1" }],
    ["read_section_type", { sectionType: "faq_accordion" }],
    ["add_section", { sectionType: "faq_accordion" }],
    ["move_section", { id: "hero-1" }],
    ["remove_section", { id: "hero-1" }],
    ["set_section_visibility", { id: "hero-1", hidden: true }],
    ["rename_section", { id: "hero-1" }],
    ["add_block", { sectionId: "faq-1" }],
    ["update_block", { sectionId: "faq-1" }],
    ["move_block", { sectionId: "faq-1" }],
    ["remove_block", { sectionId: "faq-1" }],
    ["read_section_code", { sectionType: "pricing" }],
    ["edit_section_code", { sectionType: "pricing" }],
    ["write_section_code", { sectionType: "pricing" }],
    ["copy_section_to_code", { id: "hero-1" }],
    ["read_store", {}],
    ["update_theme", {}],
    ["ask_creator", {}],
    ["a_tool_added_next_year", {}],
  ]
  const labels = TOOLS.map(([name, args]) => [name, toolStepLabel(name, JSON.stringify(args), names)] as const)
  const raw = labels.filter(([name, label]) => label.includes("_") || label.includes(name) || !/^[A-Z]/.test(label))
  check("no step is ever a tool's name or snake_case", raw.length === 0, JSON.stringify(raw))
  const say = Object.fromEntries(labels)
  check('read_section is "Reading the Hero section"', say.read_section === "Reading the Hero section", say.read_section)
  check('write_section_code is "Writing pricing.storelib"', say.write_section_code === "Writing pricing.storelib", say.write_section_code)
  check('the check after it is "Checking it compiles"', COMPILE_CHECK_LABEL === "Checking it compiles")
  check("hiding says hiding", say.set_section_visibility === "Hiding the Hero section", say.set_section_visibility)
  check("a tool nobody named yet is still words", say.a_tool_added_next_year === "Working on the page")
  check("a section that is not on the page is not called 'the a section'", !/the a section/.test(toolStepLabel("read_section", '{"id":"nope"}', names)))
  check("a type that is not a file name is never printed as a path", toolStepLabel("write_section_code", '{"sectionType":"../x"}', names) === "Writing the section's code")

  const { events } = await run({
    script: [{ calls: [["read_section", { id: "hero-1" }], ["update_section", { id: "hero-1", settingsJson: "{}" }]] }, { text: "Done." }],
    sections: page,
  })
  check("the loop's own steps carry those words", stepsOf(events).every((s) => !s.label.includes("_")), JSON.stringify(stepsOf(events).map((s) => s.label)))

  /* The list the chat draws: rows only ever appended, repeats folded into one row. */
  const stream: Record<string, unknown>[] = [
    { type: "progress", phase: "reading", label: "Reading the page" },
    { type: "progress", phase: "planning", label: "Planning" },
    { type: "plan", text: "Read the FAQ, then rewrite it." },
    { type: "step", id: "c1", label: "Reading the Questions section", state: "running" },
    { type: "step", id: "c1", label: "Reading the Questions section", state: "done" },
    { type: "progress", phase: "writing", label: "Writing the Questions" },
    { type: "step", id: "c2", label: "Adding to the Questions section", state: "running" },
    { type: "step", id: "c2", label: "Adding to the Questions section", state: "done" },
    { type: "step", id: "c3", label: "Adding to the Questions section", state: "running" },
    { type: "step", id: "c3", label: "Adding to the Questions section", state: "done" },
    { type: "step", id: "c4:check", label: "Checking it compiles", state: "running" },
  ]
  let a = EMPTY_ACTIVITY
  let before: string[] = []
  let moved = false
  for (const line of stream) {
    a = reduceActivity(a, line)
    const keys = timelineRows(a).map((r) => r.key)
    if (before.some((k, i) => keys[i] !== k)) moved = true
    before = keys
  }
  const rows = timelineRows(a)
  check("no row already listed ever changes place as lines arrive", !moved, JSON.stringify(before))
  check("the plan sits where it arrived, after the headlines before it", rows[2]?.kind === "plan", JSON.stringify(rows.map((r) => r.key)))
  check(
    "two of the same step are one row that counts",
    rows.filter((r) => r.kind === "step" && r.label === "Adding to the Questions section").length === 1 &&
      rows.some((r) => r.kind === "step" && r.label === "Adding to the Questions section" && r.count === 2),
  )
  check("the writing headline is left to the steps that name the same section", !rows.some((r) => r.kind === "step" && r.label === "Writing the Questions"))
  check(
    "one thing is running: the headline the server left open is shown as done",
    rows.filter((r) => r.kind === "step" && r.state === "running").length === 1,
    JSON.stringify(rows.filter((r) => r.kind === "step").map((r) => r.kind === "step" && `${r.label}:${r.state}`)),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
}

main().catch((thrown) => {
  console.error(thrown)
  process.exit(1)
})
