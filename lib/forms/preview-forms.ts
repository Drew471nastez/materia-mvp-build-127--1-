/**
 * ===========================================================================
 *  THE FORM THE EDITOR'S PREVIEW SHOWS IS THE FORM BEING EDITED
 * ===========================================================================
 * The owner (rec19 image 22): a link block had "Get in touch" attached, its
 * three questions rewritten in Romanian, and the phone beside the editor
 * still showed the template's "Your name", "Email address" and "How can I
 * help?". The preview is a document of its own (components/onepage/
 * preview-document) and read the form the way a visitor does, over
 * /api/forms/<id>/public: the PUBLISHED copy, read once when the block came
 * near the screen and kept for as long as the frame lived. Nothing the
 * builder did, a draft saved, a question added, even Publish, ever reached it.
 *
 * Now the editor hands the frame the forms its page uses, as it hands it the
 * page itself:
 *
 *   EDITOR   the creator's forms list (./forms-list) and, for a form open in
 *            the builder, its definition as it stands this moment
 *            (noteBuilderDraft), so an edit shows before it is saved.
 *            components/onepage/live-preview sends previewFormsFor(...)
 *            with every change.
 *   FRAME    receivePreviewForms keeps them; the visitor's form
 *            (components/forms/public-form) draws a form from here when it
 *            is here, waits for the editor's list rather than reading the
 *            published copy, and reads over the network only for a form the
 *            editor could not give (another store's, or a list that failed).
 *   LIVE     no message ever comes, so nothing here is used: the visitor
 *            reads the published copy, as before.
 *
 * The editor's page is the page's draft, so its forms are their drafts too:
 * the preview shows what Publish would make live, and says so when that
 * differs from what visitors see now (`published` below).
 */
import { validateDefinition, type FormDefinition, type PublicForm } from "./definition"

/** A form as the preview draws it: the definition being edited, and how it stands against the live copy. */
export interface PreviewForm extends PublicForm {
  /** "same": visitors see this now. "changed": published, with changes not published yet. "draft": never published, visitors can not answer. */
  published: "same" | "changed" | "draft"
}

/* ── the frame's side ──────────────────────────────────────────────────── */

type FrameSnap = { forms: ReadonlyMap<string, PreviewForm>; settled: boolean; expected: boolean }
let frame: FrameSnap = { forms: new Map(), settled: false, expected: false }
const frameListeners = new Set<() => void>()
const tellFrame = () => {
  for (const l of frameListeners) l()
}

/** This document is the editor's preview: forms come from the editor, so none is read before it has said. */
export function expectPreviewForms(): void {
  if (frame.expected) return
  frame = { ...frame, expected: true }
  tellFrame()
}

/** The editor's forms, every time they change. `settled`: the editor's list is read (or could not be), so a form not given will not come. */
export function receivePreviewForms(list: unknown, settled: boolean): void {
  const forms = new Map<string, PreviewForm>()
  if (Array.isArray(list))
    for (const f of list) {
      if (f && typeof f.id === "string" && f.definition && typeof f.definition === "object" && Array.isArray(f.definition.fields)) forms.set(f.id, f as PreviewForm)
    }
  frame = { forms, settled: settled === true, expected: true }
  tellFrame()
}

/** An editor that sends no forms (one loaded before this frame's build): read each form as a visitor does rather than wait. */
export function settlePreviewForms(): void {
  if (frame.settled) return
  frame = { ...frame, settled: true }
  tellFrame()
}

export function subscribePreviewForms(cb: () => void): () => void {
  frameListeners.add(cb)
  return () => frameListeners.delete(cb)
}
export function previewFormsSnapshot(): FrameSnap {
  return frame
}

/**
 * What the preview knows of one form. Null outside the editor's preview (the
 * live page): read it as a visitor does. Otherwise the form, or `waiting`
 * while the editor's list is on its way.
 */
export function previewFormState(snap: FrameSnap, id: string): { form: PreviewForm | null; waiting: boolean } | null {
  if (!snap.expected) return null
  const form = snap.forms.get(id) || null
  if (form) return { form, waiting: false }
  return snap.settled ? null : { form: null, waiting: true }
}

/** The form from the editor, once it has said; null when it will not give it (read it over the network then). Never longer than `maxMs`. */
export function whenPreviewForm(id: string, maxMs = 4000): Promise<PreviewForm | null> {
  const now = previewFormState(frame, id)
  if (!now) return Promise.resolve(null)
  if (now.form) return Promise.resolve(now.form)
  return new Promise((resolve) => {
    let off = () => {}
    const timer = setTimeout(() => (off(), resolve(null)), maxMs)
    off = subscribePreviewForms(() => {
      const s = previewFormState(frame, id)
      if (s?.waiting) return
      clearTimeout(timer)
      off()
      resolve(s?.form ?? null)
    })
  })
}

/* ── the editor's side ─────────────────────────────────────────────────── */

const builderDrafts = new Map<string, FormDefinition>()
let builderVersion = 0
const builderListeners = new Set<() => void>()

/** The builder's form as it stands this moment (null once the builder closes: the list's saved draft is shown again). */
export function noteBuilderDraft(id: string, definition: FormDefinition | null): void {
  if (definition) builderDrafts.set(id, definition)
  else if (!builderDrafts.delete(id)) return
  builderVersion++
  for (const l of builderListeners) l()
}
export function subscribeBuilderDrafts(cb: () => void): () => void {
  builderListeners.add(cb)
  return () => builderListeners.delete(cb)
}
export function builderDraftsVersion(): number {
  return builderVersion
}
export function builderDraft(id: string): FormDefinition | undefined {
  return builderDrafts.get(id)
}

/** Every form id a page's blocks name, however deep: a button's form or booking, a chat's questions, a Form block, a group's blocks. */
export function formIdsInBlocks(blocks: unknown): string[] {
  const ids = new Set<string>()
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 12) return
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1)
      return
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "form_id" && typeof x === "string" && UUID.test(x)) ids.add(x)
      else if (x && typeof x === "object") walk(x, depth + 1)
    }
  }
  walk(blocks, 0)
  return [...ids]
}

type Row = { id: string; status?: string; revision?: number; draft?: FormDefinition | null; published?: FormDefinition | null }

/** The forms the preview is given: the builder's live copy first, then the saved draft, then the published one. */
export function previewFormsFor(ids: string[], rows: Row[], drafts: (id: string) => FormDefinition | undefined = builderDraft): PreviewForm[] {
  const out: PreviewForm[] = []
  for (const id of ids) {
    const row = rows.find((r) => r.id === id)
    const definition = drafts(id) || row?.draft || row?.published
    if (!definition || !Array.isArray(definition.fields)) continue
    const live = row?.status === "published" && row.published ? row.published : null
    out.push({
      id,
      revision: row?.revision ?? 0,
      definition,
      published: !live ? "draft" : sameDefinition(live, definition) ? "same" : "changed",
    })
  }
  return out
}

/** Compared as the server keeps them (trimmed, defaults filled), so the builder's copy of a form just published reads as the same. */
function sameDefinition(a: FormDefinition, b: FormDefinition): boolean {
  const kept = (d: FormDefinition) => {
    try {
      return validateDefinition(d, false)
    } catch {
      return d
    }
  }
  return stable(kept(a)) === stable(kept(b))
}
/** JSON with its keys in order and empty values dropped, so a saved copy and the same form held in the builder compare equal. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(x).sort()) {
        const y = (x as Record<string, unknown>)[k]
        if (y === undefined || y === null || y === "" || y === false) continue
        o[k] = y
      }
      return o
    }
    return x
  })
}
