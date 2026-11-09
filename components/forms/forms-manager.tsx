"use client"
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactElement, type ReactNode } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowLeft, ChevronDown, Copy, ExternalLink, Eye, GripVertical, MoreHorizontal, PenLine, Plus, X } from "lucide-react"
import { ActionEditor } from "./action-editor"
import { PublicFormRenderer } from "./public-form"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { Reveal } from "@/components/ui/reveal"
import { Segmented, Switch } from "@/components/onepage/editor-kit"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { ORDER_WIDTH, OrderBarFrame, buttonSecondary, buttonAccent, iconButton, StatusBadge } from "@/app/(storelib)/app/orders/order-parts"
import { barButton } from "@/app/(storelib)/app/products/new/editor-buttons"
import { inkDepth } from "@/app/(storelib)/app/coupons/coupon-parts"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { formsRequest } from "@/lib/forms/client"
import { formPath } from "@/lib/forms/actions"
import { platformOrigin } from "@/lib/onepage/return-address"
import {
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
import type { FormUsage } from "@/lib/forms/kind"
import { AREA, ERROR, FIELD, FIELD_STACK, HINT, LABEL, THIN_SCROLL } from "./fields"
import { useFormConfirm } from "./form-confirm"

/*
  ONE FORM'S BUILDER, in the builder dialog (./form-builder-dialog), opened
  from a OnePage Form block, a button that opens a form, a chat button's
  questions, and the forms list in Emails › Leads › Forms.

  ROUND AN, the owner: "make it more easy, clean, simple to understand and
  set up, not complicated ... the scroll bar more modern ... not the right
  side options". One column:

    the title (and an intro, once asked for)
    the questions, one compact row each, opening in place; Add question
    the settings, each a row that opens when it is wanted: after sending,
    where answers go, layout and button, bookings, privacy

  A bar at the top says what the form is and whether it is live, with
  Preview (the visitor's own renderer over the draft, saving nothing) and
  Close; a bar at the foot holds Save draft and Publish. Only the middle
  scrolls, with a thin scrollbar. Closing with changes not saved asks first
  (./form-confirm), never the browser's confirm().
*/

export interface SavedForm {
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

const heading = "text-[14px] font-semibold text-[#1a1a2e]"
const muted = "text-[13px] leading-5 text-[#6b7280]"
const textButton = "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f3f4f6] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12)
const ORDER = [1, 2, 3, 4, 5, 6, 0]

const dayWords = (): string[] => [tt("Sun"), tt("Mon"), tt("Tue"), tt("Wed"), tt("Thu"), tt("Fri"), tt("Sat")]

/** The question types, in the creator's language (the ids are lib/forms/definition FIELD_TYPES'). */
const typeWords = (): [FieldType, string][] => [
  ["text", tt("Short answer")],
  ["textarea", tt("Paragraph")],
  ["name", tt("Name")],
  ["email", tt("Email")],
  ["phone", tt("Phone")],
  ["number", tt("Number")],
  ["date", tt("Date")],
  ["dropdown", tt("Dropdown")],
  ["single", tt("Single choice")],
  ["multiple", tt("Multiple choice")],
  ["checkboxes", tt("Checkboxes")],
  ["rating", tt("Rating")],
  ["consent", tt("Consent")],
  ["file", tt("File upload")],
]

const opWords = (): [Condition["op"], string][] => [
  ["is", tt("is")],
  ["is_not", tt("is not")],
  ["includes", tt("includes")],
  ["answered", tt("is answered")],
  ["empty", tt("is empty")],
  ["gte", tt("is at least")],
  ["lte", tt("is at most")],
]

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await formsRequest<T>(url, { ...init, fallback: tt("That did not work. Try again.") })
  if (r.missing) throw Object.assign(new Error(tt("Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375).")), { status: 503 })
  if (r.error || !r.data) throw Object.assign(new Error(r.error || tt("That did not work. Try again.")), { status: r.status })
  return r.data
}

/** A list chosen in Storelib's own picker (components/ui/choice-list), never the native select. */
function Pick<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  placeholder,
  className,
}: {
  name: string
  label: string
  value: T | ""
  options: [T, string][]
  onChange: (v: T) => void
  hideLabel?: boolean
  placeholder?: string
  className?: string
}) {
  const chosen = options.find(([id]) => id === value)
  const choices: Choice[] = options.map(([id, words]) => ({ value: id, label: words }))
  return (
    <div className={cn(hideLabel ? "min-w-0" : FIELD_STACK, className)}>
      {hideLabel ? null : <span className={LABEL}>{label}</span>}
      <ChoicePicker
        name={name}
        title={label}
        choices={choices}
        value={value || null}
        onChange={(v) => onChange(v as T)}
        placeholder={tt("Search")}
        searchable={options.length > 8}
        uniform={options.length > 40}
        fieldLabel={chosen?.[1] ?? placeholder ?? tt("Choose")}
        fieldMuted={!chosen}
      />
    </div>
  )
}

