/**
 * Round L, L3: the autonomous agent engine (lib/ai-builder/agent/*), driven
 * by a scripted provider against an in-memory website. No network, no keys.
 *
 *   1. a full fitness coach run in blank mode: concept first, tokens, five
 *      original components, three real pages with menu links, a header and
 *      footer of its own (no theme chrome), a real product bound, checks,
 *      finish → complete
 *   2. iterative edit mode touches only the target file; everything else is
 *      byte identical
 *   3. repair: a file that does not compile is not saved, the model fixes
 *      that file only; past maxRepairsPerFile the file is left alone;
 *      verify refuses finish over a broken link and the model fixes it;
 *      when it never does, the job ends partial and says which
 *   4. budgets: iterations, spend and wall clock end the job partial (or
 *      failed when nothing was made); cancel; provider failures
 *   5. permissions: the path rule, read before write, a creator's edit in
 *      between, blank mode refusing theme sections, invented ids, forms
 *   6. the transcript: compaction keeps the checkpoint under its bound, and a
 *      job resumes across slices from the saved checkpoint
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-builder-agent.test.ts
 */
import { runAgentSlice, worstCaseUsd, type SliceResult } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { newCheckpoint, readCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"
import { compactCheckpoint, resumeTurns } from "@/lib/ai-builder/agent/compact"
import { TOOL_LIST, TOOL_SPECS } from "@/lib/ai-builder/agent/tool-specs"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { readConcept } from "@/lib/ai-builder/agent/concept"
import { tokensToThemeSettings } from "@/lib/ai-builder/agent/tokens"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { librarySlop } from "@/lib/ai-builder/agent/knowledge"
import { versionOf } from "@/lib/ai-builder/agent/version"
import type { AgentDeps, AgentJobInput } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest } from "@/lib/sites/agent/types"
import { AGENT_TOOL_NAMES, DEFAULT_JOB_BUDGET, MAX_CHECKPOINT_BYTES, type AgentEvent, type JobBudget } from "@/lib/ai-builder/types"
import { ABOUT, BROKEN_HERO, CAPS, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS, scripted, type Step } from "./ai-builder-agent-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}

const JOB_ID = "11111111-2222-3333-4444-555555555555"
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)

function jobInput(over: Partial<AgentJobInput> = {}, budget: Partial<JobBudget> = {}): AgentJobInput {
  return { jobId: JOB_ID, creatorId: "creator-a", installId: "install-a", prompt: "A website for my strength coaching: small group classes and an 8 week program.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET, ...budget }, startedAt: T0, spentUsd: 0, lastEventSeq: 0, ...over }
}

function depsFor(store: ReturnType<typeof memoryStore>, steps: Step[], extra: Partial<AgentDeps> = {}) {
  /* One script across both roles: the plan model answers while the phase is "plan", the loop model after. Each role records what it was sent. */
  let i = 0
  const role = (id: string) => {
    const rec = {
      id,
      requests: [] as ProviderRequest[],
      calls: 0,
      async complete(req: ProviderRequest) {
        rec.requests.push({ ...req, turns: [...req.turns] })
        rec.calls++
        return scripted([steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }]).complete(req)
      },
    }
    return rec
  }
  const plan = role("plan")
  const loop = role("loop")
  const clock = { t: T0 }
  const deps: AgentDeps = {
    store,
    models: { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: loop, model: "claude-sonnet-5-5", effort: "low" }, small: { provider: loop, model: "claude-haiku-5-5" }, ownKey: false },
    capabilities: async () => CAPS,
    now: () => (clock.t += 1_000),
    ...extra,
  }
  return { deps, plan, loop, clock }
}

const files = (store: ReturnType<typeof memoryStore>) => store.project.files
const kinds = (events: AgentEvent[]) => events.map((e) => e.kind)

