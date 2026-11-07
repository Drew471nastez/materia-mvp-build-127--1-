"use client"
import { useEffect, useMemo, useState } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, GripVertical, MoreHorizontal } from "lucide-react"
import { ActionEditor } from "./action-editor"
import { PublicFormRenderer } from "./public-form"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { buttonSecondary, buttonAccent, card, iconButton } from "@/app/(storelib)/app/orders/order-parts"
import { formTemplate, TEMPLATE_CHOICES } from "@/lib/forms/templates"
import { formPath } from "@/lib/forms/actions"
import { platformOrigin } from "@/lib/onepage/return-address"
import {
  CONDITION_OPS,
  FIELD_TYPES,
  MAX_FIELDS,
  isChoice,
  type BookingSettings,
  type Condition,
  type FieldType,
  type FormDefinition,
  type FormField,
  type QuizResult,
} from "@/lib/forms/definition"
import type { ClientIntegrations } from "@/lib/forms/integrations"

/*
  Audience › Forms. The list of forms, and one form's builder: questions
  (dragged into order, each with its rules), how the form is shown, what
  happens after sending, bookings, and where responses go. Saving keeps a
  draft; Publish changes what every page shows. The preview renders the
  draft with the visitor's own renderer and saves nothing.
*/

interface SavedForm {
  id: string
  title: string
  status: string
  revision: number
  draft: FormDefinition
  published: FormDefinition | null
  updated_at: string
  integration_settings: ClientIntegrations
  retention_days?: number | null
}

const field = "h-9 w-full min-w-0 rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15"
const area = "w-full min-w-0 rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15"
const label = "block space-y-1 text-[13px] font-medium text-[#1a1a2e]"
const check = "h-4 w-4 shrink-0 accent-[#1a1a2e]"
const section = card + " p-4 sm:p-5"
const heading = "text-[15px] font-semibold text-[#1a1a2e]"
const muted = "text-[13px] text-[#6b7280]"
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12)
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const ORDER = [1, 2, 3, 4, 5, 6, 0]

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(b.error || "That did not work. Try again."), { status: r.status })
  return b as T
}

