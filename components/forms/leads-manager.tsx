"use client"
import { displayEmail } from "@/lib/businesses/email-alias"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, MoreHorizontal, Search } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { buttonSecondary, buttonAccent, card, iconButton } from "@/app/(storelib)/app/orders/order-parts"
import { LEAD_STATUSES, LEAD_STATUS_LABEL, answerText, type LeadStatus, type Answer } from "@/lib/forms/definition"

/*
  Audience › Leads. Every response to the owner's forms: who, what they
  answered, where it came from, and the follow-up (status, notes, a
  booking's answer). Filters and search run on the server inside the
  owner's own rows; export uses the same filters.
*/

interface Booking {
  id: string
  starts_at: string
  ends_at: string
  status: "pending" | "confirmed" | "declined" | "cancelled"
  visitor_timezone: string | null
  payment_status?: "none" | "unpaid" | "paid" | "failed" | "refunded" | "review"
  payment_due_at?: string | null
  payment_note?: string | null
}
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
  source_block?: string | null
  notes?: string | null
  consent: { accepted: boolean; text: string; marketing: boolean; at?: string }
  score: number
  booking: Booking | null
}
const control = "h-9 min-w-0 rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15"
const muted = "text-[13px] text-[#6b7280]"
const SOURCES: Record<string, string> = { onepage: "OnePage", website: "Website", creator_page: "Creator page", form: "Form link" }
const BOOKING: Record<Booking["status"], string> = { pending: "Waiting for you", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled" }
const PAYMENT: Record<string, string> = { unpaid: "Waiting for payment", paid: "Paid", failed: "Payment failed", refunded: "Refunded", review: "Payment needs a look" }
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

export function LeadsManager() {
  const [leads, setLeads] = useState<Lead[]>([]),
    [forms, setForms] = useState<{ id: string; title: string }[]>([]),
    [filters, setFilters] = useState({ q: "", form: "", status: "", source: "", from: "", to: "", lead: "" }),
    [query, setQuery] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [upgraded, setUpgraded] = useState(true),
    [openId, setOpenId] = useState<string | null>(null)
  const readId = useRef(0)
  const params = (f = filters) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v)
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
      setUpgraded(b.upgraded !== false)
      if (filters.lead && b.leads[0]) setOpenId(b.leads[0].id)
    } catch (e) {
      if (read === readId.current) setError(e instanceof Error ? e.message : "Leads could not be loaded.")
    } finally {
      if (read === readId.current) setLoading(false)
    }
  }
  useEffect(() => {
    const s = new URLSearchParams(location.search)
    setFilters((f) => ({ ...f, form: s.get("form") || "", lead: s.get("lead") || "" }))
    fetch("/api/forms", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((b) => setForms((b.forms || []).map((f: { id: string; title: string }) => ({ id: f.id, title: f.title }))))
      .catch(() => null)
  }, [])
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query, lead: "" })), 300)
    return () => clearTimeout(t)
  }, [query])
  const setFilter = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v, lead: "" }))
  const patchLead = (id: string, patch: Partial<Lead>) => setLeads((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const deleteAll = async () => {
    const title = forms.find((f) => f.id === filters.form)?.title || "this form"
    if (!window.confirm(`Delete every lead from “${title}”, with their answers and files? This cannot be undone.`)) return
    const r = await fetch(`/api/leads?form=${filters.form}&confirm=all`, { method: "DELETE" })
    const b = await r.json().catch(() => ({}))
    if (!r.ok) return setError(b.error || "The leads were not deleted.")
    void load()
  }
  const filtered = !!(filters.q || filters.form || filters.status || filters.source || filters.from || filters.to)

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-leads="">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Leads</h1>
        <div className="flex items-center gap-2">
          <a href="/app/audience/forms" className={buttonSecondary}>
            Forms
          </a>
          <a className={buttonAccent} href={"/api/leads/export?" + params({ ...filters, lead: "" })} data-export-leads="">
            Export CSV
          </a>
          {filters.form ? (
            <ResponsiveActionMenu
              title="This form's leads"
              trigger={
                <button type="button" className={iconButton} aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={[{ label: "Delete all leads from this form", variant: "destructive", onClick: () => void deleteAll() }]}
            />
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" role="search">
        <label className="relative col-span-2 min-w-[200px] flex-1 sm:max-w-xs">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden="true" />
          <input className={control + " w-full pl-8"} placeholder="Name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select aria-label="Form" className={control + " col-span-2 sm:max-w-[220px]"} value={filters.form} onChange={(e) => setFilter("form", e.target.value)}>
          <option value="">All forms</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title || "Untitled form"}
            </option>
          ))}
        </select>
        <select aria-label="Status" className={control} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select aria-label="Source" className={control} value={filters.source} onChange={(e) => setFilter("source", e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
          From
          <input type="date" className={control + " min-w-0 flex-1 px-2"} value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
        </label>
        <label className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
          To
          <input type="date" className={control + " min-w-0 flex-1 px-2"} value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
        </label>
        {filtered || filters.lead ? (
          <button type="button" className="text-[13px] font-medium text-[#1a1a2e] underline" onClick={() => (setQuery(""), setFilters({ q: "", form: "", status: "", source: "", from: "", to: "", lead: "" }))}>
            Clear
          </button>
        ) : null}
      </div>
      {!upgraded ? <p className={muted}>Notes, bookings and file answers need the Forms database update (SQL part 375).</p> : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {loading && !leads.length ? (
        <div className={card + " h-40 animate-pulse"} role="status">
          <span className="sr-only">Loading leads</span>
        </div>
      ) : !leads.length ? (
        <div className={card + " px-6 py-12 text-center"}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{filtered ? "No leads match" : "No leads yet"}</p>
          <p className={muted + " mt-1"}>{filtered ? "Try another search or filter." : "Responses to your published forms show up here."}</p>
        </div>
      ) : (
        <ul className={card + " divide-y divide-[#f1f2f4] overflow-hidden"}>
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} open={openId === lead.id} onToggle={() => setOpenId(openId === lead.id ? null : lead.id)} onPatch={(p) => patchLead(lead.id, p)} onRemoved={() => setLeads((all) => all.filter((l) => l.id !== lead.id))} onError={setError} />
          ))}
        </ul>
      )}
      {next ? (
        <button type="button" className={buttonSecondary} disabled={loading} onClick={() => void load(true)}>
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  )
}

