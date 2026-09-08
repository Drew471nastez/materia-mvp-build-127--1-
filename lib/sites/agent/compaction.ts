/**
 * Keeping a long run inside a context window, and inside a budget.
 *
 * ---------------------------------------------------------------------------
 *  WHAT A FORTY-TURN RUN ACTUALLY COSTS
 * ---------------------------------------------------------------------------
 * Every turn resends the whole conversation, and the conversation is mostly
 * file contents: a `read_file` result is the file. So the cost of a run is not
 * the project — it is the project multiplied by however many turns come after
 * each read. Measured on a real loop with a scripted model, reading a
 * 289KB project across forty turns:
 *
 *     total sent           4,486,800 bytes  (~1.12M input tokens)
 *     final request          272,372 bytes  (~68k tokens in one call)
 *     project resent            15.5x
 *
 * On the strong model that is over two dollars for one edit, on a product
 * whose whole free tier is meant to cost cents. And the 68k final request is
 * the number that eventually stops being expensive and starts being fatal:
 * a slightly larger project simply does not fit, and the run dies at turn
 * thirty having done most of the work.
 *
 * ---------------------------------------------------------------------------
 *  THE PART THAT IS NOT ABOUT MONEY
 * ---------------------------------------------------------------------------
 * A file read at turn three and rewritten at turn five is still in the
 * transcript at turn thirty, in its ORIGINAL form, indistinguishable from
 * current. The model is looking at two versions of the same file and nothing
 * says which one the project has. That is how an agent "restores" a change it
 * already made, or edits against text that is no longer there.
 *
 * So the first thing evicted is never the oldest — it is the stale.
 *
 * ---------------------------------------------------------------------------
 *  WHY RESULTS ARE REWRITTEN AND TURNS ARE NEVER REMOVED
 * ---------------------------------------------------------------------------
 * The provider replays assistant turns verbatim from `raw`, and every tool
 * result has to answer a `call_id` that appears in one of them. Dropping a
 * turn — or dropping one result out of a turn — leaves a function call with no
 * output, which is a malformed conversation rather than a shorter one.
 *
 * Only the `output` STRING is replaced, so the structure is untouched and the
 * call ids still line up. What is left behind says what was there and how to
 * get it back, because a hole the model cannot act on is worse than the bytes
 * it saved.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS DOES NOT RUN EVERY TURN
 * ---------------------------------------------------------------------------
 * Providers cache on a stable prefix. Rewriting the transcript on every turn
 * changes the prefix on every turn, so nothing is ever cached and the "saving"
 * costs more than it saves. Compaction is therefore triggered by a byte
 * budget, applied ONCE and permanently — the loop keeps the compacted array —
 * and is idempotent, so between compactions the prefix is byte-identical and
 * caches normally. A run that stays under budget is never rewritten at all,
 * which is most of them.
 */

import type { AgentTurn } from "./types"

/**
 * What produced a tool result.
 *
 * Recorded by the loop as calls go out, rather than recovered by reading the
 * result text. Result text is model-facing prose that gets reworded; a
 * compactor that string-matches it silently stops recognising anything the day
 * somebody improves a message.
 */
export interface CallInfo {
  name: string
  /** The `path` argument, when the call had one. */
  path: string
}

/**
 * Roughly 30k tokens of conversation before anything is dropped.
 *
 * Chosen so that ordinary runs — a handful of reads, an edit, a build — are
 * never touched and cache perfectly. It is a long way below any model's window
 * on purpose: the point is to keep the run cheap and the model's attention on
 * what is current, not to survive at the very edge of what fits.
 */
export const TRANSCRIPT_BUDGET_BYTES = 120_000

/** The most recent tool turns are never compacted — that is the working set. */
export const KEEP_RECENT_TURNS = 4

/** Marks a result as already compacted, so a second pass is a no-op. */
const ELIDED = "[elided] "

/**
 * Results that are the RECORD OF WHAT HAPPENED rather than a view of the
 * project. Short, and the only durable evidence of decisions and unfinished
 * work in the transcript — evicting these to save two hundred bytes would
 * remove exactly what the recap exists to preserve.
 */
const NEVER_ELIDE = new Set([
  "set_plan",
  "complete_step",
  "update_manifest",
  "write_file",
  "create_file",
  "delete_file",
  "replace_in_file",
])

/** Cheap and consistent: what the provider will serialise, near enough. */
export function transcriptBytes(turns: AgentTurn[]): number {
  let total = 0
  for (const turn of turns) {
    if (turn.role === "tool") {
      for (const result of turn.results) total += result.output.length + result.id.length
    } else if (turn.role === "user") {
      total += turn.content.length
    } else {
      total += turn.content.length
      if (turn.raw !== undefined) total += JSON.stringify(turn.raw)?.length ?? 0
    }
  }
  return total
}

