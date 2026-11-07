/**
 * ===========================================================================
 *  UNDO AND REDO IN THE CREATOR PAGE EDITOR (round 50)
 * ===========================================================================
 * The editor saves as each sheet closes (Edit profile, Arrange, the bar at
 * the top), so a step is a save: what was sent, and the body that puts it
 * back (the route works that out from the rows it read, see
 * lib/storefront/creator-profile-undo). Undo sends the second, redo the first,
 * both through the same PATCH, so an undo is saved and on the live page like
 * any other change. Nothing is left "dirty" to forget.
 *
 * Typing is grouped by the sheet: everything typed between opening it and
 * pressing Save is one step here. Inside an open sheet, the sheet's own
 * history (lib/store-builder/form-history) undoes field by field.
 *
 * Pure: the workspace holds the state, tests/creator-editor-r50 runs this.
 */

export type EditorBody = Record<string, unknown>

export interface EditorStep {
  /** What was changed, for the button's title and the toast: "profile", "product order", "bar". */
  label: string
  /** The save itself, sent again by Redo. */
  redo: EditorBody
  /** What puts it back, sent by Undo. */
  undo: EditorBody
}

export interface EditorHistory {
  steps: EditorStep[]
  /** How many of `steps` are applied: Undo takes back steps[at - 1], Redo applies steps[at]. */
  at: number
}

export const EMPTY_HISTORY: EditorHistory = { steps: [], at: 0 }
export const MAX_STEPS = 50

export const canUndo = (h: EditorHistory) => h.at > 0
export const canRedo = (h: EditorHistory) => h.at < h.steps.length

/** A new save: anything that had been undone is gone, as in every editor. */
export function pushStep(h: EditorHistory, step: EditorStep): EditorHistory {
  const steps = [...h.steps.slice(0, h.at), step].slice(-MAX_STEPS)
  return { steps, at: steps.length }
}

export const stepToUndo = (h: EditorHistory): EditorStep | null => (canUndo(h) ? h.steps[h.at - 1] : null)
export const stepToRedo = (h: EditorHistory): EditorStep | null => (canRedo(h) ? h.steps[h.at] : null)

/** After the undo's save has landed. */
export const undone = (h: EditorHistory): EditorHistory => (canUndo(h) ? { ...h, at: h.at - 1 } : h)
/** After the redo's save has landed. */
export const redone = (h: EditorHistory): EditorHistory => (canRedo(h) ? { ...h, at: h.at + 1 } : h)

/** Is this step something the editor can send? A step from a message is checked before it is kept. */
export function isEditorStep(v: unknown): v is EditorStep {
  if (!v || typeof v !== "object") return false
  const s = v as Record<string, unknown>
  const body = (b: unknown) => !!b && typeof b === "object" && !Array.isArray(b)
  return typeof s.label === "string" && body(s.redo) && body(s.undo)
}

/**
 * Which history key was pressed, or null. Cmd+Z / Ctrl+Z undo; Shift+Cmd+Z,
 * Shift+Ctrl+Z and Ctrl+Y redo. Alt is somebody else's shortcut.
 */
export function historyKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): "undo" | "redo" | null {
  if (e.altKey || !(e.metaKey || e.ctrlKey)) return null
  const k = e.key.toLowerCase()
  if (k === "z") return e.shiftKey ? "redo" : "undo"
  if (k === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo"
  return null
}

/** A field that has its own undo for the text in it. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === "TEXTAREA") return true
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase()
    return !["checkbox", "radio", "button", "submit", "range", "color", "file", "reset"].includes(type)
  }
  return (el as HTMLElement).isContentEditable === true
}
