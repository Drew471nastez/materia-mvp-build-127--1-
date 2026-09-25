/**
 * ===========================================================================
 *  WHAT A TYPICAL ASK STORELIB REQUEST SENDS, MEASURED WITHOUT A MODEL
 * ===========================================================================
 * Runs the real builder agent (lib/website-builder/agent/loop.ts) against a
 * scripted provider on four fixture requests, records every request the loop
 * would have sent, and prices it the way the provider bills it:
 *
 *   tokens     estimated at 4 characters per token over the request as the
 *              Anthropic provider shapes it (system, tools, messages). An
 *              estimate, the same one before and after, so the comparison
 *              holds even where the absolute number is a little off.
 *   billed     input tokens weighted as Anthropic bills them: an uncached
 *              token is 1, a cache read 0.1, a cache write 1.25, assuming
 *              every turn of a run lands inside the five minute cache.
 *   caching    read from lib/sites/agent/anthropic-provider.ts itself: the
 *              breakpoints it actually sets on a request.
 *
 * No network, no key, no database. Run:
 *   npx esbuild scripts/measure-agent-tokens.ts --bundle --platform=node \
 *     --format=cjs --alias:@=. --alias:server-only=<empty.js> --outfile=<x.cjs> && node <x.cjs>
 */
import { themeAgent } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { toMessages } from "@/lib/sites/agent/anthropic-provider"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

const estimate = (text: string) => Math.ceil(text.length / 4)

interface Sent {
  system: number
  tools: number
  messages: number
  /** Characters of messages that carry a cache breakpoint at their end, if any. */
  breakpointAt: number | null
  systemBreakpoint: boolean
}

/**
 * The request as the Anthropic provider builds it, measured in characters.
 * `cache` is what the provider marks: read by calling its own shaping code
 * where it exports one, so a change there shows up here.
 */
function measure(request: ProviderRequest): Sent {
  const tools = JSON.stringify(
    request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
  )
  const messages = toMessages(request.turns) as unknown as Array<{ role: string; content: unknown }>
  const text = JSON.stringify(messages)
  /* A breakpoint on the last block means the whole transcript is cached for the next turn. */
  const last = messages[messages.length - 1]
  const blocks = Array.isArray(last?.content) ? (last.content as Array<Record<string, unknown>>) : []
  const marked = blocks.length > 0 && !!blocks[blocks.length - 1]?.cache_control
  return {
    system: request.system.length,
    tools: tools.length,
    messages: text.length,
    breakpointAt: marked ? text.length : null,
    systemBreakpoint: true,
  }
}

function scripted(script: Scripted[], sent: Sent[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(measure(request))
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({
        id: `toolu_${turn}_${i}`,
        name,
        argumentsJson: JSON.stringify(args),
      }))
      /* The assistant turn as Anthropic returns it, so its replay is measured too. */
      const raw = [
        ...(step.text ? [{ type: "text", text: step.text }] : []),
        ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) })),
      ]
      return {
        text: step.text ?? "",
        toolCalls,
        raw,
        usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
        stop: toolCalls.length ? "tool_calls" : "done",
      }
    },
  }
}

/**
 * Billed input for a run, turn by turn, from the breakpoints the provider set.
 * The stable prefix is tools then system. A turn with a transcript breakpoint
 * reads everything up to the previous turn's breakpoint and writes the rest.
 */
function bill(sent: Sent[], warm: boolean): { input: number; billed: number } {
  let input = 0
  let billed = 0
  let cachedTranscript = 0
  sent.forEach((s, i) => {
    const prefix = estimate("x".repeat(s.tools + s.system))
    const transcript = estimate("x".repeat(s.messages))
    input += prefix + transcript
    const prefixCost = i === 0 && !warm ? prefix * 1.25 : prefix * 0.1
    let transcriptCost: number
    if (s.breakpointAt !== null) {
      const reused = Math.min(cachedTranscript, transcript)
      transcriptCost = reused * 0.1 + (transcript - reused) * 1.25
      cachedTranscript = transcript
    } else {
      transcriptCost = transcript
    }
    billed += prefixCost + transcriptCost
  })
  return { input, billed: Math.round(billed) }
}

function page(): ThemeState {
  const types = ["header", "hero_centered", "product_grid", "faq_accordion", "footer"]
  return {
    sections: types.map((t, i) => buildSection(`${t}-${i}`, t)!).filter(Boolean),
    settings: { brand_name: "Northlight Presets", heading_font: "Inter", body_font: "Inter", button_style: "solid" },
  }
}

const store = async () => ({
  storeName: "northlight",
  live: true,
  totalProducts: 3,
  publishedProducts: 3,
  products: [
    { title: "Film Presets Vol. 1", type: "digital", priceCents: 2900, published: true },
    { title: "Portrait Lightroom Pack", type: "digital", priceCents: 3900, published: true },
    { title: "Editing Course", type: "digital", priceCents: 12900, published: true },
  ],
})

/* A 1x1 PNG: the picture's own cost is priced separately, per provider. */
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

