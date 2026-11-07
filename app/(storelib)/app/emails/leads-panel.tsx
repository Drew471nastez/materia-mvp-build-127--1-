"use client"

/**
 * ===========================================================================
 *  EMAILS › LEADS: EVERY ANSWER TO THE CREATOR'S FORMS
 * ===========================================================================
 * Leads used to be a sidebar item of its own ("Audience"), drawn in its own
 * style. People already live in Emails (subscribers, the messages from a
 * website's contact form), so Leads is a tab there now, drawn with the same
 * parts as Subscribers and Messages: one toolbar row of filter chips with
 * search and export at its end, a dense table on a computer, a row per lead
 * on a phone, and a lead's answers in the dialog that is a sheet on a phone.
 *
 * The forms that collect them are one press away (Forms, in the toolbar,
 * /app/emails/forms), and each form is also made and edited where it is
 * used: the OnePage's Form block and a chat button's questions.
 *
 * WHEN FORMS ARE NOT SET UP (SQL parts 372 and 375 not run) the tab says so
 * in one sentence and asks for nothing (lib/forms/client). A blip is asked
 * again once by formsRequest; after that the table says what went wrong
 * and Try again asks once more, never in a loop.
 *
 * The first page, with no filter, comes from the tab's cached read
 * (./emails-data loadLeads); a filter or a search reads the server, inside
 * the owner's own rows.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { ShimmerSwap } from "@/components/ui/shimmer"
import { ScrollEdge } from "@/components/app/scroll-edge"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formsRequest } from "@/lib/forms/client"
import { LEAD_STATUSES, answerText, type Answer, type LeadStatus } from "@/lib/forms/definition"
import { RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, iconButton } from "../orders/order-parts"
import { Empty, FilterChip, Loading, PhoneItem, formatWhen, pressable, sticky, stickyHead, td, th, useNarrow, usePress } from "./emails-home"

export interface LeadBooking {
  id: string
  starts_at: string
  ends_at: string
  status: "pending" | "confirmed" | "declined" | "cancelled"
  visitor_timezone: string | null
  payment_status?: "none" | "unpaid" | "paid" | "failed" | "refunded" | "review"
  payment_due_at?: string | null
  payment_note?: string | null
}

export interface LeadRow {
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
  booking: LeadBooking | null
}

/** What the Leads tab reads (./emails-data loadLeads), kept in the Emails cache. */
export interface LeadsData {
  leads: LeadRow[]
  next: string | null
  forms: { id: string; title: string }[]
  /** Notes, bookings and files need part 375. */
  upgraded: boolean
  /** The forms tables are not there yet (parts 372 and 375). */
  missing: boolean
  totals: { all: number; fresh: number; week: number } | null
  /** The read did not work, in words. */
  error: string | null
}

export const EMPTY_LEADS: LeadsData = { leads: [], next: null, forms: [], upgraded: true, missing: false, totals: null, error: null }

/** The Leads tab's read: the first page with its counts, and the forms for the Form filter, side by side. */
export async function loadLeads(): Promise<LeadsData> {
  const [leads, forms] = await Promise.all([
    formsRequest<{ leads: LeadRow[]; next: string | null; upgraded?: boolean; totals?: LeadsData["totals"] }>("/api/leads?totals=1", { fallback: tt("Leads could not be loaded. Try again.") }),
    formsRequest<{ forms: { id: string; title: string }[] }>("/api/forms", { fallback: tt("Forms could not be loaded. Try again.") }),
  ])
  return {
    leads: leads.data?.leads ?? [],
    next: leads.data?.next ?? null,
    forms: (forms.data?.forms ?? []).map((f) => ({ id: f.id, title: f.title })),
    upgraded: leads.data?.upgraded !== false,
    missing: leads.missing || forms.missing,
    totals: leads.data?.totals ?? null,
    error: leads.missing ? null : leads.error,
  }
}