export interface CompactionOutcome {
  turns: AgentTurn[]
  /** True when anything was actually rewritten. */
  compacted: boolean
  /** File contents removed because they no longer matched the project. */
  stalePaths: string[]
  /** File contents removed only to make room. Still accurate; just absent. */
  droppedPaths: string[]
  bytesBefore: number
  bytesAfter: number
}

interface Candidate {
  /** Index into `turns`, and into that turn's results. */
  turn: number
  result: number
  info: CallInfo
  bytes: number
  /** Lower goes first. */
  priority: number
  reason: "stale" | "duplicate" | "superseded" | "room"
}

export interface CompactionInput {
  turns: AgentTurn[]
  calls: Map<string, CallInfo>
  budgetBytes?: number
  keepRecentTurns?: number
}

/**
 * Bring the transcript under budget, worst content first.
 *
 * "Worst" is not "oldest". A read whose file has since been rewritten is
 * actively misleading and goes first however recent it is; a build result that
 * a later build replaced is pure noise; only after those does age decide.
 */
export function compactTurns(input: CompactionInput): CompactionOutcome {
  const turns = input.turns
  const budget = input.budgetBytes ?? TRANSCRIPT_BUDGET_BYTES
  const keepRecent = input.keepRecentTurns ?? KEEP_RECENT_TURNS

  const bytesBefore = transcriptBytes(turns)
  if (bytesBefore <= budget) {
    return {
      turns,
      compacted: false,
      stalePaths: [],
      droppedPaths: [],
      bytesBefore,
      bytesAfter: bytesBefore,
    }
  }

  /**
   * The index of the earliest turn that is off limits.
   *
   * Counted in TOOL turns rather than turns, because the recent working set is
   * about tool output — an assistant turn between two of them does not make
   * the older one safe to drop.
   */
  let protectedFrom = turns.length
  if (keepRecent > 0) {
    let seenToolTurns = 0
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role !== "tool") continue
      seenToolTurns++
      protectedFrom = i
      if (seenToolTurns >= keepRecent) break
    }
  }

  /**
   * When each path was last written, and last read, so a read can be compared
   * against what happened after it. Built in one forward pass.
   */
  const lastWriteAt = new Map<string, number>()
  const lastReadAt = new Map<string, number>()
  let lastBuildAt = -1
  let lastListAt = -1

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    if (turn.role !== "tool") continue
    for (const result of turn.results) {
      const info = input.calls.get(result.id)
      if (!info) continue
      if (info.name === "read_file" && info.path) lastReadAt.set(info.path, i)
      else if (info.path && NEVER_ELIDE.has(info.name)) lastWriteAt.set(info.path, i)
      else if (info.name === "run_build" || info.name === "read_build_errors") lastBuildAt = i
      else if (info.name === "list_files") lastListAt = i
    }
  }

  const candidates: Candidate[] = []

  for (let i = 0; i < protectedFrom; i++) {
    const turn = turns[i]
    if (turn.role !== "tool") continue

    for (let r = 0; r < turn.results.length; r++) {
      const result = turn.results[r]
      if (result.output.startsWith(ELIDED)) continue

      const info = input.calls.get(result.id)
      if (!info || NEVER_ELIDE.has(info.name)) continue

      const bytes = result.output.length
      // Not worth the loss of fidelity, and rewriting it would still move the
      // cache prefix.
      if (bytes < 400) continue

      const base = { turn: i, result: r, info, bytes }

      if (info.name === "read_file" && info.path) {
        const written = lastWriteAt.get(info.path)
        if (written !== undefined && written > i) {
          candidates.push({ ...base, priority: 0, reason: "stale" })
          continue
        }
        if ((lastReadAt.get(info.path) ?? -1) > i) {
          candidates.push({ ...base, priority: 1, reason: "duplicate" })
          continue
        }
        candidates.push({ ...base, priority: 4, reason: "room" })
        continue
      }

      if (info.name === "run_build" || info.name === "read_build_errors") {
        // The most recent build is the project's current verdict and stays.
        if (i < lastBuildAt) candidates.push({ ...base, priority: 2, reason: "superseded" })
        continue
      }

      if (info.name === "list_files") {
        if (i < lastListAt) candidates.push({ ...base, priority: 2, reason: "superseded" })
        continue
      }

      // search_code and anything added later: old, bulky, reproducible.
      candidates.push({ ...base, priority: 3, reason: "room" })
    }
  }

  // Priority first; within a priority the biggest saving, so the fewest
  // results are touched and the prefix moves as little as possible.
  candidates.sort((a, b) => a.priority - b.priority || b.bytes - a.bytes || a.turn - b.turn)

  const next = turns.map((turn) =>
    turn.role === "tool" ? { ...turn, results: turn.results.map((r) => ({ ...r })) } : turn,
  )

  const stalePaths: string[] = []
  const droppedPaths: string[] = []
  let bytes = bytesBefore

  for (const candidate of candidates) {
    if (bytes <= budget) break

    const turn = next[candidate.turn]
    if (turn.role !== "tool") continue
    const result = turn.results[candidate.result]

    const stub = ELIDED + stubFor(candidate)
    bytes -= result.output.length - stub.length
    result.output = stub

    if (candidate.info.path) {
      if (candidate.reason === "stale") stalePaths.push(candidate.info.path)
      else if (candidate.info.name === "read_file") droppedPaths.push(candidate.info.path)
    }
  }

  const bytesAfter = transcriptBytes(next)

  return {
    turns: next,
    compacted: bytesAfter < bytesBefore,
    stalePaths,
    droppedPaths,
    bytesBefore,
    bytesAfter,
  }
}

