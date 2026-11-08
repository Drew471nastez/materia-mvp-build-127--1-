/**
 * ===========================================================================
 *  WAVE 5 (aifix): STORELIB AI WORKS, WITH NO ERRORS AND NOTHING INVENTED
 * ===========================================================================
 * Regression tests, with fakes only (no provider is called, no database):
 *
 *   1. thinking blocks are never replayed after an earlier turn changed
 *      (the production 400 "Invalid `signature` in `thinking` block ... bound
 *      to a different conversation"), the provider sends drop_block with its
 *      beta header, and a 400 that still arrives is retried once without
 *      thinking blocks
 *   2. a stop (tab closed) keeps the work and ends "stopped", never an error;
 *      a slow save is asked again; a slow read before the run is a 503 retry
 *   3. plain words for every failure; a run with findings left is "partial"
 *   4. restyle / redesign / make it look ... never deletes the creator's
 *      sections without being told to
 *   5. no instruction to invent testimonials or prices
 *   6. the font weights the editor offers are the weights that load
 *   7. Auto picks Sonnet 5.5 for small edits and Opus 5.5 for big ones
 *   8. pages built with build_page get the open page's review
 *
 * Run with: npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  createAnthropicProvider,
  isBindingControlRefused,
  isThinkingSignatureError,
  THINKING_BINDING_BETA,
  toMessages,
  withoutThinking as messagesWithoutThinking,
} from "@/lib/sites/agent/anthropic-provider"
import { carriesThinking, shortenTurns, withoutThinking } from "@/lib/website-builder/agent/run-repair"
import { cancelledBy, removalGuard, themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { SLOW_SAVE_MESSAGE, saveWithRetry, transientSaveFailure } from "@/lib/website-builder/agent/commit-retry"
import { ledgerStatus, legacyStatus } from "@/lib/website-builder/agent/run-ledger-status"
import { runRow } from "@/lib/website-builder/agent/run-ledger"
import { failureKind, plainChatError, plainRunError, PLAIN_MESSAGES } from "@/lib/sites/agent/plain-errors"
import { classifyIntent, intentGuidance, lookOnly } from "@/lib/website-builder/agent/intent"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { applyPlan } from "@/lib/website-builder/agent/plan-apply"
import { buildSection, applyOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { planPage, readPageSections, type SitePageTools } from "@/lib/website-builder/agent/page-builder"
import { reviewBuiltPage } from "@/lib/website-builder/agent/review"
import { FAMILY_WEIGHTS, OFFERED_FAMILIES, fontStylesheetHref, weightsFor } from "@/lib/website-builder/font-link"
import { AUTO_ENGINE_ID, AUTO_FAST_MODEL, AUTO_STRONG_MODEL, DEFAULT_ENGINE, ENGINES, PICKER_ENGINES, autoModel, engineFromSaved, engineOf } from "@/lib/website-builder/ask-engines"
import { stoppedSentence } from "@/lib/website-builder/agent/limits"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, AgentTurn, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { CreativePlan } from "@/lib/website-builder/agent/creative-plan"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const make = (id: string, type: string): SectionInstance => {
  const built = buildSection(id, type)
  if (!built) throw new Error(`no section type ${type}`)
  return built
}
const schemas = schemaMapFor({})
let minted = 0
const mint = (p: string) => `${p}-w${++minted}`

/** The API's own binding error, as the SDK throws it. */
function bindingError(at: string): Error {
  return Object.assign(
    new Error(`400 {"type":"error","error":{"type":"invalid_request_error","message":"${at}: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation. Remove the block, or set \`thinking.block_binding.prefix_mismatch_behavior\` to \\"drop_block\\". Content before this block differs from when it was created, first at \`messages.2.content.0\`."}}`),
    { status: 400, name: "BadRequestError" },
  )
}

/**
 * A provider that checks what the API checks: every thinking block it hands
 * out is bound to the exact messages in front of it, and a later request
 * that replays it after any of those changed is refused with the 400.
 * Also says "prompt is too long" once, at `overflowAt`, so the loop shortens.
 */
