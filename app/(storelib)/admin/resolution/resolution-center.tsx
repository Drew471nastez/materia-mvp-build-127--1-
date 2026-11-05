"use client"

import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder } from "../_console/ui"
import { BuyerCases } from "./buyer-cases"
import { PRIORITIES, STATUS_FOR_ADMIN, TOPIC_LABELS, type Priority, type TicketMessage, type TicketStatus, type TicketSummary } from "@/lib/support/tickets"

/**
 * ===========================================================================
 *  RESOLUTION CENTER
 * ===========================================================================
 * Three lists Storelib works through:
 *
 *   Requests   stores asking for help (/app/support, SQL part 114): Needs a
 *              reply first, the most pressing at the top. A request opens
 *              into its thread, with Storelib's internal notes in amber, a
 *              reply box, "Suggest a reply" (a draft from Storelib AI to read
 *              and change, never sent on its own), whose turn and priority.
 *   Buyer cases  a buyer's problem with an order, once the buyer or the
 *              store asked Storelib to step in (./buyer-cases.tsx, part 117).
 *   Disputes   every recorded chargeback and inquiry (part 82): the store,
 *              the amount, the reason, the evidence deadline and whether the
 *              store has answered.
 *
 * ?ticket=<id> opens a request directly (the support inbox email links it).
 */

