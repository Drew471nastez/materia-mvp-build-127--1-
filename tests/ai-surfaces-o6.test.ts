/**
 * Round O (O6): the design intelligence on EVERY AI surface that designs or
 * changes a website (docs/ai-builder/design-intelligence.md is the map).
 *
 *   RULES EVERYWHERE  each surface's assembled prompt carries the design
 *                     rules for that surface (designRulesFor, through
 *                     lib/storelib-ai/surfaces.ts): the website agent, the
 *                     editor's Ask for a change agent and its creative
 *                     planner, the section writer, the classic planner and
 *                     copy filler, the Storelib Sites agent
 *   CACHEABLE         the website agent's system prefix is byte identical
 *                     across two different jobs while their briefs differ
 *                     (O2's brief and direction, O1's references as text,
 *                     O5's site story and motion)
 *   EDITS KEEP BRAND  every edit surface gets the site's DESIGN.md and the
 *                     keep-the-brand rule (spec I.5)
 *   NO SERIF DEFAULT  no surface carries round N's "editorial serif" type
 *                     steering, and a personal trainer is not handed the
 *                     editorial serif bundle as its direction or type
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-surfaces-o6.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { AGENT_SYSTEM, briefMessage } from "@/lib/ai-builder/agent/prompts"
import { jobDesignBrief } from "@/lib/ai-builder/agent/design-brief"
import type { AgentDeps, AgentJobInput } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import { designRulesFor } from "@/lib/storelib-ai/design-rules"
import { briefFrom, chooseDirection, directionForPrompt } from "@/lib/storelib-ai/direction"
import type { DesignReference } from "@/lib/storelib-ai/references"
import { KEEP_BRAND_TOKENS, TYPE_FROM_DIRECTION, editDesignContext, findDesignContract, surfaceRules } from "@/lib/storelib-ai/surfaces"
import { buildSystemPrompt, SYSTEM_PROMPT as SITES_SYSTEM } from "@/lib/sites/agent/loop"
import { themeAgent } from "@/lib/website-builder/agent/loop"
import { writeSection, writeSectionSystem } from "@/lib/website-builder/agent/write-section"
import { PLANNER_SYSTEM } from "@/lib/website-builder/agent/creative-plan"
import { SITE_PLANNER_SYSTEM, sitePlannerSystem } from "@/lib/website-builder/agent/site-plan"
import { fillSystem } from "@/lib/website-builder/ai-site/fill"
import { STUDIO_CRAFT } from "@/lib/website-builder/ai-site/craft"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { ThemeState } from "@/lib/website-builder/agent/operations"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import { CAPS } from "./ai-builder-agent-fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** A provider that records every request and answers with plain text (or throws, to end a job quickly). */
function recording(answer: { text?: string; throws?: string } = { text: "REPLY: What should it say?" }) {
  const seen: ProviderRequest[] = []
  const provider: AgentProvider = {
    id: "recording",
    async complete(request): Promise<ProviderTurn> {
      seen.push({ ...request, turns: [...request.turns] })
      if (answer.throws) throw new Error(answer.throws)
      return { text: answer.text ?? "", toolCalls: [], raw: [], usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }, stop: "done" }
    },
  }
  return { provider, seen }
}

