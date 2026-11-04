/**
 * The agent, described without naming a vendor.
 *
 * Everything above the provider layer — the tool loop, the tool
 * implementations, the quota, the cost record, the route, the UI — speaks
 * only these types. A second provider is then one file implementing
 * `AgentProvider`, not a search-and-replace through the feature.
 *
 * That is not speculative generality: this repository has already replaced its
 * model provider once before a single request was sent, and the launch model
 * (`gpt-5.6-luna`) is chosen for price, which is the property most likely to
 * change under it.
 */

import type { AgentQuestion } from "./questions"

/** What the agent may do. A closed list — the bound is here, not in a prompt. */
export type AgentToolName =
  | "list_files"
  | "read_file"
  | "write_file"
  | "create_file"
  | "delete_file"
  | "run_build"
  | "read_build_errors"
  | "update_manifest"
  | "search_code"
  | "find_usages"
  | "replace_in_file"
  | "set_plan"
  | "complete_step"
  /**
   * Asking the creator something. In the same closed list as the rest
   * because it is a thing the agent DOES, and the bound on what it can do is
   * this union.
   */
  | "ask_creator"
  /**
   * The structured edits, on a site that has a canonical layout. They are in
   * the same closed list as the file tools on purpose: "the AI can edit your
   * website" has to mean something bounded, and the bound is one union rather
   * than two that can drift.
   */
  | "get_layout"
  | "add_section"
  | "update_section"
  | "move_section"
  | "remove_section"
  | "duplicate_section"
  | "update_theme"
  | "create_page"

/**
 * `Name` is a parameter, defaulting to this agent's closed union.
 *
 * The default is what keeps `TOOL_SPECS: ToolSpec[]` meaning exactly what it
 * meant — the sites agent's tool list stays closed, and the test that asserts
 * that still holds. The parameter exists because a SECOND agent (the theme
 * editor's, in lib/website-builder/agent) speaks the same provider protocol
 * with a completely different vocabulary, and the alternative was widening
 * this to `string` for everybody: giving up a real boundary to accommodate a
 * caller that is not inside it.
 */
export interface ToolSpec<Name extends string = AgentToolName> {
  name: Name
  description: string
  /** JSON Schema. `additionalProperties: false` + `required` on every one. */
  parameters: Record<string, unknown>
}

export interface ToolCall {
  /** The provider's id for this call, echoed back with the result. */
  id: string
  name: string
  /** Raw JSON text. Parsed by the executor, never string-matched. */
  argumentsJson: string
}

export interface ToolResult {
  id: string
  /** What the model sees. Errors are results, not exceptions — see run.ts. */
  output: string
}

import type { AgentImage } from "./attachments"

/**
 * One turn of the conversation, in the shape the loop keeps.
 *
 * `raw` carries the provider's own representation of an assistant turn so it
 * can be replayed verbatim. Providers are increasingly strict about getting
 * their own output back unchanged, and reconstructing it from our fields is
 * how a loop starts silently dropping reasoning or tool-call metadata.
 */
export type AgentTurn =
  /**
   * `images` are what the creator attached to THIS turn. They ride with the
   * text rather than being described in it, because a model that is told
   * about a picture and a model that is shown one write different sections.
   * Providers that cannot take an image say so; see `describeImages`.
   */
  | { role: "user"; content: string; images?: AgentImage[] }
  | { role: "assistant"; content: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: ToolResult[] }