/* The fitness coach website, as a model would build it. */
function fitnessSteps(store: ReturnType<typeof memoryStore>): Step[] {
  return [
    /* 1 (plan model): a write before the concept is refused; then the concept. */
    { text: "Planning the look first.", calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }], ["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, tasks: ["Header and footer", "Home: hero and programs", "Programs page", "About page"] }]] },
    /* 2: real data and tokens. */
    { calls: [["list_capabilities", {}], ["set_tokens", { tokens: { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" }, radius: { small: 2, medium: 4, large: 0 }, spacing: { scale: 1.1, sectionY: 96, pageWidth: 1240, gutter: 24 }, motion: { level: "subtle", style: "rise", durationMs: 500 }, custom: { radius: "2px", grain: "0.06" } } }]] },
    /* 3: five original components. */
    {
      calls: [
        ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }],
        ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }],
        ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }],
        ["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }],
        ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }],
      ],
    },
    /* 4: pages. */
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About", seo: { description: "Who coaches you." } }]] },
    /* 5: compose. */
    {
      calls: [
        [
          "set_page_sections",
          {
            page: "home",
            sections: [
              { type: "ai_coach_header", group: "header" },
              { type: "ai_coach_hero", settings: { heading: "Lift with a plan", cta_url: "/programs" } },
              { type: "ai_program_list", blocks: [{ type: "program", settings: { name: "Small group strength", when: "Mon Wed Fri 7am" } }] },
              { type: "ai_coach_footer", group: "footer" },
            ],
          },
        ],
        ["set_page_sections", { page: "programs", sections: [{ type: "ai_program_list", settings: { heading: "All programs" } }] }],
        ["set_page_sections", { page: "about", sections: [{ type: "ai_coach_story" }] }],
      ],
    },
    /* 6: bind a real product (and try an invented one). */
    () => {
      const id = store.project.pages.home.find((s) => s.type === "ai_program_list")?.id ?? ""
      return { calls: [["list_pages", {}], ["bind_data", { page: "home", sectionId: id, prop: "product", kind: "product", ids: ["prod_invented"] }], ["bind_data", { page: "home", sectionId: id, prop: "product", kind: "product", ids: ["prod_8week"] }]] }
    },
    /* 7: checks. */
    { calls: [["validate", {}], ["render_check", { page: "home" }], ["render_check", { page: "programs" }]] },
    /* 8: done. */
    { calls: [["finish", { summary: "A three page site for Iron & Chalk with its own header and footer. Fill in your class times and story." }]] },
  ]
}