function bindingProvider(script: { text?: string; calls?: [string, Record<string, unknown>][] }[], opts: { overflowAt?: number } = {}) {
  const bound = new Map<string, string>()
  const refusals: string[] = []
  let i = 0
  let calls = 0
  const provider: AgentProvider = {
    id: "binding-fake",
    async complete(request: ProviderRequest): Promise<ProviderTurn> {
      calls++
      const messages = toMessages(request.turns)
      messages.forEach((m, at) => {
        if (m.role !== "assistant" || typeof m.content === "string") return
        m.content.forEach((b, k) => {
          if (b.type !== "thinking") return
          const before = JSON.stringify(messages.slice(0, at))
          const was = bound.get(b.signature)
          if (was !== undefined && was !== before) {
            refusals.push(b.signature)
            throw bindingError(`messages.${at}.content.${k}`)
          }
        })
      })
      if (opts.overflowAt && calls === opts.overflowAt) {
        throw Object.assign(new Error("400 prompt is too long: 1200000 tokens > 1000000 maximum"), { status: 400 })
      }
      const step = script[i++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], k) => ({ id: `t${i}_${k}`, name, argumentsJson: JSON.stringify(args) }))
      const signature = `sig-${calls}`
      bound.set(signature, JSON.stringify(messages))
      const raw = [
        { type: "thinking", thinking: "", signature },
        ...(step.text ? [{ type: "text", text: step.text }] : []),
        ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) })),
      ]
      return { text: step.text ?? "", toolCalls, raw, usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
  return { provider, refusals }
}

