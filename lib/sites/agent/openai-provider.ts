import "server-only"

/**
 * The OpenAI provider.
 *
 * `server-only` at the top is the mechanism, not a note: the key lives in
 * `OPENAI_API_KEY`, and this import makes a build FAIL if any client component
 * ever pulls this module in. The alternative — remembering not to — is the
 * thing that eventually gets forgotten, and the failure mode is a key shipped
 * in a JavaScript bundle to every visitor.
 *
 * Nothing here reaches a generated site either. The agent runs here, the
 * browser sends a sentence and receives file changes, and a published site is
 * static output with no credentials of any kind in it.
 *
 * Responses API (`/v1/responses`), which is what gpt-5.6-luna and
 * gpt-5.6-terra speak.
 */

import OpenAI from "openai"

import { rateFor } from "./models"
import type {
  AgentProvider,
  AgentTurn,
  ProviderRequest,
  ProviderTurn,
  ToolCall,
  TokenUsage,
} from "./types"

let client: OpenAI | null = null

function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    // Thrown rather than defaulted. A provider with no key that returns a
    // polite empty answer is indistinguishable from a model with nothing to
    // say, and the route turns this into one clear sentence for the user.
    if (!apiKey) throw new MissingKeyError()
    client = new OpenAI({ apiKey })
  }
  return client
}

export class MissingKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set")
    this.name = "MissingKeyError"
  }
}

/**
 * Our turns, in the Responses API's `input` shape.
 *
 * An assistant turn is replayed from `raw` — the provider's own items —
 * whenever we have it. Rebuilding one from our own fields drops whatever the
 * provider put there that we do not model, and tool-call metadata is exactly
 * the sort of thing that goes missing that way.
 */
export function toInput(turns: AgentTurn[]): OpenAI.Responses.ResponseInputItem[] {
  const input: OpenAI.Responses.ResponseInputItem[] = []

  for (const turn of turns) {
    if (turn.role === "user") {
      /** The same picture-then-words order as the other provider. */
      input.push(
        turn.images?.length
          ? {
              role: "user",
              content: [
                ...turn.images.map((image) => ({
                  type: "input_image" as const,
                  image_url: `data:${image.mediaType};base64,${image.data}`,
                  detail: "high" as const,
                })),
                { type: "input_text" as const, text: turn.content },
              ],
            }
          : { role: "user", content: turn.content },
      )
      continue
    }

    if (turn.role === "assistant") {
      if (Array.isArray(turn.raw)) {
        input.push(...(turn.raw as OpenAI.Responses.ResponseInputItem[]))
      } else if (turn.content) {
        input.push({ role: "assistant", content: turn.content })
      }
      continue
    }

    for (const result of turn.results) {
      input.push({
        type: "function_call_output",
        call_id: result.id,
        output: result.output,
      })
    }
  }

  return input
}

function readUsage(usage: OpenAI.Responses.ResponseUsage | undefined): TokenUsage {
  const details = usage?.input_tokens_details as
    | { cached_tokens?: number; cache_write_tokens?: number }
    | undefined
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  }
}

/**
 * THE SAME PROVIDER ON SOMEBODY ELSE'S ACCOUNT: a creator's own OpenAI key,
 * or their OpenRouter account through its Responses endpoint, where the
 * model carries a vendor prefix on the wire only (see the Anthropic one).
 */
export function createOpenAIProvider(client: () => OpenAI, options: { id?: string; modelPrefix?: string } = {}): AgentProvider {
  const prefix = options.modelPrefix ?? ""
  return {
    id: options.id ?? "openai",
    complete: (request) => completeWith(client, prefix, request),
  }
}

/** An OpenAI client on a key that is not Storelib's. */
export function openAIClientFor(key: string, via: "openai" | "openrouter"): OpenAI {
  return via === "openrouter"
    ? new OpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1", maxRetries: 1, defaultHeaders: { "HTTP-Referer": "https://storelib.com", "X-Title": "Storelib" } })
    : new OpenAI({ apiKey: key, maxRetries: 1 })
}

export const openAIProvider: AgentProvider = createOpenAIProvider(openai)

async function completeWith(client: () => OpenAI, prefix: string, request: ProviderRequest): Promise<ProviderTurn> {
  const rate = rateFor(request.model)

  const response = await client().responses.create(
    {
      model: prefix + request.model,
      instructions: request.system,
      input: toInput(request.turns),
      tools: request.tools.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        // The tool arguments have to parse and have to have the fields the
        // executor reads. Without this, a malformed call becomes a wasted
        // turn and a confusing error rather than a schema violation the
        // provider prevents.
        strict: true,
      })),
      max_output_tokens: Math.min(
        request.maxOutputTokens,
        rate?.maxOutputTokens ?? request.maxOutputTokens,
      ),
      /**
       * Sent only when the caller supplied one. `prompt_cache_key: null` is
       * not the same as absent in every provider, and an empty string would
       * group every project in the system under one key — the opposite of
       * what this is for.
       */
      ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
    },
    { signal: request.signal },
  )

  const toolCalls: ToolCall[] = []
  let text = ""

  for (const item of response.output) {
    if (item.type === "function_call") {
      toolCalls.push({ id: item.call_id, name: item.name, argumentsJson: item.arguments })
    } else if (item.type === "message") {
      for (const block of item.content) {
        if (block.type === "output_text") text += block.text
        // A refusal arrives as content, with HTTP 200. Read as prose it
        // would look like an ordinary answer; the stop below is what keeps
        // it from being recorded as a successful edit.
        else if (block.type === "refusal") text += block.refusal
      }
    }
  }

  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((block) => block.type === "refusal"),
  )

  return {
    text,
    toolCalls,
    raw: response.output,
    usage: readUsage(response.usage),
    stop: refused
      ? "refusal"
      : toolCalls.length > 0
        ? "tool_calls"
        : response.incomplete_details?.reason === "max_output_tokens"
          ? "length"
          : "done",
  }
}
