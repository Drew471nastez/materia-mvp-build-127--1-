/**
 * ===========================================================================
 *  STORELIB AI ON CHATGPT, AND NEVER A PROVIDER'S RAW ERROR ON SCREEN
 * ===========================================================================
 * The chat once showed a creator this, word for word, with Try again under
 * it:
 *
 *   400 {"type":"error","error":{"type":"invalid_request_error","message":
 *   "Your credit balance is too low to access the Anthropic API..."},...}
 *
 * Storelib AI runs on ChatGPT now, and every failure of a model call is a
 * plain sentence (lib/sites/agent/plain-errors.ts). Checked here, without a
 * network:
 *
 *   the errors both SDKs throw, and that body as a bare string, each become
 *   one plain sentence that names no vendor, no credit and no JSON;
 *   the provider wrapper every route is handed throws those sentences, and
 *   leaves a cancel and the creator's own key refusing as they were;
 *   the page assistant's loop ends a run on that 400 with the plain sentence;
 *   the chat's model list is ChatGPT's two models with what each is for, a
 *   saved Claude choice reads as the default, and Strength is low, medium
 *   and high on the wire as OpenAI's `reasoning.effort`.
 */
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { failureKind, looksRaw, PLAIN_MESSAGES, PlainError, plainChatError, plainFailures, plainRunError } from "@/lib/sites/agent/plain-errors"
import { createOpenAIProvider, reasoningEffort } from "@/lib/sites/agent/openai-provider"
import { DEFAULT_ENGINE, DEFAULT_STRENGTH, effortOf, engineFromSaved, ENGINES, STRENGTHS, strengthFromSaved } from "@/lib/website-builder/ask-engines"
import { REPORTABLE_ENGINES } from "@/lib/website-builder/agent/chat"
import { themeAgent } from "@/lib/website-builder/agent/loop"
import { buildSection } from "@/lib/website-builder/agent/operations"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderRequest } from "@/lib/sites/agent/types"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    out(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    out(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}

/* The log is where the raw detail goes; collected here so the suite can say it went there and not on screen. */
const logged: string[] = []
console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "))

const BODY = {
  type: "error",
  error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." },
  request_id: "req_011CTestRequestId",
}
const RAW = `400 ${JSON.stringify(BODY)}`

/** What a creator must never read. */
function plain(message: string): boolean {
  return !/[{}]|credit|anthropic|claude|openai|request_id|invalid_request|api key|\b\d{3}\b/i.test(message) && !/—/.test(message)
}

async function main() {
  out("\nThe 400 from the screenshot")
  {
    const sdk = new Anthropic.BadRequestError(400, BODY, undefined, new Headers())
    check("the SDK's own error says what the screenshot said", sdk.message.startsWith("400 ") && /credit balance is too low/.test(sdk.message))
    const said = plainRunError(sdk, "test")
    check("becomes: Storelib AI is unavailable right now", said === PLAIN_MESSAGES.unavailable, said)
    check("which names no vendor, no credit and no JSON", plain(said), said)
    check("and the raw body went to the log instead", logged.some((l) => /credit balance is too low/.test(l)))
    const bare = plainRunError(new Error(RAW), "test")
    check("the same body as a bare Error message, too", bare === PLAIN_MESSAGES.unavailable, bare)
    check("and the chat's own guard turns the string itself into the same sentence", plainChatError(RAW) === PLAIN_MESSAGES.unavailable, plainChatError(RAW))
    check("the guard knows a raw string when it sees one", looksRaw(RAW) && looksRaw('{"type":"error"}') && !looksRaw(PLAIN_MESSAGES.busy))
    check("and leaves a sentence written for a person alone", plainChatError("Describe what you want changed.") === "Describe what you want changed.")
    check("an empty message is still a sentence", plainChatError("") === PLAIN_MESSAGES.failed && plainChatError(undefined) === PLAIN_MESSAGES.failed)
  }

  out("\nEvery other way a model call fails")
  {
    const quota = new OpenAI.RateLimitError(429, { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota" }, undefined, new Headers())
    check("OpenAI out of quota (a 429) is unavailable, not busy", failureKind(quota) === "unavailable")
    const limited = new OpenAI.RateLimitError(429, { message: "Rate limit reached for gpt-5.6-luna", type: "requests", code: "rate_limit_exceeded" }, undefined, new Headers())
    check("an ordinary rate limit is busy", failureKind(limited) === "busy")
    check("overloaded and server errors are busy", failureKind(Object.assign(new Error("529 overloaded"), { status: 529 })) === "busy" && failureKind(Object.assign(new Error("500"), { status: 500 })) === "busy")
    check("a timeout is a timeout", failureKind(new OpenAI.APIConnectionTimeoutError()) === "timeout")
    check("a lost connection is network", failureKind(new OpenAI.APIConnectionError({ message: "Connection error." })) === "network")
    check("a rejected key on Storelib's account is unavailable: nothing the creator can fix", failureKind(new OpenAI.AuthenticationError(401, { message: "Incorrect API key provided: sk-abc" }, undefined, new Headers())) === "unavailable")
    check("no key on this deployment is unavailable, never the variable's name", failureKind(Object.assign(new Error("OPENAI_API_KEY is not set"), { name: "MissingKeyError" })) === "unavailable")
    check("any other status is a plain failure", failureKind(Object.assign(new Error("418 teapot"), { status: 418 })) === "failed")
    check("a cancel is not a model failure", failureKind(Object.assign(new Error("aborted"), { name: "AbortError" })) === null)
    check("nor a bug of ours, which keeps the caller's own words", failureKind(new TypeError("x is undefined")) === null && plainRunError(new TypeError("x is undefined"), "test", "The edit failed.") === "The edit failed.")
    const own = Object.assign(new Error("Your OpenAI key is out of credit, so nothing was changed."), { name: "OwnKeyError", status: 402 })
    check("the creator's own key refusing is said in its own words", plainRunError(own, "test") === own.message)
    check("every sentence is plain", Object.values(PLAIN_MESSAGES).every(plain), Object.values(PLAIN_MESSAGES).filter((m) => !plain(m)))
    check("and the unavailable one is the one the owner asked for", PLAIN_MESSAGES.unavailable === "Storelib AI is unavailable right now. Try again in a few minutes.")
  }

  out("\nThe provider every route is handed")
  {
    const request: ProviderRequest = { model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100 }
    const failing = (thrown: unknown): AgentProvider => ({ id: "openai", complete: async () => { throw thrown } })
    const catchOf = async (p: AgentProvider) => {
      try {
        await p.complete(request)
        return null
      } catch (e) {
        return e as Error
      }
    }
    const credit = await catchOf(plainFailures(failing(new Anthropic.BadRequestError(400, BODY, undefined, new Headers()))))
    check("throws a PlainError with the plain sentence", credit instanceof PlainError && credit.message === PLAIN_MESSAGES.unavailable && (credit as PlainError).status === 400, credit?.message)
    const abort = await catchOf(plainFailures(failing(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    check("a cancel passes through as a cancel", abort?.name === "AbortError")
    const own = await catchOf(plainFailures(failing(Object.assign(new Error("Your OpenRouter account is out of credit, so nothing was changed."), { name: "OwnKeyError", status: 402 }))))
    check("the creator's own key refusing passes through as theirs", own?.name === "OwnKeyError" && /Your OpenRouter account/.test(own.message))
    const bug = await catchOf(plainFailures(failing(new TypeError("boom"))))
    check("and a bug of ours is left for the caller", bug instanceof TypeError)
  }

  out("\nThe page assistant, when the provider says no")
  {
    const provider = plainFailures({ id: "openai", complete: async () => { throw new Anthropic.BadRequestError(400, BODY, undefined, new Headers()) } })
    const types = ["header", "hero_centered", "footer"]
    const loop = themeAgent({
      provider,
      model: "gpt-5.6-luna",
      prompt: "make the headline shorter",
      state: { sections: types.map((t, i) => buildSection(`${t}-${i}`, t)!).filter(Boolean), settings: {} },
      page: "home",
      addable: ADDABLE_SECTIONS,
    })
    let step = await loop.next()
    while (!step.done) step = await loop.next()
    const result = step.value
    check("the run fails", result.status === "failed")
    check("with the plain sentence as its error, which is what the route sends and the history keeps", result.error === PLAIN_MESSAGES.unavailable, result.error)
    const unwrapped = themeAgent({
      provider: { id: "openai", complete: async () => { throw new Error(RAW) } },
      model: "gpt-5.6-luna",
      prompt: "make the headline shorter",
      state: { sections: types.map((t, i) => buildSection(`${t}-${i}`, t)!).filter(Boolean), settings: {} },
      page: "home",
      addable: ADDABLE_SECTIONS,
    })
    let s2 = await unwrapped.next()
    while (!s2.done) s2 = await unwrapped.next()
    check("and the loop is safe on its own, for a provider nobody wrapped", s2.value.error === PLAIN_MESSAGES.unavailable, s2.value.error)
  }

  out("\nThe models the chat offers")
  {
    check("two ChatGPT models, everyday and strong", ENGINES.length === 2 && ENGINES.every((e) => e.provider === "openai") && ENGINES.map((e) => e.tier).join(",") === "fast,strong")
    check("each says what it is best for", ENGINES[0].detail === "Best for quick edits, copy and colours" && ENGINES[1].detail === "Best for new sections, pages and code")
    check("the everyday one is the default", DEFAULT_ENGINE === "openai")
    check("a saved Claude choice reads as the default, never a crash", engineFromSaved("claude") === "openai" && engineFromSaved("claude-opus") === "openai" && engineFromSaved(null) === "openai" && engineFromSaved(42) === "openai")
    check("a saved ChatGPT choice is kept", engineFromSaved("openai-strong") === "openai-strong" && engineFromSaved("openai") === "openai")
    check("a report can name either model, and an answer from before", ENGINES.every((e) => (REPORTABLE_ENGINES as readonly string[]).includes(e.id)) && (REPORTABLE_ENGINES as readonly string[]).includes("claude"))
  }

  out("\nStrength")
  {
    check("Light, Standard and Deep", STRENGTHS.map((s) => s.label).join(",") === "Light,Standard,Deep")
    check("are low, medium and high", effortOf("light") === "low" && effortOf("standard") === "medium" && effortOf("deep") === "high")
    check("Standard by default, and an unknown saved value reads as it", DEFAULT_STRENGTH === "standard" && strengthFromSaved("turbo") === "standard" && strengthFromSaved("deep") === "deep")
    check("OpenAI is sent low, medium or high, and the loops' larger asks as high", reasoningEffort("low") === "low" && reasoningEffort("medium") === "medium" && reasoningEffort("high") === "high" && reasoningEffort("xhigh") === "high" && reasoningEffort("max") === "high" && reasoningEffort(undefined) === undefined)

    const sent: Record<string, unknown>[] = []
    const fake = {
      responses: {
        create: async (body: Record<string, unknown>) => {
          sent.push(body)
          return { output: [{ type: "message", content: [{ type: "output_text", text: "Done." }] }], usage: { input_tokens: 1, output_tokens: 1 } }
        },
      },
    }
    const provider = createOpenAIProvider(() => fake as never)
    await provider.complete({ model: "gpt-5.6-terra", system: "s", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100, effort: "high" })
    await provider.complete({ model: "gpt-5.6-luna", system: "s", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100 })
    check("on the wire it is the Responses API's reasoning.effort", JSON.stringify(sent[0]?.reasoning) === JSON.stringify({ effort: "high" }), sent[0]?.reasoning)
    check("and absent when nobody chose, so the model keeps its own default", !("reasoning" in (sent[1] ?? {})))
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) out(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  out(e)
  process.exit(1)
})