/** A setting that opens where it is: its name, what it is set to now, and a chevron. */
function Disclosure({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div data-form-setting={id}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left outline-none transition-colors duration-100 hover:bg-[#fafafb] focus-visible:bg-[#f7f7f8]">
        <span className="min-w-0 flex-1 text-[14px] font-medium text-[#1a1a2e]">{title}</span>
        {summary && !open ? <span className="min-w-0 max-w-[55%] truncate text-[13px] text-[#6b7280]">{summary}</span> : null}
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <Reveal open={open}>
        <div className="space-y-4 px-4 pb-5 pt-1">{children}</div>
      </Reveal>
    </div>
  )
}

/** A yes or no, as the OnePage editor draws one: the words on the left, the switch on the right. */
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] text-[#1a1a2e]">{label}</p>
        {hint ? <p className={cn(HINT, "mt-0.5")}>{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

/**
 * Two shells around the same builder:
 *
 *   the dialog   (no `view`) the builder dialog over the OnePage editor
 *                (./form-builder-dialog): a top bar, the one column that
 *                scrolls, Save draft and Publish in a foot bar. `closeRef`
 *                lets the dialog's Escape and close go through the builder,
 *                which asks before changes are lost.
 *   the page     (`view`, round 51, Contacts › Forms › a form) the form's
 *                tabs: "edit" the same one column (questions, then after
 *                sending, layout and bookings behind their rows), "settings"
 *                publication, where answers go, privacy and the follow up,
 *                "panel" the `panel` given (Responses, Insights), the save
 *                buttons kept while something is unsaved so a change is
 *                never lost by changing tab. No side panel in either.
 *
 * `embedded` is kept for callers from before round AN.
 */
export function FormEditor({
  form,
  onBack,
  onSaved,
  closeRef,
  view,
  nav,
  panel,
  usages,
  kindLabel,
  responses,
  onView,
}: {
  form: SavedForm
  onBack: () => void
  onSaved: (f: SavedForm) => void
  embedded?: boolean
  closeRef?: MutableRefObject<(() => void) | null>
  view?: "edit" | "settings" | "panel"
  /** The tabs, drawn under the title. */
  nav?: ReactNode
  panel?: ReactNode
  /** Where the form is used (the summary beside the form). */
  usages?: FormUsage[]
  /** What kind of form it is, in words (Contacts › Forms kindWord), for the line under the title. */
  kindLabel?: string
  /** How many responses it has, for that line and the summary. */
  responses?: number
  /** Open another of the form's tabs (Responses from the summary, Settings from the ⋯). */
  onView?: (view: "edit" | "responses" | "insights" | "settings") => void
}) {
  const [saved, setSaved] = useState(form),
    [draft, setDraft] = useState<FormDefinition>(() => withDefaults(form.draft)),
    [integrations, setIntegrations] = useState<ClientIntegrations>(form.integration_settings),
    [retention, setRetention] = useState<number | null>(form.retention_days ?? null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [note, setNote] = useState<string | null>(null),
    [preview, setPreview] = useState(false),
    [openQuestion, setOpenQuestion] = useState<string | null>(null),
    /* Wave 8: on the page a form opens on what makes it its kind: a booking form's hours, a quiz's results, a lead magnet's private link. */
    [openSetting, setOpenSetting] = useState<string | null>(() => (view === undefined ? null : form.draft?.booking ? "bookings" : form.draft?.mode === "quiz" ? "layout" : form.draft?.completion?.kind === "gated" ? "after" : null)),
    [intro, setIntro] = useState(() => !!form.draft?.description?.trim())
  const [ask, confirmEl] = useFormConfirm()
  const scroller = useRef<HTMLDivElement>(null)
  /* The page's bar below lg: a hairline and a soft shadow once something scrolls under it (app/globals.css .orders-bar), as the Orders bar. */
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = barRef.current
    const pane = bar?.closest<HTMLElement>(".orders-pane")
    if (!bar || !pane) return
    const read = () => {
      bar.dataset.scrolled = pane.scrollTop > 0 ? "true" : "false"
    }
    read()
    pane.addEventListener("scroll", read, { passive: true })
    return () => pane.removeEventListener("scroll", read)
  }, [view])
  useEffect(() => {
    if (!dirty) return
    const hold = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", hold)
    return () => window.removeEventListener("beforeunload", hold)
  }, [dirty])
  /* A note says its piece and goes. */
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(t)
  }, [note])
  const change = (patch: Partial<FormDefinition>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
    setNote(null)
  }
  const editQuestion = (id: string, patch: Partial<FormField>) => change({ fields: draft.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const save = async (publish: boolean): Promise<boolean> => {
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
      setNote(publish ? tt("Published. Every page with this form shows this version.") : tt("Draft saved."))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("The form did not save."))
      return false
    } finally {
      setBusy(false)
    }
  }
  const close = async () => {
    if (!dirty) return onBack()
    const answer = await ask({
      title: tt("Save your changes?"),
      body: tt("You changed this form. Save a draft, or leave the changes behind."),
      confirm: tt("Discard"),
      cancel: tt("Keep editing"),
      alt: tt("Save draft"),
    })
    if (answer === true) onBack()
    else if (answer === "alt" && (await save(false))) onBack()
  }
  useEffect(() => {
    if (!closeRef) return
    closeRef.current = () => void close()
    return () => {
      closeRef.current = null
    }
  })
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
  const duplicate = (index: number) => {
    const q = draft.fields[index]
    const copy: FormField = { ...JSON.parse(JSON.stringify(q)), id: newId(), show_if: undefined }
    const fields = [...draft.fields]
    fields.splice(index + 1, 0, copy)
    change({ fields })
    setOpenQuestion(copy.id)
  }
  const add = () => {
    const q: FormField = { id: newId(), type: "text", label: "", required: false }
    change({ fields: [...draft.fields, q] })
    setOpenQuestion(q.id)
  }
  const publicLink = platformOrigin() + formPath(saved.id)
  const live = saved.status === "published"
  const unpublished = live && (dirty || (saved.draft && JSON.stringify(saved.draft) !== JSON.stringify(saved.published)))
  const toggleSetting = (id: string) => setOpenSetting((was) => (was === id ? null : id))

  const layoutWords: Record<string, string> = { single: tt("One page"), steps: tt("Steps"), one_by_one: tt("One at a time") }
  const afterSummary = draft.completion.kind === "gated" ? tt("Private link") : draft.completion.action ? tt("Message and a button") : tt("Message")
  const answersSummary = [tt("Responses"), integrations.notify_email ? tt("Email") : "", integrations.webhook.enabled ? tt("Webhook") : ""].filter(Boolean).join(", ")
  const inPage = view !== undefined

  const answersBody = (
    <IntegrationsEditor
      form={saved}
      value={integrations}
      retention={retention}
      onRetention={(d) => (setRetention(d), setDirty(true))}
      onChange={(v) => (setIntegrations(v), setDirty(true))}
      onStamp={(updated_at) => setSaved((s) => ({ ...s, updated_at }))}
    />
  )
  const privacyBody = (
    <>
      <label className={FIELD_STACK}>
        <span className={LABEL}>{tt("Consent notice")}</span>
        <textarea className={cn(AREA, "min-h-[76px]")} rows={2} maxLength={600} value={draft.consent_text} onChange={(e) => change({ consent_text: e.target.value })} />
      </label>
      <label className={FIELD_STACK}>
        <span className={LABEL}>{tt("Privacy policy address")}</span>
        <input className={FIELD} type="url" placeholder="https://" value={draft.privacy_url ?? ""} onChange={(e) => change({ privacy_url: e.target.value })} />
      </label>
      <Toggle label={tt("Offer a separate opt-in for updates")} checked={draft.marketing_opt_in} onChange={(on) => change({ marketing_opt_in: on })} />
    </>
  )

  /* On the page each part is a card, as the coupon and product editors' (pageCard); in the dialog they sit on its grey. */
  const H = inPage ? "h2" : "h3"
  const editor = (
    <div className={inPage ? "flex flex-col gap-3 sm:gap-4" : "space-y-7"} data-form-edit="">
      <section className={inPage ? pageCard : "space-y-3"}>
        <label className={FIELD_STACK}>
          <span className={LABEL}>{tt("Title")}</span>
          <input className={FIELD} value={draft.title} maxLength={160} onChange={(e) => change({ title: e.target.value })} />
        </label>
        {intro ? (
          <label className={FIELD_STACK}>
            <span className={LABEL}>{tt("Intro")}</span>
            <textarea className={cn(AREA, "min-h-[76px]")} rows={2} maxLength={1000} value={draft.description} onChange={(e) => change({ description: e.target.value })} autoFocus={!draft.description} />
          </label>
        ) : (
          <button type="button" className={cn(textButton, "-ml-2 text-[#4b5563]")} onClick={() => setIntro(true)} data-add-intro="">
            <Plus aria-hidden className="h-3.5 w-3.5" />
            {tt("Add an intro")}
          </button>
        )}
      </section>

      <section aria-labelledby="questions-h" className={inPage ? pageCard : undefined}>
        <div className={cn("flex items-baseline justify-between", !inPage && "mb-2.5")}>
          <H id="questions-h" className={inPage ? cardTitle : heading}>
            {tt("Questions")}
          </H>
          <span className="text-[12.5px] tabular-nums text-[#9ca3af]">{tt("{count} of {max}", { count: draft.fields.length, max: MAX_FIELDS })}</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draft.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <ol className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white" data-form-questions="">
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
                  onDuplicate={() => duplicate(index)}
                  onRemove={() => remove(q.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          className={cn(inPage ? "" : "mt-2.5", "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d5d7dd] bg-white text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] focus-visible:border-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] disabled:cursor-not-allowed disabled:opacity-50")}
          disabled={draft.fields.length >= MAX_FIELDS}
          onClick={add}
          data-add-question=""
        >
          <Plus aria-hidden className="h-4 w-4" />
          {tt("Add question")}
        </button>
      </section>

      <section aria-labelledby="settings-h" className={inPage ? pageCard : undefined}>
        <H id="settings-h" className={inPage ? cardTitle : cn(heading, "mb-2.5")}>
          {tt("Settings")}
        </H>
        <div className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white">
          <Disclosure id="after" title={tt("After sending")} summary={afterSummary} open={openSetting === "after"} onToggle={() => toggleSetting("after")}>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Message")}</span>
              <textarea className={cn(AREA, "min-h-[76px]")} rows={2} maxLength={1000} value={draft.completion.message} onChange={(e) => change({ completion: { ...draft.completion, message: e.target.value } })} />
            </label>
            <Segmented
              className={SEGMENT_WRAP}
              label={tt("After sending")}
              value={draft.completion.kind === "gated" ? "gated" : "message"}
              options={[
                { id: "message", label: tt("Message and a button") },
                { id: "gated", label: tt("Private link") },
              ]}
              onChange={(v) =>
                change({
                  completion: v === "gated" ? { ...draft.completion, kind: "gated", gated: draft.completion.gated || { url: "", label: tt("Open your download") } } : { ...draft.completion, kind: draft.completion.action ? "action" : "message" },
                })
              }
            />
            {draft.completion.kind === "gated" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={FIELD_STACK}>
                  <span className={LABEL}>{tt("Private link")}</span>
                  <input className={FIELD} type="url" placeholder="https://" value={draft.completion.gated?.url || ""} onChange={(e) => change({ completion: { ...draft.completion, gated: { label: draft.completion.gated?.label || tt("Open your download"), url: e.target.value } } })} />
                </label>
                <label className={FIELD_STACK}>
                  <span className={LABEL}>{tt("Button text")}</span>
                  <input className={FIELD} maxLength={80} value={draft.completion.gated?.label || ""} onChange={(e) => change({ completion: { ...draft.completion, gated: { url: draft.completion.gated?.url || "", label: e.target.value } } })} />
                </label>
                <p className={cn(HINT, "sm:col-span-2")}>{tt("Visitors get this link only after their response is saved. It never appears in the page.")}</p>
              </div>
            ) : (
              <>
                <ActionEditor allowNone value={draft.completion.action} onChange={(action) => change({ completion: { ...draft.completion, action, kind: action ? "action" : "message" } })} />
                {draft.completion.action?.type === "whatsapp" ? (
                  <>
                    <p className={HINT}>
                      {tt("The message can use {tokens} or a question ID such as {example}.", { tokens: "{name}, {email}, {phone}, {score}, {result}, {answers}", example: `{${draft.fields[0]?.id || "goal"}}` })}
                    </p>
                    <Toggle label={tt("Add every answer under the message")} checked={draft.completion.include_answers === true} onChange={(on) => change({ completion: { ...draft.completion, include_answers: on } })} />
                  </>
                ) : null}
              </>
            )}
          </Disclosure>

          {inPage ? null : (
            <Disclosure id="responses" title={tt("Where answers go")} summary={answersSummary} open={openSetting === "responses"} onToggle={() => toggleSetting("responses")}>
              {answersBody}
            </Disclosure>
          )}

          <Disclosure id="layout" title={tt("Layout and button")} summary={`${layoutWords[draft.layout] ?? ""}${draft.mode === "quiz" ? `, ${tt("Quiz")}` : ""}`} open={openSetting === "layout"} onToggle={() => toggleSetting("layout")}>
            <Segmented
              className={SEGMENT_WRAP}
              label={tt("Layout")}
              value={draft.layout}
              options={[
                { id: "single", label: tt("One page") },
                { id: "steps", label: tt("Steps") },
                { id: "one_by_one", label: tt("One at a time") },
              ]}
              onChange={(layout) => change({ layout: layout as FormDefinition["layout"] })}
            />
            {draft.layout === "steps" ? <p className={HINT}>{tt("Open a question and switch on Starts a new step to split the form.")}</p> : null}
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Send button")}</span>
              <input className={FIELD} value={draft.button_text} maxLength={80} onChange={(e) => change({ button_text: e.target.value })} />
            </label>
            <Toggle label={tt("Score answers and show a result")} checked={draft.mode === "quiz"} onChange={(on) => change({ mode: on ? "quiz" : "form" })} />
            {draft.mode === "quiz" ? <ResultsEditor results={draft.results || []} onChange={(results) => change({ results })} /> : null}
          </Disclosure>

          <Disclosure id="bookings" title={tt("Bookings")} summary={draft.booking ? tt("{minutes} min", { minutes: draft.booking.duration }) : tt("Off")} open={openSetting === "bookings"} onToggle={() => toggleSetting("bookings")}>
            <BookingEditor booking={draft.booking} onChange={(booking) => change({ booking })} />
          </Disclosure>

          {inPage ? null : (
            <Disclosure id="privacy" title={tt("Privacy")} summary={draft.marketing_opt_in ? tt("Opt-in offered") : undefined} open={openSetting === "privacy"} onToggle={() => toggleSetting("privacy")}>
              {privacyBody}
            </Disclosure>
          )}
        </div>
      </section>
    </div>
  )

  const previewPane = (
    <div className={inPage ? cn(pageCard, "space-y-0") : "rounded-xl border border-[#e3e4e8] bg-white p-4 sm:p-5"} data-form-preview="">
      <PublicFormRenderer key={JSON.stringify(draft)} formId={saved.id} preview initial={{ id: saved.id, revision: saved.revision, definition: draft }} />
    </div>
  )
  const status = (
    <div className="flex min-w-0 items-center gap-2">
      <StatusBadge tone={live ? "success" : "neutral"}>{live ? tt("Published") : tt("Draft")}</StatusBadge>
    </div>
  )
  const shareMenu = (trigger: ReactElement) => (
    <ResponsiveActionMenu
      title={tt("Share")}
      align="end"
      trigger={trigger}
      items={[
        { label: tt("Copy form link"), onClick: () => void navigator.clipboard.writeText(publicLink).then(() => setNote(tt("Form link copied."))) },
        { label: tt("Open public form"), href: formPath(saved.id), target: "_blank" },
        { label: tt("View responses"), href: responsesHref(saved.id) },
      ]}
    />
  )
  const message = error ? (
    <p role="alert" className={cn(ERROR, "line-clamp-2")}>
      {error}
    </p>
  ) : note ? (
    <p role="status" className="truncate text-[13px] text-[#067647]">
      {note}
    </p>
  ) : null

  /*
    ── The page (Contacts › Forms › a form), wave 6 ──────────────────────
    One bar, as the coupon and product editors (app/(storelib)/app/coupons/
    coupon-editor): the form's own name is the title, with the one back
    arrow to Forms and where it stands; its tabs under it; one column of
    cards, the same width as the bar so they line up. Below lg a sticky bar
    holds Back (Cancel while something is unsaved, which asks first), the ⋯
    (Preview, Share, Save draft) and Publish, as the editors' top bar holds
    Back and Save. From lg Preview and Share sit on the right of the title
    and Save draft and Publish in the editors' foot bar, with where the form
    stands on its left. On Responses and Insights the save buttons show only
    while something is unsaved, so a change is never lost by changing tab.
  */
  if (inPage) {
    const title = draft.title || tt("Untitled form")
    const saving = view !== "panel" || dirty
    const state = dirty ? "unsaved" : unpublished ? "changed" : live ? "live" : "draft"
    const stateLine =
      state === "unsaved"
        ? tt("Unsaved changes")
        : state === "changed"
          ? tt("The draft has changes that are not published")
          : state === "live"
            ? tt("Published, version {n}. Every page with this form shows it.", { n: saved.revision })
            : tt("Draft. Publish it to take responses.")
    const togglePreview = () => setPreview((v) => !v)
    const copyLink = () => void navigator.clipboard.writeText(publicLink).then(() => setNote(tt("Form link copied.")))
    /* One ⋯: below lg it holds Preview and Save draft as well (Publish sits beside it); from lg those are a button and the foot bar. */
    const phoneMenu: ActionMenuItem[] = [
      ...(view === "edit" ? [{ label: preview ? tt("Edit") : tt("Preview"), onClick: togglePreview }] : []),
      ...(live
        ? [
            { label: tt("Copy form link"), onClick: copyLink },
            { label: tt("Open public form"), href: formPath(saved.id), target: "_blank" as const },
          ]
        : []),
      ...(saving ? [{ label: tt("Save draft"), onClick: () => void save(false), disabled: busy || !dirty, separatorBefore: view === "edit" || live }] : []),
    ]
    const deskMenu: ActionMenuItem[] = [
      ...(live
        ? [
            { label: tt("Copy form link"), onClick: copyLink },
            { label: tt("Open public form"), href: formPath(saved.id), target: "_blank" as const },
          ]
        : []),
      { label: tt("View responses"), onClick: () => onView?.("responses"), separatorBefore: live },
      { label: tt("Settings"), onClick: () => onView?.("settings") },
    ]
    const responseWords = typeof responses === "number" ? tt("{n, plural, one {# response} other {# responses}}", { n: responses }) : null
    const subtitle = [kindLabel, responseWords, state === "unsaved" ? tt("Unsaved changes") : state === "changed" ? tt("Changes not published") : null].filter(Boolean).join(" · ")
    const withAside = view === "edit" || view === "settings"
    const summary = (
      <FormSummary
        form={saved}
        state={state}
        stateLine={stateLine}
        publicLink={publicLink}
        usages={usages ?? []}
        responses={responses}
        onResponses={onView ? () => onView("responses") : undefined}
        onCopy={copyLink}
      />
    )
    /*
      ── The page (Contacts › Forms › a form), wave 7 ─────────────────────
      The owner: "I don't like the page of a form. Make it smoother,
      cleaner, Storelib UI." It is laid out as an order and a person are:
      an order's bar (OrderBarFrame, sticky: the one back arrow up to Forms,
      the form's name and where it stands, its kind and responses under it,
      the actions on the right), the form's tabs as the quiet views every
      list wears, then on a computer two columns as the coupon editor's:
      the work on the left (the form's cards; Responses and Insights take
      the whole width) and the summary on the right (where it stands, how
      many answered, its link, where it is used). Below lg the summary goes
      under the work, Publish sits in the bar beside the ⋯; from lg Save
      draft and Publish are in the editors' foot bar.
    */
    return (
      <>
        <OrderBarFrame
          back={
            <button type="button" onClick={() => void close()} className={cn(iconButton, "h-9 w-9 hover:bg-[#eceef1] active:bg-[#e4e6ea] max-md:h-11 max-md:w-11")} aria-label={tt("Back to forms")} title={tt("Forms")} data-contacts-back="">
              <ArrowLeft className="h-5 w-5" />
            </button>
          }
          title={
            <>
              <h1 className="min-w-0 truncate text-[22px] font-bold leading-8 text-[#1a1a2e] sm:text-[20px] sm:leading-7" data-form-title="">
                {title}
              </h1>
              <span className="shrink-0 max-sm:hidden">
                <StatusBadge tone={live ? "success" : "neutral"}>{live ? tt("Published") : tt("Draft")}</StatusBadge>
              </span>
            </>
          }
          actions={
            <>
              {view === "edit" ? (
                <button type="button" className={cn(buttonSecondary, "hidden lg:inline-flex")} onClick={togglePreview} aria-pressed={preview} data-form-preview-toggle="">
                  {preview ? <PenLine aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                  {preview ? tt("Edit") : tt("Preview")}
                </button>
              ) : null}
              <span className="hidden lg:inline-flex">
                <ResponsiveActionMenu
                  title={title}
                  align="end"
                  trigger={
                    <button type="button" className={cn(buttonSecondary, "w-8 px-0")} aria-label={tt("More actions")} data-form-share="">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  }
                  items={deskMenu}
                />
              </span>
              {phoneMenu.length ? (
                <span className="lg:hidden">
                  <ResponsiveActionMenu
                    title={title}
                    align="end"
                    trigger={
                      <button type="button" className={cn(buttonSecondary, "w-8 px-0 max-md:h-11 max-md:w-11 max-md:rounded-xl")} aria-label={tt("More actions")} data-form-actions-more="">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                    items={phoneMenu}
                  />
                </span>
              ) : null}
              {saving ? (
                <span className="lg:hidden">
                  <PublishButton busy={busy} onPublish={() => void save(true)} />
                </span>
              ) : null}
            </>
          }
          subtitle={<span data-form-subtitle="">{subtitle}</span>}
        />

        <div className={cn("mx-auto w-full pb-24 md:pb-10", FORM_WIDTH, "app-gutter")} data-form-builder="" data-form-view={view}>
          <div className="mt-1 flex min-w-0 items-center">{nav}</div>
          {/* Below lg the foot bar is not drawn: what just happened is said here. */}
          {message ? (
            <div className="mt-2 lg:hidden" aria-live="polite">
              {message}
            </div>
          ) : null}
          {/* Wave 8: Responses and Insights stay mounted behind the other tabs (read ahead, kept as they were), so a tab is there the moment it is pressed. */}
          {panel ? (
            <div className="mt-3 min-w-0" hidden={view !== "panel"} data-form-tab-body={view === "panel" ? "" : undefined} data-form-panels="">
              {panel}
            </div>
          ) : null}
          {view === "panel" ? null : (
          <div className={cn("mt-3", withAside && "grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start")}>
            <div className="min-w-0" data-form-tab-body="">
              {view === "settings" ? (
                <div className="flex flex-col gap-3 sm:gap-4">
                  <section className={pageCard}>
                    <h2 className={cardTitle}>{tt("Where answers go")}</h2>
                    {answersBody}
                  </section>
                  <section className={pageCard}>
                    <h2 className={cardTitle}>{tt("Privacy")}</h2>
                    {privacyBody}
                  </section>
                  <FollowUpCard />
                </div>
              ) : preview ? (
                previewPane
              ) : (
                editor
              )}
            </div>
            {withAside ? <aside className="min-w-0 lg:sticky lg:top-[96px]" aria-label={tt("Summary")}>{summary}</aside> : null}
          </div>
          )}
        </div>

        {saving ? (
          <div data-editor-foot="" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block" data-app-foot="up">
            <div className={cn("mx-auto flex h-16 items-center justify-between gap-4", FORM_WIDTH, "app-gutter")}>
              <div className="flex min-w-0 items-center gap-2 text-[14px] leading-5" data-editor-state={state} aria-live="polite">
                {message ?? (
                  <>
                    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", state === "unsaved" ? "bg-[#111113]" : state === "live" ? "bg-[#22a06b]" : "bg-[#b6bac1]")} />
                    <span className={cn("truncate", state === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className={barButton} disabled={busy || !dirty} onClick={() => void save(false)} data-save-draft="">
                  {tt("Save draft")}
                </button>
                <PublishButton busy={busy} onPublish={() => void save(true)} />
              </div>
            </div>
          </div>
        ) : null}
        {confirmEl}
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white" data-form-builder="">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-[#eef0f2] py-2.5 pl-4 pr-2 sm:pl-5 sm:pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[16px] font-semibold text-[#1a1a2e]">{draft.title || tt("Untitled form")}</h2>
            {status}
          </div>
          {unpublished ? <p className="truncate text-[12.5px] text-[#6b7280]">{dirty ? tt("Unsaved changes") : tt("The draft has changes that are not published")}</p> : null}
        </div>
        <button type="button" className={cn(textButton, "shrink-0")} onClick={() => (setPreview((v) => !v), scroller.current?.scrollTo({ top: 0 }))} aria-pressed={preview} data-form-preview-toggle="">
          {preview ? <PenLine aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          {preview ? tt("Edit") : tt("Preview")}
        </button>
        {live
          ? shareMenu(
              <button type="button" className={cn(iconButton, "h-9 w-9 shrink-0")} aria-label={tt("Share")} data-form-share="">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>,
            )
          : null}
        <button type="button" onClick={() => void close()} className={cn(iconButton, "h-9 w-9 shrink-0")} aria-label={tt("Close")} data-form-builder-done="">
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8f9fa] px-4 py-5 sm:px-5", THIN_SCROLL)} data-form-builder-scroll="" data-onepage-dialog-scroll="">
        {preview ? previewPane : editor}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-[#eef0f2] bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1" aria-live="polite">
          {message}
        </div>
        <button type="button" className={cn(buttonSecondary, "h-9 shrink-0 px-3.5")} disabled={busy || !dirty} onClick={() => void save(false)} data-save-draft="">
          {tt("Save draft")}
        </button>
        <button type="button" className={cn(buttonAccent, "h-9 shrink-0 px-3.5")} disabled={busy} onClick={() => void save(true)} data-publish-form="">
          {busy ? tt("Saving") : tt("Publish")}
        </button>
      </footer>
      {confirmEl}
    </div>
  )
}

/* Wave 8: a choice's words wrap onto a second line on a phone ("One at a time") instead of being cut. */
const SEGMENT_WRAP = "[&_span]:whitespace-normal [&_span]:text-center [&_span]:leading-[17px]"

/* The form's page: its bar, tabs, cards and foot share one width, an order's and a person's (wave 7; 800px in wave 6). */
const FORM_WIDTH = ORDER_WIDTH

/* Measured from the padding box: on a phone the press is 44px high inside a 40px button (coupon-parts CouponSaveButton). */
const PRESS_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-[2px] after:content-[''] sm:after:hidden"

/** Publish, the page's one dark action: the coupon editor's Save (coupon-parts CouponSaveButton), busy while it saves, never changing width. */
function PublishButton({ busy, onPublish }: { busy: boolean; onPublish: () => void }) {
  return (
    <button
      type="button"
      data-publish-form=""
      onClick={() => {
        if (!busy) onPublish()
      }}
      aria-busy={busy || undefined}
      className={cn(PRESS_AREA, inkDepth, "h-10 min-w-[72px] rounded-[10px] px-4 text-[15px] sm:h-8 sm:min-w-[68px] sm:rounded-lg sm:px-3 sm:text-[13px]", busy && "cursor-default hover:bg-[#111113] active:bg-[#111113]")}
    >
      <span className={cn(busy && "opacity-0")}>{tt("Publish")}</span>
      {busy ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <ActivitySpinner size={18} label={tt("Saving")} className="text-white" />
        </span>
      ) : null}
    </button>
  )
}

/** Where a form's responses are read: Contacts › Forms, the form open on Responses (round 51). */
export function responsesHref(formId: string): string {
  return `/app/contacts/forms?form=${encodeURIComponent(formId)}&view=responses`
}

/** The words for where a form is used, in the creator's language. */
export function usageWords(u: FormUsage): string {
  if (u.kind === "creator_page") return tt("Creator Page")
  if (u.kind === "onepage") return u.label && u.label !== "OnePage" ? tt("OnePage: {name}", { name: u.label }) : tt("OnePage")
  return tt("Website: {name}", { name: u.label })
}

/* The page's cards and their titles: the coupon and product editors' own (app/(storelib)/app/coupons/coupon-editor CARD, CARD_TITLE). */
const pageCard = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6"
const cardTitle = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"

/**
 * THE FORM'S SUMMARY, beside it on a computer and under it on a phone (wave
 * 7; Settings › Publication before, round 51). Where it stands (live, which
 * version, a draft with changes), how many answered (opening Responses), its
 * own link to copy or open, and every page it is placed on. Publishing stays
 * the Publish button: nothing here changes what visitors see.
 */
function FormSummary({
  form,
  state,
  stateLine,
  publicLink,
  usages,
  responses,
  onResponses,
  onCopy,
}: {
  form: SavedForm
  state: "unsaved" | "changed" | "live" | "draft"
  stateLine: string
  publicLink: string
  usages: FormUsage[]
  responses?: number
  onResponses?: () => void
  onCopy: () => void
}) {
  const live = form.status === "published"
  const label = "text-[12.5px] font-medium text-[#6b7280]"
  return (
    <section className={cn(pageCard, "space-y-0")} data-form-publication="">
      <h2 className={cardTitle}>{tt("Summary")}</h2>
      <div className="mt-3 flex items-start gap-2">
        <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", state === "unsaved" ? "bg-[#111113]" : state === "live" ? "bg-[#22a06b]" : state === "changed" ? "bg-[#d97706]" : "bg-[#b6bac1]")} />
        <p className="text-[13.5px] leading-5 text-[#1a1a2e]" data-form-state={state}>
          {stateLine}
        </p>
      </div>

      {typeof responses === "number" ? (
        <div className="mt-4 border-t border-[#f1f2f4] pt-3.5">
          <p className={label}>{tt("Responses")}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{responses.toLocaleString(appLocale())}</span>
            {onResponses ? (
              <button type="button" className={cn(textButton, "-mr-2 text-[#1a1a2e]")} onClick={onResponses} data-summary-responses="">
                {tt("View responses")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-[#f1f2f4] pt-3.5">
        <p className={label}>{tt("Form link")}</p>
        {live ? (
          <>
            <div className="mt-1.5 flex min-w-0 items-center gap-1 rounded-lg border border-[#e3e4e8] bg-[#fafbfb] py-1 pl-2.5 pr-1">
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#4b5563]" title={publicLink}>
                {publicLink.replace(/^https?:\/\//, "")}
              </span>
              <button type="button" className={cn(iconButton, "h-7 w-7 shrink-0 max-md:h-9 max-md:w-9")} aria-label={tt("Copy form link")} title={tt("Copy form link")} onClick={onCopy} data-copy-form-link="">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <a className={cn(textButton, "-ml-2 mt-1")} href={formPath(form.id)} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              {tt("Open public form")}
            </a>
          </>
        ) : (
          <p className={cn(muted, "mt-1")}>{tt("The link works once the form is published.")}</p>
        )}
      </div>

      <div className="mt-4 border-t border-[#f1f2f4] pt-3.5">
        <p className={label}>{tt("Used on")}</p>
        {usages.length ? (
          <ul className="mt-1.5 space-y-1.5" data-form-usages="">
            {usages.map((u) => (
              <li key={`${u.kind}-${u.label}`}>
                <a className="text-[13.5px] text-[#1a1a2e] underline-offset-2 hover:underline" href={u.href}>
                  {usageWords(u)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn(muted, "mt-1")}>{tt("Not placed on a page yet. Add a Form block on your OnePage, website or Creator Page and pick this form.")}</p>
        )}
      </div>
    </section>
  )
}

/** SETTINGS › FOLLOW UP (round 51): an email after a response is an automation, made in Emails. */
function FollowUpCard() {
  return (
    <section className={pageCard} data-form-follow-up="">
      <h2 className={cardTitle}>{tt("Email after a response")}</h2>
      <p className={cn(muted, "-mt-2")}>{tt("Send an email after someone answers with an automation in Emails.")}</p>
      <a className={buttonSecondary + " inline-flex"} href="/app/emails?tab=automations">
        {tt("Open automations")}
      </a>
    </section>
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
  onDuplicate,
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
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const types = typeWords()
  const typeLabel = types.find(([id]) => id === q.type)?.[1] || q.type
  const setType = (type: FieldType) =>
    onChange({
      type,
      ...(isChoice(type) && !q.options?.length
        ? {
            options: [
              { id: newId(), label: tt("Option 1") },
              { id: newId(), label: tt("Option 2") },
            ],
          }
        : {}),
      ...(type === "rating" ? { max: q.max && q.max >= 3 && q.max <= 10 ? q.max : 5 } : {}),
    })
  const line = [typeLabel, q.required ? tt("Required") : "", q.show_if?.length ? tt("Shown by a rule") : "", steps && q.new_step && index > 0 ? tt("New step") : ""].filter(Boolean).join(" · ")
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative bg-white", isDragging && "z-10 shadow-[0_8px_24px_rgba(16,24,40,0.12)]")} data-form-question={q.id}>
      <div className="flex items-center gap-0.5 py-1 pl-1 pr-1">
        <button type="button" className={cn(iconButton, "h-9 w-8 shrink-0 cursor-grab touch-none text-[#9ca3af] active:cursor-grabbing")} aria-label={tt("Drag question {n}", { n: index + 1 })} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:bg-[#f7f7f8]">
          {/* Wave 7: each question wears its number, so the list reads as the form will. */}
          <span aria-hidden className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12.5px] font-semibold tabular-nums", open ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#4b5563]")} data-question-number="">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{q.label || <span className="font-normal text-[#9ca3af]">{tt("Untitled question")}</span>}</span>
            <span className="block truncate text-[12.5px] text-[#6b7280]">{line}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </button>
        <ResponsiveActionMenu
          title={q.label || tt("Untitled question")}
          align="end"
          trigger={
            <button type="button" className={cn(iconButton, "h-9 w-9 shrink-0")} aria-label={tt("Actions for question {n}", { n: index + 1 })} data-question-menu="">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
          items={[
            ...(index > 0 ? [{ label: tt("Move up"), onClick: () => onMove(-1) }] : []),
            ...(index < count - 1 ? [{ label: tt("Move down"), onClick: () => onMove(1) }] : []),
            ...(count < MAX_FIELDS ? [{ label: tt("Duplicate"), onClick: onDuplicate }] : []),
            ...(count > 1 ? [{ label: tt("Remove"), variant: "destructive" as const, separatorBefore: true, onClick: onRemove }] : []),
          ]}
        />
      </div>
      <Reveal open={open}>
        <div className="space-y-4 px-4 pb-5 pt-2">
          <label className={FIELD_STACK}>
            <span className={LABEL}>{tt("Question")}</span>
            <input className={FIELD} value={q.label} maxLength={300} autoFocus={!q.label} onChange={(e) => onChange({ label: e.target.value })} />
          </label>
          <Pick name="question-type" label={tt("Type")} value={q.type} options={types} onChange={setType} />
          {!isChoice(q.type) && !["rating", "consent", "file"].includes(q.type) ? (
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Placeholder")}</span>
              <input className={FIELD} value={q.placeholder ?? ""} maxLength={120} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </label>
          ) : null}
          {isChoice(q.type) ? <OptionsEditor q={q} quiz={quiz} onChange={onChange} /> : null}
          {q.type === "number" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className={FIELD_STACK}>
                <span className={LABEL}>{tt("Lowest")}</span>
                <input className={FIELD} type="number" value={q.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </label>
              <label className={FIELD_STACK}>
                <span className={LABEL}>{tt("Highest")}</span>
                <input className={FIELD} type="number" value={q.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </label>
            </div>
          ) : null}
          {q.type === "rating" ? (
            <Pick
              name="rating-scale"
              label={tt("Scale")}
              value={String(q.max || 5)}
              options={[3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), tt("1 to {n}", { n })] as [string, string])}
              onChange={(v) => onChange({ max: Number(v) })}
            />
          ) : null}
          <label className={FIELD_STACK}>
            <span className={LABEL}>{tt("Help text")}</span>
            <input className={FIELD} value={q.description ?? ""} maxLength={500} placeholder={tt("Optional")} onChange={(e) => onChange({ description: e.target.value })} />
          </label>
          <div className="space-y-1">
            <Toggle label={tt("Required")} checked={q.required} onChange={(on) => onChange({ required: on })} />
            {steps && index > 0 ? <Toggle label={tt("Starts a new step")} checked={q.new_step === true} onChange={(on) => onChange({ new_step: on || undefined })} /> : null}
          </div>
          {earlier.length ? <RulesEditor rules={q.show_if || []} earlier={earlier} onChange={(show_if) => onChange({ show_if: show_if.length ? show_if : undefined })} /> : null}
        </div>
      </Reveal>
    </li>
  )
}

function OptionsEditor({ q, quiz, onChange }: { q: FormField; quiz: boolean; onChange: (patch: Partial<FormField>) => void }) {
  const options = q.options || []
  const set = (i: number, patch: Partial<NonNullable<FormField["options"]>[number]>) => onChange({ options: options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  return (
    <fieldset className="space-y-2">
      <legend className={cn(LABEL, "mb-2")}>{quiz ? tt("Answers and points") : tt("Answers")}</legend>
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <input className={FIELD} aria-label={tt("Answer {n}", { n: i + 1 })} value={o.label} maxLength={200} onChange={(e) => set(i, { label: e.target.value })} />
          {quiz ? <input className={cn(FIELD, "w-20 shrink-0")} type="number" aria-label={tt("Points for answer {n}", { n: i + 1 })} value={o.score ?? 0} onChange={(e) => set(i, { score: Number(e.target.value) || 0 })} /> : null}
          <button type="button" className={cn(iconButton, "h-9 w-9 shrink-0")} aria-label={tt("Remove answer {n}", { n: i + 1 })} disabled={options.length === 1} onClick={() => onChange({ options: options.filter((_, j) => j !== i) })}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" className={cn(textButton, "-ml-2")} disabled={options.length >= 30} onClick={() => onChange({ options: [...options, { id: newId(), label: tt("Option {n}", { n: options.length + 1 }) }] })}>
        <Plus aria-hidden className="h-3.5 w-3.5" />
        {tt("Add answer")}
      </button>
    </fieldset>
  )
}

function RulesEditor({ rules, earlier, onChange }: { rules: Condition[]; earlier: FormField[]; onChange: (r: Condition[]) => void }) {
  const set = (i: number, patch: Partial<Condition>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const ops = opWords()
  return (
    <fieldset className="space-y-2" data-rules="">
      {rules.length ? <legend className={cn(LABEL, "mb-2")}>{tt("Show only when")}</legend> : null}
      {rules.map((r, i) => {
        const target = earlier.find((f) => f.id === r.field)
        const needsValue = !["answered", "empty"].includes(r.op)
        return (
          <div key={i} className="space-y-2 rounded-xl bg-[#f8f9fa] p-2.5">
            <div className="flex items-center gap-2">
              <Pick hideLabel name="rule-question" label={tt("Question")} value={r.field} options={earlier.map((f) => [f.id, f.label || tt("Untitled question")] as [string, string])} onChange={(v) => set(i, { field: v, value: "" })} className="flex-1" />
              <button type="button" className={cn(iconButton, "h-9 w-9 shrink-0")} aria-label={tt("Remove rule")} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Pick hideLabel name="rule-op" label={tt("Comparison")} value={r.op} options={ops} onChange={(v) => set(i, { op: v })} />
              {needsValue ? (
                target && isChoice(target.type) && ["is", "is_not", "includes"].includes(r.op) ? (
                  <Pick hideLabel name="rule-answer" label={tt("Answer")} value={r.value || ""} options={(target.options || []).map((o) => [o.id, o.label] as [string, string])} onChange={(v) => set(i, { value: v })} placeholder={tt("Choose an answer")} />
                ) : (
                  <input className={FIELD} aria-label={tt("Value")} value={r.value || ""} maxLength={200} onChange={(e) => set(i, { value: e.target.value })} />
                )
              ) : null}
            </div>
          </div>
        )
      })}
      {rules.length < 5 ? (
        <button type="button" className={cn(textButton, "-ml-2 text-[#4b5563]")} onClick={() => onChange([...rules, { field: earlier[earlier.length - 1].id, op: "answered" }])}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {rules.length ? tt("Add another rule") : tt("Show only when an earlier answer matches")}
        </button>
      ) : null}
    </fieldset>
  )
}

function ResultsEditor({ results, onChange }: { results: QuizResult[]; onChange: (r: QuizResult[]) => void }) {
  const set = (i: number, patch: Partial<QuizResult>) => onChange(results.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <fieldset className="space-y-3">
      <legend className={cn(LABEL, "mb-2")}>{tt("Results by total points")}</legend>
      {results.map((r, i) => (
        <div key={r.id} className="space-y-3 rounded-xl bg-[#f8f9fa] p-3">
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("From")}</span>
              <input className={FIELD} type="number" value={r.min} onChange={(e) => set(i, { min: Number(e.target.value) || 0 })} />
            </label>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("To")}</span>
              <input className={FIELD} type="number" value={r.max} onChange={(e) => set(i, { max: Number(e.target.value) || 0 })} />
            </label>
            <button type="button" className={cn(iconButton, "mb-1 h-9 w-9")} aria-label={tt("Remove result {n}", { n: i + 1 })} onClick={() => onChange(results.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className={FIELD_STACK}>
            <span className={LABEL}>{tt("Result")}</span>
            <input className={FIELD} value={r.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} />
          </label>
          <label className={FIELD_STACK}>
            <span className={LABEL}>{tt("Message")}</span>
            <textarea className={cn(AREA, "min-h-[76px]")} rows={2} maxLength={1000} value={r.message} onChange={(e) => set(i, { message: e.target.value })} />
          </label>
          <ActionEditor allowNone value={r.action} onChange={(action) => set(i, { action })} />
        </div>
      ))}
      {results.length < 10 ? (
        <button
          type="button"
          className={cn(textButton, "-ml-2")}
          onClick={() => {
            const top = results.reduce((m, r) => Math.max(m, r.max), -1)
            onChange([...results, { id: newId(), min: top + 1, max: top + 10, title: "", message: "" }])
          }}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {tt("Add result")}
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
  const b = booking
  const days = dayWords()
  const set = (patch: Partial<BookingSettings>) => b && onChange({ ...b, ...patch })
  return (
    <div className="space-y-4" data-booking-editor="">
      <Toggle
        label={tt("Take bookings with this form")}
        hint={b ? undefined : tt("Visitors pick a time before answering. For Calendly or another booking page, use a button action instead.")}
        checked={!!b}
        onChange={(on) =>
          onChange(
            on
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
      {b ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Length (minutes)")}</span>
              <input className={FIELD} type="number" min={5} max={480} value={b.duration} onChange={(e) => set({ duration: Number(e.target.value) || 30 })} />
            </label>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Break after (minutes)")}</span>
              <input className={FIELD} type="number" min={0} max={240} value={b.buffer} onChange={(e) => set({ buffer: Number(e.target.value) || 0 })} />
            </label>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Notice (hours)")}</span>
              <input className={FIELD} type="number" min={0} max={720} value={b.notice_hours} onChange={(e) => set({ notice_hours: Number(e.target.value) || 0 })} />
            </label>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Days ahead")}</span>
              <input className={FIELD} type="number" min={1} max={365} value={b.days_ahead} onChange={(e) => set({ days_ahead: Number(e.target.value) || 30 })} />
            </label>
          </div>
          <Pick name="booking-zone" label={tt("Your time zone")} value={b.timezone} options={(tzList.includes(b.timezone) ? tzList : [b.timezone, ...tzList]).map((z) => [z, z.replace(/_/g, " ")] as [string, string])} onChange={(z) => set({ timezone: z })} />
          {/*
            Wave 8: the week as one list, a row a day, as the settings' rows are
            drawn: the day's switch (Storelib's, not the browser's checkbox),
            its name, then its hours. On a phone the hours go under the day and
            share its width, so a time is never cut off.
          */}
          <fieldset className="min-w-0">
            <legend className={cn(LABEL, "mb-2")}>{tt("Weekly hours")}</legend>
            <div className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white" data-booking-week="">
              {ORDER.map((day) => {
                const windows = b.weekly.filter((w) => w.day === day)
                const others = b.weekly.filter((w) => w.day !== day)
                const write = (list: typeof windows) => set({ weekly: [...others, ...list] })
                const on = windows.length > 0
                return (
                  <div key={day} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3" data-booking-day={day}>
                    <div className="flex h-11 shrink-0 items-center justify-between gap-3 sm:h-10 sm:w-[112px] sm:justify-start">
                      <span className={cn("text-[14px] font-medium sm:order-2", on ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{days[day]}</span>
                      <span className="sm:order-1 sm:-ml-1.5">
                        <Switch checked={on} onChange={(yes) => write(yes ? [{ day, start: "09:00", end: "17:00" }] : [])} label={days[day]} />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {on ? (
                        windows.map((w, i) => (
                          <div key={i} className="flex min-w-0 items-center gap-2">
                            <input className={cn(FIELD, "h-10 min-w-0 flex-1 px-2.5 tabular-nums sm:max-w-[132px] max-sm:[&::-webkit-calendar-picker-indicator]:hidden")} type="time" aria-label={tt("{day} from", { day: days[day] })} value={w.start} onChange={(e) => write(windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                            <span className="shrink-0 text-[13px] text-[#6b7280]">{tt("to")}</span>
                            <input className={cn(FIELD, "h-10 min-w-0 flex-1 px-2.5 tabular-nums sm:max-w-[132px] max-sm:[&::-webkit-calendar-picker-indicator]:hidden")} type="time" aria-label={tt("{day} until", { day: days[day] })} value={w.end} onChange={(e) => write(windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                            {windows.length > 1 ? (
                              <button type="button" className={cn(iconButton, "h-10 w-10 shrink-0")} aria-label={tt("Remove hours")} onClick={() => write(windows.filter((_, j) => j !== i))}>
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <span className={cn(muted, "hidden h-10 items-center sm:flex")}>{tt("Unavailable")}</span>
                      )}
                      {on && windows.length < 4 ? (
                        <button type="button" className={cn(textButton, "-ml-2 self-start text-[#4b5563] max-sm:h-10")} onClick={() => write([...windows, { day, start: "18:00", end: "20:00" }])}>
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                          {tt("Add hours")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </fieldset>
          <Toggle label={tt("Confirm each request myself")} checked={b.approval} onChange={(on) => set({ approval: on })} />
          <Pick
            name="booking-payment"
            label={tt("Payment")}
            value={b.payment_product_id || "none"}
            options={[["none", tt("No payment")], ...((products || []).map((p) => [p.id, p.title] as [string, string]))]}
            onChange={(v) => set({ payment_product_id: v === "none" ? undefined : v })}
          />
          {b.payment_product_id ? <p className={HINT}>{tt("After booking, visitors see a Pay button for this product. Payment does not confirm the booking by itself: check the order, then confirm it in Leads.")}</p> : null}
        </>
      ) : null}
    </div>
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
      } else setState(tt("Test delivered ({status}).", { status: b.status ?? "" }))
    } catch (e) {
      setState(e instanceof Error ? e.message : tt("That did not work."))
    } finally {
      setWorking(false)
    }
  }
  return (
    <div className="space-y-4" data-integrations="">
      <p className={HINT}>{tt("Every response is kept under Responses.")}</p>
      <Toggle label={tt("Email me each new response")} checked={value.notify_email} onChange={(on) => onChange({ ...value, notify_email: on })} />
      <Pick
        name="keep-responses"
        label={tt("Keep responses")}
        value={retention ? String(retention) : "forever"}
        options={[["forever", tt("Until I delete them")], ...[30, 90, 180, 365, 730].map((d) => [String(d), tt("{days} days", { days: d })] as [string, string])]}
        onChange={(v) => onRetention(v === "forever" ? null : Number(v))}
      />
      <div className="space-y-3 border-t border-[#eef0f2] pt-3">
        <Toggle label={tt("Send each response to a webhook")} checked={value.webhook.enabled} onChange={(on) => onChange({ ...value, webhook: { ...value.webhook, enabled: on } })} />
        {value.webhook.enabled || value.webhook.url ? (
          <>
            <label className={FIELD_STACK}>
              <span className={LABEL}>{tt("Webhook address")}</span>
              <input className={FIELD} type="url" placeholder="https://" value={value.webhook.url} onChange={(e) => onChange({ ...value, webhook: { ...value.webhook, url: e.target.value } })} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={buttonSecondary} disabled={working} onClick={() => void call("secret")}>
                {value.webhook.secret_hint ? tt("New signing secret") : tt("Create signing secret")}
              </button>
              <button type="button" className={buttonSecondary} disabled={working || !value.webhook.secret_hint} onClick={() => void call("test")}>
                {tt("Send test")}
              </button>
              {value.webhook.secret_hint && !secret ? <span className={muted}>{tt("Secret ends in {hint}", { hint: value.webhook.secret_hint })}</span> : null}
            </div>
            {secret ? (
              <p className="break-all rounded-lg bg-[#f4f5f7] p-3 font-mono text-[12px] text-[#1a1a2e]" data-webhook-secret="">
                {secret}
                <span className="mt-1 block font-sans text-[12px] text-[#6b7280]">{tt("Copy it now. It is not shown again.")}</span>
              </p>
            ) : null}
            {state ? (
              <p role="status" className={muted}>
                {state}
              </p>
            ) : null}
            <p className={HINT}>
              {tt("Signed with HMAC SHA-256: {header} is v1= and the hex of timestamp.body. Failed deliveries are retried for a day. Save the form after changing these.", { header: "x-storelib-signature" })}
            </p>
          </>
        ) : null}
      </div>
      <div className="space-y-1 border-t border-[#eef0f2] pt-3">
        <Toggle label={tt("Queue responses for Google Sheets")} checked={value.google_sheets.prepared} onChange={(on) => onChange({ ...value, google_sheets: { prepared: on } })} />
        <p className={HINT}>{tt("Google Sheets is not connected to Storelib yet. Queued responses are sent once it is. Until then, export CSV from Responses or point the webhook at Zapier or Make.")}</p>
      </div>
    </div>
  )
}
