/**
 * ===========================================================================
 *  ASK STORELIB, THE V ROUND: ONE ASSISTANT, FOUR MODELS, AND AI MEMORY
 * ===========================================================================
 * The owner's asks, each held to what it does:
 *
 *   MODELS      exactly Claude Opus 5.5, Sonnet 5.5, Haiku 5.5 and Opus 4.8,
 *               in that order, Opus 5.5 by default, each with what it is
 *               best for; no ChatGPT model in the menu
 *   EFFORT      medium on every run, with no switch and nothing stored, and
 *               sent only to a model that takes it (the provider's real
 *               request body, read from a fake transport)
 *   ROUTER      one box: the server decides the agent and the reach from the
 *               words, the selection and the chip (a table of prompts by
 *               selections), and asks a small model only when unsure
 *   CHIP        "Editing: <Name>" comes with a selection, says the block
 *               inside it, and its x clears it
 *   SUGGEST     two to four, from what is loaded: weakest points, empty
 *               sections, a missing FAQ page, products without photos
 *   MEMORY      add, list, change, delete; one creator never reads or
 *               deletes another's, one website's notes stay its own; never a
 *               secret; the block every agent is shown stays under its size;
 *               remember and forget in the page assistant; MCP's three tools
 *               scoped to the token's creator and website
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import * as React from "react"

import { DEFAULT_ENGINE, EFFORT, ENGINES, ENGINE_KEY, effortSupported, engineFromSaved, isEngineModel } from "@/lib/website-builder/ask-engines"
import { createAnthropicProvider } from "@/lib/sites/agent/anthropic-provider"
import { classifierPrompt, readClassifierAnswer, routeByRules, routeRequest, type RouteSelection } from "@/lib/website-builder/agent/router"
import { blockAtKey, decideRoute, routeFallback, scopeName } from "@/lib/website-builder/ask-route"
import { ScopeChip, RememberedLine } from "@/components/website-builder/ask-parts"
import { MAX_SUGGESTION_CHARS, suggestionsFor, type SuggestionSection } from "@/lib/website-builder/ask-suggestions"
import {
  addMemory,
  deleteMemory,
  describeMemory,
  kindOf,
  listMemories,
  looksSecret,
  memoriesForSite,
  MEMORY_TURN_CHARS,
  replaceMemory,
  shortId,
  type AiMemory,
  type MemoryDb,
} from "@/lib/ai-memory/store"
import { keepRunMemory } from "@/lib/ai-memory/keep"
import { memoryOps } from "@/lib/agent-access/memory-ops"
import { handleMcp, MEMORY_TOOLS, type BoundOps } from "@/lib/agent-access/mcp"
import { themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === "" ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A fake of the PostgREST calls the memory store makes, filters and all ── */
type Row = { id: string; creator_id: string; install_id: string | null; content: string; source: string; source_name?: string | null; kind?: string | null; created_at: string }
function fakeDb(rows: Row[]): MemoryDb {
  let n = 0
  return {
    from: () => {
      const make = (kind: "select" | "insert" | "delete", payload?: Record<string, unknown>) => {
        const filters: [string, unknown][] = []
        let lim = Infinity
        let single = false
        const run = async () => {
          if (kind === "insert") {
            n++
            const row = { id: `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`, created_at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), ...(payload as object) } as Row
            rows.push(row)
            return { data: single ? row : [row], error: null }
          }
          const match = (r: Row) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)
          if (kind === "delete") {
            for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1)
            return { data: null, error: null }
          }
          return { data: rows.filter(match).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, lim), error: null }
        }
        const q: Record<string, unknown> = {
          eq: (c: string, v: unknown) => (filters.push([c, v]), q),
          is: (c: string, v: unknown) => (filters.push([c, v]), q),
          order: () => q,
          limit: (x: number) => ((lim = x), q),
          select: () => q,
          single: () => ((single = true), q),
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
        }
        return q
      }
      return { select: () => make("select"), insert: (row: Record<string, unknown>) => make("insert", row), delete: () => make("delete") } as never
    },
  }
}

/* ── The page assistant, scripted ── */
type Step = { text?: string; calls?: Array<[string, Record<string, unknown>]> }
function scripted(script: Step[], sent: ProviderRequest[]): AgentProvider {
  let n = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
      const step = script[n++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  } as AgentProvider
}
const page = (): ThemeState => ({
  sections: ["header", "hero_centered", "faq_accordion", "footer"].map((t, i) => buildSection(`${t}-${i}`, t)!),
  settings: { brand_name: "Lumen" },
})
async function drive(input: Partial<ThemeAgentInput> & { script: Step[] }) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  const gen = themeAgent({ provider: scripted(input.script, sent), model: "test", page: "home", addable: ADDABLE_SECTIONS, prompt: "x", state: page(), ...input } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events, sent }
    events.push(step.value as ThemeAgentEvent)
  }
}

