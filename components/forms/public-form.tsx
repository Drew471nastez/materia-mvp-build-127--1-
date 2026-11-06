"use client"
import { useEffect, useRef, useState } from "react"
import { v4 as uuid } from "uuid"
import { platformOrigin } from "@/lib/onepage/return-address"
import type { PublicForm, FormField } from "@/lib/forms/definition"
const input =
  "w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5 text-[15px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-offset-2"
export function PublicFormRenderer({
  formId,
  initial,
  source = "form",
  preview = false,
}: {
  formId: string
  initial?: PublicForm
  preview?: boolean
  source?: "onepage" | "website" | "creator_page" | "form"
}) {
  const [form, setForm] = useState<PublicForm | null>(initial || null),
    [loading, setLoading] = useState(!initial),
    [answers, setAnswers] = useState<Record<string, string | string[]>>({}),
    [step, setStep] = useState(0),
    [consent, setConsent] = useState(false),
    [marketing, setMarketing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<{
      message: string
      href: string | null
      action_type: string | null
    } | null>(null)
  const [retry, setRetry] = useState(0)
  const started = useRef(Date.now()),
    key = useRef(uuid()),
    trap = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (initial?.id === formId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setForm(null)
    fetch(
      `${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/public`,
      { credentials: "omit", cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error || "This form could not be loaded.")
        setForm(b.form)
        started.current = Date.now()
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [formId, initial?.id, retry])
  const required = (field: FormField) => {
    const v = answers[field.id]
    return field.required && (!v || !v.length)
      ? `Complete ${field.label}.`
      : null
  }
  const advance = () => {
    if (!form) return
    const field = form.definition.fields[step]
    const e = required(field)
    if (e) {
      setError(e)
      return
    }
    const node = document.querySelector(
      `[data-native-form="${formId}"] fieldset input:not([type=checkbox]):not([type=radio]), [data-native-form="${formId}"] fieldset textarea`,
    ) as HTMLInputElement | null
    if (node && !node.reportValidity()) return
    setError(null)
    setStep((n) => n + 1)
    heading.current?.focus({ preventScroll: true })
  }
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form || busy) return
    const missing = form.definition.fields.map(required).find(Boolean)
    if (missing) {
      setError(missing)
      return
    }
    if (!consent) {
      setError("Please accept the consent notice.")
      return
    }
    if (preview) {
      setDone({
        message: form.definition.completion.message,
        href: null,
        action_type: null,
      })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(
        `${platformOrigin()}/api/forms/${encodeURIComponent(formId)}/submit`,
        {
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
          }),
        },
      )
      const b = await r.json()
      if (!r.ok)
        throw new Error(b.error || "Your answers were not saved. Try again.")
      setDone(b)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your answers were not saved. Try again.",
      )
    } finally {
      setBusy(false)
    }
  }
  if (loading)
    return (
      <div
        role="status"
        className="min-h-48 animate-pulse rounded-xl bg-[#f3f4f6] p-5"
      >
        Loading form…
      </div>
    )
  if (!form)
    return (
      <div className="space-y-3 rounded-xl border border-[#e3e4e8] p-4 text-sm">
        <p role="alert">{error || "This form is not available."}</p>
        <button
          type="button"
          className="min-h-10 underline"
          onClick={() => setRetry((n) => n + 1)}
        >
          Try again
        </button>
      </div>
    )
  const d = form.definition,
    quiz = d.mode === "quiz",
    last = step >= d.fields.length - 1
  if (done)
    return (
      <section role="status" className="space-y-4 py-4" data-form-complete="">
        <p className="whitespace-pre-wrap text-base">{done.message}</p>
        {done.href ? (
          <a
            className={button}
            href={done.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {done.action_type === "whatsapp"
              ? "Continue on WhatsApp"
              : done.action_type === "appointment"
                ? "Book an appointment"
                : done.action_type === "product"
                  ? "View product"
                  : "Continue"}
          </a>
        ) : null}
      </section>
    )
  const visible = quiz ? [d.fields[step]] : d.fields
  return (
    <form
      data-native-form={formId}
      className="min-w-0 space-y-5 text-left text-[#1a1a2e]"
      onSubmit={submit}
    >
      <header>
        {preview ? (
          <p className="mb-3 text-xs text-[#6b7280]">
            Preview. Responses are not saved.
          </p>
        ) : null}
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {d.title}
        </h2>
        {d.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#6b7280]">
            {d.description}
          </p>
        ) : null}
        {quiz ? (
          <p className="mt-3 text-xs text-[#6b7280]">
            Question {step + 1} of {d.fields.length}
          </p>
        ) : null}
      </header>
      <div
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden"
      >
        <label>
          Website
          <input ref={trap} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {visible.map((field) => (
        <fieldset key={field.id} className="min-w-0 space-y-2">
          <legend className="mb-2 text-sm font-medium">
            {field.label}
            {field.required ? <span aria-label="required"> *</span> : null}
          </legend>
          {field.description ? (
            <p className="text-xs text-[#6b7280]">{field.description}</p>
          ) : null}
          {["single", "multiple"].includes(field.type) ? (
            <div className="space-y-2">
              {field.options?.map((option) => (
                <label
                  key={option.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5 text-sm"
                >
                  <input
                    type={field.type === "single" ? "radio" : "checkbox"}
                    name={`${formId}-${field.id}`}
                    checked={
                      field.type === "single"
                        ? answers[field.id] === option.id
                        : (answers[field.id] || []).includes(option.id)
                    }
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [field.id]:
                          field.type === "single"
                            ? option.id
                            : e.target.checked
                              ? [
                                  ...((current[field.id] || []) as string[]),
                                  option.id,
                                ]
                              : ((current[field.id] || []) as string[]).filter(
                                  (id) => id !== option.id,
                                ),
                      }))
                    }
                  />
                  <span className="min-w-0 break-words">{option.label}</span>
                </label>
              ))}
            </div>
          ) : field.type === "textarea" ? (
            <textarea
              className={input}
              rows={4}
              maxLength={4000}
              required={field.required}
              aria-label={field.label}
              value={String(answers[field.id] || "")}
              onChange={(e) =>
                setAnswers((current) => ({
                  ...current,
                  [field.id]: e.target.value,
                }))
              }
            />
          ) : (
            <input
              className={input}
              type={
                field.type === "email"
                  ? "email"
                  : field.type === "phone"
                    ? "tel"
                    : "text"
              }
              autoComplete={
                field.type === "email"
                  ? "email"
                  : field.type === "name"
                    ? "name"
                    : field.type === "phone"
                      ? "tel"
                      : undefined
              }
              maxLength={field.type === "email" ? 254 : 4000}
              required={field.required}
              aria-label={field.label}
              value={String(answers[field.id] || "")}
              onChange={(e) =>
                setAnswers((current) => ({
                  ...current,
                  [field.id]: e.target.value,
                }))
              }
            />
          )}
        </fieldset>
      ))}
      {!quiz || last ? (
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-[#4b5563]">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              {d.consent_text}
              {d.privacy_url ? (
                <a
                  className="ml-1 underline"
                  href={d.privacy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy policy
                </a>
              ) : null}
            </span>
          </label>
          {d.marketing_opt_in ? (
            <label className="flex items-start gap-2.5 text-xs text-[#4b5563]">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <span>
                I would also like to receive updates. Optional; unsubscribe any
                time.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {quiz && step > 0 ? (
          <button
            type="button"
            className="min-h-11 px-3 text-sm underline"
            onClick={() => {
              setStep((n) => n - 1)
              setError(null)
            }}
          >
            Back
          </button>
        ) : null}
        {quiz && !last ? (
          <button type="button" className={button} onClick={advance}>
            Next
          </button>
        ) : (
          <button type="submit" className={button} disabled={busy}>
            {busy ? "Sending…" : d.button_text || "Send"}
          </button>
        )}
      </div>
    </form>
  )
}