const T0 = Date.UTC(2026, 10, 10, 9, 0, 0)
function job(over: Partial<AgentJobInput> = {}): AgentJobInput {
  return { jobId: "job-1", creatorId: "creator-1", installId: "install-1", prompt: "A website for my personal training business: one to one sessions, book a consultation.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET }, startedAt: T0, spentUsd: 0, lastEventSeq: 0, ...over }
}
function deps(provider: AgentProvider, store = memoryStore(), extra: Partial<AgentDeps> = {}): AgentDeps {
  let t = T0
  return { store, models: { plan: { provider, model: "claude-opus-5-5" }, loop: { provider, model: "claude-opus-5-5" }, small: { provider, model: "claude-opus-5-5" }, ownKey: false }, capabilities: async () => CAPS, knowledge: async () => [], now: () => (t += 1_000), ...extra }
}
const firstText = (r: ProviderRequest) => String((r.turns[0] as { content?: string }).content ?? "")

const DESIGN_MD = `---
name: Iron and Chalk
colors:
  ink: "#111111"
  signal: "#d7263d"
typography:
  display: { fontFamily: "Barlow Condensed" }
---
# How it is applied
Signal red only on the booking button and live session times.`

/** Round N's type steering, word for word, and its shape. None of it may come back. */
const OLD_STEERING = [/a display face with character \(editorial serif/i, /editorial serif, characterful grotesk, condensed display, mono/i, /Labels in small capitals with letter spacing/i]
const steered = (text: string) => OLD_STEERING.filter((r) => r.test(text)).map(String)

async function main() {
section("1. Every surface's prompt carries the design rules")
const surfaces: Record<string, { prompt: string; rules: string }> = {}
{
  surfaces["website agent (system)"] = { prompt: AGENT_SYSTEM, rules: designRulesFor("site_agent") }
  surfaces["section writer (system)"] = { prompt: writeSectionSystem(), rules: designRulesFor("section_writer") }
  surfaces["Ask for a change: creative planner (system)"] = { prompt: PLANNER_SYSTEM, rules: designRulesFor("site_agent") }
  surfaces["classic planner (system)"] = { prompt: sitePlannerSystem({}), rules: designRulesFor("classic") }
  surfaces["classic planner with a coder (system)"] = { prompt: sitePlannerSystem({ free: true, craft: STUDIO_CRAFT }), rules: designRulesFor("classic") }
  const site = { brand: { name: "Iron and Chalk", tagline: "" }, voice: { tone: "direct", use: [], avoid: [] }, audience: "busy people", conversion: "book a consultation", imagery: "real sessions", pages: [{ key: "home", title: "Home", purpose: "the offer" }] }
  surfaces["classic copy filler (system)"] = { prompt: fillSystem({ site: site as never, caps: {} as never, capsText: "", prompt: "A trainer", links: [], defaultLink: "/contact" }), rules: designRulesFor("classic") }
  surfaces["Storelib Sites agent, new site (system)"] = { prompt: buildSystemPrompt(null), rules: designRulesFor("sites_agent") }
  surfaces["Storelib Sites agent, existing site (system)"] = { prompt: buildSystemPrompt({ manifest: "", facts: "src/App.tsx, 4 pages", intent: "change the hero" } as never), rules: designRulesFor("sites_agent") }

  /* The Ask for a change agent's system prompt, as the provider receives it. */
  const ask = recording({ text: "Hello." })
  const state: ThemeState = { sections: [{ id: "hero-1", type: "hero", settings: {}, blocks: [] } as never], settings: {} }
  const loop = themeAgent({ provider: ask.provider, model: "test", prompt: "Change only the pricing section", state, page: "home", addable: ADDABLE_SECTIONS, designContract: { path: "DESIGN.md", text: DESIGN_MD } })
  for (let s = await loop.next(); !s.done; s = await loop.next()) {
    /* drained */
  }
  check("the Ask for a change agent was asked at least once", ask.seen.length >= 1, ask.seen.length)
  if (ask.seen[0]) {
    surfaces["Ask for a change agent (system, as sent)"] = { prompt: ask.seen[0].system, rules: designRulesFor("ask_edit") }
    surfaces["Ask for a change agent (first turn)"] = { prompt: firstText(ask.seen[0]), rules: KEEP_BRAND_TOKENS }
  }

  for (const [name, s] of Object.entries(surfaces)) check(`${name} carries ${s.rules === KEEP_BRAND_TOKENS ? "the keep-the-brand rule" : "its design rules"}`, s.prompt.includes(s.rules))
  check("surfaceRules is designRulesFor, one text per surface", surfaceRules("sites_agent") === designRulesFor("sites_agent") && surfaceRules("ask_edit") !== surfaceRules("sites_agent"))
  check("the Sites agent's base prompt still opens on its own rules and keeps the four edges rule", SITES_SYSTEM.startsWith("You edit a small React website") && /MUST REACH ALL FOUR EDGES/.test(SITES_SYSTEM))
  check("the classic planner without a coder is still the one constant", sitePlannerSystem({}) === SITE_PLANNER_SYSTEM)
  check("the rules name the editorial serif bundle as a cliche, and the honest copy rule", ["site_agent", "ask_edit", "sites_agent", "classic"].every((x) => /serif/i.test(designRulesFor(x as never)) && /cream/i.test(designRulesFor(x as never))) && /instructions? to the creator/i.test(designRulesFor("site_agent")))
  check("the rules carry no em dash, no date and no template text (they sit in cached prefixes)", Object.values({ a: designRulesFor("site_agent"), b: designRulesFor("sites_agent"), c: designRulesFor("ask_edit") }).every((t) => !/—|\$\{|2026/.test(t)))
}

section("2. The website agent: one cached prefix, a brief per job")
{
  const a = recording({ throws: "stop here" })
  await runAgentSlice(job(), null, deps(a.provider), { deadline: T0 + 30 * 60_000 })
  const b = recording({ throws: "stop here" })
  await runAgentSlice(job({ jobId: "job-2", creatorId: "creator-2", installId: "install-2", prompt: "A Y2K style storefront for my sample packs and drum kits.", options: { generation: "blank" } }), null, deps(b.provider), { deadline: T0 + 30 * 60_000 })
  check("both jobs reached the model", a.seen.length >= 1 && b.seen.length >= 1, [a.seen.length, b.seen.length])
  const sa = a.seen[0]?.system ?? ""
  const sb = b.seen[0]?.system ?? ""
  check("the system prefix is byte identical across the two jobs", sa === sb && sa === AGENT_SYSTEM && sa.length > 10_000)
  check("and the tools are the same list", JSON.stringify(a.seen[0]?.tools) === JSON.stringify(b.seen[0]?.tools))
  check("the prefix holds the design rules and the studio's craft", sa.includes(designRulesFor("site_agent")) && sa.includes(STUDIO_CRAFT))
  const ba = firstText(a.seen[0])
  const bb = firstText(b.seen[0])
  check("while the first turns (the briefs) differ", ba !== bb && /personal training/.test(ba) && /sample packs/.test(bb))
  check("each brief carries the job's creative brief, its direction and its motion tier", [ba, bb].every((t) => /CREATIVE BRIEF/.test(t) && /ART DIRECTION/.test(t) && /MOTION \(this site's feel: /.test(t)))
  check("a trainer who asked to book is told the main action is to book", /Main action: book/.test(ba))
  check("the brief still ends on the order of work", /render_check on every page, finish\.$/.test(ba))
  check("nothing of the job is in the prefix", !sa.includes("personal training") && !sa.includes("sample packs"))
}

section("3. References: their analyses in the brief, nothing claimed that was not sent")
{
  const ref: DesignReference = { id: "ref-strength-split", title: "Strength studio split hero", summary: "A full-bleed training photo beside a condensed headline.", styleTags: ["sport", "bold"], industries: ["fitness"], borrow: ["one strong photo per screen"], avoid: ["copying its words"], image: null }
  const brief = await jobDesignBrief({ job: job(), caps: CAPS, files: [], references: { list: [ref] } })
  check("references chosen for the job are in its brief, by id, as evidence", brief.referenceIds.join() === "ref-strength-split" && brief.text.includes("ref-strength-split") && /one strong photo per screen/.test(brief.text))
  const none = await jobDesignBrief({ job: job(), caps: CAPS, files: [], references: { list: [] } })
  check("with none, the brief says nothing about references or pictures", none.referenceIds.length === 0 && !/ref-|picture is attached|pictures are attached/i.test(none.text))
  const edit = await jobDesignBrief({ job: job({ edit: true }), caps: CAPS, files: [], references: { list: [ref] } })
  check("an edit gets no new direction and no references", edit.text === "" && edit.referenceIds.length === 0)
  check("the design brief is bounded", (await jobDesignBrief({ job: job({ prompt: "x ".repeat(5_000) }), caps: CAPS, files: [] })).text.length <= 9_100)
}

section("4. Edits get the site's DESIGN.md and keep the brand")
{
  const files = [{ path: "DESIGN.md", text: DESIGN_MD, updatedAt: null }, { path: "sections/ai_hero.storelib", text: "<template></template>", updatedAt: null }]
  const pages = [{ key: "home", sections: [] }]
  for (const [name, over] of [["edit mode", { edit: true }], ["a redesign of changes", { redesign: "changes" as const }]] as const) {
    const brief = briefMessage({ job: job(over as Partial<AgentJobInput>), caps: CAPS, pages, files, knowledge: [] })
    check(`the website agent in ${name} gets the contract and the keep-the-brand rule`, brief.includes(DESIGN_MD.trim()) && brief.includes(KEEP_BRAND_TOKENS) && !/ART DIRECTION/.test(brief))
  }
  const blind = briefMessage({ job: job({ edit: true }), caps: CAPS, pages, files: files.slice(1), knowledge: [] })
  check("without a DESIGN.md an edit still keeps the brand", blind.includes(KEEP_BRAND_TOKENS) && !/DESIGN CONTRACT/.test(blind))
  check("the rule is spec I.5: change only what is named, tokens kept unless asked", /"change only the pricing section" changes that section and nothing else/.test(KEEP_BRAND_TOKENS) && /fonts, colours and colour schemes/.test(KEEP_BRAND_TOKENS) && /unless the request asks to change them/.test(KEEP_BRAND_TOKENS))
  const fresh = briefMessage({ job: job(), caps: CAPS, pages, files, knowledge: [] })
  check("a new website is not told to keep a brand it does not have", !fresh.includes(KEEP_BRAND_TOKENS))

  check("the Ask for a change agent's first turn has the contract", (surfaces["Ask for a change agent (first turn)"]?.prompt ?? "").includes("Signal red only on the booking button"))

  const writer = recording()
  await writeSection({ provider: writer.provider, model: "test", prompt: "a pricing section", takenTypes: [], takenNames: [], designContract: { path: "DESIGN.md", text: DESIGN_MD } })
  const w = writer.seen[0] ? firstText(writer.seen[0]) : ""
  check("the section writer on an existing site gets the contract and the rule", w.includes("Signal red only on the booking button") && w.includes(KEEP_BRAND_TOKENS))
  check("and its system prefix is still the one constant", writer.seen.every((r) => r.system === writeSectionSystem()))
  const coder = recording()
  await writeSection({ provider: coder.provider, model: "test", prompt: "a pricing section", takenTypes: [], takenNames: [] })
  check("the classic coder, writing a new site to its plan, is not told to keep a brand", !(coder.seen[0] ? firstText(coder.seen[0]) : "").includes(KEEP_BRAND_TOKENS))

  check("the contract is found wherever O2 keeps it, the root one first", findDesignContract({ "config/DESIGN.md": "b", "DESIGN.md": "a" })?.path === "DESIGN.md" && findDesignContract({ "config/design.md": "b" })?.path === "config/design.md" && findDesignContract({ "sections/x.storelib": "y" }) === null)
  check("a long contract is shortened, never sent whole", editDesignContext({ "DESIGN.md": "x".repeat(20_000) }).length < 8_000)

  const codeRoute = code("app/api/website-builder/themes/[installId]/sections/code/route.ts")
  check("Code a section reads the install's DESIGN.md and hands it to the writer", /readDesignContract\(supabase, installId\)/.test(codeRoute) && /designContract,/.test(codeRoute))
  const askRoute = code("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the Ask for a change route reads it and hands it to the agent", /readDesignContract\(supabase, installId\)/.test(askRoute) && /themeAgent\(\{[\s\S]{0,200}designContract,/.test(askRoute))
  check("ai-edit and redesign are agent jobs, so they get the website agent's brief", /kickJob/.test(code("app/api/website-builder/themes/[installId]/ai-edit/route.ts")) && /kickJob/.test(code("app/api/website-builder/themes/[installId]/redesign/route.ts")))
}

section("5. No surface carries the old editorial serif steering")
{
  for (const [name, s] of Object.entries(surfaces)) check(`${name}: no "editorial serif" default`, steered(s.prompt).length === 0, steered(s.prompt))
  check("the agent's type rule is fit the business, from the direction", AGENT_SYSTEM.includes(TYPE_FROM_DIRECTION) && /Fit the business, from the direction/.test(TYPE_FROM_DIRECTION))
  const brief = briefMessage({ job: job(), caps: CAPS, pages: [{ key: "home", sections: [] }], files: [], knowledge: [], directions: [] })
  check("a brief without directions has no type list (unchanged)", !/TYPE SYSTEMS THAT FIT/.test(brief))
  const { suggestDirections } = await import("@/lib/storelib-ai/library/concept")
  const withTypes = briefMessage({ job: job(), caps: CAPS, pages: [{ key: "home", sections: [] }], files: [], knowledge: [], directions: suggestDirections("fitness coach", { seed: "creator-1" }) })
  const types = withTypes.split("TYPE SYSTEMS THAT FIT")[1]?.split("\n\n")[0] ?? ""
  check("a personal trainer is offered three type systems, none the italic serif", (types.match(/^\* /gm) ?? []).length === 3 && !/Instrument Serif \d+ italic/.test(types), types)
  const asked = briefMessage({ job: job({ prompt: "An editorial, literary site for my writing coaching" }), caps: CAPS, pages: [{ key: "home", sections: [] }], files: [], knowledge: [], directions: suggestDirections("coaching", { seed: "creator-1" }) })
  check("someone who asks for editorial can still get it", /TYPE SYSTEMS THAT FIT/.test(asked))
  const trainerBrief = briefFrom("Personal trainer, book a consultation", { category: "fitness_coach" }, CAPS)
  const said = directionForPrompt(trainerBrief, chooseDirection(trainerBrief, []))
  const chosen = said.split("\n").filter((l) => /^- (Primary|Type)/.test(l)).join("\n")
  check("a personal trainer's direction is not an editorial serif", chosen.length > 0 && !/Instrument Serif|Fraunces|Playfair|Cormorant|DM Serif/i.test(chosen), chosen)
  const editorial = briefFrom("A calm editorial serif site for my wellness practice", {}, CAPS)
  check("and the brief hears the style words the creator used", JSON.stringify(editorial).toLowerCase().includes("editorial"))
  const patterns = code("lib/storelib-ai/patterns.ts")
  check("the planners' shared defaults no longer put spaced capital labels on everything", !/Labels in small capitals with letter spacing/.test(patterns))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
