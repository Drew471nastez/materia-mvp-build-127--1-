import "server-only"

/**
 * ===========================================================================
 *  THE ANTHROPIC PROVIDER
 * ===========================================================================
 * One file, implementing the same `AgentProvider` both agents already speak.
 *
 * Nothing above this layer changes: not the theme agent's loop, not the code
 * agent's, not the tools, not the review pass, not the transcript, not the
 * streaming, not the cost record. `types.ts` says a second provider should be
 * one file rather than a search-and-replace through the feature, and this is
 * the test of that claim.
 *
 * `server-only` at the top is the mechanism, not a note: the key lives in
 * `ANTHROPIC_API_KEY`, and this import makes the BUILD FAIL if any client
 * component ever pulls this module in. There is no NEXT_PUBLIC_ variant of
 * this key and there must never be one.
 */

import Anthropic from "@anthropic-ai/sdk"

import { rateFor } from "./models"
import { effortSupported } from "@/lib/website-builder/ask-engines"
import type {
  AgentProvider,
  AgentTurn,
  ProviderRequest,
  ProviderTurn,
  ToolCall,
  TokenUsage,
} from "./types"

let client: Anthropic | null = null

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set")
    this.name = "MissingAnthropicKeyError"
  }
}

/** The one client, shared with the product editor's category suggestion (lib/products/category-suggest-claude.ts). */
export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    /**
     * Thrown rather than defaulted, for the same reason the OpenAI provider
     * does it: a provider with no key that returns a polite empty answer is
     * indistinguishable from a model with nothing to say, and the route turns
     * this into one clear sentence for the creator.
     */
    if (!apiKey) throw new MissingAnthropicKeyError()
    client = new Anthropic({ apiKey })
  }
  return client
}

/**
 * Our turns, in the Messages API's shape.
 *
 * Two things here are not obvious and both are load-bearing:
 *
 * 1. AN ASSISTANT TURN IS REPLAYED FROM `raw`. For Anthropic that is the
 *    content-block array, and it can contain `thinking` blocks that must come
 *    back BYTE-IDENTICAL — the API rejects or silently drops edited reasoning.
 *    Rebuilding the turn from our own `content` string would throw those away
 *    on every round trip of a tool loop.
 *
 * 2. ALL TOOL RESULTS GO IN ONE USER MESSAGE. Anthropic's parallel tool use
 *    returns several `tool_use` blocks in a single assistant turn, and the
 *    results have to come back together. Splitting them across messages is
 *    accepted by the API and quietly teaches the model to stop making
 *    parallel calls — a performance bug with no error attached to it.
 */
export function toMessages(turns: AgentTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  for (const turn of turns) {
    if (turn.role === "user") {
      /**
       * A picture goes BEFORE the words that talk about it. Claude reads a
       * message in order, and a reference that arrives after the instruction
       * to copy it has to be held in mind rather than looked at.
       */
      messages.push(
        turn.images?.length
          ? {
              role: "user",
              content: [
                ...turn.images.map((image) => ({
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
                })),
                { type: "text" as const, text: turn.content },
              ],
            }
          : { role: "user", content: turn.content },
      )
      continue
    }

    if (turn.role === "assistant") {
      if (Array.isArray(turn.raw) && turn.raw.length > 0) {
        messages.push({ role: "assistant", content: turn.raw as Anthropic.ContentBlockParam[] })
      } else if (turn.content) {
        messages.push({ role: "assistant", content: turn.content })
      }
      continue
    }

    messages.push({
      role: "user",
      content: turn.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.id,
        content: result.output,
      })),
    })
  }

  return messages
}

/**
 * ===========================================================================
 *  THE TRANSCRIPT IS CACHED TOO, NOT ONLY THE RULES
 * ===========================================================================
 * Every turn of a tool loop resends the whole conversation: the page, the
 * picture, every tool result so far. The system block's breakpoint caches
 * the rules and tools in front of it and nothing after, so turn five paid
 * full price for turns one to four again. Measured on the fixtures in
 * scripts/measure-agent-tokens.ts, that resent transcript was most of what a
 * build cost.
 *
 * So the request's last block carries a breakpoint as well. Anthropic caches
 * the longest prefix up to it, and the next turn, which begins with exactly
 * that prefix, reads it back at a tenth of the price and pays in full only
 * for what is new. Two breakpoints of the four a request may carry.
 *
 * Kept apart from `toMessages`, which is the shape of a conversation and is
 * pinned by tests that way; this is a billing instruction on top of it.
 */
