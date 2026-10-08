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
 */
export interface UndoRun {
  /** Call before an edit changes anything. Records a step when this edit starts a run. */
  step: () => void
  /** The run is over: the next edit records a step. */
  end: () => void
}

export function createUndoRun(record: () => void, quietMs = 500): UndoRun {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    step() {
      if (timer) clearTimeout(timer)
      else record()
      timer = setTimeout(() => { timer = null }, quietMs)
    },
    end() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