const ME = "creator-a"
const OTHER = "creator-b"
const SITE = "11111111-1111-4111-8111-111111111111"
const OTHER_SITE = "22222222-2222-4222-8222-222222222222"

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  section("Models: the four, in order, and nothing else")
  // ═════════════════════════════════════════════════════════════════════════
  {
    check("exactly Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 4.8, in that order", ENGINES.map((e) => e.model).join(",") === "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5,claude-opus-4-8", ENGINES.map((e) => e.model))
    check("named as Anthropic names them", ENGINES.map((e) => e.label).join(",") === "Claude Opus 5.5,Claude Sonnet 5.5,Claude Haiku 5.5,Claude Opus 4.8")
    check("Haiku is Haiku 5.5, the current Haiku, by its exact id", ENGINES[2].model === "claude-haiku-5-5" && !ENGINES.some((e) => /haiku-4/.test(e.model)))
    check("all Claude, no ChatGPT model", ENGINES.every((e) => e.provider === "anthropic"))
    check("Opus 5.5 by default, for page work and code alike", DEFAULT_ENGINE === "claude-opus-5-5" && engineFromSaved(undefined) === "claude-opus-5-5")
    check("each has one line on what it is best for", ENGINES.every((e) => /^Best for /.test(e.detail) && e.detail.length <= 48 && !/—/.test(e.detail)), ENGINES.map((e) => e.detail))
    check("ids are exactly as given, never date suffixed", ENGINES.every((e) => /^claude-(opus|sonnet|haiku)-\d-\d$/.test(e.model) && e.id === e.model))
    check("an older saved choice reads as the default", ["claude", "claude-opus", "openai", "openai-strong", "claude:claude-sonnet-5", 42, null].every((v) => engineFromSaved(v) === DEFAULT_ENGINE))
    check("only the four are models a browser may name", ENGINES.every((e) => isEngineModel(e.model)) && !isEngineModel("claude-haiku-4-5") && !isEngineModel("gpt-5.6-terra") && !isEngineModel("claude-opus-5-5-20260401"))
    const provider = read("lib/sites/agent/provider.ts")
    check("the server refuses any other id before a call", /if \(!isEngineModel\(input\.model\)\) throw new Error\("Choose a Claude model from the menu\."\)/.test(provider))
    check("the Anthropic key stays server side, and nothing is NEXT_PUBLIC", /import "server-only"/.test(read("lib/sites/agent/anthropic-provider.ts")) && /process\.env\.ANTHROPIC_API_KEY/.test(read("lib/sites/agent/anthropic-provider.ts")) && !/NEXT_PUBLIC_ANTHROPIC/.test(read("lib/sites/agent/anthropic-provider.ts") + provider + read("app/api/ai-models/route.ts")))
    check("a creator's own Claude key still answers the menu's models", /createAnthropicProvider\(once\(\(\) => anthropicClientFor\(direct\)\)/.test(provider) && /own: wanted/.test(provider))
    const models = read("lib/sites/agent/models.ts")
    check("each of the four is priced, so a run's cost is recorded", ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-4-8"].every((id) => new RegExp(`"${id}": \\{`).test(models)))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("Effort: medium, with no switch, sent only where the model takes it")
  // ═════════════════════════════════════════════════════════════════════════
  {
    check("medium", EFFORT === "medium")
    const sent: Record<string, unknown>[] = []
    const transport = {
      messages: {
        stream(body: Record<string, unknown>) {
          sent.push(body)
          return { finalMessage: async () => ({ content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) }
        },
      },
    }
    const ask = (model: string, info?: unknown) =>
      createAnthropicProvider(() => transport as never, info ? { modelInfo: info as never } : {}).complete({ model, system: "s", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 1000, effort: EFFORT })
    for (const e of ENGINES) await ask(e.model)
    await ask("claude-haiku-4-5")
    const noMedium = { id: "claude-opus-5-5", max_tokens: 1000, capabilities: { structured_outputs: { supported: true }, thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } }, effort: { supported: true, low: { supported: true }, medium: { supported: false }, high: { supported: true } } } }
    await ask("claude-opus-5-5", noMedium)
    const effortOf = (b: Record<string, unknown> | undefined) => (b?.output_config as { effort?: string } | undefined)?.effort
    check("each of the four is sent output_config.effort medium", sent.slice(0, 4).every((b) => effortOf(b) === "medium"), sent.slice(0, 4).map(effortOf))
    check("a model that does not take effort is sent none (Haiku 4.5)", !("output_config" in sent[4]), sent[4])
    check("nor one whose Models API says medium is not supported", !("output_config" in sent[5]), sent[5])
    check("the catalogue agrees: effort on the four and the 4.6+ family, not Haiku 4.5 or Sonnet 4.5", ENGINES.every((e) => effortSupported(e.model)) && !effortSupported("claude-haiku-4-5") && !effortSupported("claude-sonnet-4-5") && effortSupported("claude-opus-4-6"))
    check("Opus 5.5, Sonnet 5.5 and Opus 4.8 think adaptively; nothing sends a thinking budget", [0, 1, 3].every((i) => JSON.stringify(sent[i].thinking) === JSON.stringify({ type: "adaptive" })) && sent.every((b) => !JSON.stringify(b.thinking ?? {}).includes("budget_tokens")))
    check("no sampling parameters, which the 5.5 models refuse", sent.every((b) => !("temperature" in b) && !("top_p" in b) && !("top_k" in b)))
    const agent = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    const writer = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
    check("both routes ask for medium and take no effort from a browser", /effort: EFFORT,/.test(agent) && /effort: EFFORT,/.test(writer) && !/effort: z\./.test(agent + writer) && !/body\.effort|parsed\.data\.effort/.test(agent + writer))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("No Strength switch anywhere")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const picker = read("components/website-builder/ask-model-picker.tsx")
    const chat = read("components/website-builder/theme-chat.tsx")
    const engines = read("lib/website-builder/ask-engines.ts")
    check("the menu has no Strength row", !/Strength|data-ask-strength|onStrengthChange/.test(picker))
    check("the chat has no Strength state and stores none", !/strength|Strength/.test(chat) && !/theme-chat\.strength/.test(chat + engines))
    check("the catalogue has no Strength list", !/STRENGTHS|strengthKeyFor|DEFAULT_CODE_STRENGTH/.test(engines))
    check("the choice of model is still remembered per browser, under its old key", ENGINE_KEY === "storelib.theme-chat.engine" && /localStorage\.setItem\(ENGINE_KEY, id\)/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The router: prompts by selections")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const hero: RouteSelection = { sectionId: "hero-1", sectionType: "hero", sectionName: "Hero", origin: "own" }
    const builtin: RouteSelection = { ...hero, origin: "builtin" }
    const product: RouteSelection = { ...hero, sectionType: "product_main", origin: "product" }
    const block: RouteSelection = { ...hero, blockId: "b1", blockType: "heading" }
    const addable = [{ type: "faq", name: "FAQ" }, { type: "newsletter", name: "Newsletter" }, { type: "testimonials", name: "Testimonials" }]
    type Row = [string, RouteSelection | null, boolean, number, string]
    /* [prompt, selection, chip on, pictures, expected "agent target lock code"] */
    const table: Row[] = [
      ["make the heading shorter", hero, true, 0, "page section lock -"],
      ["make the cards slide in", hero, true, 0, "page section lock code"],
      ["make the cards slide in", builtin, true, 0, "page section lock code"],
      ["make the cards slide in", product, true, 0, "page section lock -"],
      ["redesign this section from scratch", hero, true, 0, "page section lock code"],
      ["make it look like this", hero, true, 1, "page section lock code"],
      ["change the button colour to red", hero, true, 0, "page section lock -"],
      ["Rewrite the headline", block, true, 0, "page block lock -"],
      ["now do the whole page", hero, true, 0, "page page - -"],
      ["apply the same to every section", hero, true, 0, "page page - -"],
      ["make the whole site darker", hero, true, 0, "page theme - -"],
      ["build me a website for my candle shop", null, false, 0, "page theme - -"],
      ["add an About page", null, false, 0, "page page - -"],
      ["add a new section with a flag", hero, true, 0, "writer section - -"],
      ["copy this section", hero, true, 0, "writer section - -"],
      ["build me a section like this image", null, false, 1, "writer section - -"],
      ["", null, false, 1, "writer section - -"],
      ["add a testimonials section", null, false, 0, "page section - -"],
      ["add a custom testimonials section", null, false, 0, "writer section - -"],
      ["add a FAQ", null, false, 0, "page section - -"],
      ["make it nicer", hero, false, 0, "page section - -"],
      ["what does this section do?", hero, true, 0, "page section lock -"],
    ]
    const short = (d: { agent: string; target: string; lock: boolean; codeFocus: boolean }) => `${d.agent} ${d.target} ${d.lock ? "lock" : "-"} ${d.codeFocus ? "code" : "-"}`
    const wrong = table
      .map(([prompt, selection, scoped, images, want]) => ({ prompt, want, got: short(routeByRules({ prompt, selection, scoped, images, bodySections: 3, addable })) }))
      .filter((r) => r.got !== r.want)
    check(`every row of the table routes as expected (${table.length} rows)`, wrong.length === 0, wrong)
    const unsure = routeByRules({ prompt: "add a before and after slider", selection: null, scoped: false, images: 0, bodySections: 3, addable })
    check("a thing to add of a kind the rules do not know is marked unsure", unsure.ambiguous === true && unsure.agent === "page")
    const sure = routeByRules({ prompt: "make the heading shorter", selection: hero, scoped: true, images: 0, bodySections: 3, addable })
    let asked = 0
    const model = async () => {
      asked++
      return "writer" as const
    }
    const viaModel = await routeRequest({ prompt: "add a before and after slider", selection: null, scoped: false, images: 0, bodySections: 3, addable }, model)
    await routeRequest({ prompt: "make the heading shorter", selection: hero, scoped: true, images: 0, bodySections: 3, addable }, model)
    check("the small model is asked only when the rules are unsure", asked === 1 && viaModel.agent === "writer" && viaModel.by === "model" && sure.ambiguous === false)
    const broken = await routeRequest({ prompt: "add a before and after slider", selection: null, scoped: false, images: 0, bodySections: 3, addable }, async () => {
      throw new Error("down")
    })
    check("a model that fails leaves the rules' answer", broken.agent === "page" && broken.by === "rules")
    check("the model is asked for one word, and anything else is no answer", /Answer with one word: WRITER or PAGE\./.test(classifierPrompt("x", ["FAQ"])) && readClassifierAnswer(" writer.") === "writer" && readClassifierAnswer("PAGE") === "page" && readClassifierAnswer("maybe") === null)
    const routerModel = read("lib/website-builder/agent/router-model.ts")
    check("it is a small fast model at low effort, on the creator's own key when they have one", /ROUTER_MODEL = "claude-haiku-5-5"/.test(routerModel) && /effort: "low"/.test(routerModel) && /resolveForCreator\(creatorId,/.test(routerModel) && /AbortSignal\.timeout\(ROUTER_TIMEOUT_MS\)/.test(routerModel))
    const decide = read("app/api/website-builder/themes/[installId]/agent/decide/route.ts")
    check("the decision is the server's, behind the owner check", /\.from\("store_theme_installs"\)\.select\("id"\)\.eq\("id", installId\)\.eq\("creator_id", creatorId\)/.test(decide) && /routeRequest\(/.test(decide) && !/createAdminClient/.test(decide))
    check("the old wording rule in the browser is gone", !/codeTarget/.test(read("lib/website-builder/ask-code-run.ts") + read("components/website-builder/theme-chat.tsx")))
    let posted: Record<string, unknown> | null = null
    const fake = (async (_url: string, init: { body: string }) => {
      posted = JSON.parse(init.body)
      return new Response(JSON.stringify({ agent: "writer", target: "section", lock: false, codeFocus: false }), { headers: { "content-type": "application/json" } })
    }) as unknown as typeof fetch
    const got = await decideRoute(SITE, { prompt: "p", images: 1, sections: [{ id: "a", type: "hero" }], selectedSectionId: "a", scoped: true, hasHistory: false }, fake)
    check("the chat asks the router with the words, the pictures' count, the selection and the chip", got.agent === "writer" && (posted as unknown as { scoped: boolean; selectedSectionId: string; images: number }).scoped === true && (posted as unknown as { selectedSectionId: string }).selectedSectionId === "a" && (posted as unknown as { images: number }).images === 1)
    const down = await decideRoute(SITE, { prompt: "p", images: 0, sections: [], scoped: true, hasHistory: false }, (async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch)
    check("and without it, the page assistant with the chip as it is", JSON.stringify(down) === JSON.stringify(routeFallback(true)) && down.agent === "page" && down.lock === true)
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The chip: on with a selection, removable, naming the block")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const locked = renderToStaticMarkup(React.createElement(ScopeChip, { name: "Hero", locked: true, onLock: () => {}, onUnlock: () => {}, phone: false }))
    const cleared = renderToStaticMarkup(React.createElement(ScopeChip, { name: "Hero", locked: false, onLock: () => {}, onUnlock: () => {}, phone: false }))
    check("on, it says Editing: Hero, with an x to clear it", /data-ask-scope="locked"/.test(locked) && /Editing:<\/span> Hero/.test(locked) && /<button[^>]*aria-label="Stop editing only Hero"/.test(locked))
    check("cleared, it offers to put the limit back", /data-ask-scope="page"/.test(cleared) && /Limit to Hero/.test(cleared))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("it is drawn whenever a section is selected, with nothing to press first", /\{selectedSection && \(\s*\n\s*<div data-ask-scope-row=""/.test(chat) && /const \[lockOn, setLockOn\] = React\.useState\(true\)/.test(chat) && /setLockOn\(true\)\n  \}, \[selectedSectionId\]\)/.test(chat))
    check("its x clears it, and the box sends the cleared scope", /onUnlock=\{\(\) => setLockOn\(false\)\}/.test(chat) && /const locked = !!selectedSection && lockOn/.test(chat) && /scoped: now\.locked/.test(chat))
    check("the editor hands the chat the selected block", (read("app/website-builder/editor/[installId]/page.tsx").match(/selectedBlockId=\{aiSelectedBlock\}/g) ?? []).length === 2)
    const hero = { name: "Hero", type: "hero", blocks: [{ id: "b1", type: "rich_text", blocks: [{ id: "b2", type: "button" }] }] }
    check("with a block selected it says which, inside which section", scopeName(hero, "b1") === "Rich text in Hero" && scopeName(hero, "b1/b2") === "Button in Hero" && scopeName(hero, null) === "Hero" && scopeName(hero, "gone") === "Hero")
    check("a block is found by its path key", blockAtKey(hero.blocks, "b1/b2")?.type === "button" && blockAtKey(hero.blocks, "b2") === null)
    check("no mode switch is left in the chat or its parts", !/ModeSwitch|data-ask-modes|"Code section"|"Change page"/.test(chat + read("components/website-builder/ask-parts.tsx")))
    check("attachments, voice, the model menu, sounds, the steps and run recovery are all still there", /PictureTray/.test(chat) && /useVoiceInput/.test(chat) && /<ModelPicker/.test(chat) && /playAskSound/.test(chat) && /StepsTimeline/.test(chat) && /CONTINUE_PROMPT/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("Suggestions, from what is loaded")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const header: SuggestionSection = { id: "hd", type: "header", name: "Header" }
    const footer: SuggestionSection = { id: "ft", type: "footer", name: "Footer", settings: { email: "hi@lumen.shop" } }
    const bareHero: SuggestionSection = { id: "h", type: "hero_centered", name: "Hero", settings: { heading: "Lumen candles" } }
    const emptyFaq: SuggestionSection = { id: "f", type: "faq_accordion", name: "FAQ", settings: {} }
    const grid: SuggestionSection = { id: "g", type: "product_grid", name: "Products", settings: { heading: "Shop" } }
    const all: string[][] = []
    const s = (ctx: Parameters<typeof suggestionsFor>[0]) => {
      const out = suggestionsFor(ctx)
      all.push(out)
      return out
    }
    const onHero = s({ page: "home", sections: [header, bareHero, footer], selectedId: "h" })
    check("a hero with no picture: put one behind it", onHero.includes("Put a photo behind it"), onHero)
    const onFaq = s({ page: "home", sections: [header, emptyFaq, footer], selectedId: "f" })
    check("an empty FAQ, selected: fill it in, first", onFaq[0] === "Fill in this FAQ", onFaq)
    const onGrid = s({ page: "home", sections: [grid], selectedId: "g", productCount: 9, productsWithoutImages: 4 })
    check("a product grid whose products lack photos says so first", onGrid[0] === "Style cards that have no photo", onGrid)
    const page = s({ page: "home", sections: [header, bareHero, emptyFaq, footer], productCount: 0, pages: ["about", "About", "contact", "Contact"] })
    check("a page with an empty section offers to fill it", page.includes("Fill in the empty FAQ"), page)
    const noFaqPage = s({ page: "home", sections: [header, bareHero, { id: "n", type: "promo_newsletter", name: "Newsletter" }, { id: "t", type: "proof_testimonials", name: "Quotes" }, footer], pages: ["about"] })
    check("a site with no FAQ page offers one", noFaqPage.includes("Add an FAQ page"), noFaqPage)
    const withFaqPage = s({ page: "home", sections: [header, bareHero, { id: "n", type: "promo_newsletter", name: "Newsletter" }, { id: "t", type: "proof_testimonials", name: "Quotes" }, footer], pages: ["faq", "FAQ"] })
    check("and not when it has one", !withFaqPage.includes("Add an FAQ page"), withFaqPage)
    check("two to four each time, each one chip long", all.every((x) => x.length >= 2 && x.length <= 4) && all.flat().every((x) => x.length <= MAX_SUGGESTION_CHARS), all)
    const source = read("lib/website-builder/ask-suggestions.ts")
    check("computed, never a model call", !/fetch\(|provider|anthropic|openai|await /i.test(source))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("shown only while the box is empty, and a tap fills the box", (chat.match(/items=\{composerEmpty \? suggestions : \[\]\}/g) ?? []).length === 2 && /setDraft\(text\)/.test(chat.slice(chat.indexOf("const pickSuggestion = React.useCallback"), chat.indexOf("viewingRef.current = !!viewing"))))
    check("the editor hands it products without photos and the site's pages", /productsWithoutImages: productsLoading \? null : products\.filter/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /pages: customPages\.flatMap/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("AI Memory: add, list, change, delete, and whose it is")
  // ═════════════════════════════════════════════════════════════════════════
  const rows: Row[] = [
    { id: "aaaaaaaa-0000-4000-8000-000000000001", creator_id: OTHER, install_id: null, content: "Someone else's note", source: "creator", created_at: "2026-09-01T00:00:00.000Z" },
    { id: "aaaaaaaa-0000-4000-8000-000000000002", creator_id: OTHER, install_id: OTHER_SITE, content: "Another website's note", source: "assistant", created_at: "2026-09-02T00:00:00.000Z" },
  ]
  const db = fakeDb(rows)
  {
    const site = await addMemory(db, ME, "  Never use gradients.  ", "creator", { installId: SITE })
    check("a note for one website is kept, tidy, with its kind", site.ok === true && site.memory.content === "Never use gradients." && site.memory.installId === SITE && site.memory.kind === "dislike", site)
    const everywhere = await addMemory(db, ME, "We write in a warm, plain voice.", "assistant")
    check("a note for every website is kept with no website", everywhere.ok === true && everywhere.memory.installId === null && everywhere.memory.source === "assistant" && everywhere.memory.kind === "voice")
    const again = await addMemory(db, ME, "never use GRADIENTS", "creator", { installId: SITE })
    check("the same note twice in one scope is kept once", again.ok === true && again.duplicate === true)
    const listed = await memoriesForSite(db, ME, SITE)
    check("a website's run sees its own notes and the everywhere ones", listed.ready && listed.site.map((m) => m.content).join() === "Never use gradients." && listed.account.map((m) => m.content).join() === "We write in a warm, plain voice.")
    check("and none of another creator's, nor another website's", ![...listed.site, ...listed.account].some((m) => /Someone else|Another website/.test(m.content)))
    const mine = await listMemories(db, ME, undefined, { installId: OTHER_SITE })
    check("naming another creator's website reads nothing", mine.memories.length === 0)
    check("deleting another creator's note does nothing", (await deleteMemory(db, ME, rows[0].id)) && rows.some((r) => r.id === rows[0].id) && rows.some((r) => r.content === "Someone else's note"))
    const siteId = site.ok === true ? site.memory.id : ""
    await deleteMemory(db, ME, siteId, { installId: OTHER_SITE })
    check("a website's note is not deleted through another website's scope", rows.some((r) => r.id === siteId))
    const changed = await replaceMemory(db, ME, siteId, "Never use gradients or glow.", { installId: SITE })
    check("correcting one keeps the new words in the same scope and forgets the old", changed.ok === true && changed.memory.installId === SITE && !rows.some((r) => r.id === siteId) && rows.some((r) => r.content === "Never use gradients or glow."))
    for (const secret of ["My OpenAI key is sk-proj-abcdefghijklmnopqrstu1234", "password: hunter2hunter2", "card 4242 4242 4242 4242", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"]) {
      const r = await addMemory(db, ME, secret, "assistant", { installId: SITE })
      if (r.ok !== false) check(`never a secret: "${secret.slice(0, 18)}..."`, false)
    }
    check("never a secret: keys, passwords and card numbers are refused, whoever sends them", ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "api key = abcd1234efgh", "-----BEGIN PRIVATE KEY-----"].every(looksSecret) && !looksSecret("Prices in euros, shipping in 3 days, call 020 7946 0958"))
    check("a note's kind is read from its words", kindOf("Always use our logo in black") === "preference" && kindOf("I love the serif headings") === "like" && kindOf("We are a family bakery in Leeds") === "fact" && kindOf("Rounded corners on the cards") === "design")
    const long = await addMemory(db, ME, "x ".repeat(400), "assistant", { installId: SITE })
    check("an agent's note is one sentence long at most", long.ok === true && long.memory.content.length <= 240)
  }

  {
    const many: AiMemory[] = Array.from({ length: 80 }, (_, i) => ({ id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, content: `Note number ${i}: ${"a fairly long preference about the site ".repeat(3)}`, installId: i % 2 ? SITE : null, source: "creator" as const, sourceName: null, kind: "preference" as const, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }))
    const block = describeMemory({ site: many.filter((m) => m.installId), account: many.filter((m) => !m.installId) }, { ids: true })
    check(`what a turn is shown stays under ${MEMORY_TURN_CHARS} characters however many notes there are`, block.length <= MEMORY_TURN_CHARS && block.length > 1000, block.length)
    check("this website's notes come first, each with the id forget takes", block.indexOf("On this website:") < block.indexOf("On every website") || !block.includes("On every website") ? /\[[0-9a-f]{8}\] \(preference\) Note number/.test(block) : false)
    check("and the message wins over memory", /the message wins/.test(block))
    check("no notes, no block", describeMemory({ site: [], account: [] }) === "")
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("Remember and forget, in the page assistant")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const shown = await memoriesForSite(db, ME, SITE)
    const text = describeMemory(shown, { ids: true })
    const target = shown.site[0]
    const run = await drive({
      prompt: "Remember we only sell soy candles. And forget the glow note, it is wrong.",
      memory: true,
      accountMemory: shown.account.map((m) => m.content),
      memoryText: text,
      siteMemory: true,
      script: [
        { calls: [["remember", { note: "Only sells soy candles." }], ["forget", { id: shortId(target.id) }], ["forget", { id: "deadbeef" }]] },
        { text: "Noted, and forgotten." },
      ],
    })
    const tools = run.sent[0].tools.map((t) => t.name)
    check("both tools are offered when memory has ids", tools.includes("remember") && tools.includes("forget"))
    check("the turn carries the memory block", run.sent[0].turns.some((t) => t.role === "user" && (t as { content: string }).content.includes(text)))
    check("a website note comes back for the route to keep, not in the brief", JSON.stringify(run.result.rememberedSite) === JSON.stringify(["Only sells soy candles."]), run.result.rememberedSite)
    check("forget takes only an id the run was shown", JSON.stringify(run.result.forgotten) === JSON.stringify([shortId(target.id)]), run.result.forgotten)
    const kept = await keepRunMemory(db, { creatorId: ME, installId: SITE }, run.result, [...shown.site, ...shown.account])
    check("the route keeps the note as Storelib AI's, for this website, and says it for the chat's line", kept.kept.length === 1 && kept.kept[0].scope === "website" && rows.some((r) => r.content === "Only sells soy candles." && r.install_id === SITE && r.source === "assistant"))
    check("and forgets the one asked", kept.forgot.length === 1 && !rows.some((r) => r.id === target.id))
    const foreign = await keepRunMemory(db, { creatorId: ME, installId: SITE }, { forgotten: [shortId(rows[1].id)] }, [{ ...(rows[1] as unknown as AiMemory), installId: OTHER_SITE }])
    check("a note of another website is never forgotten, even if named", foreign.forgot.length === 0 && rows.some((r) => r.id === rows[1].id))
    const plain = await drive({ memory: true, accountMemory: [], script: [{ text: "Hi." }] })
    check("without memory ids there is no forget tool", !plain.sent[0].tools.some((t) => t.name === "forget"))
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the route tells the chat what it kept", /send\(\{ type: "remembered", items: notes\.kept, forgot:/.test(route))
    const chat = read("components/website-builder/theme-chat.tsx")
    const line = renderToStaticMarkup(React.createElement(RememberedLine, { content: "Only sells soy candles.", undone: false, onUndo: () => {}, phone: false }))
    check("the chat says Remembered: ..., with Undo", /Remembered:<\/span> Only sells soy candles\./.test(line) && /data-ask-remembered-undo=""/.test(line) && /type === "remembered"/.test(chat))
    check("and Undo deletes the note in its scope", /fetch\(`\/api\/ai-memory\/\$\{encodeURIComponent\(id\)\}\$\{scope\}`, \{ method: "DELETE" \}\)/.test(chat) && /\?installId=\$\{encodeURIComponent\(installId\)\}/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("AI Memory over MCP, scoped to the token")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const mcpRows: Row[] = [
      { id: "c1c1c1c1-0000-4000-8000-000000000001", creator_id: ME, install_id: SITE, content: "Use the cream background", source: "creator", created_at: "2026-09-03T00:00:00.000Z" },
      { id: "c2c2c2c2-0000-4000-8000-000000000002", creator_id: ME, install_id: OTHER_SITE, content: "Other site of mine", source: "creator", created_at: "2026-09-04T00:00:00.000Z" },
      { id: "c3c3c3c3-0000-4000-8000-000000000003", creator_id: OTHER, install_id: SITE, content: "Forged row of another creator", source: "creator", created_at: "2026-09-05T00:00:00.000Z" },
      { id: "c4c4c4c4-0000-4000-8000-000000000004", creator_id: ME, install_id: null, content: "Prices in euros", source: "creator", created_at: "2026-09-06T00:00:00.000Z" },
    ]
    const mdb = fakeDb(mcpRows)
    const ops = memoryOps(mdb, { creatorId: ME, installId: SITE, name: "Claude Code" })
    const seen = await ops.read()
    const block = seen.ok === true ? seen.value : ""
    check("read shows this website's notes and the creator's everywhere ones", /Use the cream background/.test(block) && /Prices in euros/.test(block))
    check("and not the creator's other website, nor another creator's", !/Other site of mine|Forged row/.test(block))
    const kept = await ops.remember({ note: "The owner wants big serif headings" })
    check("remember keeps a note for this website only, as the connected agent's, by its name", kept.ok === true && mcpRows.some((r) => r.content === "The owner wants big serif headings" && r.install_id === SITE && r.creator_id === ME && r.source === "agent" && r.source_name === "Claude Code"))
    const secret = await ops.remember({ note: "the token is ghp_abcdefghijklmnopqrstuvwxyz0123" })
    check("and refuses a secret", secret.ok === false)
    const other = await ops.forget({ id: shortId("c2c2c2c2-0000-4000-8000-000000000002") })
    const everywhere = await ops.forget({ id: shortId("c4c4c4c4-0000-4000-8000-000000000004") })
    check("forget cannot reach another website's note, nor an everywhere one", other.ok === false && everywhere.ok === false && mcpRows.length === 5)
    const gone = await ops.forget({ id: shortId("c1c1c1c1-0000-4000-8000-000000000001") })
    check("but forgets this website's own", gone.ok === true && !mcpRows.some((r) => r.id === "c1c1c1c1-0000-4000-8000-000000000001"))
    const readOnly = memoryOps(mdb, { creatorId: ME, installId: SITE, name: "Codex", canWrite: false })
    check("a read only key reads, and writes nothing", (await readOnly.read()).ok === true && (await readOnly.remember({ note: "x y z" })).ok === false && (await readOnly.forget({ id: "c4c4c4c4" })).ok === false)
    const bound = { siteName: "Lumen", agentName: "Claude Code", list: async () => ({ ok: false, status: 404, error: "x" }), read: async () => ({ ok: false, status: 404, error: "x" }), compile: () => ({ ok: false, status: 400, error: "x" }), write: async () => ({ ok: false, status: 400, error: "x" }), guide: () => "", memory: ops } as unknown as BoundOps
    const list = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, bound)) as { result: { tools: { name: string }[] } }
    check("the three memory tools are listed", MEMORY_TOOLS.every((t) => list.result.tools.some((x) => x.name === t.name)))
    const call = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "storelib_memory_remember", arguments: { note: "Ships from Lisbon" } } }, bound)) as { result: { content: { text: string }[] } }
    check("and answer through tools/call", /Remembered for this website: Ships from Lisbon/.test(call.result.content[0].text))
    const init = (await handleMcp({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }, bound)) as { result: { instructions: string } }
    check("the memory is in the instructions an agent gets on connecting", /AI MEMORY/.test(init.result.instructions) && /Ships from Lisbon/.test(init.result.instructions))
    check("the MCP binding uses these, scoped to the token's creator and website", /memory: memoryOps\(db as unknown as MemoryDb, who\)/.test(read("lib/agent-access/bind.ts")))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The SQL part, and where creators manage it")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const sql = read("supabase/sql/run-now/215_ai_memory_sources.sql")
    check("part 215 adds the kind, the agent's name and the agent source, idempotently", /ADD COLUMN IF NOT EXISTS kind text/.test(sql) && /ADD COLUMN IF NOT EXISTS source_name text/.test(sql) && /source IN \('creator', 'assistant', 'agent'\)/.test(sql) && /DROP CONSTRAINT IF EXISTS ai_memories_source_check/.test(sql))
    check("row level security stays on, and nobody changes a row in place", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE UPDATE ON public\.ai_memories FROM authenticated, anon/.test(sql))
    check("its migration is the same file", sql === read("supabase/migrations/20270201_v6_ai_memory_sources.sql"))
    check("and the run-now list names it", /`215_ai_memory_sources\.sql`/.test(read("supabase/sql/run-now/README.md")))
    const api = read("app/api/ai-memory/route.ts") + read("app/api/ai-memory/[id]/route.ts") + read("app/api/ai-memory/caller.ts")
    check("the memory API checks a website is the caller's, through their own client", /\.from\("store_theme_installs"\)\.select\("id"\)\.eq\("id", installId\)\.eq\("creator_id", creator\.id\)/.test(api) && !/createAdminClient/.test(api))
    const settings = read("components/website-builder/website-settings/connections.tsx")
    const panel = read("components/website-builder/website-settings/ai-memory.tsx")
    check("Website settings, Connections, has an AI Memory list to add, edit and delete", /<AiMemorySettings installId=\{ctx\.installId\} \/>/.test(settings) && /method: "POST"/.test(panel) && /method: "PATCH"/.test(panel) && /method: "DELETE"/.test(panel))
    check("each note says which scope, who kept it and when", /tt\("This website"\)/.test(panel) && /tt\("Every website"\)/.test(panel) && /keptBy\(note\)/.test(panel) && /relativeTime\(note\.createdAt\)/.test(panel))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailing:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
