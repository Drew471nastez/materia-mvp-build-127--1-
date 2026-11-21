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
import { lazy, Suspense, useCallback, useMemo, useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { formsRequest } from "@/lib/forms/client"
import { emitFormsList, keepForm, readForms, useFormsList, type FormRow } from "@/lib/forms/forms-list"
import { formTemplate, TEMPLATE_CHOICES } from "@/lib/forms/templates"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import { ERROR, LABEL, PROBLEM, SMALL_BUTTON } from "./fields"

const FormBuilderDialog = lazy(() => import("./form-builder-dialog"))

/* The creator's forms, read once and shared (lib/forms/forms-list): kept there so the editor's preview reads the same list without this picker. */
export { readForms, keepForm, useFormsList, emitFormsList, type FormRow }

/** Make a form from a template. A chat's questions are live at once (`publish`). */
export async function createForm(template: string, publish = false): Promise<{ form: FormRow | null; error: string | null; missing: boolean }> {
  const body = publish ? { definition: formTemplate(template), publish: true } : { template }
  const r = await formsRequest<{ form: FormRow }>("/api/forms", { method: "POST", body: JSON.stringify(body), fallback: tt("The form could not be created. Try again.") })
  if (r.missing) emitFormsList({ missing: true })
  if (r.data?.form) keepForm(r.data.form)
  return { form: r.data?.form ?? null, error: r.error, missing: r.missing }
}

/* ── the picker ─────────────────────────────────────────────────────────── */

/* Kept for anything that imported it from here: the forms surfaces' small button (./fields). */
export { SMALL_BUTTON }

/** Plain words for a store without the forms tables, the same everywhere a form is picked. */
export function FormsNotSetUp({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[13px] leading-5 text-[#4b5563]", className)} data-forms-missing="">
      {tt("Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates).")}
    </p>
  )
}

/*
  ROUND AN: the form is chosen in Storelib's own list (components/ui/
  choice-list ChoicePicker: a popover on a computer, the shared sheet on a
  phone), never the native select, with a draft or a booking form said in a
  quieter line under its name. New form and Edit questions sit under it as
  two small buttons.
*/
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

  const choices = useMemo<Choice[]>(
    () => [
      ...(allowEmpty && value ? [{ value: "", label: tt("No form") }] : []),
      ...list.map((f) => ({
        value: f.id,
        label: f.title || tt("Untitled form"),
        detail: [kind === "booking" && books(f) ? tt("Takes bookings") : "", f.status !== "published" ? tt("Draft") : ""].filter(Boolean).join(" · ") || undefined,
      })),
    ],
    [list, kind, allowEmpty, value],
  )

  if (missing) return <FormsNotSetUp />

  const templates = kind === "prechat" ? [{ id: "prechat", label: tt("Before a chat") }, ...TEMPLATE_CHOICES.filter((t) => t.id === "contact" || t.id === "service")] : kind === "booking" ? TEMPLATE_CHOICES.filter((t) => t.id === "appointment") : TEMPLATE_CHOICES
  const waiting = loading && !forms.length
  return (
    <div className="space-y-2.5" data-form-picker={kind}>
      <div className="space-y-2">
        <span className={LABEL}>{label}</span>
        <ChoicePicker
          name={`form-${kind}`}
          title={label}
          choices={choices}
          value={value || null}
          onChange={onChange}
          placeholder={tt("Search forms")}
          searchable={choices.length > 7}
          fieldLabel={chosen ? chosen.title || tt("Untitled form") : waiting ? tt("Loading forms") : tt("Choose a form")}
          fieldAside={chosen && chosen.status !== "published" ? tt("Draft") : undefined}
          fieldMuted={!chosen}
          lead={
            list.length
              ? undefined
              : (compact) => <p className={cn("text-[#6b7280]", compact ? "px-3 py-3 text-[15px]" : "px-2.5 py-2 text-[13px]")}>{waiting ? tt("Loading forms") : tt("No forms yet. Start one with New form.")}</p>
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {templates.length === 1 ? (
          <button type="button" className={SMALL_BUTTON} disabled={busy} onClick={() => void make(templates[0].id)} data-new-form-here="">
            <Plus aria-hidden className="h-3.5 w-3.5 text-[#6b7280]" />
            {busy ? tt("Creating") : tt("New form")}
          </button>
        ) : (
          <ResponsiveActionMenu
            title={tt("Start from")}
            align="start"
            trigger={
              <button type="button" className={SMALL_BUTTON} disabled={busy} data-new-form-here="">
                <Plus aria-hidden className="h-3.5 w-3.5 text-[#6b7280]" />
                {busy ? tt("Creating") : tt("New form")}
              </button>
            }
            items={templates.map((t) => ({ label: t.id === "prechat" ? tt("Before a chat") : templateName(t.id, t.label), onClick: () => void make(t.id) }))}
          />
        )}
        {chosen ? (
          <button type="button" className={SMALL_BUTTON} onClick={() => setEditing(chosen.id)} data-edit-form-here="">
            <Pencil aria-hidden className="h-3.5 w-3.5 text-[#6b7280]" />
            {tt("Edit questions")}
          </button>
        ) : null}
      </div>
      {chosen && chosen.status !== "published" ? <p className={PROBLEM}>{tt("This form is a draft. Publish it so visitors can answer.")}</p> : null}
      {problem || error ? (
        <p role="alert" className={ERROR}>
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

/** A starting point's name in the creator's language (the ids are lib/forms/templates'). */
export function templateName(id: string, fallback?: string): string {
  const words: Record<string, string> = {
    contact: tt("Contact"),
    lead: tt("Lead magnet"),
    coaching: tt("Coaching application"),
    service: tt("Service inquiry"),
    appointment: tt("Appointment booking"),
    waitlist: tt("Waitlist"),
    feedback: tt("Feedback"),
    registration: tt("Registration"),
    fitness: tt("Quiz with results"),
    prechat: tt("Before a chat"),
  }
  return words[id] ?? fallback ?? TEMPLATE_CHOICES.find((t) => t.id === id)?.label ?? id
}