async function main() {
  console.log("\n0. tool specs and pure parts")
  check("every tool has exactly one spec, named as the contract", AGENT_TOOL_NAMES.every((n) => TOOL_SPECS[n]?.name === n) && TOOL_LIST.length === AGENT_TOOL_NAMES.length)
  check("every spec is a closed JSON schema object", TOOL_LIST.every((t) => (t.parameters as { type?: string; additionalProperties?: boolean }).type === "object" && (t.parameters as { additionalProperties?: boolean }).additionalProperties === false))
  check("a concept needs every field (L6 validateConcept)", readConcept({ name: "x" }).ok === false && readConcept(CONCEPT).ok === true, readConcept(CONCEPT))
  const mapped = tokensToThemeSettings({ colors: { background: "#ffffff", surface: "#f0f0f0", text: "#111111", muted: "#555555", accent: "#c2410c", accentText: "#ffffff", border: "#dddddd" }, custom: { ok: "4px", bad: "url(https://x.test/a.png)" } }, {})
  check("tokens become schemes and custom tokens; url() refused", !!(mapped.settings.color_schemes as Record<string, unknown>).site && mapped.settings.default_color_scheme === "site" && (mapped.settings.custom_tokens as Record<string, string>).ok === "4px" && !("bad" in (mapped.settings.custom_tokens as Record<string, string>)) && mapped.issues.some((i) => i.code === "token.value"))
  check("remote script refused by validate", validateFile("sections/ai_x.storelib", HERO.replace(/ai_coach_hero/g, "ai_x").replace("</template>", '<script src="https://evil.test/x.js"></script></template>')).some((i) => i.code === "import.script_src"))
  check("a database capability is refused", validateFile("sections/ai_x.storelib", HERO.replace(/ai_coach_hero/g, "ai_x").replace('"category": "hero",', '"category": "hero", "capabilities": ["database"],')).some((i) => i.code === "script.capability"))
  const slop = await librarySlop({ files: [{ path: "sections/ai_t.storelib", text: HERO.replace("Lift with a plan", "Unlock your potential with 10,000+ clients") }], concept: null, capabilities: CAPS })
  check("anti slop (L6): invented metrics and empty words are high", slop.some((i) => i.code.startsWith("slop.") && i.severity === "error"))
  check("the worst case of a call is priced, unpriced models at Opus", worstCaseUsd("claude-sonnet-5-5", 30_000, 24_000) > 0.2 && worstCaseUsd("mystery-model", 30_000, 24_000) >= worstCaseUsd("claude-opus-5-5", 30_000, 24_000))

  console.log("\n1. a fitness coach website, from blank")
  const store = memoryStore({ pages: { home: [] }, settings: {} })
  const { deps, plan, loop } = depsFor(store, fitnessSteps(store))
  const r1 = await runAgentSlice(jobInput(), null, deps, { deadline: T0 + 10 * 60_000 })
  check("the job completes", r1.status === "complete", { status: r1.status, summary: r1.summary, events: r1.events.filter((e) => e.kind === "tool" && !e.ok) })
  check("the first call is the plan model, the rest the loop model", plan.calls === 1 && loop.calls >= 7, { plan: plan.calls, loop: loop.calls })
  const toolEvents = r1.events.filter((e): e is Extract<AgentEvent, { kind: "tool" }> => e.kind === "tool")
  check("a write before the concept was refused and nothing was saved then", toolEvents[0]?.tool === "write_file" && toolEvents[0].ok === false && store.versions[0]?.path === "sections/ai_coach_header.storelib")
  const own = Object.keys(files(store)).filter((p) => /^sections\/ai_/.test(p))
  check("five original component files", own.length === 5, own)
  check("every file version is authored by the AI and tagged with the job", store.versions.length >= 5 && store.versions.every((v) => v.author === "ai" && v.jobId === JOB_ID))
  const pages = store.project.pages
  check("three real pages", ["home", "programs", "about"].every((k) => k in pages), Object.keys(pages))
  const all = Object.values(pages).flat()
  check("no theme header or footer anywhere (blank mode)", !all.some((s) => s.type === "header" || s.type === "footer"))
  check("its own header and footer, site-wide, on every page", Object.values(pages).every((list) => list[0]?.type === "ai_coach_header" && list[0].group === "header" && list[list.length - 1]?.type === "ai_coach_footer" && list[list.length - 1].group === "footer"), Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.map((s) => `${s.type}:${s.group ?? ""}`)])))
  check("every body section is an ai_ component", all.every((s) => s.type.startsWith("ai_")))
  const menu = (store.project.settings.menus as Record<string, { links: { url: string }[] }>)["main-menu"]
  check("pages are in the Main menu with real addresses", menu?.links.map((l) => l.url).join(",") === "/programs,/about", menu)
  check("tokens are Theme settings", (store.project.settings.color_schemes as Record<string, unknown>)?.site !== undefined && store.project.settings.font_heading === "Oswald" && (store.project.settings.custom_tokens as Record<string, string>)?.["section-y"] === "96px")
  const programs = pages.home.find((s) => s.type === "ai_program_list")
  check("a real product is bound; the invented one was refused", programs?.settings.product === "prod_8week" && toolEvents.some((e) => e.tool === "bind_data" && !e.ok))
  check("ids are stable and unique", new Set(all.filter((s) => !s.group).map((s) => s.id)).size === all.filter((s) => !s.group).length && all.every((s) => /-11111111-\d+$/.test(s.id)), all.map((s) => s.id))
  const k1 = kinds(r1.events)
  check("events tell the story: brief, plan, build, verify, finish", ["brief", "plan", "build", "verify", "finish"].every((p) => r1.events.some((e) => e.kind === "phase" && e.phase === p)) && k1.includes("file") && k1.includes("page") && k1.includes("tokens") && k1.includes("spend") && k1[k1.length - 1] === "finished")
  check("events are numbered from 1 without gaps", r1.events.every((e, i) => e.seq === i + 1))
  check("no file body in any event", r1.events.every((e) => JSON.stringify(e).length < 2_000))
  check("spend is tracked per call", r1.usage.calls === plan.calls + loop.calls && r1.usage.usd > 0 && r1.events.filter((e) => e.kind === "spend").length === r1.usage.calls && r1.totalUsd === r1.usage.usd)
  check("the checkpoint is within its bound and holds no file body", JSON.stringify(r1.checkpoint).length < MAX_CHECKPOINT_BYTES && !JSON.stringify(r1.checkpoint).includes("<style scoped>"))
  check("the system prompt and tools are the stable prefix of every call", [...plan.requests, ...loop.requests].every((q) => q.system === plan.requests[0].system && q.tools.length === 17 && q.cacheKey === "ai-builder:install-a"))
  check("the first request carries the brief with the real product id", plan.requests[0].turns[0].role === "user" && /prod_8week/.test((plan.requests[0].turns[0] as { content: string }).content))
  const again = await runAgentSlice(jobInput(), r1.checkpoint, deps, { deadline: T0 + 10 * 60_000 })
  check("a finished job run again does nothing", again.status === "complete" && again.usage.calls === 0)

  console.log("\n2. edit mode touches only what is asked")
  const before = JSON.stringify({ files: files(store), pages: store.project.pages, settings: store.project.settings })
  const otherFiles = Object.fromEntries(Object.entries(files(store)).filter(([p]) => p !== "sections/ai_coach_hero.storelib"))
  const editSteps: Step[] = [
    { calls: [["list_pages", {}], ["read_file", { path: "sections/ai_coach_hero.storelib" }]] },
    { calls: [["edit_file", { path: "sections/ai_coach_hero.storelib", old: "font-size: clamp(40px, 9cqi, 112px); line-height: 0.92;", new: "font-size: clamp(34px, 6cqi, 72px); line-height: 1.05;" }]] },
    { calls: [["finish", { summary: "The hero heading is smaller and calmer." }]] },
  ]
  const e = depsFor(store, editSteps)
  const r2 = await runAgentSlice(jobInput({ edit: true, mode: "theme", prompt: "Make the hero heading calmer, smaller." }), null, e.deps, { deadline: T0 + 10 * 60_000 })
  check("the edit completes without a new concept", r2.status === "complete", r2.summary)
  check("only the hero file changed", files(store)["sections/ai_coach_hero.storelib"].includes("clamp(34px, 6cqi, 72px)") && Object.entries(otherFiles).every(([p, t]) => files(store)[p] === t))
  check("pages and settings are byte identical", JSON.stringify(store.project.pages) === JSON.stringify(JSON.parse(before).pages) && JSON.stringify(store.project.settings) === JSON.stringify(JSON.parse(before).settings))
  check("the edit's events name only the hero", r2.events.filter((ev) => ev.kind === "file" || ev.kind === "page" || ev.kind === "tokens").every((ev) => ev.kind === "file" && ev.path === "sections/ai_coach_hero.storelib"))

  console.log("\n3. repair")
  {
    const s = memoryStore()
    const steps: Step[] = [
      { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] },
      { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: BROKEN_HERO }]] },
      (req) => {
        const last = req.turns[req.turns.length - 1]
        const said = last.role === "tool" ? last.results[0].output : ""
        return /did not compile/.test(said) && /"line":\d+/.test(said) ? { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] } : { calls: [["finish", { summary: "no feedback seen" }]] }
      },
      { calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_coach_hero", settings: { cta_url: "/pricing" } }] }]] },
      { calls: [["finish", { summary: "First try." }]] },
      (req) => {
        const last = req.turns[req.turns.length - 1]
        const said = last.role === "tool" ? last.results[0].output : ""
        const id = Object.values(s.project.pages).flat().find((x) => x.type === "ai_coach_hero")?.id ?? ""
        return /pricing/.test(said) && /not a page of this site/.test(said) ? { calls: [["set_section_settings", { page: "home", sectionId: id, settings: { cta_url: "/" } }]] } : { calls: [["finish", { summary: "did not see the link error" }]] }
      },
      { calls: [["finish", { summary: "Fixed the link." }]] },
    ]
    const d = depsFor(s, steps)
    const r = await runAgentSlice(jobInput(), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("a broken file is not saved; the model gets the error with its line and fixes that file", s.versions.filter((v) => v.path === "sections/ai_coach_hero.storelib").length === 1 && files(s)["sections/ai_coach_hero.storelib"] === HERO)
    check("the refused write is a repair event", r.events.some((ev) => ev.kind === "repair" && ev.path === "sections/ai_coach_hero.storelib" && ev.attempt === 1))
    check("verify refused finish over the broken link, then the job completed", r.status === "complete" && r.events.some((ev) => ev.kind === "phase" && ev.phase === "repair") && r.checkpoint.verifyCycles === 1, { status: r.status, summary: r.summary })
  }
  {
    const s = memoryStore()
    const broken = (n: number): Step => ({ calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: BROKEN_HERO.replace("Lift", `Lift ${n}`) }]] })
    const steps: Step[] = [{ calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] }, broken(1), broken(2), broken(3), broken(4), { calls: [["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }]] }, { calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_coach_story", settings: { body: "<p>x</p>" } }, { type: "ai_coach_hero" }] }]] }, { calls: [["finish", { summary: "Tried." }]] }]
    const d = depsFor(s, steps, {})
    const r = await runAgentSlice(jobInput({}, { maxRepairsPerFile: 3 }), null, d.deps, { deadline: T0 + 10 * 60_000 })
    const outs = d.loop.requests.map((q) => q.turns[q.turns.length - 1]).filter((t) => t.role === "tool").map((t) => (t.role === "tool" ? t.results[0].output : ""))
    check("past maxRepairsPerFile the file is left alone", r.checkpoint.repairs["sections/ai_coach_hero.storelib"] === 3 && outs.some((o) => /repair\.exhausted/.test(o)) && !("sections/ai_coach_hero.storelib" in files(s)))
    check("placing the type that never compiled is refused", outs.some((o) => /no section \\"ai_coach_hero\\"/.test(o)))
  }
  {
    /* The model never fixes the broken link: after maxVerifyCycles the job ends partial, naming what fails. */
    const s = memoryStore()
    const steps: Step[] = [
      { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] },
      { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] },
      { calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_coach_hero", settings: { cta_url: "/nowhere" } }] }]] },
      { calls: [["finish", { summary: "1" }]] },
      { calls: [["finish", { summary: "2" }]] },
      { calls: [["finish", { summary: "3" }]] },
    ]
    const d = depsFor(s, steps)
    const r = await runAgentSlice(jobInput({}, { maxVerifyCycles: 2 }), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("never complete with failing checks: partial, honest", r.status === "partial" && /partial/.test(r.summary ?? "") && (r.checkpoint.final?.failing.length ?? 0) > 0 && r.events[r.events.length - 1].kind === "finished", { status: r.status, summary: r.summary })
    check("what was made is kept as a draft", "sections/ai_coach_hero.storelib" in files(s))
  }

  console.log("\n4. budgets, cancel, failures")
  {
    const s = memoryStore()
    const steps: Step[] = [{ calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] }, { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] }, { calls: [["list_pages", {}]] }, { calls: [["list_pages", {}]] }, { calls: [["list_pages", {}]] }]
    const d = depsFor(s, steps)
    const r = await runAgentSlice(jobInput({}, { maxIterations: 3 }), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("iterations spent: partial, the work kept, the reason said", r.status === "partial" && r.stopped === "iterations" && r.iteration === 3 && "sections/ai_coach_hero.storelib" in files(s) && /used all its steps/.test(r.summary ?? ""), { status: r.status, stopped: r.stopped, it: r.iteration })
  }
  {
    const s = memoryStore()
    const d = depsFor(s, [{ calls: [["list_pages", {}]] }])
    const r = await runAgentSlice(jobInput({ spentUsd: 0.5 }, { maxUsd: 0.6 }), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("a call that could pass the spend cap is not made; nothing made is failed", r.status === "failed" && r.stopped === "spend" && d.plan.calls === 0)
    const own = depsFor(memoryStore(), [{ calls: [["report_progress", { phase: "plan", label: "x" }]] }])
    own.deps.models.ownKey = true
    const r2b = await runAgentSlice(jobInput({ spentUsd: 0.5 }, { maxUsd: 0.6, maxUsdOwnKey: 15, maxIterations: 1 }), null, own.deps, { deadline: T0 + 10 * 60_000 })
    check("the creator's own key has its own cap", own.plan.calls === 1 && r2b.stopped === "iterations")
  }
  {
    const s = memoryStore()
    const steps: Step[] = [
      { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] },
      () => {
        /* Twenty minutes pass while this call answers. */
        d.clock.t = T0 + DEFAULT_JOB_BUDGET.maxWallMs
        return { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] }
      },
      { calls: [["list_pages", {}]] },
    ]
    const d = depsFor(s, steps)
    const r = await runAgentSlice(jobInput(), null, d.deps, { deadline: T0 + 60 * 60_000 })
    check("the wall clock ends the job partial", r.status === "partial" && r.stopped === "wall_clock", { status: r.status, stopped: r.stopped })
  }
  {
    const s = memoryStore()
    let n = 0
    const d = depsFor(s, [{ calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }]] }, { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] }], { cancelled: async () => ++n > 3 })
    const r = await runAgentSlice(jobInput(), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("cancel stops the job, drafts kept", r.status === "cancelled" && r.stopped === "cancelled" && r.events[r.events.length - 1].kind === "finished")
  }
  {
    const s = memoryStore()
    const d = depsFor(s, [{ throws: "overloaded" }, { throws: "overloaded" }, { throws: "overloaded" }])
    const r = await runAgentSlice(jobInput(), null, d.deps, { deadline: T0 + 10 * 60_000 })
    check("three provider failures in a row end the job, said plainly", r.status === "failed" && r.events.filter((ev) => ev.kind === "error").length === 3 && /failed 3 times/.test(r.summary ?? ""))
  }

  console.log("\n5. permissions")
  {
    const s = memoryStore({ files: { "sections/hero.storelib": "theme file", "sections/ai_mine.storelib": HERO.replace(/ai_coach_hero/g, "ai_mine") }, pages: { home: [] } })
    const cp = newCheckpoint()
    const events: unknown[] = []
    const tools = createToolSet({ job: jobInput(), deps: { store: s, models: depsFor(s, []).deps.models, capabilities: async () => CAPS }, cp, emit: (ev) => events.push(ev), onFinish: async () => ({ ok: true }), setPhase: () => undefined })
    await tools.report_progress({ phase: "plan", label: "c", concept: CONCEPT })
    const theme = await tools.write_file({ path: "sections/hero.storelib", content: HERO })
    const layout = await tools.write_file({ path: "layout/theme.storelib", content: HERO })
    const escape = await tools.write_file({ path: "sections/ai_x.storelib/../header.storelib", content: HERO })
    check("only ai_ component paths are writable", theme.ok === false && theme.reason === "forbidden_path" && layout.ok === false && escape.ok === false && s.project.files["sections/hero.storelib"] === "theme file")
    const unread = await tools.write_file({ path: "sections/ai_mine.storelib", content: HERO.replace(/ai_coach_hero/g, "ai_mine").replace("Lift", "Push") })
    check("an existing file must be read before it is written", unread.ok === false && unread.reason === "conflict")
    await tools.read_file({ path: "sections/ai_mine.storelib" })
    s.project.files["sections/ai_mine.storelib"] = s.project.files["sections/ai_mine.storelib"].replace("Lift", "Carry")
    const raced = await tools.edit_file({ path: "sections/ai_mine.storelib", old: "Carry", new: "Push" })
    check("the creator's edit in between wins: conflict, nothing overwritten", raced.ok === false && raced.reason === "conflict" && s.project.files["sections/ai_mine.storelib"].includes("Carry"))
    const r = await tools.read_file({ path: "sections/ai_mine.storelib" })
    check("read gives the version (sha256 of the draft)", "version" in r && r.version === versionOf(s.project.files["sections/ai_mine.storelib"]))
    const native = await tools.set_page_sections({ page: "home", sections: [{ type: "hero_split" }, { type: "header", group: "header" }] })
    check("blank mode refuses theme sections and the theme header", native.ok === false && (native.issues ?? []).filter((i) => i.code === "chrome.builtin").length === 2)
    const notChrome = await tools.set_page_sections({ page: "home", sections: [{ type: "ai_mine", group: "header" }] })
    check("a component that is not a header cannot be placed as one", notChrome.ok === false && (notChrome.issues ?? []).some((i) => i.code === "chrome.kind"))
    const placed = await tools.set_page_sections({ page: "home", sections: [{ type: "ai_mine" }] })
    const bound = await tools.set_page_sections({ page: "home", sections: [{ type: "ai_mine", settings: { photo: "x" } }] })
    check("placing works and settings are kept to the schema", placed.ok && bound.ok)
    const missing = await tools.set_page_sections({ page: "pricing", sections: [] })
    check("a page that does not exist is refused", missing.ok === false)
    const form = await tools.bind_data({ page: "home", sectionId: placed.ids[0], prop: "photo", kind: "form", ids: ["f1"] })
    check("forms cannot be bound until form_picker exists", form.ok === false && (form.issues ?? [])[0]?.code === "binding.form_unavailable")
    const caps = await tools.list_capabilities({})
    check("capabilities are this store's only, pages and menus from the website", caps.products.length === 1 && caps.products[0].id === "prod_8week" && caps.pages.some((p) => p.key === "home" && p.url === "/"))
    const otherTenant = await tools.bind_data({ page: "home", sectionId: placed.ids[0], prop: "photo", kind: "product", ids: ["prod_of_creator_b"] })
    check("another creator's product id is refused", otherTenant.ok === false)
    const reserved = await tools.add_page({ key: "checkout", title: "Checkout" })
    const badKey = await tools.add_page({ key: "Our Story!", title: "x" })
    check("reserved and malformed page keys are refused", reserved.ok === false && badKey.ok === false)
    const del = await tools.delete_file({ path: "sections/ai_mine.storelib" })
    check("a placed component cannot be deleted", del.ok === false && "sections/ai_mine.storelib" in s.project.files)
    const del2 = await tools.delete_file({ path: "sections/hero.storelib" })
    check("a theme file cannot be deleted", del2.ok === false && "sections/hero.storelib" in s.project.files)
  }

  console.log("\n6. the transcript and resuming")
  {
    const cp = newCheckpoint()
    cp.turns.push({ role: "user", text: "BRIEF" })
    for (let i = 0; i < 1500; i++) {
      cp.turns.push({ role: "assistant", text: `step ${i}`, toolCalls: [{ id: `c${i}`, name: "read_file", argumentsJson: JSON.stringify({ path: `sections/ai_${i}.storelib` }) }] })
      cp.turns.push({ role: "tool", toolCallId: `c${i}`, text: "x".repeat(3_000) })
    }
    const c = compactCheckpoint(cp)
    check("compaction keeps the checkpoint under MAX_CHECKPOINT_BYTES", Buffer.byteLength(JSON.stringify(c)) <= MAX_CHECKPOINT_BYTES && Buffer.byteLength(JSON.stringify(cp)) > MAX_CHECKPOINT_BYTES, Buffer.byteLength(JSON.stringify(c)))
    check("the brief stays first and the folded turns are summarised", c.turns[0].text === "BRIEF" && c.summary.includes("you called read_file"))
    check("compaction is deterministic", JSON.stringify(compactCheckpoint(cp)) === JSON.stringify(c))
    const resumed = resumeTurns(c)
    check("a resumed slice starts from one user turn with the digest", resumed.length === 1 && resumed[0].role === "user" && /RESUMING/.test(resumed[0].content))
  }
  {
    const s = memoryStore({ pages: { home: [] } })
    const steps = fitnessSteps(s)
    const d = depsFor(s, steps)
    const first = await runAgentSlice(jobInput(), null, d.deps, { deadline: T0 + 10 * 60_000, maxIterations: 3 })
    check("a slice stops at its iteration budget and asks to chain", first.status === "running" && first.iteration === 3)
    const saved = readCheckpoint(JSON.parse(JSON.stringify(first.checkpoint))) as LoopCheckpoint
    check("the checkpoint survives JSON (the database) and keeps the concept and versions", !!saved?.concept && Object.keys(saved.known).length === 5 && saved.turns.length > 1)
    const rest = await runAgentSlice(jobInput({ spentUsd: first.totalUsd, lastEventSeq: first.events[first.events.length - 1].seq }), saved, d.deps, { deadline: T0 + 10 * 60_000 })
    check("the next slice resumes and completes", rest.status === "complete", { status: rest.status, summary: rest.summary })
    const firstReq = d.loop.requests[d.loop.requests.length - (rest.usage.calls)]
    check("it resumed from the digest, not from replayed provider turns", firstReq.turns.length === 1 && /THIS JOB IS RESUMING/.test((firstReq.turns[0] as { content: string }).content) && /Chalk and Iron/.test((firstReq.turns[0] as { content: string }).content))
    check("event numbers continue across slices", rest.events[0].seq === first.events[first.events.length - 1].seq + 1)
    check("spend adds up across slices", rest.totalUsd > first.totalUsd && Math.abs(rest.totalUsd - (first.totalUsd + rest.usage.usd)) < 1e-6)
    /* Deadline: no call starts inside callReserveMs. */
    const late = await runAgentSlice(jobInput(), null, depsFor(memoryStore(), steps).deps, { deadline: T0 + DEFAULT_JOB_BUDGET.callReserveMs - 1 })
    check("no call starts inside the reserve before the deadline", late.status === "running" && late.usage.calls === 0)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void (main() as Promise<void>).catch((e) => {
  console.error(e)
  process.exit(1)
})

export type { SliceResult }