type AdminTicket = TicketSummary & { creatorId: string; store: { name: string | null; slug: string | null }; disputeId: string | null; resolvedAt: string | null }
type Case = { disputeId: string; amount: number; currency: string; reason: string | null; status: string | null; inquiry: boolean; evidenceDueBy: string | null; product: string | null; outcome: string | null; creatorNote: string | null; opened: string | null; closed: string | null; creator: { slug: string | null; display_name: string | null } | null }
type Note = { tone: "good" | "bad" | "plain"; text: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`
  }
}
const AREA = "min-h-[140px] w-full rounded-[8px] border border-white/[0.1] bg-[#0f0f14] px-3 py-2.5 text-[14px] leading-[21px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-white/[0.25]"
const SELECT = "h-9 rounded-[7px] border border-white/[0.1] bg-[#0f0f14] px-2 text-[13px] text-[#ededf0] outline-none"

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: init?.method ?? "GET", cache: "no-store", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined })
    const body = await res.json().catch(() => null)
    if (res.status === 401) window.location.reload()
    if (!res.ok) return { ok: false, error: body?.error || "That did not work." }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: "Could not reach Storelib." }
  }
}

export function ResolutionCenter() {
  const [tab, setTab] = React.useState<"requests" | "cases" | "disputes">("requests")
  const [caseCount, setCaseCount] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState<TicketStatus>("open")
  const [tickets, setTickets] = React.useState<AdminTicket[] | null>(null)
  const [counts, setCounts] = React.useState<Record<TicketStatus, number> | null>(null)
  const [cases, setCases] = React.useState<Case[] | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<Note | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("ticket")
    if (id) setOpenId(id)
    /* A buyer case linked from the inbox email opens on its own tab. */
    if (params.get("case")) setTab("cases")
  }, [])

  const loadTickets = React.useCallback(async (s: TicketStatus) => {
    setTickets(null)
    const r = await call<{ tickets: AdminTicket[]; counts: Record<TicketStatus, number> }>(`/api/admin/support?status=${s}`)
    if ("error" in r) {
      setNote({ tone: "bad", text: r.error })
      return setTickets([])
    }
    setTickets(r.data.tickets)
    setCounts(r.data.counts)
  }, [])

  React.useEffect(() => {
    if (tab === "requests") void loadTickets(status)
  }, [tab, status, loadTickets])

  /* How many buyer cases wait on Storelib, on the tab before it is opened: a buyer waiting should never be found by chance. */
  React.useEffect(() => {
    if (tab === "cases") return
    void call<{ counts: { storelib: number } }>("/api/admin/cases?view=storelib").then((r) => {
      if (!("error" in r)) setCaseCount(r.data.counts.storelib)
    })
  }, [tab])

  React.useEffect(() => {
    if (tab !== "disputes" || cases) return
    void call<{ cases: Case[] }>("/api/admin/payments/disputes").then((r) => {
      if ("error" in r) {
        setNote({ tone: "bad", text: r.error })
        return setCases([])
      }
      setCases(r.data.cases ?? [])
    })
  }, [tab, cases])

  const openTicket = (id: string | null) => {
    setOpenId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("ticket", id)
    else url.searchParams.delete("ticket")
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-resolution="">
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Resolution center</h1>
            <p className="mt-0.5 text-[13px] text-[#9b9ba6]">Stores asking for help, buyers' problems with orders, and every payment dispute.</p>
          </div>
          <Filters
            label="Show"
            value={tab}
            onChange={(v) => {
              setTab(v)
              openTicket(null)
            }}
            options={[
              { id: "requests", label: counts ? `Requests (${counts.open})` : "Requests" },
              { id: "cases", label: caseCount ? `Buyer cases (${caseCount})` : "Buyer cases" },
              { id: "disputes", label: "Disputes" },
            ]}
          />
        </div>

        {note ? (
          <div className="mb-4">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}

        {tab === "cases" ? (
          <BuyerCases onCount={setCaseCount} />
        ) : tab === "requests" ? (
          openId ? (
            <TicketView id={openId} onBack={() => openTicket(null)} onNote={setNote} onChanged={() => void loadTickets(status)} />
          ) : (
            <>
              <div className="mb-3">
                <Filters
                  label="Requests"
                  value={status}
                  onChange={setStatus}
                  options={(["open", "waiting", "resolved"] as TicketStatus[]).map((s) => ({ id: s, label: counts ? `${STATUS_FOR_ADMIN[s]} (${counts[s]})` : STATUS_FOR_ADMIN[s] }))}
                />
              </div>
              {tickets === null ? (
                <Placeholder rows={5} />
              ) : tickets.length === 0 ? (
                <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">{status === "open" ? "Nothing needs a reply." : "None here."}</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[10px] border border-white/[0.06]" data-admin-tickets="">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => openTicket(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]" data-admin-ticket={t.id}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-[#ededf0]">{t.subject}</span>
                          <span className="block truncate text-[12.5px] text-[#9b9ba6]">
                            {t.store.name || "A store"} · {TOPIC_LABELS[t.topic]}
                            {t.orderRef ? ` · #${t.orderRef}` : ""} · {when(t.lastMessageAt)}
                          </span>
                        </span>
                        {t.priority === "urgent" || t.priority === "high" ? <span className={t.priority === "urgent" ? "shrink-0 rounded-full bg-[#f47067]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#f47067]" : "shrink-0 rounded-full bg-[#d29922]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#d29922]"}>{t.priority === "urgent" ? "Urgent" : "High"}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        ) : cases === null ? (
          <Placeholder rows={5} />
        ) : cases.length === 0 ? (
          <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">No disputes recorded.</p>
        ) : (
          <div className="space-y-3" data-admin-disputes="">
            {cases.map((d) => (
              <Panel key={d.disputeId} title={`${money(d.amount, d.currency)} · ${d.creator?.display_name || "A store"}`} meta={`${d.inquiry ? "Inquiry" : "Chargeback"} · ${d.reason || "no reason given"} · opened ${when(d.opened)}${d.closed ? ` · closed ${when(d.closed)}` : ""}`}>
                <div className="space-y-1.5 px-4 py-3 text-[13px] text-[#c9c9d1]">
                  {d.product ? <p>Product: {d.product}</p> : null}
                  <p>
                    Status: {d.status || "unknown"}
                    {d.outcome ? ` · ${d.outcome}` : ""}
                  </p>
                  {d.evidenceDueBy && !d.closed ? <p className={new Date(d.evidenceDueBy).getTime() - Date.now() < 3 * 86_400_000 ? "text-[#f47067]" : ""}>Evidence due {when(d.evidenceDueBy)}</p> : null}
                  <p className="text-[#9b9ba6]">{d.creatorNote ? `The store answered: ${d.creatorNote.slice(0, 400)}` : "The store hasn't added evidence yet."}</p>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TicketView({ id, onBack, onNote, onChanged }: { id: string; onBack: () => void; onNote: (n: Note) => void; onChanged: () => void }) {
  const [ticket, setTicket] = React.useState<AdminTicket | null>(null)
  const [messages, setMessages] = React.useState<TicketMessage[]>([])
  const [contact, setContact] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [internal, setInternal] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "send" | "suggest" | "update">(null)

  const take = (d: { ticket: AdminTicket; messages: TicketMessage[]; contact: string | null }) => {
    setTicket(d.ticket)
    setMessages(d.messages)
    setContact(d.contact)
  }

  React.useEffect(() => {
    setTicket(null)
    void call<{ ticket: AdminTicket; messages: TicketMessage[]; contact: string | null }>(`/api/admin/support/${encodeURIComponent(id)}`).then((r) => ("error" in r ? onNote({ tone: "bad", text: r.error }) : take(r.data)))
  }, [id, onNote])

  const send = async (status?: TicketStatus) => {
    if (!draft.trim()) return
    setBusy("send")
    const r = await call<{ ticket: AdminTicket; messages: TicketMessage[]; contact: string | null }>(`/api/admin/support/${encodeURIComponent(id)}`, { method: "POST", body: { action: "reply", body: draft, internal, ...(status ? { status } : {}) } })
    setBusy(null)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    take(r.data)
    setDraft("")
    onNote({ tone: "good", text: internal ? "Note added. The store doesn't see it." : "Sent. The store gets it by email too." })
    onChanged()
  }

  const update = async (patch: { status?: TicketStatus; priority?: Priority }) => {
    setBusy("update")
    const r = await call<{ ticket: AdminTicket; messages: TicketMessage[]; contact: string | null }>(`/api/admin/support/${encodeURIComponent(id)}`, { method: "POST", body: { action: "update", ...patch } })
    setBusy(null)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    take(r.data)
    onChanged()
  }

  const suggest = async () => {
    setBusy("suggest")
    const r = await call<{ draft: string }>(`/api/admin/support/${encodeURIComponent(id)}/suggest`, { method: "POST" })
    setBusy(null)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    setInternal(false)
    setDraft(r.data.draft)
  }

  return (
    <div className="space-y-3" data-admin-ticket-view={id}>
      <button type="button" onClick={onBack} className="-ml-2 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
        All requests
      </button>
      {!ticket ? (
        <Placeholder rows={4} />
      ) : (
        <Panel>
          {/* Its own header rather than the Panel's one line: a subject and a store can be long, and both must read whole on a phone. */}
          <div className="border-b border-white/[0.08] px-4 py-3">
            <h2 className="text-[15px] font-semibold leading-[21px] text-[#ededf0] [overflow-wrap:anywhere]">{ticket.subject}</h2>
            <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#9b9ba6] [overflow-wrap:anywhere]">
              {ticket.store.name || "A store"}
              {ticket.store.slug ? ` (@${ticket.store.slug})` : ""} · {TOPIC_LABELS[ticket.topic]}
              {ticket.orderRef ? ` · Order #${ticket.orderRef}` : ""}
              {contact ? ` · ${contact}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[13px] text-[#9b9ba6]">
            <label className="inline-flex items-center gap-2">
              Status
              <select className={SELECT} value={ticket.status} disabled={busy !== null} onChange={(e) => void update({ status: e.target.value as TicketStatus })}>
                {(["open", "waiting", "resolved"] as TicketStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_FOR_ADMIN[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              Priority
              <select className={SELECT} value={ticket.priority} disabled={busy !== null} onChange={(e) => void update({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="space-y-3 px-4 py-4" data-admin-thread="">
            {messages.map((m) => (
              <li key={m.id} className={m.internal ? "rounded-[10px] border border-[#d29922]/30 bg-[#d29922]/[0.07] px-3.5 py-2.5" : m.author === "creator" ? "rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5" : "ml-6 rounded-[10px] border border-white/[0.08] bg-white/[0.05] px-3.5 py-2.5"} data-admin-message={m.internal ? "note" : m.author}>
                <p className="mb-1 text-[12px] font-medium text-[#9b9ba6]">
                  {m.internal ? "Internal note" : m.author === "creator" ? ticket.store.name || "The store" : "Storelib"} · {when(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-[14px] leading-[21px] text-[#ededf0] [overflow-wrap:anywhere]">{m.body}</p>
              </li>
            ))}
          </ol>
          <div className="space-y-2.5 border-t border-white/[0.06] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Filters
                label="Write"
                value={internal ? "note" : "reply"}
                onChange={(v) => setInternal(v === "note")}
                options={[
                  { id: "reply", label: "Reply to the store" },
                  { id: "note", label: "Internal note" },
                ]}
              />
              <Button onClick={() => void suggest()} disabled={busy !== null} data-admin-suggest="">
                {busy === "suggest" ? "Thinking" : "Suggest a reply"}
              </Button>
            </div>
            <textarea className={AREA} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={internal ? "Only Storelib sees this" : "The store gets this here and by email"} aria-label={internal ? "Internal note" : "Reply"} />
            {draft && !internal ? <p className="text-[12px] text-[#6b6b76]">Read it before sending. A suggestion can be wrong about money or dates.</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              {!internal ? (
                <Button onClick={() => void send("resolved")} disabled={busy !== null || !draft.trim()}>
                  Send and resolve
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => void send()} disabled={busy !== null || !draft.trim()} data-admin-send="">
                {internal ? "Add note" : "Send"}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
