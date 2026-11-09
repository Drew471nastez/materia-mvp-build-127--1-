/**
 * ===========================================================================
 *  THE TRANSCRIPT, KEPT SMALL ENOUGH TO SAVE AND TO RESUME FROM
 * ===========================================================================
 * Two transcripts:
 *
 *   LIVE      the provider's turns inside one invocation, raw blocks and
 *             all, so the provider replays its own output verbatim (thinking
 *             blocks, tool call ids). When it grows past LIVE_BYTES the
 *             OUTPUTS of old tool results are rewritten to one line (never
 *             the turns themselves: a tool call with no result is a broken
 *             conversation, lib/sites/agent/compaction.ts explains why), once
 *             per threshold so the cached prefix stays stable in between.
 *
 *   SAVED     the checkpoint (AgentCheckpoint.turns): provider neutral,
 *             no raw blocks, file bodies never kept (they are in the
 *             database; a write's `content` becomes "<N bytes>"), old tool
 *             results one line each, and when it is still over the bound the
 *             oldest turns are folded into `summary`. Always under
 *             MAX_CHECKPOINT_BYTES.
 *
 * A new invocation does not replay the saved turns as provider turns (their
 * raw blocks are gone and a tool result must answer a tool call the provider
 * made): it starts one user turn holding the brief and a digest of the work
 * so far. Deterministic: the same checkpoint gives the same turn.
 */
import type { AgentTurn, ToolCall } from "@/lib/sites/agent/types"
import { MAX_CHECKPOINT_BYTES, type CheckpointTurn } from "../types"
import type { LoopCheckpoint } from "./state"

/** Live transcript size that triggers rewriting old tool outputs. */
export const LIVE_BYTES = 180_000
/** Turns at the end that keep their tool outputs whole. */
const KEEP_RECENT = 8
/** What a saved tool result keeps, recent and old. */
const SAVED_RESULT_CHARS = 3_000
const OLD_RESULT_CHARS = 200
/** The saved transcript is compacted to this before it is checked against the hard bound. */
const SAVED_TARGET = Math.floor(MAX_CHECKPOINT_BYTES * 0.7)

const BIG_ARGS = new Set(["content", "new", "old"])

/** A tool call's arguments with file bodies replaced by their size. */
export function compactArgs(argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson) as Record<string, unknown>
    if (!args || typeof args !== "object") return argumentsJson.slice(0, 600)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(args)) {
      if (BIG_ARGS.has(k) && typeof v === "string" && v.length > 300) out[k] = `<${Buffer.byteLength(v)} bytes, saved in the file>`
      else if (k === "manifest" && v && typeof v === "object") out[k] = `<manifest of ${(v as { type?: string }).type ?? "a component"}>`
      else if (k === "sections" && Array.isArray(v)) out[k] = v.map((s) => ({ id: (s as { id?: string }).id, type: (s as { type?: string }).type, group: (s as { group?: string }).group }))
      else out[k] = v
    }
    const text = JSON.stringify(out)
    return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text
  } catch {
    return argumentsJson.slice(0, 600)
  }
}