const statusLabel = (s: LeadStatus) => ({ new: tt("New"), contacted: tt("Contacted"), qualified: tt("Qualified"), converted: tt("Converted") })[s] ?? s
const sourceLabel = (k: string) => ({ onepage: "OnePage", website: tt("Website"), creator_page: tt("Creator page"), form: tt("Form link") })[k] ?? k
const SOURCE_KEYS = ["onepage", "website", "creator_page", "form"]
const bookingLabel = (s: LeadBooking["status"]) => ({ pending: tt("Waiting for you"), confirmed: tt("Confirmed"), declined: tt("Declined"), cancelled: tt("Cancelled") })[s]
const paymentLabel = (s: string) => ({ unpaid: tt("Waiting for payment"), paid: tt("Paid"), failed: tt("Payment failed"), refunded: tt("Refunded"), review: tt("Payment needs a look") })[s] ?? ""

function LeadStatusBadge({ lead }: { lead: LeadRow }) {
  if (lead.booking?.status === "pending") return <StatusBadge tone="attention">{tt("Booking request")}</StatusBadge>
  if (lead.status === "new") return <StatusBadge tone="attention">{tt("New")}</StatusBadge>
  return <StatusBadge tone={lead.status === "converted" ? "success" : "neutral"}>{statusLabel(lead.status)}</StatusBadge>
}

const whoOf = (l: LeadRow) => l.contact_name || l.contact_email || l.contact_phone || tt("No name given")

type Filters = { q: string; form: string; status: string; source: string }
const NO_FILTERS: Filters = { q: "", form: "", status: "", source: "" }