/** Tokens exactly as the provider reported them. Never estimated here. */
export interface TokenUsage {
  /** TOTAL input, including the cached and cache-written subsets below. */
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

export interface ProviderTurn {
  /** Prose for the user. May be empty when the model only called tools. */
  text: string
  toolCalls: ToolCall[]
  /** The assistant turn as the provider represents it, for verbatim replay. */
  raw: unknown
  usage: TokenUsage
  /**
   * Why generation stopped. `refusal` is its own outcome and must not be
   * reported as a failure — the model declined, nothing broke, and telling a
   * creator their site failed to build would be false.
   */
  stop: "done" | "tool_calls" | "length" | "refusal"
}

export interface ProviderRequest {
  model: string
  system: string
  turns: AgentTurn[]
  /**
   * Widened here on purpose: a provider does not care whose vocabulary it is
   * relaying, and the request is where the two agents meet.
   */
  tools: ToolSpec<string>[]
  maxOutputTokens: number
  signal?: AbortSignal
  /**
   * WHICH CACHE THIS REQUEST BELONGS TO.
   *
   * Caching is on a stable prefix, and this run's prefix — the base rules, the
   * preservation rules, the project map, the tokens, the manifest — is several
   * thousand tokens that are identical on every turn and identical again on
   * the creator's NEXT request about the same site. A key tells the provider
   * those belong together, so the second prompt about a project starts warm
   * rather than paying for the same preamble again.
   *
   * A project identifier, never anything about the person. It is sent to a
   * third party and it exists only to group requests.
   */
  cacheKey?: string
  /**
   * How hard to think, where the provider has such a control.
   *
   * OpenAI's `reasoning.effort` (and Anthropic's `output_config.effort`) is
   * the difference between a considered multi-step edit and the first thing
   * that answers the sentence. The creator picks it in the chat as Strength:
   * Light, Standard or Deep are low, medium and high. Optional, and each
   * provider sends only what its models take (see `reasoningEffort` in
   * ./openai-provider), which is why it lives here rather than being
   * smuggled through the model id.
   */
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
  /**
   * CALLED ON EVERY STREAMED EVENT, where the provider streams. What lets a
   * caller tell a long answer from a call that stopped answering (the theme
   * agent's per call guard, lib/website-builder/agent/run-clock.ts), and say
   * which tool is being written while it is. Never throws into the provider:
   * a caller's mistake here is caught there. Optional; a provider that does
   * not stream simply never calls it.
   */
  onActivity?: (event: ProviderActivity) => void
}

/** One streamed event, as a caller of `complete` sees it: no content, only its shape. */
export interface ProviderActivity {
  kind: "start" | "thinking" | "text" | "tool"
  /** The tool whose call is being written, once its block starts. */
  tool?: string
  /** Characters of text or tool input this event carried. */
  chars?: number
}

export interface AgentProvider {
  /** Stable id recorded on every run: "openai", "anthropic", … */
  readonly id: string
  /** It calls `onActivity` while it answers (it streams): a caller may treat silence from it as a call that hung. */
  readonly streams?: boolean
  /** One round trip. The loop is in run.ts and is provider-independent. */
  complete(request: ProviderRequest): Promise<ProviderTurn>
}

/** What the client sees while a run is in flight, one JSON object per line. */
export type AgentEvent =
  /**
   * `versionId` is the snapshot taken before this run, and it is on the FIRST
   * event on purpose: Undo has to be offerable the moment a run starts
   * changing things, not only if it finishes cleanly. A run that half-succeeds
   * is exactly the one somebody wants to take back.
   */
  | { type: "started"; runId: string; versionId: string | null; model: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "files"; paths: string[] }
  | { type: "message"; text: string }
  | { type: "done"; runId: string; costUsd: number; turns: number; filesChanged: string[] }
  /**
   * WHERE THE RUN IS, in words the editor can show without interpreting.
   *
   * Deliberately a small closed set rather than free text: the panel renders
   * these, and a state nobody anticipated would render as nothing. This is
   * status, never reasoning — what the agent is DOING is useful to watch, what
   * it is thinking is not something to put on screen.
   */
  | {
      type: "state"
      state:
        | "inspecting"
        | "planning"
        | "executing"
        /** Stopped, with a question on screen, waiting for a person. */
        | "asking"
        | "verifying"
        | "repairing"
    }
  /**
   * The plan and its progress, re-sent whenever either changes. The whole list
   * each time rather than a delta — it is a dozen short strings, and a client
   * that missed one delta would show a checklist that never matches the run.
   */
  | { type: "plan"; steps: Array<{ title: string; done: boolean }> }
  /**
   * WHAT THE AGENT WANTS TO KNOW, and the run is stopped until it hears back.
   *
   * One at a time. The plural version of this event asked four things at once
   * and did not wait for any of them, which turned the questions into a
   * correction pass after the site was already built — see ./questions.
   */
  | { type: "question"; question: AgentQuestion }
  /**
   * How that question ended, so the card can settle into what was said and any
   * other tab watching the same run sees the same thing.
   *
   * `timeout` is not a skip: nobody was there, and the agent is told so.
   */
  | {
      type: "answered"
      questionId: string
      answer: string
      outcome: "answered" | "skipped" | "timeout"
    }
  | { type: "error"; message: string }