/** One line about a tool result, for old turns. */
export function oneLine(output: string, max = OLD_RESULT_CHARS): string {
  const flat = output.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}… [${output.length} chars, shortened]` : flat
}

/** Live provider turns as saved turns. */
export function toCheckpointTurns(turns: AgentTurn[]): CheckpointTurn[] {
  const out: CheckpointTurn[] = []
  for (const t of turns) {
    if (t.role === "user") out.push({ role: "user", text: t.content.slice(0, 20_000) })
    else if (t.role === "assistant") out.push({ role: "assistant", text: t.content.slice(0, 4_000), ...(t.toolCalls.length ? { toolCalls: t.toolCalls.map((c: ToolCall) => ({ id: c.id, name: c.name, argumentsJson: compactArgs(c.argumentsJson) })) } : {}) })
    else for (const r of t.results) out.push({ role: "tool", toolCallId: r.id, text: r.output.length > SAVED_RESULT_CHARS ? `${r.output.slice(0, SAVED_RESULT_CHARS)}… [shortened]` : r.output })
  }
  return out
}

const sizeOf = (v: unknown) => Buffer.byteLength(JSON.stringify(v))

/**
 * The checkpoint within its bound. The first turn (the brief) always stays;
 * then old tool results shrink to one line; then the oldest turns fold into
 * `summary`, a line each, oldest lines dropped first.
 */
export function compactCheckpoint(cp: LoopCheckpoint): LoopCheckpoint {
  let turns = cp.turns.map((t) => ({ ...t }))
  let summary = cp.summary
  if (sizeOf({ ...cp, turns }) > SAVED_TARGET) {
    const cut = Math.max(1, turns.length - KEEP_RECENT * 2)
    turns = turns.map((t, i) => (i > 0 && i < cut && t.role === "tool" && t.text ? { ...t, text: oneLine(t.text) } : t))
  }
  while (sizeOf({ ...cp, turns, summary }) > SAVED_TARGET && turns.length > 2) {
    const fold = turns.splice(1, Math.max(1, Math.floor((turns.length - 1) / 4)))
    const lines = fold.map(describeTurn).filter(Boolean)
    summary = `${summary}\n${lines.join("\n")}`.trim()
    if (summary.length > 40_000) summary = `…${summary.slice(-40_000)}`
  }
  if (turns[0]?.text && sizeOf({ ...cp, turns, summary }) > MAX_CHECKPOINT_BYTES) turns[0] = { ...turns[0], text: turns[0].text.slice(0, 8_000) }
  if (sizeOf({ ...cp, turns, summary }) > MAX_CHECKPOINT_BYTES) summary = summary.slice(-8_000)
  return { ...cp, turns, summary }
}

function describeTurn(t: CheckpointTurn): string {
  if (t.role === "assistant") return [t.text ? `you: ${oneLine(t.text, 160)}` : "", ...(t.toolCalls ?? []).map((c) => `you called ${c.name} ${oneLine(c.argumentsJson, 160)}`)].filter(Boolean).join("\n")
  if (t.role === "tool") return `  → ${oneLine(t.text ?? "", 160)}`
  return t.text ? `note: ${oneLine(t.text, 160)}` : ""
}

/** The digest of saved work a resumed invocation starts from. */
export function digest(cp: LoopCheckpoint, maxChars = 60_000): string {
  const rest = cp.turns.slice(1)
  const lines = [cp.summary ? `EARLIER (summarised):\n${cp.summary}` : "", rest.length ? `RECENT:\n${rest.map(describeFull).join("\n")}` : ""].filter(Boolean).join("\n\n")
  return lines.length > maxChars ? `…${lines.slice(-maxChars)}` : lines
}

function describeFull(t: CheckpointTurn): string {
  if (t.role === "assistant") return [t.text ? `you: ${t.text.slice(0, 800)}` : "", ...(t.toolCalls ?? []).map((c) => `you called ${c.name} ${c.argumentsJson.slice(0, 600)}`)].filter(Boolean).join("\n")
  if (t.role === "tool") return `  → ${(t.text ?? "").slice(0, 1_200)}`
  return `note: ${(t.text ?? "").slice(0, 800)}`
}

/** The provider turns a slice starts from. */
export function resumeTurns(cp: LoopCheckpoint): AgentTurn[] {
  const brief = cp.turns[0]?.text ?? ""
  if (cp.turns.length <= 1 && !cp.summary) return [{ role: "user", content: brief }]
  const state = [
    cp.concept ? `CONCEPT (accepted): ${JSON.stringify(cp.concept)}` : "",
    cp.openTasks.length ? `PLAN: ${cp.openTasks.join(" | ")}` : "",
    cp.filesTouched.length ? `FILES YOU WROTE: ${cp.filesTouched.join(", ")} (current text is in the database: read_file before editing)` : "",
    cp.pagesTouched.length ? `PAGES YOU CHANGED: ${cp.pagesTouched.join(", ")}` : "",
    `PHASE: ${cp.phase}, iteration ${cp.iteration}.`,
  ].filter(Boolean)
  return [{ role: "user", content: `${brief}\n\n---\nTHIS JOB IS RESUMING (a new invocation). What you did so far:\n${state.join("\n")}\n\n${digest(cp)}\n\nCarry on from here.` }]
}

/** Live transcript: old tool outputs rewritten to one line when over LIVE_BYTES. Returns the same array when nothing changed. */
export function compactLive(turns: AgentTurn[], maxBytes = LIVE_BYTES): AgentTurn[] {
  if (sizeOf(turns) <= maxBytes) return turns
  const cut = Math.max(1, turns.length - KEEP_RECENT)
  return turns.map((t, i) => (i < cut && t.role === "tool" ? { role: "tool", results: t.results.map((r) => ({ id: r.id, output: r.output.startsWith("[old result]") ? r.output : `[old result] ${oneLine(r.output)}` })) } : t))
}
