/**
 * ===========================================================================
 *  SCRIPTED RUNS OF THE BUILDER'S AI, MEASURED: CALLS, TOOL CALLS, TOKENS
 * ===========================================================================
 * The same runs feed tests/ai-quality-v.test.ts (budgets) and
 * scripts/measure-ai-quality-v.ts (the numbers, printed). No network.
 *
 * The models here are not fixed scripts. Each one decides its next call from
 * what it was sent, the way a careful model would: it reads a file only when
 * the file is not already in front of it, and it reads a section only when it
 * has not been shown that section in full. So a run that hands the model
 * more of what it needs up front shows up as fewer calls, and a run that
 * hands it less shows up as more. The policy of each is written beside it.
 *
 * Tokens are estimated at four characters a token over everything a request
 * carries (system, tools, turns), uncached: the same estimate before and
 * after, so the comparison holds.
 */
import { themeAgent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { makeCodedCopy } from "@/lib/website-builder/agent/coded-copy"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { BRIEF_KEY } from "@/lib/website-builder/agent/project-state"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, AgentTurn, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"

/** A small, good section an agent might write: everything a setting, one column on a phone. */
export const GOOD = `<template>
<section class="gd" data-scheme="{{ settings.color_scheme }}" style="--s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px; --s-heading: {{ settings.heading_color }};">
  <div class="gd__in">
    <h2 class="gd__h">{{ settings.heading }}</h2>
    <ul class="gd__list">
      {% for block in section.blocks %}<li class="gd__item" {{ block.storelib_attributes }}><strong>{{ block.settings.title }}</strong> {{ block.settings.text }}</li>{% endfor %}
    </ul>
    {% if settings.button_label != blank %}<a class="gd__btn" href="{{ settings.button_url | default: '#' | url }}">{{ settings.button_label }}</a>{% endif %}
  </div>
</section>
</template>

<style scoped>
.gd { container-type: inline-size; padding: var(--s-pt) 0 var(--s-pb); }
.gd__in { display: grid; gap: 24px; max-width: var(--theme-page-width, 1200px); margin: 0 auto; padding: 0 var(--theme-padding-x, 24px); }
.gd__h { margin: 0; color: var(--s-heading); font-size: clamp(28px, 5cqi, 44px); line-height: 1.1; }
.gd__list { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; }
@container (min-width: 760px) { .gd__in { grid-template-columns: 5fr 7fr; gap: 56px; } .gd__list { grid-template-columns: repeat(2, 1fr); } }
</style>

<schema>
{
  "type": "good_list",
  "name": "Good list",
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "color", "id": "heading_color", "label": "Heading", "default": "scheme.heading" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "What you get" },
    { "type": "text", "id": "button_label", "label": "Button", "default": "See the plans" },
    { "type": "url", "id": "button_url", "label": "Button link" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 }
  ],
  "blocks": [
    { "type": "item", "name": "Item", "settings": [
      { "type": "text", "id": "title", "label": "Title", "default": "Weekly lessons" },
      { "type": "text", "id": "text", "label": "Text", "default": "A new lesson every Monday." }
    ] }
  ],
  "presets": [{ "name": "Good list", "blocks": [{ "type": "item" }, { "type": "item" }] }]
}
</schema>`

/** The same section with a 960px list and nothing for a narrow screen. */
export const FIXED_WIDTH = GOOD.replace(/@container \(min-width: 760px\) \{[^\n]*\n/, "").replace("gap: 16px; }", "gap: 16px; width: 960px; }")
/** And with three columns at every width. */
export const FIXED_GRID = GOOD.replace(/@container \(min-width: 760px\) \{[^\n]*\n/, "").replace("gap: 16px; }", "gap: 16px; grid-template-columns: repeat(3, 1fr); }")

export interface RunNumbers {
  name: string
  /** Model calls the run made. */
  calls: number
  /** Tool calls across those model calls. */
  toolCalls: number
  /** Estimated input tokens over every request, uncached. */
  inputTokens: number
  status: string
}

export const estimate = (text: string) => Math.ceil(text.length / 4)

export function requestTokens(request: ProviderRequest): number {
  return estimate(request.system) + estimate(JSON.stringify(request.tools)) + estimate(JSON.stringify(request.turns))
}

type Decide = (request: ProviderRequest, n: number) => { text?: string; calls?: Array<[string, Record<string, unknown>]> }

/** A model that decides each call from what it was sent, recording every request. */
export function deciding(decide: Decide, sent: ProviderRequest[], made: string[] = []): AgentProvider {
  let n = 0
  return {
    id: "deciding",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })) as ProviderRequest)
      const step = decide(request, n++)
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `t${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      made.push(...toolCalls.map((c) => c.name))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: requestTokens(request), cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 50 },
        stop: toolCalls.length ? "tool_calls" : "done",
      }
    },
  }
}

/** The tool calls the model has already made in this run, by name. */
export function called(turns: AgentTurn[]): string[] {
  return turns.flatMap((t) => (t.role === "assistant" ? (t.toolCalls ?? []).map((c) => c.name) : []))
}

const firstUser = (request: ProviderRequest) => String((request.turns[0] as { content?: unknown })?.content ?? "")

/* ── the creator's own section: Storelib's FAQ, copied to code ─────────── */

const copied = makeCodedCopy({
  type: "faq_accordion",
  source: DEFAULT_THEME_SOURCES["sections/faq_accordion.storelib"],
  takenTypes: new Set(Object.keys(SECTION_SCHEMAS)),
  takenNames: new Set(),
})
if (copied.ok === false) throw new Error(copied.error)
export const OWN_TYPE = copied.type
export const OWN_PATH = copied.path
export const OWN_SOURCE = copied.source

/** A line of the file that only a model holding the file could quote. */
const OWN_MARK = OWN_SOURCE.split("\n").find((l) => l.includes("</style>")) ?? "</style>"

export function codeStub(files: Record<string, string>) {
  const writes: { type: string; source: string }[] = []
  return {
    writes,
    code: {
      read: (type: string) => files[`sections/${type}.storelib`] ?? DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ?? null,
      origin: (type: string) =>
        (`sections/${type}.storelib` in files ? "own" : DEFAULT_THEME_SOURCES[`sections/${type}.storelib`] ? "builtin" : "product") as "own" | "builtin" | "product",
      async write(type: string, source: string) {
        writes.push({ type, source })
        files[`sections/${type}.storelib`] = source
        return { ok: true as const }
      },
    } satisfies NonNullable<ThemeAgentInput["code"]>,
  }
}

const s = (id: string, type: string) => {
  const built = buildSection(id, type)
  if (!built) throw new Error(`no section ${type}`)
  return built
}

async function drain(input: ThemeAgentInput): Promise<ThemeAgentResult> {
  const loop = themeAgent(input)
  for (;;) {
    const next = await loop.next()
    if (next.done) return next.value
  }
}

const numbers = (name: string, sent: ProviderRequest[], made: string[], result: ThemeAgentResult): RunNumbers => ({
  name,
  calls: sent.length,
  toolCalls: made.length,
  inputTokens: sent.reduce((n, r) => n + requestTokens(r), 0),
  status: result.status,
})

/**
 * RUN 1, A CODE EDIT ON THE OPEN SECTION ("Code a section").
 * Policy: read the file when its text is not already in what it was sent;
 * then one edit_section_code; then the closing sentence.
 */
export async function codeFocusRun(): Promise<{ numbers: RunNumbers; result: ThemeAgentResult; sent: ProviderRequest[]; writes: { type: string; source: string }[] }> {
  const files: Record<string, string> = { [OWN_PATH]: OWN_SOURCE }
  const stub = codeStub(files)
  const sent: ProviderRequest[] = []
  const made: string[] = []
  const prompt = "make the answers open with a smooth slide"
  const state: ThemeState = { sections: [s("header-0", "header"), { ...s("faq-1", "faq_accordion"), type: OWN_TYPE }, s("footer-2", "footer")], settings: {} }
  const provider = deciding((request) => {
    const done = called(request.turns)
    const holds = JSON.stringify(request.turns).includes(JSON.stringify(OWN_MARK).slice(1, -1))
    if (!done.includes("edit_section_code") && !holds && !done.includes("read_section_code")) return { calls: [["read_section_code", { sectionType: OWN_TYPE }]] }
    if (!done.includes("edit_section_code")) {
      return {
        calls: [
          [
            "edit_section_code",
            {
              sectionType: OWN_TYPE,
              edits: [{ find: OWN_MARK, replace: `.v7-slide { transition: grid-template-rows 0.3s ease; }\n@media (prefers-reduced-motion: reduce) { .v7-slide { transition: none; } }\n${OWN_MARK}` }],
            },
          ],
        ],
      }
    }
    return { text: "The answers now open with a short slide, and stay still for anyone who asked for less motion." }
  }, sent, made)
  const result = await drain({
    provider,
    model: "test",
    prompt,
    state,
    page: "home",
    addable: ADDABLE_SECTIONS,
    sources: files,
    code: stub.code,
    selectedSectionId: "faq-1",
    codeFocus: true,
    intent: classifyIntent(prompt, { selected: true, codeFocus: true, bodySections: 1 }),
  })
  return { numbers: numbers("code edit on the open section", sent, made, result), result, sent, writes: stub.writes }
}

/**
 * RUN 2, A FOLLOW UP ("make it cleaner") AFTER A SECTION WAS ADDED.
 * Policy: when the section it is about is shown in full, change it straight
 * away; otherwise find it from the conversation and read it first. And it
 * also tries to tidy the hero, which a follow up about one section has no
 * business doing.
 */
export async function followUpRun(): Promise<{ numbers: RunNumbers; result: ThemeAgentResult; sent: ProviderRequest[] }> {
  const sent: ProviderRequest[] = []
  const made: string[] = []
  const prompt = "make it cleaner"
  const added = s("testimonials-new-1", "testimonials")
  const state: ThemeState = {
    sections: [s("header-0", "header"), s("hero-1", "hero_centered"), added, s("faq-3", "faq_accordion"), s("footer-4", "footer")],
    settings: {
      [BRIEF_KEY]: { v: 1, recent: [{ request: "add a testimonials section", kind: "LOCAL_EDIT", changed: ["Testimonials"], ids: ["testimonials-new-1"] }] },
    },
  }
  const history = [
    { role: "user" as const, content: "add a testimonials section" },
    { role: "assistant" as const, content: "Added a testimonials section under the hero with three quotes.", changed: ["add section", "add block x3"] },
  ]
  const provider = deciding((request) => {
    const done = called(request.turns)
    const shown = firstUser(request).includes("CONTROLS THIS SECTION HAS") && firstUser(request).includes("[testimonials-new-1]")
    if (!done.includes("update_section") && !shown && !done.includes("read_section")) return { calls: [["read_section", { id: "testimonials-new-1" }]] }
    if (!done.includes("update_section")) {
      return {
        calls: [
          ["update_section", { id: "testimonials-new-1", settingsJson: JSON.stringify({ padding_top: 96, padding_bottom: 96 }) }],
          ["update_section", { id: "hero-1", settingsJson: JSON.stringify({ padding_top: 96 }) }],
        ],
      }
    }
    return { text: "Gave the testimonials more room around them." }
  }, sent, made)
  const intent = classifyIntent(prompt, { bodySections: 3, hasHistory: true })
  const result = await drain({
    provider,
    model: "test",
    prompt,
    state,
    page: "home",
    addable: ADDABLE_SECTIONS,
    history,
    memory: true,
    intent,
  })
  return { numbers: numbers("follow up on the last section", sent, made, result), result, sent }
}