export function FormsManager() {
  const [forms, setForms] = useState<SavedForm[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [openId, setOpenId] = useState<string | null>(null)
  const load = async () => {
    setLoading(true)
    try {
      const b = await api<{ forms: SavedForm[] }>("/api/forms")
      setForms(b.forms || [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forms could not be loaded.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const id = new URLSearchParams(location.search).get("form")
    if (id) setOpenId(id)
  }, [])
  const create = async (template: string) => {
    setBusy(true)
    setError(null)
    try {
      const b = await api<{ form: SavedForm }>("/api/forms", { method: "POST", body: JSON.stringify({ template }) })
      setForms((all) => [b.form, ...all])
      open(b.form.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The form could not be created.")
    } finally {
      setBusy(false)
    }
  }
  const open = (id: string | null) => {
    setOpenId(id)
    const url = new URL(location.href)
    if (id) url.searchParams.set("form", id)
    else url.searchParams.delete("form")
    history.replaceState(history.state, "", url)
  }
  const archive = async (form: SavedForm) => {
    if (!window.confirm(`Archive “${form.title || "Untitled form"}”? It stops taking responses on every page. Its leads stay in Leads.`)) return
    try {
      await api(`/api/forms/${form.id}`, { method: "DELETE" })
      setForms((all) => all.filter((f) => f.id !== form.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The form was not archived.")
    }
  }
  const selected = forms.find((f) => f.id === openId) || null
  if (selected)
    return <FormEditor key={selected.id} form={selected} onBack={() => open(null)} onSaved={(f) => setForms((all) => all.map((x) => (x.id === f.id ? { ...x, ...f } : x)))} />

  const newMenu = TEMPLATE_CHOICES.map((t) => ({ label: t.label, onClick: () => void create(t.id) }))
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-forms-list="">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Forms and quizzes</h1>
        <div className="flex items-center gap-2">
          <a className={buttonSecondary} href="/app/audience/leads">
            Leads
          </a>
          <ResponsiveActionMenu
            title="Start from"
            align="end"
            trigger={
              <button type="button" className={buttonAccent} disabled={busy} data-new-form="">
                New form
              </button>
            }
            items={newMenu}
          />
        </div>
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {loading && !forms.length ? (
        <div className={card + " h-40 animate-pulse"} role="status">
          <span className="sr-only">Loading forms</span>
        </div>
      ) : !forms.length ? (
        <div className={card + " px-6 py-12 text-center"}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">No forms yet</p>
          <p className={muted + " mx-auto mt-1 max-w-sm"}>Contact forms, applications, quizzes and bookings. One form works on your OnePage, website and creator page.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {TEMPLATE_CHOICES.slice(0, 5).map((t) => (
              <button key={t.id} type="button" className={buttonSecondary} disabled={busy} onClick={() => void create(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className={card + " divide-y divide-[#f1f2f4] overflow-hidden"}>
          {forms.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbfb]">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(f.id)}>
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.title || "Untitled form"}</span>
                <span className="block text-[13px] text-[#6b7280]">
                  {f.status === "published" ? "Published" : "Draft"}
                  {f.draft?.booking ? " · Bookings" : f.draft?.mode === "quiz" ? " · Quiz" : ""} · Edited {new Date(f.updated_at).toLocaleDateString()}
                </span>
              </button>
              <ResponsiveActionMenu
                title={f.title || "Form"}
                trigger={
                  <button type="button" className={iconButton} aria-label={`Actions for ${f.title || "form"}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                }
                items={[
                  { label: "Edit", onClick: () => open(f.id) },
                  { label: "View leads", href: `/app/audience/leads?form=${f.id}` },
                  ...(f.status === "published" ? [{ label: "Open public form", href: formPath(f.id), target: "_blank" as const }] : []),
                  { label: "Archive", variant: "destructive" as const, separatorBefore: true, onClick: () => void archive(f) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormEditor({ form, onBack, onSaved }: { form: SavedForm; onBack: () => void; onSaved: (f: SavedForm) => void }) {
  const [saved, setSaved] = useState(form),
    [draft, setDraft] = useState<FormDefinition>(() => withDefaults(form.draft)),
    [integrations, setIntegrations] = useState<ClientIntegrations>(form.integration_settings),
    [retention, setRetention] = useState<number | null>(form.retention_days ?? null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [note, setNote] = useState<string | null>(null),
    [preview, setPreview] = useState(false),
    [openQuestion, setOpenQuestion] = useState<string | null>(null)
  useEffect(() => {
    if (!dirty) return
    const hold = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", hold)
    return () => window.removeEventListener("beforeunload", hold)
  }, [dirty])
  const change = (patch: Partial<FormDefinition>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
    setNote(null)
  }
  const editQuestion = (id: string, patch: Partial<FormField>) => change({ fields: draft.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const save = async (publish: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const b = await api<{ form: SavedForm }>(`/api/forms/${saved.id}`, {
        method: "PATCH",
        body: JSON.stringify({ definition: draft, publish, updated_at: saved.updated_at, integrations, retention_days: retention }),
      })
      setSaved(b.form)
      onSaved(b.form)
      setDirty(false)
      setNote(publish ? "Published. Every page with this form shows this version." : "Draft saved.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "The form did not save.")
    } finally {
      setBusy(false)
    }
  }
  const back = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return
    onBack()
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = draft.fields.findIndex((f) => f.id === e.active.id)
    const to = draft.fields.findIndex((f) => f.id === e.over!.id)
    if (from < 0 || to < 0) return
    change({ fields: dropBrokenRules(arrayMove(draft.fields, from, to)) })
  }
  const move = (index: number, by: number) => {
    const to = index + by
    if (to < 0 || to >= draft.fields.length) return
    change({ fields: dropBrokenRules(arrayMove(draft.fields, index, to)) })
  }
  const remove = (id: string) => change({ fields: dropBrokenRules(draft.fields.filter((f) => f.id !== id)) })
  const add = () => {
    const q: FormField = { id: newId(), type: "text", label: "", required: false }
    change({ fields: [...draft.fields, q] })
    setOpenQuestion(q.id)
  }
  const publicLink = platformOrigin() + formPath(saved.id)
  const previewPane = (
    <div className={section}>
      <PublicFormRenderer key={JSON.stringify(draft)} formId={saved.id} preview initial={{ id: saved.id, revision: saved.revision, definition: draft }} />
    </div>
  )

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" data-form-builder="">
      <header className="mb-5 space-y-3">
        <button type="button" onClick={back} className="text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
          ← Forms
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{draft.title || "Untitled form"}</h1>
            <p className={muted}>
              {saved.status === "published" ? (dirty ? "Published, with unsaved changes" : saved.draft && JSON.stringify(saved.draft) !== JSON.stringify(saved.published) ? "Published, draft has changes" : "Published") : "Draft"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonSecondary + " lg:hidden"} onClick={() => setPreview((v) => !v)} aria-pressed={preview}>
              {preview ? "Edit" : "Preview"}
            </button>
            {saved.status === "published" ? (
              <ResponsiveActionMenu
                title="Share"
                trigger={
                  <button type="button" className={buttonSecondary}>
                    Share
                  </button>
                }
                items={[
                  { label: "Copy form link", onClick: () => void navigator.clipboard.writeText(publicLink).then(() => setNote("Form link copied.")) },
                  { label: "Open public form", href: formPath(saved.id), target: "_blank" },
                  { label: "View leads", href: `/app/audience/leads?form=${saved.id}` },
                ]}
              />
            ) : null}
            <button type="button" className={buttonSecondary} disabled={busy || !dirty} onClick={() => void save(false)}>
              Save draft
            </button>
            <button type="button" className={buttonAccent} disabled={busy} onClick={() => void save(true)} data-publish-form="">
              {busy ? "Saving…" : "Publish"}
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="text-[13px] text-[#067647]">
            {note}
          </p>
        ) : null}
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={`min-w-0 space-y-4 ${preview ? "max-lg:hidden" : ""}`}>
          <section className={section + " space-y-3"}>
            <label className={label}>
              Title
              <input className={field} value={draft.title} maxLength={160} onChange={(e) => change({ title: e.target.value })} />
            </label>
            <label className={label}>
              Intro
              <textarea className={area} rows={2} maxLength={1000} value={draft.description} onChange={(e) => change({ description: e.target.value })} />
            </label>
          </section>

          <section className={section} aria-labelledby="questions-h">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="questions-h" className={heading}>
                Questions
              </h2>
              <span className={muted}>
                {draft.fields.length} of {MAX_FIELDS}
              </span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={draft.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <ol className="divide-y divide-[#f1f2f4]">
                  {draft.fields.map((q, index) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      index={index}
                      count={draft.fields.length}
                      earlier={draft.fields.slice(0, index)}
                      open={openQuestion === q.id}
                      quiz={draft.mode === "quiz"}
                      steps={draft.layout === "steps"}
                      onToggle={() => setOpenQuestion(openQuestion === q.id ? null : q.id)}
                      onChange={(patch) => editQuestion(q.id, patch)}
                      onMove={(by) => move(index, by)}
                      onRemove={() => remove(q.id)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            <button type="button" className={buttonSecondary + " mt-3"} disabled={draft.fields.length >= MAX_FIELDS} onClick={add}>
              Add question
            </button>
          </section>

          <section className={section + " space-y-4"}>
            <h2 className={heading}>Layout</h2>
            <Segmented
              value={draft.layout}
              options={[
                ["single", "One page"],
                ["steps", "Steps"],
                ["one_by_one", "One at a time"],
              ]}
              onChange={(layout) => change({ layout: layout as FormDefinition["layout"] })}
              label="Layout"
            />
            {draft.layout === "steps" ? <p className={muted}>Open a question and tick “Starts a new step” to split the form.</p> : null}
            <label className={label}>
              Send button
              <input className={field} value={draft.button_text} maxLength={80} onChange={(e) => change({ button_text: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" className={check} checked={draft.mode === "quiz"} onChange={(e) => change({ mode: e.target.checked ? "quiz" : "form" })} />
              Score answers and show a result
            </label>
            {draft.mode === "quiz" ? <ResultsEditor results={draft.results || []} onChange={(results) => change({ results })} /> : null}
          </section>

          <BookingEditor booking={draft.booking} onChange={(booking) => change({ booking })} />

          <section className={section + " space-y-4"}>
            <h2 className={heading}>After sending</h2>
            <label className={label}>
              Message
              <textarea className={area} rows={2} maxLength={1000} value={draft.completion.message} onChange={(e) => change({ completion: { ...draft.completion, message: e.target.value } })} />
            </label>
            <Segmented
              value={draft.completion.kind === "gated" ? "gated" : "message"}
              options={[
                ["message", "Message and a button"],
                ["gated", "Private link"],
              ]}
              onChange={(v) =>
                change({
                  completion: v === "gated" ? { ...draft.completion, kind: "gated", gated: draft.completion.gated || { url: "", label: "Open your download" } } : { ...draft.completion, kind: draft.completion.action ? "action" : "message" },
                })
              }
              label="After sending"
            />
            {draft.completion.kind === "gated" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  Private link
                  <input className={field} type="url" placeholder="https://" value={draft.completion.gated?.url || ""} onChange={(e) => change({ completion: { ...draft.completion, gated: { label: draft.completion.gated?.label || "Open your download", url: e.target.value } } })} />
                </label>
                <label className={label}>
                  Button text
                  <input className={field} maxLength={80} value={draft.completion.gated?.label || ""} onChange={(e) => change({ completion: { ...draft.completion, gated: { url: draft.completion.gated?.url || "", label: e.target.value } } })} />
                </label>
                <p className={muted + " sm:col-span-2"}>Visitors get this link only after their response is saved. It never appears in the page.</p>
              </div>
            ) : (
              <>
                <ActionEditor allowNone value={draft.completion.action} onChange={(action) => change({ completion: { ...draft.completion, action, kind: action ? "action" : "message" } })} />
                {draft.completion.action?.type === "whatsapp" ? (
                  <>
                    <p className={muted}>
                      The message can use {"{name}"}, {"{email}"}, {"{phone}"}, {"{score}"}, {"{result}"}, {"{answers}"} or a question ID such as {`{${draft.fields[0]?.id || "goal"}}`}.
                    </p>
                    <label className="flex items-center gap-2 text-[14px]">
                      <input type="checkbox" className={check} checked={draft.completion.include_answers === true} onChange={(e) => change({ completion: { ...draft.completion, include_answers: e.target.checked } })} />
                      Add every answer under the message
                    </label>
                  </>
                ) : null}
              </>
            )}
          </section>

          <IntegrationsEditor
            form={saved}
            value={integrations}
            retention={retention}
            onRetention={(d) => (setRetention(d), setDirty(true))}
            onChange={(v) => (setIntegrations(v), setDirty(true))}
            onStamp={(updated_at) => setSaved((s) => ({ ...s, updated_at }))}
          />

          <section className={section + " space-y-3"}>
            <h2 className={heading}>Privacy</h2>
            <label className={label}>
              Consent notice
              <textarea className={area} rows={2} maxLength={600} value={draft.consent_text} onChange={(e) => change({ consent_text: e.target.value })} />
            </label>
            <label className={label}>
              Privacy policy address
              <input className={field} type="url" placeholder="https://" value={draft.privacy_url ?? ""} onChange={(e) => change({ privacy_url: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" className={check} checked={draft.marketing_opt_in} onChange={(e) => change({ marketing_opt_in: e.target.checked })} />
              Offer a separate opt-in for updates
            </label>
          </section>
        </div>
        <aside className={`min-w-0 ${preview ? "" : "max-lg:hidden"}`} aria-label="Preview">
          <div className="lg:sticky lg:top-6">{previewPane}</div>
        </aside>
      </div>
    </div>
  )
}

function withDefaults(d: FormDefinition): FormDefinition {
  const copy = JSON.parse(JSON.stringify(d)) as FormDefinition
  copy.layout = copy.layout || (copy.mode === "quiz" ? "one_by_one" : "single")
  copy.completion = { kind: copy.completion?.kind || (copy.completion?.action ? "action" : "message"), ...copy.completion }
  return copy
}

/** Rules may only depend on questions above them: after a move or a removal, rules that no longer can are dropped. */
function dropBrokenRules(fields: FormField[]): FormField[] {
  return fields.map((f, i) => {
    if (!f.show_if?.length) return f
    const earlier = new Set(fields.slice(0, i).map((x) => x.id))
    const kept = f.show_if.filter((c) => earlier.has(c.field))
    return kept.length === f.show_if.length ? f : { ...f, show_if: kept.length ? kept : undefined }
  })
}

function Segmented({ value, options, onChange, label: name }: { value: string; options: [string, string][]; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-[#f1f2f4] p-1">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`h-8 rounded-md px-3 text-[13px] font-medium ${value === id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-[#4b5563] hover:text-[#1a1a2e]"}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function QuestionRow({
  q,
  index,
  count,
  earlier,
  open,
  quiz,
  steps,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  q: FormField
  index: number
  count: number
  earlier: FormField[]
  open: boolean
  quiz: boolean
  steps: boolean
  onToggle: () => void
  onChange: (patch: Partial<FormField>) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const typeLabel = FIELD_TYPES.find((t) => t.id === q.type)?.label || q.type
  const setType = (type: FieldType) =>
    onChange({
      type,
      ...(isChoice(type) && !q.options?.length
        ? {
            options: [
              { id: newId(), label: "Option 1" },
              { id: newId(), label: "Option 2" },
            ],
          }
        : {}),
      ...(type === "rating" ? { max: q.max && q.max >= 3 && q.max <= 10 ? q.max : 5 } : {}),
    })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative bg-white ${isDragging ? "z-10 shadow-[0_8px_24px_rgba(16,24,40,0.12)]" : ""}`} data-form-question={q.id}>
      <div className="flex items-center gap-1 py-2">
        <button type="button" className={iconButton + " cursor-grab touch-none active:cursor-grabbing"} aria-label={`Drag question ${index + 1}`} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">
              {q.label || <span className="text-[#9ca3af]">Untitled question</span>}
              {q.required ? <span className="text-[#6b7280]"> *</span> : null}
            </span>
            <span className="block text-[12px] text-[#6b7280]">
              {typeLabel}
              {q.show_if?.length ? " · Shown by a rule" : ""}
              {steps && q.new_step && index > 0 ? " · New step" : ""}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#6b7280] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="space-y-3 pb-4 pl-9">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className={label}>
              Question
              <input className={field} value={q.label} maxLength={300} autoFocus={!q.label} onChange={(e) => onChange({ label: e.target.value })} />
            </label>
            <label className={label}>
              Type
              <select className={field} value={q.type} onChange={(e) => setType(e.target.value as FieldType)}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!isChoice(q.type) && !["rating", "consent", "file"].includes(q.type) ? (
            <label className={label}>
              Placeholder
              <input className={field} value={q.placeholder ?? ""} maxLength={120} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </label>
          ) : null}
          <label className={label}>
            Help text
            <input className={field} value={q.description ?? ""} maxLength={500} onChange={(e) => onChange({ description: e.target.value })} />
          </label>
          {isChoice(q.type) ? <OptionsEditor q={q} quiz={quiz} onChange={onChange} /> : null}
          {q.type === "number" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Lowest
                <input className={field} type="number" value={q.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </label>
              <label className={label}>
                Highest
                <input className={field} type="number" value={q.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </label>
            </div>
          ) : null}
          {q.type === "rating" ? (
            <label className={label}>
              Scale
              <select className={field + " sm:w-40"} value={q.max || 5} onChange={(e) => onChange({ max: Number(e.target.value) })}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    1 to {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" className={check} checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
              Required
            </label>
            {steps && index > 0 ? (
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" className={check} checked={q.new_step === true} onChange={(e) => onChange({ new_step: e.target.checked || undefined })} />
                Starts a new step
              </label>
            ) : null}
          </div>
          {earlier.length ? <RulesEditor rules={q.show_if || []} earlier={earlier} onChange={(show_if) => onChange({ show_if: show_if.length ? show_if : undefined })} /> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={buttonSecondary} disabled={index === 0} onClick={() => onMove(-1)}>
              Move up
            </button>
            <button type="button" className={buttonSecondary} disabled={index === count - 1} onClick={() => onMove(1)}>
              Move down
            </button>
            <button type="button" className={buttonSecondary + " text-[#b42318]"} disabled={count === 1} onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function OptionsEditor({ q, quiz, onChange }: { q: FormField; quiz: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const options = q.options || []
  const set = (i: number, patch: Partial<NonNullable<FormField["options"]>[number]>) => onChange({ options: options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">Answers{quiz ? " and points" : ""}</legend>
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <input className={field} aria-label={`Answer ${i + 1}`} value={o.label} maxLength={200} onChange={(e) => set(i, { label: e.target.value })} />
          {quiz ? (
            <input className={field + " w-20 shrink-0"} type="number" aria-label={`Points for answer ${i + 1}`} value={o.score ?? 0} onChange={(e) => set(i, { score: Number(e.target.value) || 0 })} />
          ) : null}
          <button type="button" className={iconButton} aria-label={`Remove answer ${i + 1}`} disabled={options.length === 1} onClick={() => onChange({ options: options.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="text-[13px] font-medium text-[#1a1a2e] underline" disabled={options.length >= 30} onClick={() => onChange({ options: [...options, { id: newId(), label: `Option ${options.length + 1}` }] })}>
        Add answer
      </button>
    </fieldset>
  )
}

function RulesEditor({ rules, earlier, onChange }: { rules: Condition[]; earlier: FormField[]; onChange: (r: Condition[]) => void }) {
  const set = (i: number, patch: Partial<Condition>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <fieldset className="space-y-2" data-rules="">
      <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">{rules.length ? "Show only when" : "Visibility"}</legend>
      {rules.map((r, i) => {
        const target = earlier.find((f) => f.id === r.field)
        const needsValue = !["answered", "empty"].includes(r.op)
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto]">
            <select className={field} aria-label="Question" value={r.field} onChange={(e) => set(i, { field: e.target.value, value: "" })}>
              {earlier.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label || "Untitled question"}
                </option>
              ))}
            </select>
            <select className={field} aria-label="Comparison" value={r.op} onChange={(e) => set(i, { op: e.target.value as Condition["op"] })}>
              {CONDITION_OPS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {needsValue ? (
              target && isChoice(target.type) && ["is", "is_not", "includes"].includes(r.op) ? (
                <select className={field} aria-label="Answer" value={r.value || ""} onChange={(e) => set(i, { value: e.target.value })}>
                  <option value="">Choose…</option>
                  {target.options?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={field} aria-label="Value" value={r.value || ""} maxLength={200} onChange={(e) => set(i, { value: e.target.value })} />
              )
            ) : (
              <span />
            )}
            <button type="button" className={iconButton} aria-label="Remove rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        )
      })}
      {rules.length < 5 ? (
        <button type="button" className="text-[13px] font-medium text-[#1a1a2e] underline" onClick={() => onChange([...rules, { field: earlier[earlier.length - 1].id, op: "answered" }])}>
          {rules.length ? "Add another rule" : "Show only when an earlier answer matches"}
        </button>
      ) : null}
    </fieldset>
  )
}

function ResultsEditor({ results, onChange }: { results: QuizResult[]; onChange: (r: QuizResult[]) => void }) {
  const set = (i: number, patch: Partial<QuizResult>) => onChange(results.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">Results by total points</legend>
      {results.map((r, i) => (
        <div key={r.id} className="space-y-2 border-l-2 border-[#e3e4e8] pl-3">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <label className={label}>
              From
              <input className={field} type="number" value={r.min} onChange={(e) => set(i, { min: Number(e.target.value) || 0 })} />
            </label>
            <label className={label}>
              To
              <input className={field} type="number" value={r.max} onChange={(e) => set(i, { max: Number(e.target.value) || 0 })} />
            </label>
            <button type="button" className={iconButton + " self-end"} aria-label={`Remove result ${i + 1}`} onClick={() => onChange(results.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
          <label className={label}>
            Result
            <input className={field} value={r.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} />
          </label>
          <label className={label}>
            Message
            <textarea className={area} rows={2} maxLength={1000} value={r.message} onChange={(e) => set(i, { message: e.target.value })} />
          </label>
          <ActionEditor allowNone value={r.action} onChange={(action) => set(i, { action })} />
        </div>
      ))}
      {results.length < 10 ? (
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => {
            const top = results.reduce((m, r) => Math.max(m, r.max), -1)
            onChange([...results, { id: newId(), min: top + 1, max: top + 10, title: "", message: "" }])
          }}
        >
          Add result
        </button>
      ) : null}
    </fieldset>
  )
}

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
  } catch {
    return ["UTC", "Europe/London", "Europe/Bucharest", "America/New_York", "America/Los_Angeles"]
  }
}

function BookingEditor({ booking, onChange }: { booking?: BookingSettings; onChange: (b: BookingSettings | undefined) => void }) {
  const products = useCreatorProducts(!!booking)
  const tzList = useMemo(zones, [])
  const on = !!booking
  const b = booking
  const set = (patch: Partial<BookingSettings>) => b && onChange({ ...b, ...patch })
  return (
    <section className={section + " space-y-4"} data-booking-editor="">
      <label className="flex items-center justify-between gap-3">
        <span className={heading}>Bookings</span>
        <input
          type="checkbox"
          className={check}
          aria-label="Take bookings with this form"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    duration: 30,
                    buffer: 10,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" })),
                    notice_hours: 12,
                    days_ahead: 30,
                    approval: true,
                  }
                : undefined,
            )
          }
        />
      </label>
      {!b ? (
        <p className={muted}>Visitors pick a time before answering. For Calendly or another booking page, use a button action instead.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Length (minutes)
              <input className={field} type="number" min={5} max={480} value={b.duration} onChange={(e) => set({ duration: Number(e.target.value) || 30 })} />
            </label>
            <label className={label}>
              Break after (minutes)
              <input className={field} type="number" min={0} max={240} value={b.buffer} onChange={(e) => set({ buffer: Number(e.target.value) || 0 })} />
            </label>
            <label className={label}>
              Notice (hours)
              <input className={field} type="number" min={0} max={720} value={b.notice_hours} onChange={(e) => set({ notice_hours: Number(e.target.value) || 0 })} />
            </label>
            <label className={label}>
              Bookable up to (days ahead)
              <input className={field} type="number" min={1} max={365} value={b.days_ahead} onChange={(e) => set({ days_ahead: Number(e.target.value) || 30 })} />
            </label>
            <label className={label + " sm:col-span-2"}>
              Your time zone
              <select className={field} value={b.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                {(tzList.includes(b.timezone) ? tzList : [b.timezone, ...tzList]).map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">Weekly hours</legend>
            {ORDER.map((day) => {
              const windows = b.weekly.filter((w) => w.day === day)
              const others = b.weekly.filter((w) => w.day !== day)
              const write = (list: typeof windows) => set({ weekly: [...others, ...list] })
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-16 items-center gap-2 text-[14px]">
                    <input type="checkbox" className={check} checked={windows.length > 0} onChange={(e) => write(e.target.checked ? [{ day, start: "09:00", end: "17:00" }] : [])} />
                    {DAYS[day]}
                  </label>
                  {windows.length ? (
                    windows.map((w, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <input className={field + " w-[104px]"} type="time" aria-label={`${DAYS[day]} from`} value={w.start} onChange={(e) => write(windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                        <span className="text-[13px] text-[#6b7280]">to</span>
                        <input className={field + " w-[104px]"} type="time" aria-label={`${DAYS[day]} until`} value={w.end} onChange={(e) => write(windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                        {windows.length > 1 ? (
                          <button type="button" className={iconButton} aria-label="Remove hours" onClick={() => write(windows.filter((_, j) => j !== i))}>
                            ×
                          </button>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className={muted}>Unavailable</span>
                  )}
                  {windows.length && windows.length < 4 ? (
                    <button type="button" className="text-[13px] text-[#1a1a2e] underline" onClick={() => write([...windows, { day, start: "18:00", end: "20:00" }])}>
                      Add hours
                    </button>
                  ) : null}
                </div>
              )
            })}
          </fieldset>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className={check} checked={b.approval} onChange={(e) => set({ approval: e.target.checked })} />
            Confirm each request myself
          </label>
          <label className={label}>
            Payment
            <select className={field} value={b.payment_product_id || ""} onChange={(e) => set({ payment_product_id: e.target.value || undefined })}>
              <option value="">No payment</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {b.payment_product_id ? <p className={muted}>After booking, visitors see a Pay button for this product. Payment does not confirm the booking by itself: check the order, then confirm it in Leads.</p> : null}
        </>
      )}
    </section>
  )
}

function IntegrationsEditor({
  form,
  value,
  retention,
  onRetention,
  onChange,
  onStamp,
}: {
  form: SavedForm
  value: ClientIntegrations
  retention: number | null
  onRetention: (d: number | null) => void
  onChange: (v: ClientIntegrations) => void
  onStamp: (updated_at: string) => void
}) {
  const [secret, setSecret] = useState<string | null>(null),
    [state, setState] = useState<string | null>(null),
    [working, setWorking] = useState(false)
  const call = async (action: "secret" | "test") => {
    setWorking(true)
    setState(null)
    try {
      const b = await api<{ secret?: string; updated_at?: string; integrations?: ClientIntegrations; status?: number }>(`/api/forms/${form.id}/webhook`, { method: "POST", body: JSON.stringify({ action }) })
      if (action === "secret" && b.secret) {
        setSecret(b.secret)
        if (b.updated_at) onStamp(b.updated_at)
        onChange({ ...value, webhook: { ...value.webhook, secret_hint: b.integrations?.webhook.secret_hint || "set" } })
      } else setState(`Test delivered (${b.status}).`)
    } catch (e) {
      setState(e instanceof Error ? e.message : "That did not work.")
    } finally {
      setWorking(false)
    }
  }
  return (
    <section className={section + " space-y-4"} data-integrations="">
      <h2 className={heading}>Responses</h2>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" className={check} checked={value.notify_email} onChange={(e) => onChange({ ...value, notify_email: e.target.checked })} />
        Email me each new response
      </label>
      <label className={label}>
        Keep responses
        <select className={field + " block sm:w-56"} value={retention ?? ""} onChange={(e) => onRetention(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Until I delete them</option>
          {[30, 90, 180, 365, 730].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-3 border-t border-[#f1f2f4] pt-4">
        <label className="flex items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" className={check} checked={value.webhook.enabled} onChange={(e) => onChange({ ...value, webhook: { ...value.webhook, enabled: e.target.checked } })} />
          Send each response to a webhook
        </label>
        <label className={label}>
          Webhook address
          <input className={field} type="url" placeholder="https://" value={value.webhook.url} onChange={(e) => onChange({ ...value, webhook: { ...value.webhook, url: e.target.value } })} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonSecondary} disabled={working} onClick={() => void call("secret")}>
            {value.webhook.secret_hint ? "New signing secret" : "Create signing secret"}
          </button>
          <button type="button" className={buttonSecondary} disabled={working || !value.webhook.secret_hint} onClick={() => void call("test")}>
            Send test
          </button>
          {value.webhook.secret_hint && !secret ? <span className={muted}>Secret ends in {value.webhook.secret_hint}</span> : null}
        </div>
        {secret ? (
          <p className="break-all rounded-lg bg-[#f4f5f7] p-3 font-mono text-[12px] text-[#1a1a2e]" data-webhook-secret="">
            {secret}
            <span className="mt-1 block font-sans text-[12px] text-[#6b7280]">Copy it now. It is not shown again.</span>
          </p>
        ) : null}
        {state ? (
          <p role="status" className={muted}>
            {state}
          </p>
        ) : null}
        <p className={muted}>
          Signed with HMAC SHA-256: <code className="text-[12px]">x-storelib-signature</code> is v1= and the hex of timestamp.body. Failed deliveries are retried for a day. Save the form after changing these.
        </p>
      </div>
      <div className="space-y-2 border-t border-[#f1f2f4] pt-4">
        <label className="flex items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" className={check} checked={value.google_sheets.prepared} onChange={(e) => onChange({ ...value, google_sheets: { prepared: e.target.checked } })} />
          Queue responses for Google Sheets
        </label>
        <p className={muted}>Google Sheets is not connected to Storelib yet. Queued responses are sent once it is. Until then, export CSV from Leads or point the webhook at Zapier or Make.</p>
      </div>
    </section>
  )
}
