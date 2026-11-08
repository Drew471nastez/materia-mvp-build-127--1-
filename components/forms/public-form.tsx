"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { v4 as uuid } from "uuid"
import { platformOrigin } from "@/lib/onepage/return-address"
import { actionLabel } from "@/lib/forms/actions"
import { formSteps, isChoice, isMulti, pickResult, validDate, type FormField, type PublicForm } from "@/lib/forms/definition"
import { generateSlots, type Slot } from "@/lib/forms/slots"
import { formsRequest } from "@/lib/forms/client"

/*
  THE VISITOR'S FORM, the same on a OnePage, a website and a creator page.

  Steps come from formSteps (lib/forms/definition.ts), the function the
  server uses to decide which questions count, so a question hidden by an
  answer is neither shown nor required on either side. A booking form
  starts with its times. Everything is checked again on the server; the
  checks here only save the visitor a round trip.
*/

const input =
  "w-full min-w-0 rounded-xl border border-[var(--form-line,#dfe2e7)] bg-[var(--form-field,#fff)] px-3 py-2.5 text-[15px] text-[var(--sheet-ink,#1a1a2e)] outline-none placeholder:text-[#9ca3af] focus:border-[var(--sheet-ink,#1a1a2e)] focus:ring-2 focus:ring-[var(--sheet-ink,#1a1a2e)]/10"
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--sheet-ink,#1a1a2e)] px-5 py-3 text-sm font-semibold text-[var(--sheet-on-ink,#fff)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
const tile =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--form-line,#e3e4e8)] bg-[var(--form-field,#fff)] px-3 py-2.5 text-sm has-[:checked]:border-[var(--sheet-ink,#1a1a2e)] focus-within:ring-2 focus-within:ring-[var(--sheet-ink,#1a1a2e)]/20"

type Value = string | string[] | boolean
type Done = {
  message: string
  href: string | null
  action_type: string | null
  action_label?: string | null
  result?: { title: string; message: string } | null
  score?: number | null
  gated?: { url: string; label: string } | null
  booking?: { starts_at: string; status: string } | null
  payment_href?: string | null
}
type FileState = { ref?: string; name: string; busy?: boolean; error?: string }

const visitorZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
const dayKey = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
const dayLabel = (iso: string, tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))
const timeLabel = (iso: string, tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
const fullLabel = (iso: string, tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date(iso))

/*
  READ BEFORE THE SHEET IS UP (round AN). A button that opens a form starts
  reading it on the press (components/forms/action-frame), while the sheet
  rises, so the questions are usually there by the time it settles and the
  renderer draws them in its first frame instead of a placeholder that is
  then swapped. Only a form that was read is kept, for this page view; a
  failure is forgotten, so the next press asks again.
*/
type Loaded = { form: PublicForm | null; missing: boolean; error: string | null }
const reading = new Map<string, Promise<Loaded>>()
const loadedForms = new Map<string, PublicForm>()

function readPublicForm(formId: string): Promise<Loaded> {
  /* A timeout and one retry after a blip (lib/forms/client), so the visitor never waits on a spinner that does not end. */
  return formsRequest<{ form: PublicForm }>(`${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/public`, { credentials: "omit", fallback: "This form could not be loaded." }).then((r) => {
    const form = r.data?.form && !r.missing ? r.data.form : null
    if (form) loadedForms.set(formId, form)
    return { form, missing: r.missing, error: form ? null : r.error }
  })
}

/** Start reading a form now, once, for a renderer that is about to need it. */
export function prefetchPublicForm(formId: string): Promise<Loaded> {
  const known = loadedForms.get(formId)
  if (known) return Promise.resolve({ form: known, missing: false, error: null })
  let p = reading.get(formId)
  if (!p) {
    p = readPublicForm(formId).finally(() => reading.delete(formId))
    reading.set(formId, p)
  }
  return p
}

export function PublicFormRenderer({
  formId,
  initial,
  source = "form",
  preview = false,
  sourceBlock,
  onSubmitted,
  onUnavailable,
  shownTitle,
}: {
  /** The form could not be shown (not published, no forms on this store, or no answer after a retry): a chat's questions step aside and the chat opens (components/forms/action-frame). */
  onUnavailable?: () => void
  /** Called once the answers are saved, or accepted in a preview: a pre-chat form hands them to the chat it opens (components/forms/action-frame). */
  onSubmitted?: (answers: Record<string, unknown>, fields: { id: string; type?: string }[]) => void
  formId: string
  initial?: PublicForm
  preview?: boolean
  source?: "onepage" | "website" | "creator_page" | "form"
  /** The block or section title, kept with the lead as where it came from. */
  sourceBlock?: string
  /** The title the sheet around the form already shows: the form's own heading is then for screen readers only, never said twice. */
  shownTitle?: string
}) {
  const [form, setForm] = useState<PublicForm | null>(() => initial || (formId ? loadedForms.get(formId) : undefined) || null),
    [loading, setLoading] = useState(() => !initial && !(formId && loadedForms.has(formId))),
    [values, setValues] = useState<Record<string, Value>>({}),
    [files, setFiles] = useState<Record<string, FileState>>({}),
    [step, setStep] = useState(0),
    [consent, setConsent] = useState(false),
    [marketing, setMarketing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<Done | null>(null),
    [retry, setRetry] = useState(0),
    [slot, setSlot] = useState<Slot | null>(null),
    [slotsVersion, setSlotsVersion] = useState(0)
  const started = useRef(Date.now()),
    key = useRef(uuid()),
    trap = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null)
  const zone = useMemo(visitorZone, [])
  /* True once the visitor has seen the placeholder: the form then settles in over it. */
  const waited = useRef(loading)
  if (loading) waited.current = true
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable

  useEffect(() => {
    if (initial?.id === formId) return
    /* Read already (the press that opened it started it): drawn from the first frame, nothing to wait for. */
    if (retry === 0 && form?.id === formId) return
    let live = true
    setLoading(true)
    setError(null)
    setForm(null)
    void (retry === 0 ? prefetchPublicForm(formId) : readPublicForm(formId)).then((r) => {
      if (!live) return
      setLoading(false)
      if (r.form) {
        setForm(r.form)
        started.current = Date.now()
        return
      }
      setError(r.missing ? "This form is not available." : r.error || "This form could not be loaded.")
      onUnavailableRef.current?.()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, initial?.id, retry])

  const d = form?.definition
  const steps = useMemo(() => (d ? formSteps(d, values) : []), [d, values])
  const bookingStep = d?.booking ? 1 : 0
  const total = steps.length + bookingStep
  const current = Math.min(step, Math.max(0, total - 1))
  const onSlots = bookingStep === 1 && current === 0
  const fields = onSlots ? [] : steps[current - bookingStep] || []
  const last = current >= total - 1

  const set = (id: string, v: Value) => {
    setValues((c) => ({ ...c, [id]: v }))
    setError(null)
  }

  const problem = (f: FormField): string | null => {
    const v = values[f.id]
    const empty = v === undefined || v === "" || v === false || (Array.isArray(v) && !v.length)
    const label = f.label || "this question"
    if (f.type === "file") {
      const s = files[f.id]
      if (s?.busy) return "Wait for the upload to finish."
      if (s?.error) return s.error
      if (f.required && !s?.ref && !(preview && s?.name)) return `Add ${label}.`
      return null
    }
    if (f.required && empty) return `Complete ${label}.`
    if (empty || typeof v !== "string") return null
    if (f.type === "email" && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim())) return "Enter a valid email address."
    if (f.type === "phone" && (v.replace(/\D/g, "").length < 7 || v.replace(/\D/g, "").length > 15)) return "Enter a valid phone number."
    if (f.type === "number") {
      const n = Number(v)
      if (!Number.isFinite(n)) return `Enter a number for ${label}.`
      if (f.min !== undefined && n < f.min) return `${label} must be at least ${f.min}.`
      if (f.max !== undefined && n > f.max) return `${label} must be at most ${f.max}.`
    }
    if (f.type === "date" && !validDate(v)) return `Enter a valid date for ${label}.`
    return null
  }
  const stepProblem = () => (onSlots ? (slot ? null : "Choose a time.") : fields.map(problem).find(Boolean) || null)

  const focusTop = () => requestAnimationFrame(() => heading.current?.focus({ preventScroll: false }))
  const next = () => {
    const p = stepProblem()
    if (p) return setError(p)
    setError(null)
    setStep(current + 1)
    focusTop()
  }

  const upload = async (field: FormField, file: File | undefined) => {
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      setFiles((c) => ({ ...c, [field.id]: { name: file.name, error: "Files can be up to 4 MB." } }))
      return
    }
    if (preview) {
      setFiles((c) => ({ ...c, [field.id]: { name: file.name } }))
      return
    }
    setFiles((c) => ({ ...c, [field.id]: { name: file.name, busy: true } }))
    try {
      const body = new FormData()
      body.set("file", file)
      body.set("field", field.id)
      body.set("token", key.current)
      const r = await fetch(`${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/upload`, { method: "POST", body, credentials: "omit" })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || "The file was not uploaded.")
      setFiles((c) => ({ ...c, [field.id]: { name: b.name, ref: b.ref } }))
      set(field.id, b.ref)
    } catch (e) {
      setFiles((c) => ({ ...c, [field.id]: { name: file.name, error: e instanceof Error ? e.message : "The file was not uploaded." } }))
    }
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form || !d || busy) return
    if (!last) return next()
    const p = stepProblem() || steps.flat().map(problem).find(Boolean)
    if (p) return setError(p)
    if (d.booking && !slot) {
      setStep(0)
      return setError("Choose a time.")
    }
    if (!consent) return setError("Please accept the consent notice.")
    const answers: Record<string, Value> = {}
    for (const f of steps.flat()) if (values[f.id] !== undefined) answers[f.id] = values[f.id]
    if (preview) {
      const result = d.mode === "quiz" ? pickResult(d.results, previewScore(d.fields, answers)) : null
      setDone({
        message: d.completion.message,
        href: null,
        action_type: null,
        result: result ? { title: result.title, message: result.message } : null,
        gated: d.completion.kind === "gated" ? { url: "", label: d.completion.gated?.label || "Open" } : null,
        booking: slot ? { starts_at: slot.start, status: d.booking?.approval ? "pending" : "confirmed" } : null,
      })
      onSubmitted?.(answers, d.fields)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/submit`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: form.revision,
          submission_id: key.current,
          answers,
          consent,
          marketing,
          website: trap.current?.value || "",
          started_at: started.current,
          source,
          source_url: window.location.href,
          source_block: sourceBlock || undefined,
          ...(d.booking && slot ? { slot: slot.start, timezone: zone } : {}),
        }),
      })
      const b = await r.json()
      if (r.status === 409 && b.slot_taken) {
        setSlot(null)
        setStep(0)
        setSlotsVersion((n) => n + 1)
        throw new Error(b.error)
      }
      if (!r.ok) throw new Error(b.error || "Your answers were not saved. Try again.")
      setDone(b)
      onSubmitted?.(answers, d.fields)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your answers were not saved. Try again.")
    } finally {
      setBusy(false)
    }
  }
  /* While it is read: the shape of a form, quietly, so what arrives takes the same room and settles in rather than jumping. */
  if (loading)
    return (
      <div role="status" aria-label="Loading form" className="space-y-5 motion-safe:animate-pulse" data-form-loading="">
        <div className="h-6 w-2/5 rounded-md bg-[var(--form-line,#eef0f2)]" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3.5 w-1/4 rounded bg-[var(--form-line,#eef0f2)]" />
            <div className="h-11 rounded-xl bg-[var(--form-field,#f6f7f8)]" />
          </div>
        ))}
        <div className="h-11 w-28 rounded-xl bg-[var(--form-line,#eef0f2)]" />
      </div>
    )
  if (!form || !d)
    return (
      <div className="space-y-3 rounded-xl border border-[var(--form-line,#e3e4e8)] p-4 text-sm">
        <p role="alert">{error || "This form is not available."}</p>
        {/* Only a failed read is worth another try; a form that is not there stays not there. */}
        {error && error !== "This form is not available." ? (
          <button type="button" className="min-h-10 underline" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        ) : null}
      </div>
    )

  if (done) return <Completion done={done} zone={zone} preview={preview} />

  return (
    <form
      data-native-form={formId}
      /* Read after a wait: it settles in over the placeholder (a short fade and a 4px rise), never a cut. Drawn from the first frame, it is simply there. */
      className={`relative min-w-0 space-y-5 text-left text-[var(--sheet-ink,#1a1a2e)] ${waited.current ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200" : ""}`}
      onSubmit={submit}
      noValidate
    >
      <header>
        {preview ? <p className="mb-3 text-xs text-[var(--sheet-muted,#6b7280)]">Preview. Responses are not saved.</p> : null}
        <h2 ref={heading} tabIndex={-1} className={`text-xl font-semibold outline-none ${shownTitle && shownTitle.trim().toLowerCase() === (d.title || "").trim().toLowerCase() ? "sr-only" : ""}`}>
          {d.title}
        </h2>
        {d.description && current === 0 ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--sheet-muted,#6b7280)]">{d.description}</p> : null}
        {total > 1 ? (
          <div className="mt-4" data-form-progress="">
            <div className="flex justify-between text-xs text-[var(--sheet-muted,#6b7280)]">
              <span>
                Step {current + 1} of {total}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--form-line,#eceef1)]" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label="Progress">
              <div className="h-full rounded-full bg-[var(--sheet-ink,#1a1a2e)] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((current + 1) / total) * 100}%` }} />
            </div>
          </div>
        ) : null}
      </header>
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input ref={trap} tabIndex={-1} autoComplete="off" name="website" />
        </label>
      </div>
      {onSlots && d.booking ? (
        <SlotPicker formId={formId} settings={d.booking} preview={preview} zone={zone} value={slot} version={slotsVersion} onChange={(s) => (setSlot(s), setError(null))} />
      ) : null}
      {fields.map((field) => (
        <Question key={field.id} formId={formId} field={field} value={values[field.id]} file={files[field.id]} onChange={(v) => set(field.id, v)} onFile={(f) => void upload(field, f)} />
      ))}
      {last ? (
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--sheet-body,#4b5563)]">
            <input type="checkbox" checked={consent} onChange={(e) => (setConsent(e.target.checked), setError(null))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sheet-ink,#1a1a2e)]" />
            <span>
              {d.consent_text}
              {d.privacy_url ? (
                <a className="ml-1 underline" href={d.privacy_url} target="_blank" rel="noopener noreferrer">
                  Privacy policy
                </a>
              ) : null}
            </span>
          </label>
          {d.marketing_opt_in ? (
            <label className="flex items-start gap-2.5 text-xs text-[var(--sheet-body,#4b5563)]">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sheet-ink,#1a1a2e)]" />
              <span>Send me occasional updates. Optional, and you can unsubscribe any time.</span>
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--sheet-error,#b42318)]">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {current > 0 ? (
          <button type="button" className="min-h-11 px-3 text-sm underline" onClick={() => (setStep(current - 1), setError(null), focusTop())}>
            Back
          </button>
        ) : null}
        <button type="submit" className={button} disabled={busy || Object.values(files).some((f) => f.busy)}>
          {busy ? "Sending…" : last ? d.button_text || "Send" : "Next"}
        </button>
      </div>
    </form>
  )
}

function previewScore(fields: FormField[], answers: Record<string, Value>): number {
  let score = 0
  for (const f of fields) {
    const v = answers[f.id]
    const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : []
    for (const o of f.options || []) if (ids.includes(o.id)) score += o.score || 0
  }
  return score
}

function Question({
  formId,
  field,
  value,
  file,
  onChange,
  onFile,
}: {
  formId: string
  field: FormField
  value: Value | undefined
  file?: FileState
  onChange: (v: Value) => void
  onFile: (f: File | undefined) => void
}) {
  const id = `${formId}-${field.id}`
  const help = field.description ? `${id}-help` : undefined
  const legend = (
    <legend className="mb-2 text-sm font-medium">
      {field.label}
      {field.required ? <span aria-hidden="true"> *</span> : null}
      {field.required ? <span className="sr-only"> (required)</span> : null}
    </legend>
  )
  const helpText = field.description ? (
    <p id={help} className="-mt-1 text-xs text-[var(--sheet-muted,#6b7280)]">
      {field.description}
    </p>
  ) : null
  if (field.type === "consent")
    return (
      <fieldset className="min-w-0" data-question={field.id}>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sheet-ink,#1a1a2e)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-describedby={help} />
          <span>
            {field.label}
            {field.required ? <span aria-hidden="true"> *</span> : null}
          </span>
        </label>
        {helpText}
      </fieldset>
    )
  if (isChoice(field.type) && field.type !== "dropdown") {
    const multi = isMulti(field.type)
    const chosen = multi ? ((value as string[]) || []) : value
    return (
      <fieldset className="min-w-0 space-y-2" data-question={field.id} aria-describedby={help}>
        {legend}
        {helpText}
        <div className={field.type === "multiple" ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
          {field.options?.map((o) => (
            <label key={o.id} className={tile}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={id}
                className="h-4 w-4 shrink-0 accent-[var(--sheet-ink,#1a1a2e)]"
                checked={multi ? (chosen as string[]).includes(o.id) : chosen === o.id}
                onChange={(e) => onChange(multi ? (e.target.checked ? [...(chosen as string[]), o.id] : (chosen as string[]).filter((x) => x !== o.id)) : o.id)}
              />
              <span className="min-w-0 break-words">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  if (field.type === "rating") {
    const max = field.max || 5
    return (
      <fieldset className="min-w-0 space-y-2" data-question={field.id} aria-describedby={help}>
        {legend}
        {helpText}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
            <label key={n} className="relative">
              <input type="radio" name={id} value={n} checked={value === n} onChange={() => onChange(n)} className="peer absolute inset-0 opacity-0" />
              <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--form-line,#e3e4e8)] bg-[var(--form-field,#fff)] text-sm font-medium peer-checked:border-[var(--sheet-ink,#1a1a2e)] peer-checked:bg-[var(--sheet-ink,#1a1a2e)] peer-checked:text-[var(--sheet-on-ink,#fff)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/30">
                {n}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-between text-xs text-[var(--sheet-muted,#6b7280)]" style={{ maxWidth: max * 52 }}>
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </fieldset>
    )
  }
  if (field.type === "file")
    return (
      <fieldset className="min-w-0 space-y-2" data-question={field.id}>
        {legend}
        {helpText}
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--form-line,#cfd3da)] bg-[var(--form-field,#fff)] px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-[var(--sheet-ink,#1a1a2e)]/20">
          <span className="min-w-0 truncate">{file?.busy ? `Uploading ${file.name}…` : file?.name || "Choose a file"}</span>
          <span className="shrink-0 text-xs text-[var(--sheet-muted,#6b7280)]">JPG, PNG, WebP, PDF</span>
          <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} aria-describedby={help} />
        </label>
        {file?.error ? (
          <p role="alert" className="text-xs text-[var(--sheet-error,#b42318)]">
            {file.error}
          </p>
        ) : null}
      </fieldset>
    )
  const common = {
    id,
    className: input,
    "aria-describedby": help,
    "aria-required": field.required || undefined,
    value: typeof value === "string" ? value : "",
    placeholder: field.placeholder,
  }
  return (
    <div className="min-w-0 space-y-2" data-question={field.id}>
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {helpText}
      {field.type === "textarea" ? (
        <textarea {...common} rows={4} maxLength={4000} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "dropdown" ? (
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          autoComplete={field.type === "email" ? "email" : field.type === "name" ? "name" : field.type === "phone" ? "tel" : "off"}
          maxLength={field.type === "email" ? 254 : 500}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function SlotPicker({
  formId,
  settings,
  preview,
  zone,
  value,
  version,
  onChange,
}: {
  formId: string
  settings: NonNullable<PublicForm["definition"]["booking"]>
  preview: boolean
  zone: string
  value: Slot | null
  version: number
  onChange: (s: Slot) => void
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null),
    [next, setNext] = useState<string | null>(null),
    [failed, setFailed] = useState<string | null>(null),
    [day, setDay] = useState<string | null>(null)
  const load = async (from?: string, append = false) => {
    if (preview) {
      const now = Date.now()
      const start = from ? Date.parse(from) : now
      const list = generateSlots(settings, { fromMs: start, toMs: start + 14 * 86_400_000, nowMs: now, limit: 500 })
      setSlots((old) => (append && old ? [...old, ...list] : list))
      setNext(start + 14 * 86_400_000 < now + settings.days_ahead * 86_400_000 ? new Date(start + 14 * 86_400_000).toISOString() : null)
      return
    }
    try {
      setFailed(null)
      const r = await fetch(`${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/slots?days=14${from ? `&from=${encodeURIComponent(from)}` : ""}`, { credentials: "omit", cache: "no-store" })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || "Times could not be loaded.")
      setSlots((old) => (append && old ? [...old, ...b.slots] : b.slots))
      setNext(b.next)
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Times could not be loaded.")
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, version])
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots || []) {
      const k = dayKey(s.start, zone)
      map.set(k, [...(map.get(k) || []), s])
    }
    return [...map.entries()]
  }, [slots, zone])
  const active = day && days.some(([k]) => k === day) ? day : days[0]?.[0] || null
  if (failed)
    return (
      <p role="alert" className="text-sm text-[var(--sheet-error,#b42318)]">
        {failed}{" "}
        <button type="button" className="underline" onClick={() => void load()}>
          Try again
        </button>
      </p>
    )
  if (!slots)
    return (
      <div role="status" className="h-32 rounded-xl bg-[var(--form-field,#f3f4f6)] motion-safe:animate-pulse">
        <span className="sr-only">Loading times…</span>
      </div>
    )
  return (
    <fieldset className="min-w-0 space-y-3" data-slot-picker="">
      <legend className="mb-1 text-sm font-medium">Choose a time</legend>
      <p className="-mt-1 text-xs text-[var(--sheet-muted,#6b7280)]">
        {settings.duration} minutes. Times shown in {zone.replace(/_/g, " ")}.
      </p>
      {!days.length ? <p className="text-sm text-[var(--sheet-muted,#6b7280)]">No free times in the next two weeks.</p> : null}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Days">
        {days.map(([k, list]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === active}
            onClick={() => setDay(k)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${k === active ? "border-[var(--sheet-ink,#1a1a2e)] bg-[var(--sheet-ink,#1a1a2e)] text-[var(--sheet-on-ink,#fff)]" : "border-[var(--form-line,#e3e4e8)] bg-[var(--form-field,#fff)]"}`}
          >
            {dayLabel(list[0].start, zone)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Times">
        {(days.find(([k]) => k === active)?.[1] || []).map((s) => (
          <button
            key={s.start}
            type="button"
            role="radio"
            aria-checked={value?.start === s.start}
            onClick={() => onChange(s)}
            className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${value?.start === s.start ? "border-[var(--sheet-ink,#1a1a2e)] bg-[var(--sheet-ink,#1a1a2e)] text-[var(--sheet-on-ink,#fff)]" : "border-[var(--form-line,#e3e4e8)] bg-[var(--form-field,#fff)]"}`}
          >
            {timeLabel(s.start, zone)}
          </button>
        ))}
      </div>
      {next ? (
        <button type="button" className="text-sm underline" onClick={() => void load(next, true)}>
          Show later dates
        </button>
      ) : null}
      {value ? <p className="text-sm">Selected: {fullLabel(value.start, zone)}</p> : null}
    </fieldset>
  )
}

function Completion({ done, zone, preview }: { done: Done; zone: string; preview: boolean }) {
  const label = done.action_label || (done.action_type ? actionLabel({ type: done.action_type } as never) : "Continue")
  return (
    <section role="status" className="space-y-4 py-2 text-left text-[var(--sheet-ink,#1a1a2e)]" data-form-complete="">
      {done.result ? (
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{done.result.title}</h2>
          {done.result.message ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{done.result.message}</p> : null}
        </div>
      ) : null}
      {done.booking ? (
        <p className="text-[15px]">
          {done.booking.status === "pending" ? "Requested: " : "Booked: "}
          <strong>{fullLabel(done.booking.starts_at, zone)}</strong>
        </p>
      ) : null}
      <p className={`whitespace-pre-wrap ${done.result ? "text-sm text-[var(--sheet-muted,#6b7280)]" : "text-base"}`}>{done.message}</p>
      <div className="flex flex-wrap gap-2">
        {done.payment_href ? (
          <a className={button} href={done.payment_href}>
            Pay to confirm
          </a>
        ) : null}
        {done.gated ? (
          done.gated.url ? (
            <a className={button} href={done.gated.url} target="_blank" rel="noopener noreferrer" data-gated-link="">
              {done.gated.label}
            </a>
          ) : (
            <span className={button + " opacity-60"}>{done.gated.label}{preview ? " (link appears after sending)" : ""}</span>
          )
        ) : null}
        {done.href ? (
          <a className={button} href={done.href} target={done.action_type === "product" ? undefined : "_blank"} rel="noopener noreferrer">
            {label}
          </a>
        ) : null}
      </div>
    </section>
  )
}

