/**
 * ===========================================================================
 *  ONE RUN'S CLOCK: WRITE EARLY, NEVER HANG, STOP WITH SOMETHING TO SHOW
 * ===========================================================================
 * "This edit ran out of time before it changed anything." came from a run
 * that spent its whole 255 seconds before a single write was kept. The route
 * gave the loop an AbortSignal and nothing else, so the loop could not tell
 * a minute left from a second left. Three things followed from that:
 *
 *   - the model was never told time was passing, so it read, planned and
 *     wrote a whole section file in one turn, which on a large file is most
 *     of the budget, and a compile refusal then asked for the whole file
 *     again;
 *   - one model call had no limit of its own: a stream that stopped sending
 *     sat there until the run's deadline aborted it, and the abort was then
 *     reported as the run's failure;
 *   - a turn cut off at the output limit was asked for again with twice the
 *     room, however little time was left.
 *
 * This module is the loop's view of time. Pure: no network, no timers kept.
 *
 *   firstWriteBy   the share of the run after which, with nothing written
 *                  yet, the model is told to make the smallest correct change
 *                  now and refine after (WRITE_NOW_NOTE)
 *   wrapUpAt       the share after which it is told to finish (TIME_UP_NOTE)
 *   minTurnMs      no turn starts with less than this left: it would be cut
 *   connectMs      a model call that has sent nothing at all by then is hung
 *   idleMs         one that sent something and then went quiet this long is
 *                  hung. Generous, because adaptive thinking streams an empty
 *                  block while it thinks
 *   retries        a hung call is asked again this many times, when time allows
 */

export interface ClockLimits {
  firstWriteBy: number
  wrapUpAt: number
  minTurnMs: number
  connectMs: number
  idleMs: number
  retries: number
  /** Below this share of the run left, a turn cut off at the output limit is not asked for again with more room. */
  regrowAt: number
  /** How often a long call says it is still working (the loop's `working` line). */
  keepAliveMs: number
}

export const CLOCK_LIMITS: ClockLimits = {
  firstWriteBy: 0.35,
  wrapUpAt: 0.8,
  minTurnMs: 20_000,
  connectMs: 45_000,
  idleMs: 120_000,
  retries: 1,
  regrowAt: 0.5,
  keepAliveMs: 8_000,
}

export class RunClock {
  readonly startedAt: number
  readonly deadlineAt: number
  readonly limits: ClockLimits
  private readonly now: () => number

  constructor(opts: { deadlineAt: number; startedAt?: number; now?: () => number; limits?: Partial<ClockLimits> }) {
    this.now = opts.now ?? Date.now
    this.startedAt = opts.startedAt ?? this.now()
    this.deadlineAt = opts.deadlineAt
    this.limits = { ...CLOCK_LIMITS, ...(opts.limits ?? {}) }
  }

  /** Milliseconds left before the loop must stop. */
  left(): number {
    return Math.max(0, this.deadlineAt - this.now())
  }

  elapsed(): number {
    return this.now() - this.startedAt
  }

  /** How much of the run is spent, 0 to 1. */
  spent(): number {
    const total = Math.max(1, this.deadlineAt - this.startedAt)
    return Math.min(1, Math.max(0, (this.now() - this.startedAt) / total))
  }

  /** Enough time for one more model turn. */
  roomForTurn(): boolean {
    return this.left() >= this.limits.minTurnMs
  }

  /** Nothing written yet, and the share of time by which something should be. */
  shouldWriteNow(workDone: boolean): boolean {
    return !workDone && this.spent() >= this.limits.firstWriteBy
  }

  shouldWrapUp(): boolean {
    return this.spent() >= this.limits.wrapUpAt
  }

  /** Whether a turn cut off at the output limit may be asked again with more room. */
  mayRegrow(): boolean {
    return 1 - this.spent() >= this.limits.regrowAt
  }
}

/** Told once, in the results the model reads next, when a third of the run is gone and nothing is changed. */
export const WRITE_NOW_NOTE =
  "NOTE FROM STORELIB ON TIME: a third of this run's time is gone and nothing is changed yet. Make the smallest correct change now, in this turn: update_section for a setting, or edit_section_code with exact find and replace for only the lines that change. Do not rewrite a whole file and do not read more first. Refine it after it is kept."

/** Told once when most of the run's time is gone. */
export const TIME_UP_NOTE =
  "NOTE FROM STORELIB ON TIME: this run is almost out of time. Finish the change you are making with one small edit so nothing is left half done, then reply with your one closing sentence. Anything left is picked up in the next part automatically."

