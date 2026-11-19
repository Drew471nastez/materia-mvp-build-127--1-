"use client"
/**
 * The creator's forms, read once per page and shared by every form picker on
 * it (components/forms/form-picker) and by the OnePage editor's preview
 * (components/onepage/live-preview), which hands the forms its page uses to
 * the preview frame (lib/forms/preview-forms). One request at a time,
 * whoever asks, through lib/forms/client.
 */
import { useEffect, useSyncExternalStore } from "react"
import { formsRequest } from "@/lib/forms/client"
import { tt } from "@/lib/i18n/text"
import type { SavedForm } from "@/components/forms/forms-manager"

export type FormRow = Pick<SavedForm, "id" | "title" | "status" | "draft" | "published" | "updated_at"> & Partial<SavedForm>

type ListState = { forms: FormRow[] | null; missing: boolean; error: string | null; loading: boolean }
let state: ListState = { forms: null, missing: false, error: null, loading: false }
const listeners = new Set<() => void>()
export const emitFormsList = (next: Partial<ListState>) => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}
const emit = emitFormsList
let inflight: Promise<void> | null = null

/** Read the list (again, with `force`). One request at a time, whoever asks. */
export function readForms(force = false): Promise<void> {
  if (inflight) return inflight
  if (state.forms && !force) return Promise.resolve()
  emit({ loading: true, error: null })
  inflight = formsRequest<{ forms: FormRow[] }>("/api/forms", { fallback: tt("Forms could not be loaded. Try again.") }).then((r) => {
    inflight = null
    emit({ loading: false, missing: r.missing, error: r.missing ? null : r.error, forms: r.missing ? [] : r.data?.forms ?? (r.error ? state.forms : []) })
  })
  return inflight
}

/** A form made or saved here: in the list at once, for every picker on the page and the editor's preview. */
export function keepForm(form: FormRow) {
  const list = state.forms || []
  emit({ forms: list.some((f) => f.id === form.id) ? list.map((f) => (f.id === form.id ? { ...f, ...form } : f)) : [form, ...list] })
}

/** The creator's forms, read when `needed` turns true. */
export function useFormsList(needed: boolean) {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
  useEffect(() => {
    if (needed && !snap.forms && !snap.loading && !snap.error && !snap.missing) void readForms()
  }, [needed, snap.forms, snap.loading, snap.error, snap.missing])
  return { forms: snap.forms || [], loading: snap.loading || (needed && !snap.forms && !snap.error && !snap.missing), missing: snap.missing, error: snap.error, retry: () => void readForms(true) }
}