async function run(name: string, prompt: string, script: Scripted[], extra: Partial<Parameters<typeof themeAgent>[0]> = {}) {
  const sent: Sent[] = []
  let n = 0
  const loop = themeAgent({
    provider: scripted(script, sent),
    model: "claude-sonnet-5",
    prompt,
    state: page(),
    page: "home",
    addable: ADDABLE_SECTIONS,
    readStore: store,
    newId: (t) => `${t}-new-${++n}`,
    ...extra,
  })
  let outChars = 0
  for (const s of script) outChars += (s.text ?? "").length + JSON.stringify(s.calls ?? []).length
  for (;;) {
    const step = await loop.next()
    if (step.done) break
  }
  const first = sent[0]
  const cold = bill(sent, false)
  const warm = bill(sent, true)
  console.log(
    [
      `${name}`,
      `  requests ${sent.length}`,
      `  first request: system ${estimate("x".repeat(first.system))}, tools ${estimate("x".repeat(first.tools))}, messages ${estimate("x".repeat(first.messages))} = ${estimate("x".repeat(first.system + first.tools + first.messages))} tokens`,
      `  whole run input ${cold.input} tokens; billed as ${cold.billed} (cold cache), ${warm.billed} (warm: a second request within five minutes)`,
      `  model output written by the script: ~${estimate("x".repeat(outChars))} tokens`,
      `  transcript breakpoint set by the provider: ${first.breakpointAt !== null ? "yes" : "no"}`,
    ].join("\n"),
  )
  return { name, sent: sent.length, first: estimate("x".repeat(first.system + first.tools + first.messages)), cold, warm, out: estimate("x".repeat(outChars)) }
}

async function main() {
  const results = []

  results.push(
    await run("A. Make the hero headline shorter (hero selected)", "make the headline shorter", [
      { calls: [["update_section", { id: "hero_centered-1", settingsJson: JSON.stringify({ heading: "Film looks for your photos" }) }]] },
      { text: "Shortened the hero headline to six words." },
    ], { selectedSectionId: "hero_centered-1" }),
  )

  results.push(
    await run("B. Build a features section about my presets", "build a features section about my presets under the hero", [
      { text: "I will add a features section under the hero about the three packs.", calls: [["read_store", {}], ["read_section_type", { sectionType: "features_cards" }]] },
      { calls: [["add_section", { sectionType: "features_cards", index: 2, settingsJson: JSON.stringify({ heading: "What is in each pack" }) }]] },
      {
        calls: [
          ["update_section", { id: "features_cards-new-1", settingsJson: JSON.stringify({ subheading: "Three packs, each tested on real client work." }) }],
        ],
      },
      { text: "Added a features section under the hero about the three packs." },
    ]),
  )

  /* A section the creator owns, so the code tools are offered. */
  const faq = DEFAULT_THEME_SOURCES["sections/faq_accordion.storelib"].replace(/"type": "faq_accordion"/, '"type": "faq_mine"')
  const files: Record<string, string> = { "sections/faq_mine.storelib": faq }
  const smoother = faq.replace(/transition: ([^;]*);/, "transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);")
  const code = {
    read: (t: string) => files[`sections/${t}.storelib`] ?? null,
    write: async (t: string, source: string) => {
      files[`sections/${t}.storelib`] = source
      return { ok: true as const }
    },
  }
  const state = page()
  state.sections.splice(3, 0, { id: "faq-mine-1", type: "faq_mine", name: "FAQ", settings: {}, blocks: [] })
  const probe = await (async () => {
    const tools: string[] = []
    const loop = themeAgent({
      provider: { id: "probe", complete: async (r) => { tools.push(...r.tools.map((t) => t.name)); return { text: "ok", toolCalls: [], raw: [], usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, stop: "done" } } },
      model: "x", prompt: "x", state: page(), page: "home", addable: ADDABLE_SECTIONS, code, sources: files,
    })
    for (;;) { const s = await loop.next(); if (s.done) break }
    return tools
  })()
  const patch = probe.includes("edit_section_code")
  const edit: Scripted = patch
    ? { calls: [["edit_section_code", { sectionType: "faq_mine", edits: [{ find: (faq.match(/transition: ([^;]*);/) ?? [""])[0], replace: "transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);" }] }]] }
    : { calls: [["write_section_code", { sectionType: "faq_mine", source: smoother }]] }
  results.push(
    await run(`C. Make the FAQ open smoothly (code, ${patch ? "patch" : "whole file"})`, "make my faq open more smoothly", [
      { calls: [["read_section_code", { sectionType: "faq_mine" }]] },
      edit,
      { text: "The answers now slide open over a quarter of a second." },
    ], { code, sources: files, state }),
  )

  results.push(
    await run("D. Image: create me something similar", "create me something similar", [
      { calls: [["add_section", { sectionType: "features_image", index: 2, settingsJson: "{}" }]] },
      { calls: [["update_section", { id: "features_image-new-1", settingsJson: JSON.stringify({ heading: "Presets made on real shoots" }) }]] },
      { text: "Built a split section like the picture: image left, three points right." },
    ], { images: [{ mediaType: "image/png", data: PIXEL, name: "ref.png" }] }),
  )

  const total = results.reduce((a, r) => ({ cold: a.cold + r.cold.billed, warm: a.warm + r.warm.billed, input: a.input + r.cold.input, out: a.out + r.out }), { cold: 0, warm: 0, input: 0, out: 0 })
  console.log(`\nALL FOUR: input ${total.input} tokens, billed ${total.cold} cold / ${total.warm} warm, output ~${total.out}`)
  console.log(JSON.stringify(results))
}

void main()