function LeadRow({ lead, open, onToggle, onPatch, onRemoved, onError }: { lead: Lead; open: boolean; onToggle: () => void; onPatch: (p: Partial<Lead>) => void; onRemoved: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false),
    [notes, setNotes] = useState(lead.notes || ""),
    [notesState, setNotesState] = useState<string | null>(null)
  const send = async (url: string, method: string, body?: unknown) => {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const b = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(b.error || "That did not save.")
    return b
  }
  const setStatus = async (status: LeadStatus) => {
    const before = lead.status
    onPatch({ status })
    try {
      await send(`/api/leads/${lead.id}`, "PATCH", { status })
    } catch (e) {
      onPatch({ status: before })
      onError(e instanceof Error ? e.message : "The status did not save.")
    }
  }
  const saveNotes = async () => {
    if ((lead.notes || "") === notes) return
    setNotesState("Saving…")
    try {
      await send(`/api/leads/${lead.id}`, "PATCH", { notes })
      onPatch({ notes })
      setNotesState("Saved")
    } catch (e) {
      setNotesState(e instanceof Error ? e.message : "Not saved")
    }
  }
  const decide = async (decision: "confirm" | "decline" | "cancel") => {
    if (!lead.booking) return
    if (decision !== "confirm" && !window.confirm(decision === "decline" ? "Decline this request? The visitor gets an email." : "Cancel this booking? The time becomes free again.")) return
    setBusy(true)
    try {
      const b = await send(`/api/bookings/${lead.booking.id}`, "PATCH", { decision })
      onPatch({ booking: { ...lead.booking, status: b.booking.status } })
    } catch (e) {
      onError(e instanceof Error ? e.message : "The booking did not change.")
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!window.confirm("Delete this lead with its answers and files? This cannot be undone.")) return
    setBusy(true)
    try {
      await send(`/api/leads/${lead.id}`, "DELETE")
      onRemoved()
    } catch (e) {
      onError(e instanceof Error ? e.message : "The lead was not deleted.")
      setBusy(false)
    }
  }
  const who = lead.contact_name || displayEmail(lead.contact_email) || lead.contact_phone || "No name given"
  return (
    <li data-lead={lead.id}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#fafbfb]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{who}</span>
          <span className="block truncate text-[13px] text-[#6b7280]">
            {lead.form_title} · {when(lead.submitted_at)}
            {lead.booking ? ` · ${when(lead.booking.starts_at)}` : ""}
          </span>
        </span>
        <span className="hidden shrink-0 text-[13px] text-[#4b5563] sm:block">{lead.booking?.status === "pending" ? "Booking request" : LEAD_STATUS_LABEL[lead.status]}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#6b7280] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="space-y-5 border-t border-[#f1f2f4] bg-[#fafbfb] px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#eceef1] p-1 sm:grid-cols-4" role="radiogroup" aria-label="Status">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={lead.status === s}
                onClick={() => void setStatus(s)}
                className={`h-8 rounded-md px-3 text-[13px] font-medium ${lead.status === s ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-[#4b5563]"}`}
              >
                {LEAD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {lead.booking ? (
            <div className="space-y-2" data-lead-booking="">
              <p className="text-[14px] text-[#1a1a2e]">
                <span className="font-medium">{when(lead.booking.starts_at)}</span>
                <span className="text-[#6b7280]">
                  {" "}
                  · {BOOKING[lead.booking.status]}
                  {lead.booking.visitor_timezone ? ` · visitor in ${lead.booking.visitor_timezone.replace(/_/g, " ")}` : ""}
                </span>
              </p>
              {lead.booking.payment_status && lead.booking.payment_status !== "none" ? (
                <p className="text-[13px] text-[#4b5563]" data-booking-payment="">
                  {PAYMENT[lead.booking.payment_status]}
                  {lead.booking.payment_status === "unpaid" && lead.booking.status === "pending" && lead.booking.payment_due_at ? `, held until ${when(lead.booking.payment_due_at)}` : ""}
                  {lead.booking.payment_note ? `. ${lead.booking.payment_note}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {lead.booking.status === "pending" ? (
                  <>
                    <button type="button" className={buttonAccent} disabled={busy} onClick={() => void decide("confirm")}>
                      Confirm
                    </button>
                    <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void decide("decline")}>
                      Decline
                    </button>
                  </>
                ) : null}
                {lead.booking.status === "confirmed" ? (
                  <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void decide("cancel")}>
                    Cancel booking
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-3">
            <div className="min-w-0">
              <dt className={muted}>Email</dt>
              <dd className="break-words">{displayEmail(lead.contact_email) ? <a className="underline" href={`mailto:${displayEmail(lead.contact_email)}`}>{displayEmail(lead.contact_email)}</a> : "Not given"}</dd>
            </div>
            <div className="min-w-0">
              <dt className={muted}>Phone</dt>
              <dd className="break-words">{lead.contact_phone ? <a className="underline" href={`tel:${lead.contact_phone.replace(/[^\d+]/g, "")}`}>{lead.contact_phone}</a> : "Not given"}</dd>
            </div>
            <div className="min-w-0">
              <dt className={muted}>From</dt>
              <dd className="break-words">
                {SOURCES[lead.source_kind] || lead.source_kind}
                {lead.source_block ? `, ${lead.source_block}` : ""}
                {lead.source_url ? (
                  <a className="ml-1 text-[13px] underline" href={lead.source_url} target="_blank" rel="noopener noreferrer">
                    page
                  </a>
                ) : null}
              </dd>
            </div>
          </dl>
          <dl className="space-y-3 border-t border-[#eceef1] pt-4">
            {lead.answers.map((a) => (
              <div key={a.field_id}>
                <dt className="text-[13px] font-medium text-[#6b7280]">{a.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[#1a1a2e]">
                  {a.type === "file" && a.file ? (
                    <a className="underline" href={`/api/leads/${lead.id}/files/${a.file.id}`}>
                      {a.file.name}
                    </a>
                  ) : (
                    answerText(a) || <span className="text-[#9ca3af]">No answer</span>
                  )}
                </dd>
              </div>
            ))}
            {lead.score ? (
              <div>
                <dt className="text-[13px] font-medium text-[#6b7280]">Score</dt>
                <dd className="text-[14px]">{lead.score}</dd>
              </div>
            ) : null}
          </dl>
          <label className="block space-y-1 text-[13px] font-medium text-[#1a1a2e]">
            Notes
            <textarea className="w-full rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-[14px] font-normal outline-none focus:border-[#8b5cf6]" rows={3} maxLength={5000} value={notes} onChange={(e) => (setNotes(e.target.value), setNotesState(null))} onBlur={() => void saveNotes()} />
            {notesState ? <span className="block text-[12px] font-normal text-[#6b7280]">{notesState}</span> : null}
          </label>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#eceef1] pt-4">
            <p className="max-w-xl text-[12px] leading-relaxed text-[#6b7280]">
              Consent given {lead.consent.at ? when(lead.consent.at) : when(lead.submitted_at)}: “{lead.consent.text}” Updates: {lead.consent.marketing ? "yes" : "no"}.
            </p>
            <button type="button" className="text-[13px] font-medium text-[#b42318] underline" disabled={busy} onClick={() => void remove()}>
              Delete lead
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