/**
 * ONE MODEL CALL, WITH A LIMIT OF ITS OWN.
 *
 * Its signal ends at the first of: the caller's (the reader left), the run's
 * deadline, nothing heard from the provider for `connectMs` at the start, or
 * silence for `idleMs` after it began. `activity()` is what the provider
 * calls on every streamed event (ProviderRequest.onActivity).
 *
 * `why()` says which one ended it, so the loop can tell "ask again", "out of
 * time" and "cancelled" apart instead of reading every abort as a failure.
 */
export type CallEnd = "caller" | "deadline" | "hung" | null

export interface CallGuard {
  signal: AbortSignal
  activity: () => void
  why: () => CallEnd
  done: () => void
}

export function guardCall(opts: { caller?: AbortSignal; deadlineMs: number | null; connectMs: number; idleMs: number; watch: boolean }): CallGuard {
  const ctl = new AbortController()
  let ended: CallEnd = null
  const end = (why: Exclude<CallEnd, null>) => {
    if (ended) return
    ended = why
    ctl.abort(new DOMException(why === "caller" ? "Aborted" : why === "deadline" ? "The run is out of time" : "The model stopped answering", "AbortError"))
  }
  /* Kept referenced: a timer that ends a call must still fire when nothing else holds the process open. */
  const deadline = opts.deadlineMs === null ? null : setTimeout(() => end("deadline"), Math.max(0, opts.deadlineMs))
  /* Silence is a hang only from a provider that streams: one that answers in one piece is silent until it answers. */
  let idle: ReturnType<typeof setTimeout> | null = opts.watch ? setTimeout(() => end("hung"), opts.connectMs) : null
  const onCaller = () => end("caller")
  if (opts.caller?.aborted) end("caller")
  else opts.caller?.addEventListener("abort", onCaller, { once: true })
  return {
    signal: ctl.signal,
    activity() {
      if (ended || !opts.watch) return
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => end("hung"), opts.idleMs)
    },
    why: () => ended,
    done() {
      if (deadline) clearTimeout(deadline)
      if (idle) clearTimeout(idle)
      opts.caller?.removeEventListener("abort", onCaller)
    },
  }
}

/**
 * ===========================================================================
 *  A PART THAT RAN OUT OF TIME, KEPT FOR THE NEXT ONE
 * ===========================================================================
 * A run the clock stopped before it changed anything used to end with an
 * error and nothing to carry on from. Now it ends with this: what it was
 * asked, what it decided, what it read and the last draft it wrote, with the
 * reason the draft was refused. The browser holds it, keyed to the run, and
 * sends it back with the automatic next part (theme-chat CONTINUE_PROMPT),
 * where it is the first thing the model reads.
 *
 * Context for the model, never applied: a draft in it is code the next part
 * still has to write through edit_section_code and every check, so a
 * checkpoint somebody edits in their own browser can do nothing a typed
 * message could not.
 */
export interface RunCheckpoint {
  v: 1
  /** The run this continues: the first part's id, the same for every part after it. */
  runId: string
  /** Which part comes next: 2 for the first continuation. */
  part: number
  /** The request as the creator typed it, before "Continue" replaced it. */
  prompt: string
  /** The model's own plan, when it said one. */
  plan?: string
  /** What the target decision was (./targeting.ts), as one line. */
  target?: string
  /** What the model had read, by tool and target: so the next part does not read it all again first. */
  read: string[]
  /** The last code it wrote that did not pass, with the first thing wrong: the next part fixes that with an edit. */
  draft?: { path: string; source: string; problem: string }
}

export const CHECKPOINT_MAX_SOURCE = 60_000
export const CHECKPOINT_MAX_PROMPT = 8_000

/** The checkpoint as the model reads it at the start of the next part. */
export function describeCheckpoint(cp: RunCheckpoint): string {
  const lines = [
    `THIS CONTINUES A RUN THAT RAN OUT OF TIME BEFORE ANYTHING WAS KEPT (part ${cp.part}). Nothing from the earlier part is on the page. Its request was:\n${cp.prompt}`,
    cp.target ? `What it was going to change: ${cp.target}` : "",
    cp.plan ? `Its plan:\n${cp.plan}` : "",
    cp.read.length ? `It had already read: ${cp.read.join(", ")}. What you need of those is in this message or the page above; read again only what you must.` : "",
    cp.draft
      ? `Its last draft of ${cp.draft.path} did not pass its checks: ${cp.draft.problem}\nThat draft, for reference (not saved):\n${cp.draft.source}`
      : "",
    "WORK ORDER FOR THIS PART: make the smallest correct change first, in your first turn (update_section, or edit_section_code with exact find and replace), so something is kept, then refine. Never rewrite a whole large file.",
  ]
  return lines.filter(Boolean).join("\n\n")
}