type Step = { text?: string; calls?: [string, Record<string, unknown>][] }
function scripted(script: Step[], sent: ProviderRequest[], onCall?: (n: number) => void): AgentProvider {
  let i = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push({ ...request, signal: undefined })
      onCall?.(i + 1)
      if (request.signal?.aborted) throw Object.assign(new Error("Request was aborted."), { name: "Error" })
      const step = script[i++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], k) => ({ id: `c${i}_${k}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
}

async function drive(input: Partial<ThemeAgentInput> & { provider: AgentProvider }) {
  const events: ThemeAgentEvent[] = []
  const gen = themeAgent({ model: "test", page: "home", addable: ADDABLE_SECTIONS, newId: mint, ...input } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events }
    events.push(step.value as ThemeAgentEvent)
  }
}

function page(): ThemeState {
  return { sections: [make("header-1", "header"), make("hero-1", "hero_split"), make("faq-1", "faq_accordion"), make("cta-1", "cta_simple"), make("footer-1", "footer")], settings: {} }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("1. A thinking block is never replayed after the conversation in front of it changed")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const turns: AgentTurn[] = [
      { role: "user", content: "the request" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "read_section", argumentsJson: "{}" }], raw: [{ type: "thinking", thinking: "", signature: "s1" }, { type: "tool_use", id: "a", name: "read_section", input: {} }] },
      { role: "tool", results: [{ id: "a", output: "x".repeat(5_000) }] },
      ...Array.from({ length: 8 }, (_, n): AgentTurn[] => [
        { role: "assistant", content: "", toolCalls: [{ id: `b${n}`, name: "read_section", argumentsJson: "{}" }], raw: [{ type: "thinking", thinking: "", signature: `s${n + 2}` }, { type: "tool_use", id: `b${n}`, name: "read_section", input: {} }] },
        { role: "tool", results: [{ id: `b${n}`, output: "y".repeat(5_000) }] },
      ]).flat(),
    ]
    const short = shortenTurns(turns)
    check("shortening a long run saves bytes", short.saved > 0)
    check("and takes EVERY thinking block out with it (a partial edit is the production 400)", !carriesThinking(short.turns))
    check("tool calls and their order stay, so the conversation is still one the API takes", short.turns.length === turns.length && short.turns.every((t, i) => t.role === turns[i].role) && JSON.stringify(toMessages(short.turns)).includes('"tool_use"'))
    const untouched = shortenTurns(turns.slice(0, 3))
    check("a run with nothing to shorten keeps its thinking, byte for byte", untouched.saved === 0 && carriesThinking(untouched.turns) && untouched.turns[1] === turns[1])
    check("withoutThinking leaves a turn with no thinking as the same object", withoutThinking([turns[0]])[0] === turns[0])

    /* The real loop, with a provider that refuses exactly as the API does, and one context overflow that makes the run shorten. */
    const reads = ["hero_split", "faq_accordion", "cta_simple", "features_grid", "promo_newsletter", "text_image", "collections_grid", "pricing_table", "media_collage"]
    const { provider, refusals } = bindingProvider(
      [...reads.map((type) => ({ text: "", calls: [["read_section_type", { sectionType: type }]] as [string, Record<string, unknown>][] })), { text: "", calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Made in Porto" }) }]] }, { text: "Changed the hero heading." }],
      { overflowAt: 10 },
    )
    const { result } = await drive({ provider, prompt: "change the hero heading to Made in Porto", state: page() })
    check("a run that had to shorten its conversation is never refused for a thinking block", refusals.length === 0, refusals.join(","))
    check("and finishes its work", result.status === "succeeded" && result.ops.some((op) => op.kind === "update_section"), `${result.status} ${result.error}`)
  }

  {
    /* The provider: drop_block with its beta header, and one retry without thinking blocks when the 400 still comes. */
    const sent: { body: Record<string, any>; options: Record<string, any> }[] = []
    let failFirst = true
    const transport = {
      messages: {
        stream(body: Record<string, any>, options: Record<string, any>) {
          sent.push({ body: JSON.parse(JSON.stringify(body)), options: { headers: options?.headers } })
          const hasThinking = (body.messages as { role: string; content: unknown }[]).some((m) => Array.isArray(m.content) && (m.content as { type: string }[]).some((b) => b.type === "thinking"))
          return {
            on() {},
            finalMessage: async () => {
              if (failFirst && hasThinking) {
                failFirst = false
                throw bindingError("messages.1.content.0")
              }
              return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }
            },
          }
        },
      },
    }
    const provider = createAnthropicProvider(() => transport as never)
    const turns: AgentTurn[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "read_section", argumentsJson: "{}" }], raw: [{ type: "thinking", thinking: "", signature: "s" }, { type: "tool_use", id: "a", name: "read_section", input: {} }] },
      { role: "tool", results: [{ id: "a", output: "the section" }] },
    ]
    const turn = await provider.complete({ model: "claude-opus-5-5", system: "rules", turns, tools: [], maxOutputTokens: 1000 })
    check("the run carries on instead of failing on the 400", turn.text === "ok")
    check("every request asks the API to drop a mismatched block", sent[0].body.thinking?.block_binding?.prefix_mismatch_behavior === "drop_block" && sent[0].body.thinking?.type === "adaptive")
    check("with the beta header that setting needs", sent[0].options.headers?.["anthropic-beta"] === THINKING_BINDING_BETA && THINKING_BINDING_BETA === "thinking-binding-controls-2026-08-01")
    check("the one retry sends the conversation without its thinking blocks, tool calls kept", sent.length === 2 && !JSON.stringify(sent[1].body.messages).includes('"thinking"') && JSON.stringify(sent[1].body.messages).includes('"tool_use"'))
    check("a model without thinking gets neither", await (async () => {
      sent.length = 0
      await provider.complete({ model: "claude-haiku-4-5", system: "rules", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100 })
      return !("thinking" in sent[0].body) && !sent[0].options.headers
    })())
    check("the error is recognised by its words and status", isThinkingSignatureError(bindingError("messages.3.content.1")) && !isThinkingSignatureError(Object.assign(new Error("400 prompt is too long"), { status: 400 })) && !isThinkingSignatureError(Object.assign(new Error("bound to a different conversation"), { status: 500 })))
    check("a platform that refuses block_binding is sent the request again without it", isBindingControlRefused(Object.assign(new Error("400 thinking.block_binding: Extra inputs are not permitted"), { status: 400 })))
    check("withoutThinking (messages) keeps text and tool calls", JSON.stringify(messagesWithoutThinking(toMessages(turns))).includes("tool_use") && !JSON.stringify(messagesWithoutThinking(toMessages(turns))).includes('"thinking"'))
    const src = read("lib/sites/agent/anthropic-provider.ts")
    check("never the provider's 400 verbatim on a creator's screen", !/Claude refused the request: \$\{thrown\.message\}/.test(src))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("2. A stop keeps the work; a slow save is asked again; a slow read is a retry")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ctl = new AbortController()
    const sent: ProviderRequest[] = []
    const provider = scripted(
      [{ text: "", calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Made in Porto" }) }]] }, { text: "never reached" }],
      sent,
      (n) => {
        if (n === 2) ctl.abort(new DOMException("The reader left", "AbortError"))
      },
    )
    const { result, events } = await drive({ provider, prompt: "change the hero heading and then the faq", state: page(), signal: ctl.signal })
    check("a run the creator stopped (the tab closed) is not a failure", result.status === "succeeded" && result.error === null, `${result.status} ${result.error}`)
    check("it is recorded as stopped, and what it did is kept", result.stopped === "cancelled" && result.ops.length === 1 && ledgerStatus(result) === "stopped")
    check("the reply says so plainly", /Stopped here\. Everything changed so far is kept\./.test(result.message), result.message)
    check("and the chat is not told to carry on by itself", !events.some((e) => e.type === "continue"))

    const ctl2 = new AbortController()
    const nothing = await drive({ provider: scripted([{ text: "x" }], [], () => ctl2.abort(new DOMException("gone", "AbortError"))), prompt: "change the hero", state: page(), signal: ctl2.signal })
    check("stopped before anything changed: 'Stopped. Nothing was changed.', no error", nothing.result.status === "succeeded" && nothing.result.message === "Stopped. Nothing was changed." && nothing.result.error === null, `${nothing.result.status} ${nothing.result.message}`)

    const deadline = new AbortController()
    deadline.abort(new DOMException("deadline", "TimeoutError"))
    check("the deadline backstop is not a stop: the route carries it on as the next part", !cancelledBy(deadline.signal) && cancelledBy(ctl.signal))
    check("the stop sentence", stoppedSentence(false, "cancelled") === "Stopped. Nothing was changed.")
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the route passes the abort's reason on, so a stop and the deadline differ", /both\.abort\(a\.reason\)/.test(route) && /both\.abort\(b\.reason\)/.test(route))
  }
  {
    const pauses: number[] = []
    let n = 0
    const ok = await saveWithRetry(async () => (++n < 3 ? { ok: false, error: "DeadlineExceeded: x.supabase.co/rest/v1/store_theme_custom_files took longer than 30s" } : { ok: true }), { sleep: async (ms) => void pauses.push(ms) })
    check("a save that timed out twice is asked again, with backoff, and lands", ok.ok === true && ok.tries === 3 && pauses.join(",") === "1000,3000", JSON.stringify(ok))
    let m = 0
    const thrown = await saveWithRetry(async () => {
      if (++m === 1) throw Object.assign(new Error("store_theme_custom_files took longer than 30s"), { name: "DeadlineExceeded" })
      return { ok: true }
    }, { sleep: async () => {} })
    check("a thrown DeadlineExceeded counts as slow, not as the file being wrong", thrown.ok === true && thrown.tries === 2)
    let k = 0
    const refused = await saveWithRetry(async () => (++k, { ok: false, error: "Invalid path" }), { sleep: async () => {} })
    check("a file refused for what it is is not asked again", refused.ok === false && refused.tries === 1 && k === 1 && refused.transient === false)
    let j = 0
    const noRoom = await saveWithRetry(async () => (++j, { ok: false, error: "fetch failed" }), { sleep: async () => {}, roomMs: () => 10_000, perTryMs: 30_000 })
    check("no retry without room for a whole try before the function ends", noRoom.ok === false && j === 1 && noRoom.transient === true)
    check("transient words", transientSaveFailure("503 Service Unavailable") && !transientSaveFailure("A file is at most 1 MB"))
    check("the creator reads that the same request works again", /Send the same request again/.test(SLOW_SAVE_MESSAGE))
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the route's commit saves through the retry", /saveWithRetry\(/.test(route) && /codeLostSlow \? SLOW_SAVE_MESSAGE/.test(route))
    const decide = read("app/api/website-builder/themes/[installId]/agent/decide/route.ts")
    check("both routes answer a slow read of the creator or install with the retryable 503, not 403/404", [route, decide].every((r) => (r.match(/transientReadError\(/g) ?? []).length === 2 && /dataUnavailableResponse\(\)/.test(r)))
    check("and both still refuse a missing sign in exactly as before (routeUser, authUnavailableResponse)", [route, decide].every((r) => /routeUser\(\)/.test(r) && /authUnavailableResponse\(\)/.test(r) && /status: 401/.test(r)))
    const auth = read("lib/auth/current-user.ts")
    check("the Auth call that lost its race is caught, so its late DeadlineExceeded is never an unhandled error", (auth.match(/asked\.catch\(\(\) => undefined\)/g) ?? []).length === 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("3. Plain words for every failure, and partly done said as that")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const quiet = console.error
    console.error = () => {}
    try {
      check("a DeadlineExceeded from the database is about the site's data", failureKind(Object.assign(new Error("store_theme_custom_files took longer than 30s"), { name: "DeadlineExceeded" })) === "storage")
      check("the binding 400, if it ever escaped, is a plain sentence", plainRunError(bindingError("messages.1.content.0"), "test") === PLAIN_MESSAGES.failed)
      check("an abort is not a model failure", failureKind(Object.assign(new Error("Request was aborted."), {})) === null)
    } finally {
      console.error = quiet
    }
    check("raw provider JSON kept in a history reads as a sentence", plainChatError(bindingError("messages.1.content.0").message) === PLAIN_MESSAGES.failed)
    check("a raw database line too", plainChatError("DeadlineExceeded: abc.supabase.co/rest/v1/x took longer than 30s") !== "DeadlineExceeded: abc.supabase.co/rest/v1/x took longer than 30s")
    check("ledger: findings left is partial, never succeeded", ledgerStatus({ status: "succeeded", partial: true }) === "partial" && ledgerStatus({ status: "succeeded" }) === "succeeded" && ledgerStatus({ status: "failed" }) === "failed")
    check("and a database without the new statuses gets the old ones", legacyStatus("partial") === "succeeded" && legacyStatus("stopped") === "failed")
    check("the row keeps partial and stopped", runRow({ installId: "i", creatorId: "c", pageKey: "home", status: "partial", intent: null, ops: 1, wroteCode: false, pages: [], unresolved: ["x"], ms: 1, model: "m", provider: "p", inputTokens: 1, outputTokens: 1 }).status === "partial")
    check("the database change ships beside it", /'partial', 'stopped'/.test(read("supabase/sql/RUN_STORELIB_AI_RUN_STATUS.sql")))

    /* A run whose page still has demo copy at the end: partial. */
    const { result } = await drive({
      provider: scripted([{ text: "", calls: [["add_section", { sectionType: "faq_accordion", index: 1 }]] }, { text: "Added." }, { text: "Added." }, { text: "Added." }, { text: "Added." }], []),
      prompt: "add a faq",
      state: page(),
      projectCheck: true,
      maxReviews: 1,
    })
    check("a run that ends with findings is partial, and says what is left", result.status === "succeeded" && result.partial === true && (result.unresolved ?? []).length > 0 && ledgerStatus(result) === "partial", JSON.stringify({ s: result.status, p: result.partial, u: result.unresolved }))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the chat shows partly done under the reply", /type === "outcome"/.test(chat) && /data-ask-partial/.test(chat) && /Partly done: some checks still fail/.test(chat))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Restyle, redesign, make it look ...: never a section deleted without being asked")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ctx = { bodySections: 4 }
    const style = ["restyle the whole site to feel more editorial", "redesign my website to look more modern", "make my website look like a real luxury brand", "change the whole vibe of my site", "give the site a whole new look", "restyle this page", "redesign the home page so it feels premium"]
    for (const p of style) {
      const i = classifyIntent(p, ctx)
      check(`"${p}" is a style change, no plan, sections kept`, i.kind === "STYLE_CHANGE" && !i.plan && i.preserveStructure, `${i.kind} ${i.reasons.join(";")}`)
    }
    const structure = classifyIntent("redesign the whole site with new sections and a gallery", ctx)
    check("structure words still make a redesign, with consent to remove", structure.kind === "FULL_SITE_REDESIGN" && structure.confirmRemovals === false)
    const redesign = classifyIntent("redesign my website", ctx)
    check('"redesign my website" is still a redesign, but nothing of theirs may be removed', redesign.kind === "FULL_SITE_REDESIGN" && redesign.confirmRemovals === true && /NOTHING OF THEIRS IS REMOVED/.test(intentGuidance(redesign)))
    check("an explicit delete is consent", classifyIntent("delete the testimonials section", ctx).confirmRemovals === false)
    check("a new site on an empty page has nothing to protect", classifyIntent("build me a website for a ceramics studio", { bodySections: 0 }).confirmRemovals === false)
    check("lookOnly: look words without structure words", lookOnly("make it feel warmer") && !lookOnly("make the layout feel warmer") && !lookOnly("change the heading"))
    check("ambition: a restyle is not a whole page build", !classifyRequest("restyle the whole website").wholePage && classifyRequest("build a whole website for my bakery").wholePage)

    /* The plan's removals become hides. */
    const state = page()
    const plan = { brand: { name: "B" }, archetype: "other", palette: { direction: "", colors: {} }, typography: {}, sections: [{ pattern: "faq", use: "faq_accordion" }], remove: ["cta-1"], corrections: [] } as unknown as CreativePlan
    const applied = applyPlan({ plan, state, schemas, addable: ADDABLE_SECTIONS, intent: redesign, newId: mint })
    const kinds = applied.ops.map((o) => o.op.kind)
    check("a plan on a site nobody said to clear hides the old sections, removes none", !kinds.includes("remove_section") && kinds.includes("set_section_visibility"), kinds.join(","))
    const consent = applyPlan({ plan, state, schemas, addable: ADDABLE_SECTIONS, intent: structure, newId: mint })
    check("with consent, the plan removes as before", consent.ops.some((o) => o.op.kind === "remove_section"))

    check("remove_section on their section becomes a hide", removalGuard("remove_section", JSON.stringify({ id: "cta-1" }), redesign, state) === JSON.stringify({ id: "cta-1", hidden: true }))
    check("a section this run added may still be removed", removalGuard("remove_section", JSON.stringify({ id: "new-1" }), redesign, state) === null)
    check("and an asked-for delete stands", removalGuard("remove_section", JSON.stringify({ id: "cta-1" }), classifyIntent("delete the call to action", ctx), state) === null)

    const { result } = await drive({
      provider: scripted([{ text: "", calls: [["remove_section", { id: "cta-1" }]] }, { text: "Restyled." }], []),
      prompt: "redesign my website",
      intent: redesign,
      state: page(),
    })
    const final = result.ops.reduce((s, op) => applyOp(s, op, schemas), page())
    check("in a run, the model's remove_section on their section hides it instead", !result.ops.some((o) => o.kind === "remove_section") && final.sections.some((s) => s.id === "cta-1" && s.hidden), JSON.stringify(result.ops))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("5. Proof is never invented")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const loop = read("lib/website-builder/agent/loop.ts")
    check("no instruction to write testimonials with named people", !/testimonials with named people/.test(loop) && !/three add_block with named people/.test(loop))
    check("no instruction to invent three named tiers with prices", !/three named tiers, each with its price/.test(loop))
    check("instead: the store's real reviews and products, or hidden honest placeholders", /NEVER INVENT PROOF OR PRICES/.test(loop) && /store's real reviews \(read_store\), names as given/.test(loop) && /add it HIDDEN with placeholders/.test(loop))
    check("the planner says the same", /Never invent a customer, a quote, a rating, a statistic, a client logo or a price/.test(read("lib/website-builder/agent/creative-plan.ts")))
    check("and the design rules", /prices nobody set\. Use real ones or none/.test(read("lib/storelib-ai/design.ts")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("6. The weights the editor offers are the weights that load")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const panels = read("components/website-builder/editor/design-panels.tsx")
    const offered = (panels.match(/const WEIGHT_OPTIONS = \[([^\]]+)\]/)?.[1] ?? "").match(/\d{3}/g) ?? []
    check("the panel offers 300 to 900", offered.join(",") === "300,400,500,600,700,800,900", offered.join(","))
    const missing = [...OFFERED_FAMILIES].filter((f) => !(f in FAMILY_WEIGHTS))
    check("every family the editor offers has its own weights", missing.length === 0, missing.join(","))
    const within = Object.entries(FAMILY_WEIGHTS).every(([, w]) => {
      const range = w.match(/^(\d{3})\.\.(\d{3})$/)
      if (range) return Number(range[1]) >= 300 && Number(range[2]) <= 900 && Number(range[1]) < Number(range[2])
      return w.split(";").every((x) => /^\d{3}$/.test(x) && Number(x) >= 300 && Number(x) <= 900)
    })
    check("each is a range inside 300..900 or a list of real weights", within)
    check("a variable family loads 300 to 900 in one range", weightsFor("Montserrat") === "300..900" && fontStylesheetHref({ font_heading: "Montserrat" }) === "https://fonts.googleapis.com/css2?family=Montserrat:wght@300..900&display=swap")
    check("Playfair Display, which has no 300, is asked for what it has", weightsFor("Playfair Display") === "400..900")
    check("a static family lists its own weights", weightsFor("Lato") === "300;400;700;900" && weightsFor("Bebas Neue") === "400")
    check("still one stylesheet for every family", (fontStylesheetHref({ font_heading: "Fraunces", font_body: "DM Sans" }) ?? "").split("https://").length === 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("7. Auto: Sonnet 5.5 for a small edit, Opus 5.5 for plans, redesigns and code")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const pick = (prompt: string, extra: Partial<Parameters<typeof autoModel>[0]> = {}) => {
      const i = classifyIntent(prompt, { bodySections: 4 })
      const shape = classifyRequest(prompt)
      return autoModel({ kind: i.kind, plan: i.plan, rebuild: i.rebuild, newPage: i.newPage, recreate: i.recreate, ambitious: shape.ambitious, wholePage: shape.wholePage, ...extra })
    }
    check('"change the heading to Summer drop" runs on Sonnet 5.5', pick("change the heading to Summer drop") === AUTO_FAST_MODEL && AUTO_FAST_MODEL === "claude-sonnet-5-5")
    check('"make the hero background darker" runs on Sonnet 5.5', pick("make the hero background darker") === AUTO_FAST_MODEL)
    check('"restyle the whole site to feel more editorial" runs on Sonnet 5.5 (a style change)', pick("restyle the whole site to feel more editorial") === AUTO_FAST_MODEL)
    check('"redesign my website" runs on Opus 5.5', pick("redesign my website") === AUTO_STRONG_MODEL && AUTO_STRONG_MODEL === "claude-opus-5-5")
    check('"completely redesign the pricing section" runs on Opus 5.5', pick("completely redesign the pricing section") === AUTO_STRONG_MODEL)
    check('"add an about page" runs on Opus 5.5', pick("add an about page that tells our story") === AUTO_STRONG_MODEL)
    check("a picture, Code a section, or a new section's code run on Opus 5.5", pick("make it like this", { images: 1 }) === AUTO_STRONG_MODEL && pick("tweak the spacing", { codeFocus: true }) === AUTO_STRONG_MODEL && pick("tweak the spacing", { code: true }) === AUTO_STRONG_MODEL)
    check("Auto is the default and first in the menu; the four models follow, unchanged", DEFAULT_ENGINE === AUTO_ENGINE_ID && PICKER_ENGINES[0].id === "auto" && PICKER_ENGINES.slice(1).map((e) => e.id).join() === ENGINES.map((e) => e.id).join())
    check("a saved model choice is kept; an old one reads as Auto", engineFromSaved("claude-opus-5-5") === "claude-opus-5-5" && engineFromSaved("claude:claude-haiku-4-5") === "auto" && engineOf("auto").model === "")
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the chat sends no model for Auto, and the chosen model otherwise", /live\.current\.engine\.model \? \{ model: live\.current\.engine\.model, tier: live\.current\.engine\.tier \} : \{ auto: true \}/.test(chat))
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the route chooses only when no model was sent: an explicit choice is honoured", /!body\.model && \(body\.auto === true \|\| !body\.tier\)/.test(route) && /model: body\.model \?\? autoChosen/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("8. A page built with build_page gets the open page's review")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const chrome: ThemeState = { sections: [make("header-1", "header"), make("footer-1", "footer")], settings: {} }
    const lazy = readPageSections([{ type: "faq_accordion" }])
    const lazyPlan = "sections" in lazy ? planPage(chrome, lazy.sections, schemas, { mint }) : null
    const found = lazyPlan?.ok ? reviewBuiltPage(lazyPlan.state, lazyPlan.created, schemas) : []
    check("a FAQ left with its preset's demo entries is found", found.some((f) => /exactly as the preset ships them|demo/i.test(f.message)), JSON.stringify(found.map((f) => f.message)))
    const real = readPageSections([
      {
        type: "faq_accordion",
        settings: { heading: "Questions about our studio" },
        blocks: [
          { type: "qa", settings: { question: "Do you run evening classes?", answer: "<p>Tuesdays and Thursdays, 18:00 to 20:30.</p>" } },
          { type: "qa", settings: { question: "Is clay included?", answer: "<p>Yes, and firing too.</p>" } },
          { type: "qa", settings: { question: "Can I bring a friend?", answer: "<p>Book two places in one order.</p>" } },
          { type: "qa", settings: { question: "Where do I park?", answer: "<p>On Rua Nova, two minutes away.</p>" } },
        ],
      },
    ])
    const realPlan = "sections" in real ? planPage(chrome, real.sections, schemas, { mint }) : null
    const clean = realPlan?.ok ? reviewBuiltPage(realPlan.state, realPlan.created, schemas) : null
    check("a page written with real entries passes", Array.isArray(clean) && !clean.some((f) => /preset ships them/.test(f.message)), JSON.stringify(clean?.map((f) => f.message)))
    const server = read("lib/website-builder/agent/page-builder-server.ts")
    check("build_page runs it and tells the model what to fix", /reviewBuiltPage\(plan\.state, plan\.created, schemas\)/.test(server) && /REVIEW FOUND/.test(server) && /findings: \[\.\.\.failed, \.\.\.reviewed\]/.test(server))

    /* The loop reports what the page's review still found: partial, not succeeded. */
    const pages: SitePageTools = {
      async list() {
        return "THE SITE'S PAGES\n- home: OPEN\n- about: not made yet"
      },
      async build() {
        return { ok: true, text: 'Made "about". REVIEW FOUND 1 THING TO FIX', key: "about", title: "About", created: true, findings: ["faq_accordion [faq-1]: You added this faq_accordion and left all 4 of its entries exactly as the preset ships them."] }
      },
    }
    const { result } = await drive({
      provider: scripted([{ text: "", calls: [["build_page", { page: "about", title: "About", sectionsJson: JSON.stringify([{ type: "faq_accordion" }]) }]] }, { text: "Made the About page." }], []),
      prompt: "add an about page",
      state: page(),
      pages,
    })
    check("the run says the page still has demo copy, and is partial", result.partial === true && (result.unresolved ?? []).some((u) => /On the about page/.test(u)) && /still not right/.test(result.message), JSON.stringify({ p: result.partial, u: result.unresolved, m: result.message }))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