export function requestMessages(turns: AgentTurn[]): Anthropic.MessageParam[] {
  const messages = toMessages(turns)
  const last = messages[messages.length - 1]
  if (!last) return messages
  const breakpoint = { type: "ephemeral" as const }
  if (typeof last.content === "string") {
    if (!last.content) return messages
    messages[messages.length - 1] = { ...last, content: [{ type: "text", text: last.content, cache_control: breakpoint }] }
    return messages
  }
  const blocks = [...last.content]
  const end = blocks[blocks.length - 1]
  /* Thinking blocks are replayed byte for byte and take no marker; the last message here is the user's anyway. */
  if (!end || end.type === "thinking" || end.type === "redacted_thinking") return messages
  blocks[blocks.length - 1] = { ...end, cache_control: breakpoint } as Anthropic.ContentBlockParam
  messages[messages.length - 1] = { ...last, content: blocks }
  return messages
}

/**
 * ANTHROPIC'S THREE INPUT COUNTS ARE DISJOINT. OpenAI's are nested.
 *
 * `TokenUsage.inputTokens` is documented as the TOTAL, with the two cache
 * figures as subsets of it — `costOf` subtracts them to find what pays full
 * price. Anthropic reports `input_tokens` as the UNCACHED remainder, with
 * cache reads and cache writes counted separately alongside it.
 *
 * Passing `input_tokens` straight through would therefore make `costOf`
 * subtract the cache figures a second time, clamp at zero, and bill a long
 * cached run as almost free. They are summed here so the contract this
 * interface documents is the contract this provider meets.
 */
export function readUsage(usage: Anthropic.Usage | undefined): TokenUsage {
  const uncached = usage?.input_tokens ?? 0
  const cacheRead = usage?.cache_read_input_tokens ?? 0
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0
  return {
    inputTokens: uncached + cacheRead + cacheWrite,
    cachedInputTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: usage?.output_tokens ?? 0,
  }
}

/**
 * THE SAME PROVIDER ON SOMEBODY ELSE'S ACCOUNT. `client` is where the calls
 * go: Storelib's key by default, or a creator's own Claude key.
 */
export function createAnthropicProvider(client: () => Anthropic, options: { id?: string; modelInfo?: Anthropic.ModelInfo } = {}): AgentProvider {
  return {
    id: options.id ?? "anthropic",
    complete: (request) => completeWith(client, request, options.modelInfo),
  }
}

/** A Claude client on a key that is not Storelib's. One retry: a creator's key that is refused should say so quickly. */
export function anthropicClientFor(key: string): Anthropic {
  return new Anthropic({ apiKey: key, maxRetries: 1 })
}

export const anthropicProvider: AgentProvider = createAnthropicProvider(anthropic)

