/**
 * ===========================================================================
 *  ONE UNDO STEP FOR A RUN OF EDITS, AND IT IS WHAT CAME BEFORE THE RUN
 * ===========================================================================
 * Typing into a field changes the page on every keystroke, and thirty
 * keystrokes should be one step in the history, not thirty. The builder used
 * to wait for the typing to stop and then take the step, which recorded the
 * page AFTER the edit: Undo put back what was already on screen and did
 * nothing, and the next Undo jumped past the edit.
 *
 * So the step is taken on the first edit of a run, before anything changes
 * (every caller asks for it first), and later edits in the same run take
 * none. A run ends after `quietMs` without an edit, or at once when the
 * history itself moves (an Undo, a Redo, a page change), so the next edit is
 * a step of its own.
 *
 * ---------------------------------------------------------------------------
 *  AN ASSISTANT'S RUN IS ONE STEP, HOWEVER FAR APART ITS CHANGES ARRIVE
 * ---------------------------------------------------------------------------
 * Storelib AI builds a landing page as thirty operations streamed over a
 * minute, seconds apart while the model thinks. Half a second of quiet ended
 * the run each time, so one request filled the history with a step per
 * model turn, and Undo took the page back one turn at a time. The editor
 * takes the run's step itself when the run starts (startAiRun), then
 * `hold()`s: the assistant's edits (`aiStep`) record nothing until
 * `release()`, the history moving (`end`), or `holdMs` as a backstop for a
 * run whose end was never heard. A person's own edits (`step`) are never
 * held: what they do by hand during a run is a step of its own.
 *
 * ---------------------------------------------------------------------------
 *  THE SAME THING, OR A STEP OF ITS OWN (round 34)
 * ---------------------------------------------------------------------------
 * A run was any edits less than half a second apart, so a heading typed and
 * then a colour picked straight after were one step, and Undo took back
 * both. An edit can say what it edits (`step(key)`: the setting, of which
 * section or block); an edit of another thing starts a step of its own,
 * while forty keys in one field, or a colour dragged around its square, stay
 * one. An edit that names nothing joins whatever run is open, as before.
 */
export interface UndoRun {
  /**
   * Call before an edit changes anything. Records a step when this edit
   * starts a run: after `quietMs` without an edit, or when `key` names
   * another thing than the run's (see THE SAME THING, below).
   */
  step: (key?: string) => void
  /** The run is over: the next edit records a step. Also ends a hold. */
  end: () => void
  /** The run of edits is over (a step of its own was just taken); a hold stays. */
  cut: () => void
  /** The assistant's run has recorded its step: its edits record nothing until release. */
  hold: () => void
  release: () => void
  /** Call before one of the assistant's edits: nothing while held, `step` otherwise. */
  aiStep: () => void
  /** Whether an assistant's run is holding the step. */
  held: () => boolean
}

/** Ten minutes: longer than any run the platform lets finish. */
export const AI_HOLD_MS = 10 * 60_000

export function createUndoRun(record: () => void, quietMs = 500, holdMs = AI_HOLD_MS, now: () => number = () => Date.now()): UndoRun {
  let timer: ReturnType<typeof setTimeout> | null = null
  let heldSince: number | null = null
  const isHeld = () => {
    if (heldSince === null) return false
    if (now() - heldSince > holdMs) heldSince = null
    return heldSince !== null
  }
  /* What the run is editing: one setting of one section, say. Undefined is any edit. */
  let runKey: string | undefined
  const step = (key?: string) => {
    const sameThing = key === undefined || runKey === undefined || key === runKey
    if (timer && sameThing) clearTimeout(timer)
    else {
      if (timer) clearTimeout(timer)
      timer = null
      record()
    }
    if (key !== undefined) runKey = key
    timer = setTimeout(() => {
      timer = null
      runKey = undefined
    }, quietMs)
  }
  const cut = () => {
    if (timer) clearTimeout(timer)
    timer = null
    runKey = undefined
  }
  return {
    step,
    cut,
    end() {
      cut()
      heldSince = null
    },
    hold() {
      heldSince = now()
    },
    release() {
      heldSince = null
    },
    aiStep() {
      if (isHeld()) return
      step()
    },
    held: isHeld,
  }
}
