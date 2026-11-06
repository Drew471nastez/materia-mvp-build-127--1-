"use client"
import { useEffect, useState, useRef } from "react"
import {
  LEAD_STATUSES,
  type LeadStatus,
  type Answer,
} from "@/lib/forms/definition"
interface Lead {
  id: string
  form_id: string
  form_title: string
  answers: Answer[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  submitted_at: string
  status: LeadStatus
  source_kind: string
  source_url: string | null
  consent: { accepted: boolean; text: string; marketing: boolean }
  score: number
}
const button =
  "inline-flex min-h-10 items-center rounded-lg border border-[#dfe2e7] bg-white px-4 py-2 text-sm font-medium text-[#1a1a2e] disabled:opacity-50"
export function LeadsManager() {
  const [leads, setLeads] = useState<Lead[]>([]),
    [status, setStatus] = useState(""),
    [formId, setFormId] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null)
  const readId = useRef(0)
  const params = () => {
    const q = new URLSearchParams()
    if (status) q.set("status", status)
    if (formId) q.set("form", formId)
    return q
  }
  const load = async (more = false) => {
    const read = ++readId.current
    setLoading(true)
    setError(null)
    const q = params()
    if (more && next) q.set("before", next)
    try {
      const r = await fetch("/api/leads?" + q, { cache: "no-store" }),
        b = await r.json()
      if (!r.ok) throw new Error(b.error)
      if (read !== readId.current) return
      setLeads((old) => (more ? [...old, ...b.leads] : b.leads))
      setNext(b.next)
    } catch (e) {
      if (read === readId.current)
        setError(e instanceof Error ? e.message : "Leads could not be loaded.")
    } finally {
      if (read === readId.current) setLoading(false)
    }
  }
  useEffect(() => {
    setFormId(new URLSearchParams(location.search).get("form") || "")
  }, [])
  useEffect(() => {
    void load()
  }, [status, formId])
  const update = async (lead: Lead, value: LeadStatus) => {
    setBusy(lead.id)
    try {
      const r = await fetch("/api/leads/" + lead.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: value }),
        }),
        b = await r.json()
      if (!r.ok) throw new Error(b.error)
      setLeads((all) =>
        all.map((row) =>
          row.id === lead.id ? { ...row, status: value } : row,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "The status did not save.")
    } finally {
      setBusy(null)
    }
  }
  const remove = async (lead: Lead) => {
    if (
      !window.confirm(
        "Delete this lead and their answers? This cannot be undone.",
      )
    )
      return
    setBusy(lead.id)
    try {
      const r = await fetch("/api/leads/" + lead.id, { method: "DELETE" })
      if (!r.ok) throw new Error("The lead was not deleted.")
      setLeads((all) => all.filter((row) => row.id !== lead.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The lead was not deleted.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e]">Leads</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Form responses, contact details and follow-ups.
          </p>
        </div>
        <a href="/app/audience/forms" className={button}>
          Forms and quizzes
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Lead status"
          className={button}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <button className={button} type="button" onClick={() => void load()}>
          Refresh
        </button>
        <a className={button} href={"/api/leads/export?" + params()}>
          Export CSV
        </a>
        {formId ? (
          <button
            className={button}
            type="button"
            onClick={() => setFormId("")}
          >
            All forms
          </button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-[#6b7280]">
          Loading leads…
        </p>
      ) : null}
      {!leads.length && !loading ? (
        <p className="rounded-xl border border-dashed border-[#dfe2e7] p-8 text-center text-sm text-[#6b7280]">
          Responses to your published forms appear here.
        </p>
      ) : null}
      {leads.map((lead) => (
        <details
          key={lead.id}
          className="rounded-xl border border-[#e5e7eb] bg-white p-4"
          data-lead={lead.id}
        >
          <summary className="cursor-pointer">
            <span className="font-semibold text-[#1a1a2e]">
              {lead.contact_name || lead.contact_email || "Anonymous response"}
            </span>
            <span className="ml-3 text-xs text-[#6b7280]">
              {lead.form_title} · {new Date(lead.submitted_at).toLocaleString()}{" "}
              · {lead.status}
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                ["Email", lead.contact_email],
                ["Phone", lead.contact_phone],
                ["Source", lead.source_kind],
                ["Score", String(lead.score)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[#6b7280]">{label}</dt>
                  <dd className="break-words">{value || "Not provided"}</dd>
                </div>
              ))}
            </dl>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Status
              <select
                className={button}
                value={lead.status}
                disabled={busy === lead.id}
                onChange={(e) =>
                  void update(lead, e.target.value as LeadStatus)
                }
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <dl className="space-y-3 border-t border-[#eef0f2] pt-3">
              {lead.answers.map((answer) => (
                <div key={answer.field_id}>
                  <dt className="text-xs font-medium text-[#6b7280]">
                    {answer.label}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {Array.isArray(answer.value)
                      ? answer.value.join(", ")
                      : answer.value || "No answer"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-relaxed text-[#6b7280]">
              Consent: {lead.consent.text}
              <br />
              Marketing opt-in: {lead.consent.marketing ? "Yes" : "No"}
            </p>
            <button
              type="button"
              className="text-xs text-red-700 underline"
              disabled={busy === lead.id}
              onClick={() => void remove(lead)}
            >
              Delete lead and answers
            </button>
          </div>
        </details>
      ))}
      {next ? (
        <button
          type="button"
          className={button}
          disabled={loading}
          onClick={() => void load(true)}
        >
          Load more
        </button>
      ) : null}
    </div>
  )
}