export function LeadsPanel({ data, loading, onData, onNotice }: { data: LeadsData | null; loading: boolean; onData: (next: LeadsData) => void; onNotice: (message: string, failed?: boolean) => void }) {
  const narrow = useNarrow()
  const press = usePress()
  const params = useSearchParams()
  const base = data ?? EMPTY_LEADS
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [searching, setSearching] = React.useState(false)
  const [query, setQuery] = React.useState("")
  /* A filtered read of the server; null while no filter is on (the cached first page shows). */
  const [found, setFound] = React.useState<{ leads: LeadRow[]; next: string | null } | null>(null)
  const [reading, setReading] = React.useState(false)
  const [readError, setReadError] = React.useState<string | null>(null)
  const [more, setMore] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(params?.get("lead") ?? null)
  /* A lead opened by its link (a notification email) that is not on the first page is read on its own. */
  const [linked, setLinked] = React.useState<LeadRow | null>(null)
  const readId = React.useRef(0)
  const filtered = !!(filters.q || filters.form || filters.status || filters.source)

  const query_ = (f: Filters, before?: string | null) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v)
    if (before) q.set("before", before)
    return q.toString()
  }

  /* The search waits for the typing to stop. */
  React.useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === query.trim() ? f : { ...f, q: query.trim() })), 300)
    return () => window.clearTimeout(t)
  }, [query])

  React.useEffect(() => {
    if (!filtered) {
      setFound(null)
      setReadError(null)
      setReading(false)
      return
    }
    const id = ++readId.current
    setReading(true)
    setReadError(null)
    void formsRequest<{ leads: LeadRow[]; next: string | null }>("/api/leads?" + query_(filters), { fallback: tt("Leads could not be loaded. Try again.") }).then((r) => {
      if (id !== readId.current) return
      setReading(false)
      if (r.error) return setReadError(r.error)
      setFound({ leads: r.data?.leads ?? [], next: r.data?.next ?? null })
    })
  }, [filters, filtered])

  /* ?lead=<id>: opened at once when it is on the page, read on its own when not. */
  React.useEffect(() => {
    const id = params?.get("lead")
    if (!id || base.missing || loading) return
    setOpenId(id)
    if (base.leads.some((l) => l.id === id)) return
    let live = true
    void formsRequest<{ leads: LeadRow[] }>("/api/leads?lead=" + encodeURIComponent(id)).then((r) => {
      if (live && r.data?.leads?.[0]) setLinked(r.data.leads[0])
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, loading, base.missing])

  const rows = found ? found.leads : base.leads
  const next = found ? found.next : base.next
  const open = rows.find((l) => l.id === openId) ?? (linked?.id === openId ? linked : null)

  const patch = (id: string, change: Partial<LeadRow>) => {
    const apply = (list: LeadRow[]) => list.map((l) => (l.id === id ? { ...l, ...change } : l))
    onData({ ...base, leads: apply(base.leads) })
    setFound((f) => (f ? { ...f, leads: apply(f.leads) } : f))
    setLinked((l) => (l && l.id === id ? { ...l, ...change } : l))
  }
  const removed = (id: string) => {
    const drop = (list: LeadRow[]) => list.filter((l) => l.id !== id)
    onData({ ...base, leads: drop(base.leads), totals: base.totals ? { ...base.totals, all: Math.max(0, base.totals.all - 1) } : null })
    setFound((f) => (f ? { ...f, leads: drop(f.leads) } : f))
    setOpenId(null)
  }
  const closeLead = () => {
    setOpenId(null)
    if (params?.get("lead")) {
      const url = new URL(window.location.href)
      url.searchParams.delete("lead")
      window.history.replaceState(window.history.state, "", url)
    }
  }

  const loadMore = async () => {
    if (!next || more) return
    setMore(true)
    const r = await formsRequest<{ leads: LeadRow[]; next: string | null }>("/api/leads?" + query_(filters, next), { fallback: tt("Leads could not be loaded. Try again.") })
    setMore(false)
    if (r.error || !r.data) return onNotice(r.error || tt("Leads could not be loaded. Try again."), true)
    const page = r.data
    if (found) setFound({ leads: [...found.leads, ...page.leads], next: page.next })
    else onData({ ...base, leads: [...base.leads, ...page.leads], next: page.next })
  }

  const retry = async () => {
    setReading(true)
    const fresh = await loadLeads()
    setReading(false)
    onData(fresh)
  }

  const deleteAllOf = async (formId: string) => {
    const title = base.forms.find((f) => f.id === formId)?.title || tt("this form")
    if (!window.confirm(tt("Delete every lead from “{title}”, with their answers and files? This cannot be undone.", { title }))) return
    const r = await formsRequest<{ deleted: number | null }>(`/api/leads?form=${encodeURIComponent(formId)}&confirm=all`, { method: "DELETE", fallback: tt("The leads were not deleted. Try again.") })
    if (r.error) return onNotice(r.error, true)
    onNotice(tt("Leads deleted"))
    setFilters({ ...filters })
    void retry()
  }

  const formName = filters.form ? base.forms.find((f) => f.id === filters.form)?.title || tt("Untitled form") : null
  const exportHref = "/api/leads/export?" + query_(filters)

  if (base.missing) {
    return (
      <div data-leads-missing="">
        <Empty
          title={tt("Forms are not switched on yet")}
          body={tt("Leads come from your forms, and forms need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates). Everything else keeps working.")}
        />
      </div>
    )
  }

  const menuFor = (l: LeadRow): ActionMenuItem[] => [
    { label: tt("Open"), onClick: () => setOpenId(l.id) },
    ...(l.contact_email ? [{ label: tt("Email {who}", { who: whoOf(l) }), href: `mailto:${l.contact_email}` }] : []),
    ...LEAD_STATUSES.filter((s) => s !== l.status).map((s) => ({ label: tt("Mark as {status}", { status: statusLabel(s).toLowerCase() }), onClick: () => void setStatus(l, s) })),
  ]
  const setStatus = async (l: LeadRow, status: LeadStatus) => {
    const before = l.status
    patch(l.id, { status })
    const r = await formsRequest(`/api/leads/${l.id}`, { method: "PATCH", body: JSON.stringify({ status }), fallback: tt("The status did not save. Try again.") })
    if (r.error || r.missing) {
      patch(l.id, { status: before })
      onNotice(r.error || tt("The status did not save. Try again."), true)
    }
  }

  const busy = loading || (reading && !found)
  const problem = filtered ? readError : base.error

  return (
    <div data-leads="">
      {/* One toolbar row, the height of Subscribers': the filters and the tools, or the search. */}
      <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
        {searching ? (
          <>
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]">
              <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tt("Search by name, email or phone")}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button type="button" aria-label={tt("Clear search")} className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => setQuery("")}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <button type="button" className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]" onClick={() => (setQuery(""), setSearching(false))}>
              {tt("Cancel")}
            </button>
          </>
        ) : (
          <>
            <div className="orders-strip flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1">
              {base.forms.length > 0 ? (
                <FilterChip label={tt("Form")} value={formName} options={[{ value: "", label: tt("Any form") }, ...base.forms.map((f) => ({ value: f.id, label: f.title || tt("Untitled form") }))]} selected={filters.form} onSelect={(form) => setFilters((f) => ({ ...f, form }))} />
              ) : null}
              <FilterChip label={tt("Status")} value={filters.status ? statusLabel(filters.status as LeadStatus) : null} options={[{ value: "", label: tt("Any status") }, ...LEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))]} selected={filters.status} onSelect={(status) => setFilters((f) => ({ ...f, status }))} />
              <FilterChip label={tt("Source")} value={filters.source ? sourceLabel(filters.source) : null} options={[{ value: "", label: tt("Any source") }, ...SOURCE_KEYS.map((k) => ({ value: k, label: sourceLabel(k) }))]} selected={filters.source} onSelect={(source) => setFilters((f) => ({ ...f, source }))} />
            </div>
            <a href="/app/emails/forms" className={cn(buttonSecondary, "shrink-0")} data-leads-forms="">
              {tt("Forms")}
            </a>
            <button type="button" aria-label={tt("Search leads")} className={iconButton} onClick={() => setSearching(true)}>
              <Search className="h-4 w-4" />
            </button>
            <a href={exportHref} aria-label={tt("Export leads")} className={iconButton} data-export-leads="">
              <Download className="h-4 w-4" />
            </a>
            {filters.form ? (
              <ResponsiveActionMenu
                title={formName || tt("Form")}
                align="end"
                trigger={<RowMenuButton label={tt("More for this form's leads")} />}
                items={[{ label: tt("Delete all leads from this form"), variant: "destructive", onClick: () => void deleteAllOf(filters.form) }]}
              />
            ) : null}
          </>
        )}
      </div>

      <ShimmerSwap loading={busy} skeleton={<Loading />}>
        {busy ? null : problem && !rows.length ? (
          <Empty
            title={tt("Leads did not load")}
            body={problem}
            action={
              <button type="button" className={buttonSecondary} disabled={reading} onClick={() => (filtered ? setFilters({ ...filters }) : void retry())}>
                {tt("Try again")}
              </button>
            }
          />
        ) : rows.length === 0 ? (
          filtered ? (
            <Empty title={tt("No leads match")} body={tt("Try another search or filter.")} />
          ) : (
            <Empty
              title={tt("No leads yet")}
              body={base.forms.length ? tt("Answers to your forms show up here, and you get an email for each one.") : tt("Add a Form block to your OnePage, or ask a few questions before a WhatsApp chat opens. The answers show up here.")}
              action={
                <a href="/app/emails/forms" className={buttonAccent}>
                  {base.forms.length ? tt("Your forms") : tt("Create a form")}
                </a>
              }
            />
          )
        ) : (
          <>
            {narrow !== false ? (
              <ul aria-label={tt("Leads")} className="divide-y divide-[#f1f2f4] sm:hidden">
                {rows.map((l) => (
                  <PhoneItem
                    key={l.id}
                    data-lead-row={l.id}
                    onClick={() => setOpenId(l.id)}
                    {...press(l.id)}
                    head={whoOf(l)}
                    aside={formatWhen(l.submitted_at)}
                    line={l.form_title}
                    meta={[l.contact_email, l.contact_phone].filter(Boolean).join(" · ") || undefined}
                    badges={<LeadStatusBadge lead={l} />}
                    menu={<ResponsiveActionMenu title={whoOf(l)} align="end" trigger={<RowMenuButton label={tt("Actions for {who}", { who: whoOf(l) })} className="h-11 w-11" />} items={menuFor(l)} />}
                  />
                ))}
              </ul>
            ) : null}
            {narrow !== true ? (
              <ScrollEdge frameClassName="max-sm:hidden">
                <table className="w-full min-w-[760px] border-collapse" data-leads-table="">
                  <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                    <tr>
                      <th data-scroll-edge="" className={cn(th, stickyHead, "w-px")}>{tt("Name")}</th>
                      <th className={th}>{tt("Contact")}</th>
                      <th className={th}>{tt("Form")}</th>
                      <th className={th}>{tt("Source")}</th>
                      <th className={th}>{tt("Status")}</th>
                      <th className={th}>{tt("Received")}</th>
                      <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f2f4]">
                    {rows.map((l) => (
                      <tr key={l.id} data-lead-row={l.id} className={cn("orders-row", pressable)} onClick={() => setOpenId(l.id)} {...press(l.id)}>
                        <td data-scroll-edge="" className={cn(td, sticky)}>
                          <span className={cn("block max-w-[200px] truncate", l.status === "new" ? "font-semibold" : "font-medium")}>{whoOf(l)}</span>
                        </td>
                        <td className={cn(td, "text-[#4b5563]")}>
                          <span className="block max-w-[220px] truncate">{l.contact_email || l.contact_phone || "–"}</span>
                        </td>
                        <td className={td}>
                          <span className="block max-w-[200px] truncate">{l.form_title}</span>
                        </td>
                        <td className={cn(td, "text-[#4b5563]")}>{sourceLabel(l.source_kind)}</td>
                        <td className={td}>
                          <LeadStatusBadge lead={l} />
                        </td>
                        <td className={cn(td, "tabular-nums text-[#4b5563]")}>{formatWhen(l.submitted_at)}</td>
                        <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                          <ResponsiveActionMenu title={whoOf(l)} align="end" trigger={<RowMenuButton label={tt("Actions for {who}", { who: whoOf(l) })} />} items={menuFor(l)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollEdge>
            ) : null}
            {next ? (
              <div className="flex h-12 items-center justify-center border-t border-[#eef0f2]">
                <button type="button" className={buttonSecondary} disabled={more} onClick={() => void loadMore()}>
                  {more ? tt("Loading") : tt("Show more")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </ShimmerSwap>
      {!base.upgraded && rows.length ? <p className="border-t border-[#eef0f2] px-4 py-3 text-[13px] text-[#6b7280]">{tt("Notes, bookings and file answers need the Forms database update (SQL part 375).")}</p> : null}

      <LeadDialog lead={open} onClose={closeLead} onPatch={patch} onRemoved={removed} onNotice={onNotice} upgraded={base.upgraded} />
    </div>
  )
}

const LABEL = "text-[12px] font-medium text-[#4b5563]"
const TEXTAREA =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[14px]"

/** One lead: a dialog on a computer, the shared sheet on a phone (components/ui/sheet-dialog). */
function LeadDialog({ lead, onClose, onPatch, onRemoved, onNotice, upgraded }: { lead: LeadRow | null; onClose: () => void; onPatch: (id: string, p: Partial<LeadRow>) => void; onRemoved: (id: string) => void; onNotice: (m: string, failed?: boolean) => void; upgraded: boolean }) {
  const phone = usePhoneWidth()
  /* The last lead stays drawn while the dialog closes, so it leaves with its words. */
  const [shown, setShown] = React.useState<LeadRow | null>(lead)
  if (lead && lead !== shown) setShown(lead)
  const l = lead ?? shown
  return (
    <SheetDialog open={!!lead} onClose={onClose} phone={phone} label={l ? whoOf(l) : tt("Lead")} className="max-h-[86dvh] overflow-y-auto p-0 sm:max-w-[560px]" dialog={{ "aria-describedby": undefined }}>
      {l ? <LeadBody key={l.id} lead={l} onPatch={onPatch} onRemoved={onRemoved} onNotice={onNotice} upgraded={upgraded} /> : null}
    </SheetDialog>
  )
}

function LeadBody({ lead, onPatch, onRemoved, onNotice, upgraded }: { lead: LeadRow; onPatch: (id: string, p: Partial<LeadRow>) => void; onRemoved: (id: string) => void; onNotice: (m: string, failed?: boolean) => void; upgraded: boolean }) {
  const [notes, setNotes] = React.useState(lead.notes || "")
  const [notesState, setNotesState] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const when = (iso: string) => formatWhen(iso)

  const setStatus = async (status: LeadStatus) => {
    if (status === lead.status) return
    const before = lead.status
    onPatch(lead.id, { status })
    const r = await formsRequest(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }), fallback: tt("The status did not save. Try again.") })
    if (r.error || r.missing) {
      onPatch(lead.id, { status: before })
      onNotice(r.error || tt("The status did not save. Try again."), true)
    }
  }
  const saveNotes = async () => {
    if ((lead.notes || "") === notes) return
    setNotesState(tt("Saving"))
    const r = await formsRequest(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ notes }), fallback: tt("Not saved. Try again.") })
    if (r.error || r.missing) return setNotesState(r.error || tt("Not saved. Try again."))
    onPatch(lead.id, { notes })
    setNotesState(tt("Saved"))
  }
  const decide = async (decision: "confirm" | "decline" | "cancel") => {
    if (!lead.booking) return
    if (decision !== "confirm" && !window.confirm(decision === "decline" ? tt("Decline this request? The visitor gets an email.") : tt("Cancel this booking? The time becomes free again."))) return
    setBusy(true)
    const r = await formsRequest<{ booking: { status: LeadBooking["status"] } }>(`/api/bookings/${lead.booking.id}`, { method: "PATCH", body: JSON.stringify({ decision }), fallback: tt("The booking did not change. Try again.") })
    setBusy(false)
    if (r.error || !r.data) return onNotice(r.error || tt("The booking did not change. Try again."), true)
    onPatch(lead.id, { booking: { ...lead.booking, status: r.data.booking.status } })
  }
  const remove = async () => {
    if (!window.confirm(tt("Delete this lead with its answers and files? This cannot be undone."))) return
    setBusy(true)
    const r = await formsRequest(`/api/leads/${lead.id}`, { method: "DELETE", fallback: tt("The lead was not deleted. Try again.") })
    setBusy(false)
    if (r.error || r.missing) return onNotice(r.error || tt("The lead was not deleted. Try again."), true)
    onNotice(tt("Lead deleted"))
    onRemoved(lead.id)
  }

  return (
    <div className="flex flex-col" data-lead={lead.id}>
      <div className="border-b border-[#eef0f2] px-5 pb-4 pt-5 pr-12">
        <SheetDialogTitle className="truncate text-[17px] font-semibold leading-6 text-[#1a1a2e]">{whoOf(lead)}</SheetDialogTitle>
        <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">
          {lead.form_title} · {when(lead.submitted_at)}
        </p>
        <div className="mt-3">
          <SegmentedPills label={tt("Status")} size="sm" value={lead.status} onChange={(s) => void setStatus(s)} options={LEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
        </div>
      </div>

      {lead.booking ? (
        <section className="space-y-2 border-b border-[#eef0f2] px-5 py-4" data-lead-booking="">
          <p className={LABEL}>{tt("Booking")}</p>
          <p className="text-[14px] text-[#1a1a2e]">
            <span className="font-medium">{when(lead.booking.starts_at)}</span>
            <span className="text-[#6b7280]">
              {" · "}
              {bookingLabel(lead.booking.status)}
              {lead.booking.visitor_timezone ? ` · ${tt("visitor in {zone}", { zone: lead.booking.visitor_timezone.replace(/_/g, " ") })}` : ""}
            </span>
          </p>
          {lead.booking.payment_status && lead.booking.payment_status !== "none" ? (
            <p className="text-[13px] text-[#4b5563]" data-booking-payment="">
              {paymentLabel(lead.booking.payment_status)}
              {lead.booking.payment_status === "unpaid" && lead.booking.status === "pending" && lead.booking.payment_due_at ? `, ${tt("held until {when}", { when: when(lead.booking.payment_due_at) })}` : ""}
              {lead.booking.payment_note ? `. ${lead.booking.payment_note}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {lead.booking.status === "pending" ? (
              <>
                <button type="button" className={buttonAccent} disabled={busy} onClick={() => void decide("confirm")}>
                  {tt("Confirm")}
                </button>
                <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void decide("decline")}>
                  {tt("Decline")}
                </button>
              </>
            ) : null}
            {lead.booking.status === "confirmed" ? (
              <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void decide("cancel")}>
                {tt("Cancel booking")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 border-b border-[#eef0f2] px-5 py-4 text-[14px] text-[#1a1a2e] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className={LABEL}>{tt("Email")}</dt>
          <dd className="mt-0.5 break-words">{lead.contact_email ? <a className="underline decoration-[#d5d7dd] underline-offset-2" href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a> : <span className="text-[#9ca3af]">{tt("Not given")}</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className={LABEL}>{tt("Phone")}</dt>
          <dd className="mt-0.5 break-words">{lead.contact_phone ? <a className="underline decoration-[#d5d7dd] underline-offset-2" href={`tel:${lead.contact_phone.replace(/[^\d+]/g, "")}`}>{lead.contact_phone}</a> : <span className="text-[#9ca3af]">{tt("Not given")}</span>}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className={LABEL}>{tt("From")}</dt>
          <dd className="mt-0.5 break-words">
            {sourceLabel(lead.source_kind)}
            {lead.source_block ? `, ${lead.source_block}` : ""}
            {lead.source_url ? (
              <a className="ml-1.5 text-[13px] text-[#4b5563] underline decoration-[#d5d7dd] underline-offset-2" href={lead.source_url} target="_blank" rel="noopener noreferrer">
                {tt("Open page")}
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <dl className="space-y-3 border-b border-[#eef0f2] px-5 py-4">
        {lead.answers.map((a) => (
          <div key={a.field_id}>
            <dt className={LABEL}>{a.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[#1a1a2e]">
              {a.type === "file" && a.file ? (
                <a className="underline decoration-[#d5d7dd] underline-offset-2" href={`/api/leads/${lead.id}/files/${a.file.id}`}>
                  {a.file.name}
                </a>
              ) : (
                answerText(a) || <span className="text-[#9ca3af]">{tt("No answer")}</span>
              )}
            </dd>
          </div>
        ))}
        {lead.score ? (
          <div>
            <dt className={LABEL}>{tt("Score")}</dt>
            <dd className="mt-0.5 text-[14px] tabular-nums">{lead.score}</dd>
          </div>
        ) : null}
      </dl>

      {upgraded ? (
        <div className="border-b border-[#eef0f2] px-5 py-4">
          <label htmlFor={`lead-notes-${lead.id}`} className={cn(LABEL, "mb-1.5 block")}>
            {tt("Notes")}
          </label>
          <textarea id={`lead-notes-${lead.id}`} className={TEXTAREA} rows={3} maxLength={5000} value={notes} onChange={(e) => (setNotes(e.target.value), setNotesState(null))} onBlur={() => void saveNotes()} />
          {notesState ? <p className="mt-1 text-[12px] text-[#6b7280]">{notesState}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <p className="max-w-[360px] text-[12px] leading-relaxed text-[#6b7280]">
          {tt("Consent given {when}: “{text}” Updates: {updates}.", { when: when(lead.consent.at || lead.submitted_at), text: lead.consent.text, updates: lead.consent.marketing ? tt("yes") : tt("no") })}
        </p>
        <button type="button" className="h-8 rounded-lg px-2.5 text-[13px] font-medium text-[#b42318] hover:bg-[#fef3f2]" disabled={busy} onClick={() => void remove()}>
          {tt("Delete lead")}
        </button>
      </div>
    </div>
  )
}
