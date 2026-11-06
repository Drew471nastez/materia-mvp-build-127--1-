"use client"
import { useEffect, useState } from "react"
import { ActionEditor } from "./action-editor"
import { PublicFormRenderer } from "./public-form"
import { formTemplate, FORM_TEMPLATES } from "@/lib/forms/templates"
import { formPath } from "@/lib/forms/actions"
import { platformOrigin } from "@/lib/onepage/return-address"
import type { FormDefinition, FormField } from "@/lib/forms/definition"
interface SavedForm {
  id: string
  title: string
  status: string
  revision: number
  draft: FormDefinition
  published: FormDefinition | null
  updated_at: string
  integration_settings?: Record<string, { prepared: boolean }>
}
const field =
  "w-full min-w-0 rounded-lg border border-[#dfe2e7] bg-white px-3 py-2.5 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#1a1a2e]"
const button =
  "min-h-10 rounded-lg border border-[#dfe2e7] bg-white px-4 py-2 text-sm font-medium text-[#1a1a2e] disabled:opacity-50"
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16)
export function FormsManager() {
  const [forms, setForms] = useState<SavedForm[]>([]),
    [selected, setSelected] = useState<SavedForm | null>(null),
    [draft, setDraft] = useState<FormDefinition>(formTemplate()),
    [template, setTemplate] = useState("contact"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [note, setNote] = useState<string | null>(null),
    [preview, setPreview] = useState(false),
    [dirty, setDirty] = useState(false),
    [integrations, setIntegrations] = useState<
      Record<string, { prepared: boolean }>
    >({})
  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/forms", { cache: "no-store" }),
        b = await r.json()
      if (!r.ok) throw new Error(b.error)
      setForms(b.forms || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forms could not be loaded.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    if (!dirty) return
    const hold = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", hold)
    return () => window.removeEventListener("beforeunload", hold)
  }, [dirty])
  const pick = (form: SavedForm) => {
    if (dirty && !window.confirm("Leave your unsaved form changes?")) return
    setSelected(form)
    setDraft(JSON.parse(JSON.stringify(form.draft)))
    setIntegrations(form.integration_settings || {})
    setDirty(false)
    setPreview(false)
    setNote(null)
    setError(null)
  }
  const change = (patch: Partial<FormDefinition>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
    setNote(null)
  }
  const editQuestion = (id: string, patch: Partial<FormField>) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
    setDirty(true)
    setNote(null)
  }
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
        }),
        b = await r.json()
      if (!r.ok) throw new Error(b.error)
      setForms((all) => [b.form, ...all])
      pick(b.form)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The form could not be created.",
      )
    } finally {
      setBusy(false)
    }
  }
  const save = async (publish = false) => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/forms/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            definition: draft,
            publish,
            updated_at: selected.updated_at,
            integrations,
          }),
        }),
        b = await r.json()
      if (!r.ok) throw new Error(b.error)
      setSelected(b.form)
      setForms((all) => all.map((f) => (f.id === b.form.id ? b.form : f)))
      setDirty(false)
      setNote(
        publish
          ? "Published. Every page using this form shows this version."
          : "Draft saved.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "The form did not save.")
    } finally {
      setBusy(false)
    }
  }
  const reorder = (index: number, by: number) => {
    const next = [...draft.fields],
      to = index + by
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to], next[index]]
    change({ fields: next })
  }
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e]">
            Forms and quizzes
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Use the same form on your OnePage, website and creator page.
          </p>
        </div>
        <a className={button} href="/app/audience/leads">
          View leads
        </a>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-sm text-[#067647]">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Form template"
          className={field + " !w-auto"}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          {Object.entries(FORM_TEMPLATES).map(([id, d]) => (
            <option key={id} value={id}>
              {d.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void create()}
        >
          Create form
        </button>
        <button type="button" className={button} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {loading ? (
        <p role="status" className="text-sm text-[#6b7280]">
          Loading forms…
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {forms.map((f) => (
          <button
            key={f.id}
            type="button"
            className={
              button + (selected?.id === f.id ? " !border-[#1a1a2e]" : "")
            }
            onClick={() => pick(f)}
          >
            {f.title || "Unnamed form"}
            <span className="ml-2 text-xs text-[#6b7280]">{f.status}</span>
          </button>
        ))}
      </div>
      {!selected && !loading ? (
        <p className="rounded-xl border border-dashed border-[#dfe2e7] p-8 text-center text-sm text-[#6b7280]">
          Choose a template to create your first form, or open a saved form.
        </p>
      ) : null}
      {selected ? (
        <section
          className="space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-6"
          data-form-builder=""
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? "Edit questions" : "Preview"}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save draft
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void save(true)}
            >
              {busy ? "Saving…" : "Publish form"}
            </button>
            {selected.status === "published" ? (
              <button
                type="button"
                className={button}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(platformOrigin() + formPath(selected.id))
                    .then(() => setNote("Form link copied."))
                }}
              >
                Copy form link
              </button>
            ) : null}
            {selected.status === "published" ? (
              <a
                href={formPath(selected.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-sm underline"
              >
                Open published form
              </a>
            ) : null}
          </div>
          {preview ? (
            <div className="mx-auto max-w-lg">
              <PublicFormRenderer
                key={JSON.stringify(draft)}
                formId={selected.id}
                preview
                initial={{
                  id: selected.id,
                  revision: selected.revision,
                  definition: draft,
                }}
              />
            </div>
          ) : (
            <>
              <label className="block space-y-1 text-xs font-medium">
                Form title
                <input
                  className={field}
                  value={draft.title}
                  maxLength={160}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium">
                Description
                <textarea
                  className={field}
                  value={draft.description}
                  rows={2}
                  onChange={(e) => change({ description: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium">
                Presentation
                <select
                  className={field}
                  value={draft.mode}
                  onChange={(e) =>
                    change({ mode: e.target.value as "form" | "quiz" })
                  }
                >
                  <option value="form">All questions on one page</option>
                  <option value="quiz">Quiz: one question at a time</option>
                </select>
              </label>
              <div className="divide-y divide-[#eef0f2]">
                {draft.fields.map((q, index) => (
                  <section
                    key={q.id}
                    className="space-y-3 py-5"
                    data-form-question={q.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-sm font-semibold">
                        Question {index + 1}
                      </span>
                      <button
                        type="button"
                        className={button}
                        disabled={index === 0}
                        aria-label={`Move question ${index + 1} up`}
                        onClick={() => reorder(index, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={index === draft.fields.length - 1}
                        aria-label={`Move question ${index + 1} down`}
                        onClick={() => reorder(index, 1)}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={draft.fields.length === 1}
                        onClick={() =>
                          change({
                            fields: draft.fields.filter((f) => f.id !== q.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <label className="block space-y-1 text-xs font-medium">
                      Question
                      <input
                        className={field}
                        value={q.label}
                        onChange={(e) =>
                          editQuestion(q.id, { label: e.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-medium">
                      Help text
                      <input
                        className={field}
                        value={q.description ?? ""}
                        onChange={(e) =>
                          editQuestion(q.id, { description: e.target.value })
                        }
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-4">
                      <select
                        aria-label={`Question ${index + 1} type`}
                        className={field + " !w-auto"}
                        value={q.type}
                        onChange={(e) =>
                          editQuestion(q.id, {
                            type: e.target.value as FormField["type"],
                            ...(["single", "multiple"].includes(
                              e.target.value,
                            ) && !q.options
                              ? {
                                  options: [
                                    { id: newId(), label: "Option 1" },
                                    { id: newId(), label: "Option 2" },
                                  ],
                                }
                              : {}),
                          })
                        }
                      >
                        {[
                          ["single", "Single choice"],
                          ["multiple", "Multiple choice"],
                          ["text", "Short answer"],
                          ["textarea", "Long answer"],
                          ["name", "Name"],
                          ["email", "Email address"],
                          ["phone", "Phone number"],
                        ].map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            editQuestion(q.id, { required: e.target.checked })
                          }
                        />
                        Required
                      </label>
                    </div>
                    {["single", "multiple"].includes(q.type) ? (
                      <label className="block space-y-1 text-xs font-medium">
                        Answer choices, one per line
                        <textarea
                          className={field}
                          rows={4}
                          value={
                            q.options?.map((o) => o.label).join("\n") ?? ""
                          }
                          onChange={(e) =>
                            editQuestion(q.id, {
                              options: e.target.value
                                .split("\n")
                                .slice(0, 30)
                                .map((label, i) => ({
                                  id: q.options?.[i]?.id || newId(),
                                  label,
                                })),
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </section>
                ))}
              </div>
              <button
                type="button"
                className={button}
                disabled={draft.fields.length >= 30}
                onClick={() =>
                  change({
                    fields: [
                      ...draft.fields,
                      { id: newId(), type: "text", label: "", required: false },
                    ],
                  })
                }
              >
                Add question
              </button>
              <label className="block space-y-1 text-xs font-medium">
                Send button text
                <input
                  className={field}
                  value={draft.button_text}
                  onChange={(e) => change({ button_text: e.target.value })}
                />
              </label>
              <div className="space-y-3 border-t border-[#eef0f2] pt-5">
                <h2 className="text-base font-semibold">Privacy and consent</h2>
                <label className="block space-y-1 text-xs font-medium">
                  Required consent notice
                  <textarea
                    className={field}
                    rows={2}
                    value={draft.consent_text}
                    onChange={(e) => change({ consent_text: e.target.value })}
                  />
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  Privacy policy URL
                  <input
                    className={field}
                    type="url"
                    value={draft.privacy_url ?? ""}
                    onChange={(e) => change({ privacy_url: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.marketing_opt_in}
                    onChange={(e) =>
                      change({ marketing_opt_in: e.target.checked })
                    }
                  />
                  Offer a separate, optional marketing opt-in
                </label>
              </div>
              <div className="space-y-3 border-t border-[#eef0f2] pt-5">
                <h2 className="text-base font-semibold">After completion</h2>
                <label className="block space-y-1 text-xs font-medium">
                  Success message
                  <textarea
                    className={field}
                    rows={2}
                    value={draft.completion.message}
                    onChange={(e) =>
                      change({
                        completion: {
                          ...draft.completion,
                          message: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <ActionEditor
                  allowNone
                  value={draft.completion.action}
                  onChange={(action) =>
                    change({ completion: { ...draft.completion, action } })
                  }
                />
                {draft.completion.action?.type === "whatsapp" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.completion.include_answers === true}
                      onChange={(e) =>
                        change({
                          completion: {
                            ...draft.completion,
                            include_answers: e.target.checked,
                          },
                        })
                      }
                    />
                    Include the submitted answers in the WhatsApp draft
                  </label>
                ) : null}
              </div>
              <details className="border-t border-[#eef0f2] pt-5">
                <summary className="cursor-pointer text-sm font-semibold">
                  Optional integrations
                </summary>
                <p className="my-3 text-xs text-[#6b7280]">
                  Prepare new responses for a future connection. Delivery stays
                  off until the integration is connected. CSV export is
                  available now.
                </p>
                {[
                  ["webhook", "Webhook"],
                  ["google_sheets", "Google Sheets"],
                ].map(([id, label]) => (
                  <label
                    key={id}
                    className="my-3 flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={integrations[id]?.prepared === true}
                      onChange={(e) => {
                        setIntegrations((current) => ({
                          ...current,
                          [id]: { prepared: e.target.checked },
                        }))
                        setDirty(true)
                      }}
                    />
                    Prepare {label} integration
                  </label>
                ))}
              </details>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