async function completeWith(client: () => Anthropic, request: ProviderRequest, modelInfo?: Anthropic.ModelInfo): Promise<ProviderTurn> {
  const rate = rateFor(request.model)

  /**
   * STREAMED, always, then collected into one message.
   *
   * The contract here is one round trip returning a whole turn — the
   * progress the creator watches is streamed by the agent loop above this,
   * not by the HTTP call. Streaming is used anyway because a non-streaming
   * request with a large `max_tokens` can exceed the SDK's request timeout
   * and fail after doing all the work. `finalMessage()` gives back exactly
   * the object the non-streaming call would have returned, so nothing above
   * has to know.
   */
  const stream = client().messages.stream(
    {
      model: request.model,
      max_tokens: Math.min(
        request.maxOutputTokens,
        rate?.maxOutputTokens ?? request.maxOutputTokens,
        modelInfo?.max_tokens ?? request.maxOutputTokens,
      ),
      /**
       * Anthropic takes the system prompt as its own parameter rather than
       * a message. Sent as a block with `cache_control` so the part that is
       * identical on every turn of a run — and identical again on the
       * creator's next request about the same site — is paid for once.
       *
       * Caching here is a PREFIX MATCH over tools then system then messages,
       * so this only works while the tool list is stable. Both agents build
       * theirs deterministically, which is what makes it safe to rely on.
       */
      system: [
        {
          type: "text" as const,
          text: request.system,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      /**
       * `request.cacheKey` has no Anthropic equivalent and is deliberately
       * not sent. OpenAI takes an explicit key; Anthropic caches on a PREFIX
       * MATCH, which the `cache_control` above already asks for. Inventing a
       * parameter to carry the key would be a 400.
       */
      /* With a breakpoint on the last block: see requestMessages. */
      messages: requestMessages(request.turns),
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        /**
         * The same guarantee the OpenAI provider asks for: arguments that
         * parse and carry the fields the executor reads. Every spec in both
         * agents already declares `additionalProperties: false` and
         * `required`, which is what this needs to be accepted.
         */
        ...(!modelInfo?.capabilities || modelInfo.capabilities.structured_outputs.supported ? { strict: true } : {}),
      })),
      /**
       * Adaptive thinking. On Sonnet 5 and Opus 5 this is the only on-mode —
       * the fixed `budget_tokens` form is rejected with a 400 — and it is
       * what makes the model plan a multi-step edit rather than answer the
       * first thing it thought of.
       *
       * `display` is left at its default, which returns empty thinking text.
       * The reasoning is not shown to creators: what the agent is DOING is
       * worth watching, what it is thinking is not something to put on a
       * customer's screen.
       */
      ...(modelInfo?.capabilities
        ? modelInfo.capabilities.thinking.types.adaptive.supported ? { thinking: { type: "adaptive" as const } } : {}
        : /claude-(?:sonnet-5|opus-(?:5|4-[678])|sonnet-4-6|fable|mythos)/.test(request.model) ? { thinking: { type: "adaptive" as const } } : {}),
      /*
        EFFORT, where the model takes it: what the account's Models API says
        when it was read, otherwise the catalogue (lib/website-builder/ask-engines.ts,
        effortSupported). Ask Storelib always asks for "medium".
      */
      ...(request.effort && (modelInfo?.capabilities ? modelInfo.capabilities.effort?.[request.effort]?.supported : effortSupported(request.model)) ? { output_config: { effort: request.effort } } : {}),
    },
    { signal: request.signal },
  )

  const response = await stream.finalMessage()

  const toolCalls: ToolCall[] = []
  let text = ""

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text
    } else if (block.type === "tool_use") {
      /**
       * `input` arrives as a parsed object here, where the rest of this
       * codebase passes tool arguments around as JSON text and parses them
       * in one place. Re-serialised rather than special-cased so both
       * providers hand the executor the same thing.
       */
      toolCalls.push({
        id: block.id,
        name: block.name,
        argumentsJson: JSON.stringify(block.input ?? {}),
      })
    }
  }

  /**
   * A REFUSAL IS AN OUTCOME, NOT A FAILURE. It arrives with HTTP 200, and
   * reported as an error it would tell a creator their site failed to build
   * when in fact the model declined and nothing broke.
   */
  if (response.stop_reason === "refusal") {
    return {
      text: text || "I can't help with that.",
      toolCalls: [],
      raw: response.content,
      usage: readUsage(response.usage),
      stop: "refusal",
    }
  }

  return {
    text,
    toolCalls,
    raw: response.content,
    usage: readUsage(response.usage),
    stop:
      toolCalls.length > 0
        ? "tool_calls"
        : response.stop_reason === "max_tokens"
          ? "length"
          : "done",
  }
}

/**
 * What went wrong, in a sentence a creator can act on.
 *
 * The SDK's typed error classes, checked most specific first — never string
 * matching on a message, which breaks the first time the wording changes.
 * Returns null for anything that is not an Anthropic failure so the caller's
 * own handling still runs.
 */
export function describeAnthropicError(thrown: unknown): string | null {
  if (thrown instanceof MissingAnthropicKeyError) {
    return "Claude is not configured on this deployment: ANTHROPIC_API_KEY is not set."
  }
  if (thrown instanceof Anthropic.AuthenticationError) {
    return "Claude rejected the API key. It may have been revoked or rotated."
  }
  if (thrown instanceof Anthropic.RateLimitError) {
    return "Claude is rate limited right now. Wait a moment and try again. Nothing was lost."
  }
  if (thrown instanceof Anthropic.APIConnectionError) {
    return "Lost the connection to Claude. Anything already changed is still here."
  }
  if (thrown instanceof Anthropic.BadRequestError) {
    // Worth surfacing verbatim: this one is almost always OUR bug, and hiding
    // it behind a friendly sentence is how it stays unfixed.
    return `Claude refused the request: ${thrown.message}`
  }
  if (thrown instanceof Anthropic.APIError) {
    return `Claude returned an error (${thrown.status ?? "no status"}). Try again.`
  }
  return null
}
