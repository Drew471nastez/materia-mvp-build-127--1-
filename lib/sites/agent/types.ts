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

export interface ToolSpec {
  name: AgentToolName
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

/**
 * One turn of the conversation, in the shape the loop keeps.
 *
 * `raw` carries the provider's own representation of an assistant turn so it
 * can be replayed verbatim. Providers are increasingly strict about getting
 * their own output back unchanged, and reconstructing it from our fields is
 * how a loop starts silently dropping reasoning or tool-call metadata.
 */
export type AgentTurn =
  | { role: "user"; content: string }
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
  tools: ToolSpec[]
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
}

export interface AgentProvider {
  /** Stable id recorded on every run: "openai", "anthropic", … */
  readonly id: string
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
      state: "inspecting" | "planning" | "executing" | "verifying" | "repairing"
    }
  /**
   * The plan and its progress, re-sent whenever either changes. The whole list
   * each time rather than a delta — it is a dozen short strings, and a client
   * that missed one delta would show a checklist that never matches the run.
   */
  | { type: "plan"; steps: Array<{ title: string; done: boolean }> }
  | { type: "error"; message: string }
