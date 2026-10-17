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
 */
export interface UndoRun {
  /** Call before an edit changes anything. Records a step when this edit starts a run. */
  step: () => void
  /** The run is over: the next edit records a step. Also ends a hold. */
  end: () => void
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
  const step = () => {
    if (timer) clearTimeout(timer)
    else record()
    timer = setTimeout(() => {
      timer = null
    }, quietMs)
  }
  return {
    step,
    end() {
      if (timer) clearTimeout(timer)
      timer = null
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
