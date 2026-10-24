/**
 * ===========================================================================
 *  A LONG RUN IS SHORTENED, NOT ENDED
 * ===========================================================================
 * A page built over thirty turns carries every section it read, every file it
 * wrote and every screenshot of the visual check in its conversation. Past
 * what the model takes, the provider refuses the turn and the run ended on
 * "The edit failed. Try again." with most of the work done and the rest lost.
 *
 * The page's state is never in the conversation alone: it is in `state` and
 * the sources, and the model re-reads what it needs with its tools. So the old
 * results can go. Each long one is replaced by a line saying what it was and
 * that it can be read again, and screenshots after the first message are
 * dropped. The structure is untouched (every tool call keeps its result), so
 * the conversation stays one the provider accepts.
 *
 * Done once the conversation is past a size (`THEME_TRANSCRIPT_BUDGET`), and
 * again whenever the provider says it no longer fits. Between those, it is
 * not rewritten, so the cached prefix is kept.
 */
import type { AgentTurn } from "@/lib/sites/agent/types"

/** Well inside every model's window: past this the old results go before the provider has to refuse. */
export const THEME_TRANSCRIPT_BUDGET = 420_000

/** The latest turns are the work in hand and are never shortened. */
export const KEEP_RECENT = 6

/** A result this short is a record of what happened, not a view of the page, and is worth its bytes. */
const KEEP_SHORT = 600

const ELIDED = "[shortened] "

export function transcriptSize(turns: AgentTurn[]): number {
  let total = 0
  for (const turn of turns) {
    if (turn.role === "tool") for (const r of turn.results) total += r.output.length
    else total += turn.content.length + (turn.role === "user" ? (turn.images?.length ?? 0) * 60_000 : 0)
  }
  return total
}

/**
 * The conversation with its old long results and old pictures taken out, and
 * how many bytes that saved. The first message (the request, the page and
 * the creator's own pictures) is always kept as it is.
 */
export function shortenTurns(turns: AgentTurn[], keepRecent = KEEP_RECENT): { turns: AgentTurn[]; saved: number } {
  const before = transcriptSize(turns)
  const cut = Math.max(1, turns.length - keepRecent)
  const next = turns.map((turn, i): AgentTurn => {
    if (i === 0 || i >= cut) return turn
    if (turn.role === "tool") {
      return {
        role: "tool",
        results: turn.results.map((r) =>
          r.output.length <= KEEP_SHORT || r.output.startsWith(ELIDED)
            ? r
            : { id: r.id, output: `${ELIDED}${r.output.slice(0, 160).replace(/\s+/g, " ")}... (an earlier result, taken out to keep this run short. What it showed may have changed since: read it again with the tools if you need it.)` },
        ),
      }
    }
    if (turn.role === "user" && turn.images?.length) {
      return { role: "user", content: `${turn.content}\n\n(The pictures that came with this message are no longer attached.)` }
    }
    return turn
  })
  return { turns: next, saved: before - transcriptSize(next) }
}
