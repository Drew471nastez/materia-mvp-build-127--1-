"use client"

import { CasePhotoStrip } from "@/components/support/case-photos"
import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder } from "../_console/ui"
import { CASE_REASON_LABELS, CASE_STATUSES, STATUS_FOR_ADMIN, type CaseMessage, type CaseStatus, type CaseSummary } from "@/lib/support/cases"

/**
 * ===========================================================================
 *  BUYER CASES, FOR STORELIB
 * ===========================================================================
 * A buyer's case about an order (lib/support/cases.ts) goes to the store
 * first. Storelib sees it here once the buyer or the store asks it to step
 * in ("Needs a reply"), and can look at every case it was ever asked into,
 * the resolved ones, or all of them. A case opens into its whole thread:
 * the buyer, the store, Storelib, and Storelib's notes in amber. A reply goes
 * to both by email; who it is for decides whose turn it is next.
 *
 * ?case=<id> opens one directly (the inbox email links it).
 */

type AdminCase = CaseSummary & { creatorId: string; store: { name: string | null; slug: string | null }; escalatedAt: string | null; resolvedAt: string | null; checkoutId: string | null; orderId: string | null }
type Store = { name: string; email: string | null; phone: string | null; websiteUrl: string | null }
type View = "storelib" | "escalated" | "resolved" | "all"
type Note = { tone: "good" | "bad" | "plain"; text: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
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

export function BuyerCases({ onCount }: { onCount?: (n: number) => void }) {
  const [view, setView] = React.useState<View>("storelib")
  const [cases, setCases] = React.useState<AdminCase[] | null>(null)
  const [counts, setCounts] = React.useState<{ storelib: number; escalated: number; all: number } | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<Note | null>(null)

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("case")
    if (id) setOpenId(id)
  }, [])

  const load = React.useCallback(
    async (v: View) => {
      setCases(null)
      const r = await call<{ cases: AdminCase[]; counts: { storelib: number; escalated: number; all: number } }>(`/api/admin/cases?view=${v}`)
      if ("error" in r) {
        setNote({ tone: "bad", text: r.error })
        return setCases([])
      }
      setCases(r.data.cases)
      setCounts(r.data.counts)
      onCount?.(r.data.counts.storelib)
    },
    [onCount],
  )

  React.useEffect(() => {
    void load(view)
  }, [view, load])

  const open = (id: string | null) => {
    setOpenId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("case", id)
    else url.searchParams.delete("case")
    window.history.replaceState(null, "", url)
  }

  return (
    <div data-admin-cases="">
      {note ? (
        <div className="mb-4">
          <Banner tone={note.tone} onClose={() => setNote(null)}>
            {note.text}
          </Banner>
        </div>
      ) : null}
      {openId ? (
        <CaseView id={openId} onBack={() => open(null)} onNote={setNote} onChanged={() => void load(view)} />
      ) : (
        <>
          <p className="mb-3 text-[13px] leading-[19px] text-[#9b9ba6]">A buyer's problem with an order goes to the store first. It comes here when the buyer or the store asks Storelib to step in.</p>
          <div className="mb-3">
            <Filters
              label="Cases"
              value={view}
              onChange={setView}
              options={[
                { id: "storelib", label: counts ? `Needs a reply (${counts.storelib})` : "Needs a reply" },
                { id: "escalated", label: counts ? `Stepped in (${counts.escalated})` : "Stepped in" },
                { id: "resolved", label: "Resolved" },
                { id: "all", label: counts ? `All (${counts.all})` : "All" },
              ]}
            />
          </div>
          {cases === null ? (
            <Placeholder rows={5} />
          ) : cases.length === 0 ? (
            <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">{view === "storelib" ? "No buyer is waiting on Storelib." : "None here."}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[10px] border border-white/[0.06]">
              {cases.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => open(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]" data-admin-case={c.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-[#ededf0]">
                        {CASE_REASON_LABELS[c.reason]}
                        {c.orderRef ? ` · #${c.orderRef}` : ""}
                      </span>
                      <span className="block truncate text-[12.5px] text-[#9b9ba6]">
                        {c.store.name || "A store"} · {c.buyerName || c.buyerEmail} · {c.kind === "physical" ? "Shipped order" : "Digital order"} · {when(c.lastMessageAt)}
                      </span>
                    </span>
                    <span className={c.status === "storelib" ? "shrink-0 rounded-full bg-[#f47067]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#f47067]" : "shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11.5px] font-medium text-[#9b9ba6]"}>{STATUS_FOR_ADMIN[c.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function CaseView({ id, onBack, onNote, onChanged }: { id: string; onBack: () => void; onNote: (n: Note) => void; onChanged: () => void }) {
  const [c, setCase] = React.useState<AdminCase | null>(null)
  const [messages, setMessages] = React.useState<CaseMessage[]>([])
  const [store, setStore] = React.useState<Store | null>(null)
  const [draft, setDraft] = React.useState("")
  const [mode, setMode] = React.useState<"buyer" | "store" | "note">("buyer")
  const [busy, setBusy] = React.useState(false)

  const take = (d: { case: AdminCase; messages: CaseMessage[]; store: Store }) => {
    setCase(d.case)
    setMessages(d.messages)
    setStore(d.store)
  }
  React.useEffect(() => {
    setCase(null)
    void call<{ case: AdminCase; messages: CaseMessage[]; store: Store }>(`/api/admin/cases/${encodeURIComponent(id)}`).then((r) => ("error" in r ? onNote({ tone: "bad", text: r.error }) : take(r.data)))
  }, [id, onNote])

  const send = async (status?: CaseStatus) => {
    if (!draft.trim()) return
    setBusy(true)
    const r = await call<{ case: AdminCase; messages: CaseMessage[]; store: Store }>(`/api/admin/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action: "reply", body: draft, internal: mode === "note", to: mode === "store" ? "store" : "buyer", ...(status ? { status } : {}) } })
    setBusy(false)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    take(r.data)
    setDraft("")
    onNote({ tone: "good", text: mode === "note" ? "Note added. Only Storelib sees it." : "Sent to the buyer and the store, by email too." })
    onChanged()
  }
  const update = async (status: CaseStatus) => {
    setBusy(true)
    const r = await call<{ case: AdminCase; messages: CaseMessage[]; store: Store }>(`/api/admin/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action: "update", status } })
    setBusy(false)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    take(r.data)
    onChanged()
  }

  const who = (m: CaseMessage) => (m.internal ? "Internal note" : m.author === "buyer" ? c?.buyerName || "The buyer" : m.author === "store" ? store?.name || "The store" : "Storelib")

  return (
    <div className="space-y-3" data-admin-case-view={id}>
      <button type="button" onClick={onBack} className="-ml-2 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
        All cases
      </button>
      {!c ? (
        <Placeholder rows={4} />
      ) : (
        <Panel>
          <div className="border-b border-white/[0.08] px-4 py-3">
            <h2 className="text-[15px] font-semibold leading-[21px] text-[#ededf0]">
              {CASE_REASON_LABELS[c.reason]}
              {c.sellerNumber ? ` · Order ${c.sellerNumber} in the store's Orders${c.orderRef ? `, buyer's reference ${c.orderRef}` : ""}` : c.orderRef ? ` · Order #${c.orderRef}` : ""}
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#9b9ba6] [overflow-wrap:anywhere]">
              Buyer: {c.buyerName ? `${c.buyerName}, ` : ""}
              {c.buyerEmail} · Store: {store?.name || c.store.name || "A store"}
              {store?.email ? ` (${store.email}${store.phone ? `, ${store.phone}` : ""})` : ""} · {c.kind === "physical" ? "Shipped order" : "Digital order"}
              {c.escalatedBy ? ` · Asked in by the ${c.escalatedBy} ${when(c.escalatedAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[13px] text-[#9b9ba6]">
            <label className="inline-flex items-center gap-2">
              Whose turn
              <select className={SELECT} value={c.status} disabled={busy} onChange={(e) => void update(e.target.value as CaseStatus)}>
                {CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_FOR_ADMIN[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="space-y-3 px-4 py-4">
            {messages.map((m) => (
              <li key={m.id} className={m.internal ? "rounded-[10px] border border-[#d29922]/30 bg-[#d29922]/[0.07] px-3.5 py-2.5" : m.author === "storelib" ? "ml-6 rounded-[10px] border border-white/[0.08] bg-white/[0.05] px-3.5 py-2.5" : m.author === "store" ? "mr-6 rounded-[10px] border border-[#4c8dff]/20 bg-[#4c8dff]/[0.05] px-3.5 py-2.5" : "mr-6 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"} data-admin-case-message={m.internal ? "note" : m.author}>
                <p className="mb-1 text-[12px] font-medium text-[#9b9ba6]">
                  {who(m)} · {when(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-[14px] leading-[21px] text-[#ededf0] [overflow-wrap:anywhere]">{m.body}</p>
                <CasePhotoStrip photos={m.photos} dark />
              </li>
            ))}
          </ol>
          <div className="space-y-2.5 border-t border-white/[0.06] px-4 py-4">
            <Filters
              label="Write"
              value={mode}
              onChange={setMode}
              options={[
                { id: "buyer", label: "Reply, the buyer's turn next" },
                { id: "store", label: "Reply, the store's turn next" },
                { id: "note", label: "Internal note" },
              ]}
            />
            <textarea className={AREA} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={mode === "note" ? "Only Storelib sees this" : "The buyer and the store both get this, here and by email"} aria-label={mode === "note" ? "Internal note" : "Reply"} />
            <div className="flex flex-wrap justify-end gap-2">
              {mode !== "note" ? (
                <Button onClick={() => void send("resolved")} disabled={busy || !draft.trim()}>
                  Send and resolve
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => void send()} disabled={busy || !draft.trim()}>
                {mode === "note" ? "Add note" : "Send"}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