/**
 * What is left where the content was.
 *
 * Every one of these tells the model the two things it needs: whether what was
 * removed was still TRUE, and how to get it back. A stub that only says
 * "removed" turns a saving into a model guessing at a file it can no longer
 * see.
 */
function stubFor(candidate: Candidate): string {
  const { info, reason } = candidate
  switch (reason) {
    case "stale":
      return `${info.path} was read here, and has been CHANGED since — this copy was out of date, so it has been removed rather than left to be read as current. Call read_file if you need the file as it now stands.`
    case "duplicate":
      return `${info.path} was read here, and read again later in this run. The later copy is the one to use.`
    case "superseded":
      return `An earlier ${info.name} result, replaced by a later one further down.`
    case "room":
    default:
      return info.name === "read_file"
        ? `${info.path} was read here. Removed to keep this conversation within its budget — nothing about the file has changed since. Call read_file if you need it again.`
        : `An earlier ${info.name} result, removed to keep this conversation within its budget. Run it again if you need it.`
  }
}

/**
 * The turn that goes in after a compaction.
 *
 * DECISIONS, ARCHITECTURE, ERRORS AND UNFINISHED WORK, restated from state
 * that is known to be true rather than summarised by a second model call. A
 * summariser is one more thing that can quietly be wrong, and it would be
 * wrong about precisely the run it was summoned to rescue.
 */
export function compactionNote(input: {
  outcome: CompactionOutcome
  planSteps: Array<{ title: string; done: boolean }>
  changed: string[]
  deleted: string[]
  buildOk: boolean | null
}): string {
  const lines: string[] = [
    "SOME OF THIS CONVERSATION HAS BEEN COMPACTED to keep it within its budget. Older file contents and older build output have been replaced with a note saying so. Nothing about the project itself changed. Where you need a file, read it again — it is the project that is authoritative, not this transcript.",
  ]

  if (input.outcome.stalePaths.length > 0) {
    lines.push(
      `These were showing you OUT OF DATE contents and were removed for that reason: ${unique(
        input.outcome.stalePaths,
      ).join(", ")}. Re-read any of them before you edit it.`,
    )
  }

  if (input.changed.length > 0 || input.deleted.length > 0) {
    const parts: string[] = []
    if (input.changed.length > 0) parts.push(`written: ${unique(input.changed).join(", ")}`)
    if (input.deleted.length > 0) parts.push(`deleted: ${unique(input.deleted).join(", ")}`)
    lines.push(`WHAT YOU HAVE DONE SO FAR — ${parts.join("; ")}.`)
  } else {
    lines.push("YOU HAVE NOT CHANGED ANY FILE YET.")
  }

  const open = input.planSteps.filter((s) => !s.done)
  if (input.planSteps.length > 0) {
    lines.push(
      open.length === 0
        ? "YOUR PLAN is complete — every step is marked done."
        : `STILL TO DO:\n${open.map((s) => `  - ${s.title}`).join("\n")}`,
    )
  }

  lines.push(
    input.buildOk === null
      ? "You have not built yet. Call run_build before you finish."
      : input.buildOk
        ? "The last build passed."
        : "THE LAST BUILD FAILED. Fix it and build again before you finish.",
  )

  return lines.join("\n\n")
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
