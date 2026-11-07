"use client"
/**
 * ===========================================================================
 *  CHOOSE A FORM WHERE IT IS USED, OR MAKE ONE THERE
 * ===========================================================================
 * The owner: forms are made where they are used, not in a menu of their
 * own. A OnePage Form block, a button that opens a form or a booking form,
 * and a WhatsApp or Telegram button that asks a few questions first all
 * pick their form here, and can start a new one (from a template, live at
 * once for a chat's questions) or edit the chosen one's questions in the
 * builder, which opens over the editor (./form-builder-dialog).
 *
 * The creator's forms are read once per page and shared by every picker on
 * it (useFormsList), through lib/forms/client: a blip is asked again once,
 * nothing waits longer than its timeout, and a store without the forms
 * tables (SQL parts 372 and 375 not run) is told so in one sentence with no
 * Try again, because trying again can not help.
 */
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { formsRequest } from "@/lib/forms/client"
import { formTemplate, TEMPLATE_CHOICES } from "@/lib/forms/templates"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import type { SavedForm } from "./forms-manager"

const FormBuilderDialog = lazy(() => import("./form-builder-dialog"))

export type FormRow = Pick<SavedForm, "id" | "title" | "status" | "draft" | "published" | "updated_at"> & Partial<SavedForm>

/* ── the creator's forms, read once and shared ──────────────────────────── */

type ListState = { forms: FormRow[] | null; missing: boolean; error: string | null; loading: boolean }
let state: ListState = { forms: null, missing: false, error: null, loading: false }
const listeners = new Set<() => void>()
const emit = (next: Partial<ListState>) => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}
let inflight: Promise<void> | null = null

/** Read the list (again, with `force`). One request at a time, whoever asks. */
export function readForms(force = false): Promise<void> {
  if (inflight) return inflight
  if (state.forms && !force) return Promise.resolve()
  emit({ loading: true, error: null })
  inflight = formsRequest<{ forms: FormRow[] }>("/api/forms", { fallback: "Forms could not be loaded. Try again." }).then((r) => {
    inflight = null
    emit({ loading: false, missing: r.missing, error: r.missing ? null : r.error, forms: r.missing ? [] : r.data?.forms ?? (r.error ? state.forms : []) })
  })
  return inflight
}

/** A form made or saved here: in the list at once, for every picker on the page. */
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

/** Make a form from a template. A chat's questions are live at once (`publish`). */
export async function createForm(template: string, publish = false): Promise<{ form: FormRow | null; error: string | null; missing: boolean }> {
  const body = publish ? { definition: formTemplate(template), publish: true } : { template }
  const r = await formsRequest<{ form: FormRow }>("/api/forms", { method: "POST", body: JSON.stringify(body), fallback: "The form could not be created. Try again." })
  if (r.missing) emit({ missing: true })
  if (r.data?.form) keepForm(r.data.form)
  return { form: r.data?.form ?? null, error: r.error, missing: r.missing }
}

/* ── the picker ─────────────────────────────────────────────────────────── */

const LABEL = "block text-xs font-medium text-[#4b5563]"
const SELECT =
  "h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-[#e3e4e8] bg-white pl-3 pr-9 text-sm text-[#1a1a2e] outline-none focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2212%22%20height=%2212%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%236b7280%22%20stroke-width=%222%22><path%20d=%22m6%209%206%206%206-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat"
export const SMALL_BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] disabled:cursor-not-allowed disabled:opacity-50"

/** Plain words for a store without the forms tables, the same everywhere a form is picked. */
export function FormsNotSetUp({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-lg bg-[#f6f7f9] px-3 py-2.5 text-xs leading-5 text-[#4b5563]", className)} data-forms-missing="">
      {tt("Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates).")}
    </p>
  )
}

export function FormPicker({
  value,
  onChange,
  label,
  kind = "form",
  allowEmpty = true,
}: {
  value: string
  onChange: (id: string) => void
  label: string
  /** "booking" lists forms that take bookings first; "prechat" starts new ones from the chat template, live at once. */
  kind?: "form" | "booking" | "prechat"
  allowEmpty?: boolean
}) {
  const { forms, loading, missing, error, retry } = useFormsList(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const books = (f: FormRow) => !!(f.published?.booking || f.draft?.booking)
  const list = kind === "booking" ? [...forms].sort((x, y) => Number(books(y)) - Number(books(x))) : forms
  const chosen = forms.find((f) => f.id === value) || null

  const make = useCallback(
    async (template: string) => {
      setBusy(true)
      setProblem(null)
      const r = await createForm(template, kind === "prechat")
      setBusy(false)
      if (r.error && !r.missing) return setProblem(r.error)
      if (r.form) {
        onChange(r.form.id)
        setEditing(r.form.id)
      }
    },
    [kind, onChange],
  )

  if (missing) return <FormsNotSetUp />

  const templates = kind === "prechat" ? [{ id: "prechat", label: tt("Before a chat") }, ...TEMPLATE_CHOICES.filter((t) => t.id === "contact" || t.id === "service")] : kind === "booking" ? TEMPLATE_CHOICES.filter((t) => t.id === "appointment") : TEMPLATE_CHOICES
  return (
    <div className="space-y-2" data-form-picker={kind}>
      <label className="block space-y-1.5">
        <span className={LABEL}>{label}</span>
        <select className={SELECT} value={value} disabled={loading && !forms.length} onChange={(e) => onChange(e.target.value)}>
          {allowEmpty || !value ? <option value="">{loading && !forms.length ? tt("Loading forms") : tt("Choose a form")}</option> : null}
          {list.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title || tt("Untitled form")}
              {kind === "booking" && books(f) ? ` (${tt("takes bookings")})` : ""}
              {f.status !== "published" ? ` (${tt("draft")})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {templates.length === 1 ? (
          <button type="button" className={SMALL_BUTTON} disabled={busy} onClick={() => void make(templates[0].id)} data-new-form-here="">
            {busy ? tt("Creating") : tt("New form")}
          </button>
        ) : (
          <ResponsiveActionMenu
            title={tt("Start from")}
            align="start"
            trigger={
              <button type="button" className={SMALL_BUTTON} disabled={busy} data-new-form-here="">
                {busy ? tt("Creating") : tt("New form")}
              </button>
            }
            items={templates.map((t) => ({ label: t.id === "prechat" ? tt("Before a chat") : t.label, onClick: () => void make(t.id) }))}
          />
        )}
        {chosen ? (
          <button type="button" className={SMALL_BUTTON} onClick={() => setEditing(chosen.id)} data-edit-form-here="">
            {tt("Edit questions")}
          </button>
        ) : null}
      </div>
      {chosen && chosen.status !== "published" ? <p className="text-xs font-medium text-[#b54708]">{tt("This form is a draft. Publish it so visitors can answer.")}</p> : null}
      {problem || error ? (
        <p role="alert" className="text-xs text-[#b42318]">
          {problem || error}
          {error && !problem ? (
            <button type="button" className="ml-1.5 font-medium underline" onClick={retry}>
              {tt("Try again")}
            </button>
          ) : null}
        </p>
      ) : null}
      {editing ? (
        <Suspense fallback={null}>
          <FormBuilderDialog formId={editing} onClose={() => setEditing(null)} onSaved={keepForm} />
        </Suspense>
      ) : null}
    </div>
  )
}
