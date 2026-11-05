"use client"

import { CasePhotoStrip } from "@/components/support/case-photos"
import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder, SearchField, Toolbar } from "../_console/ui"
import { CASE_REASON_LABELS, CASE_STATUSES, STATUS_FOR_ADMIN, type CaseMessage, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { lastMessageId, mergeMessages, useCaseLive, useVisibleInterval } from "@/lib/support/use-case-live"

/**
 * ===========================================================================
 *  BUYER CASES, FOR STORELIB
 * ===========================================================================
 * A buyer's case about an order (lib/support/cases.ts) goes to the store
 * first. Storelib sees it here once the buyer or the store asks it to step
 * in ("Needs a reply"), and can look at every case it was ever asked into,
 * the resolved ones, or all of them, and find one by the buyer's email or
 * the order's reference. A case opens into its whole thread (the buyer, the
 * store, Storelib, and Storelib's notes in amber) beside the order it is
 * about: what was bought, paid and refunded, and where each parcel is. A
 * reply goes to both by email; who it is for decides whose turn it is next.
 * The thread is live (lib/support/use-case-live.ts) and the list reads
 * itself again every minute while it is in view.
 *
 * ?case=<id> opens one directly (the inbox email links it).
 */

type AdminCase = CaseSummary & { creatorId: string; store: { name: string | null; slug: string | null }; escalatedAt: string | null; resolvedAt: string | null; checkoutId: string | null; orderId: string | null }
type Store = { name: string; email: string | null; phone: string | null; websiteUrl: string | null }
type Order = {
  placedAt: string | null
  status: string | null
  fulfillment: string | null
  returns: string | null
  currency: string | null
  totalCents: number | null
  refundedCents: number | null
  cancelledAt: string | null
  lines: { title: string; variant: string | null; quantity: number }[]
  shipments: { status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null }[]
}
type Read = { case: AdminCase; messages: CaseMessage[]; store?: Store; order?: Order | null; live?: string | null }
type View = "storelib" | "escalated" | "resolved" | "all"
type Note = { tone: "good" | "bad" | "plain"; text: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "")
const money = (cents: number | null, currency: string | null) => {
  if (cents === null) return ""
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "USD" }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`
  }
}
const words = (v: string | null) => (v ? v.replace(/_/g, " ") : "")
const AREA = "min-h-[120px] w-full resize-y rounded-[8px] border border-white/[0.1] bg-[#0f0f14] px-3 py-2.5 text-[14px] leading-[21px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-white/[0.25]"
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
  const [q, setQ] = React.useState("")
  const [cases, setCases] = React.useState<AdminCase[] | null>(null)
  const [counts, setCounts] = React.useState<{ storelib: number; escalated: number; all: number } | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<Note | null>(null)

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("case")
    if (id) setOpenId(id)
  }, [])

  const asked = React.useRef(0)
  const load = React.useCallback(
    async (v: View, words: string, quiet = false) => {
      const n = ++asked.current
      if (!quiet) setCases(null)
      const r = await call<{ cases: AdminCase[]; counts: { storelib: number; escalated: number; all: number } }>(`/api/admin/cases?view=${v}${words.trim() ? `&q=${encodeURIComponent(words.trim())}` : ""}`)
      if (n !== asked.current) return
      if ("error" in r) {
        if (!quiet) setNote({ tone: "bad", text: r.error })
        if (!quiet) setCases([])
        return
      }
      setCases(r.data.cases)
      setCounts(r.data.counts)
      onCount?.(r.data.counts.storelib)
    },
    [onCount],
  )

  /* A search waits for the typing to stop. */
  React.useEffect(() => {
    const t = window.setTimeout(() => void load(view, q), q ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [view, q, load])
  useVisibleInterval(() => load(view, q, true), 60_000, !openId)

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
        <CaseView id={openId} onBack={() => open(null)} onNote={setNote} onChanged={() => void load(view, q, true)} />
      ) : (
        <>
          <p className="mb-3 text-[13px] leading-[19px] text-[#9b9ba6]">A buyer's problem with an order goes to the store first. It comes here when the buyer or the store asks Storelib to step in.</p>
          <div className="mb-3">
            <Toolbar>
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
              <SearchField value={q} onChange={setQ} label="Find a case" placeholder="Buyer email or order reference" />
            </Toolbar>
          </div>
          {cases === null ? (
            <Placeholder rows={5} />
          ) : cases.length === 0 ? (
            <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">{q.trim() ? "No case matches that." : view === "storelib" ? "No buyer is waiting on Storelib." : "None here."}</p>
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
                    {c.escalatedBy ? <span className="hidden shrink-0 text-[12px] text-[#6b6b76] sm:inline">Asked by the {c.escalatedBy}</span> : null}
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

/** Beside the thread: the order (a parcel's; a download has none here) and how to reach the store. */
function OrderFacts({ order, store }: { order: Order | null; store: Store | null }) {
  if (!order && !store) return null
  const refunded = order?.refundedCents && order.refundedCents > 0 ? order.refundedCents : 0
  return (
    <Panel title={order ? "The order" : "The store"} meta={order?.placedAt ? `Paid ${day(order.placedAt)}` : undefined}>
      {order ? (
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]" data-admin-case-order="">
        <dt className="text-[#9b9ba6]">Total</dt>
        <dd className="text-[#ededf0]">
          {money(order.totalCents, order.currency)}
          {refunded ? <span className="text-[#d4a72c]"> · {money(refunded, order.currency)} refunded</span> : null}
        </dd>
        <dt className="text-[#9b9ba6]">Payment</dt>
        <dd className="text-[#ededf0] first-letter:uppercase">{words(order.status)}</dd>
        <dt className="text-[#9b9ba6]">Delivery</dt>
        <dd className="text-[#ededf0] first-letter:uppercase">{order.cancelledAt ? `Cancelled ${day(order.cancelledAt)}` : words(order.fulfillment)}</dd>
        {order.returns && order.returns !== "none" ? (
          <>
            <dt className="text-[#9b9ba6]">Returns</dt>
            <dd className="text-[#ededf0] first-letter:uppercase">{words(order.returns)}</dd>
          </>
        ) : null}
      </dl>
      ) : null}
      {order?.lines.length ? (
        <ul className="space-y-1 border-t border-white/[0.06] px-4 py-3 text-[13px] text-[#c9c9d1]">
          {order.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {l.title}
                {l.variant ? <span className="text-[#9b9ba6]"> · {l.variant}</span> : null}
              </span>
              <span className="shrink-0 text-[#9b9ba6]">x {l.quantity}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {order?.shipments.length ? (
        <ul className="space-y-2 border-t border-white/[0.06] px-4 py-3 text-[13px]">
          {order.shipments.map((s, i) => (
            <li key={i} className="min-w-0">
              <p className="text-[#ededf0] first-letter:uppercase">
                {words(s.status)}
                {s.deliveredAt ? ` ${day(s.deliveredAt)}` : s.shippedAt ? `, shipped ${day(s.shippedAt)}` : ""}
              </p>
              {s.carrier || s.trackingNumber ? (
                <p className="text-[#9b9ba6] [overflow-wrap:anywhere]">
                  {[s.carrier, s.trackingNumber].filter(Boolean).join(" ")}
                  {s.trackingUrl ? (
                    <>
                      {" · "}
                      <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="text-[#ededf0] underline underline-offset-4">
                        Track
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {store && (store.email || store.phone || store.websiteUrl) ? (
        <div className={`space-y-1 px-4 py-3 text-[13px] text-[#9b9ba6] ${order ? "border-t border-white/[0.06]" : ""}`}>
          <p className="text-[#ededf0]">{store.name}</p>
          {store.email ? (
            <a href={`mailto:${store.email}`} className="block [overflow-wrap:anywhere] hover:text-[#ededf0]">
              {store.email}
            </a>
          ) : null}
          {store.phone ? <p>{store.phone}</p> : null}
          {store.websiteUrl ? (
            <a href={store.websiteUrl} target="_blank" rel="noreferrer" className="block [overflow-wrap:anywhere] hover:text-[#ededf0]">
              {store.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}

function CaseView({ id, onBack, onNote, onChanged }: { id: string; onBack: () => void; onNote: (n: Note) => void; onChanged: () => void }) {
  const [c, setCase] = React.useState<AdminCase | null>(null)
  const [messages, setMessages] = React.useState<CaseMessage[]>([])
  const [store, setStore] = React.useState<Store | null>(null)
  const [order, setOrder] = React.useState<Order | null>(null)
  const [live, setLive] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [mode, setMode] = React.useState<"buyer" | "store" | "note">("buyer")
  const [busy, setBusy] = React.useState(false)
  const shown = React.useRef(messages)
  shown.current = messages
  const current = React.useRef(c)
  current.current = c
  const fullAt = React.useRef(0)
  const changedRef = React.useRef(onChanged)
  React.useEffect(() => {
    changedRef.current = onChanged
  })

  const take = (d: Read) => {
    setCase(d.case)
    setMessages(d.messages)
    if (d.store) setStore(d.store)
    if (d.order !== undefined) setOrder(d.order ?? null)
    if (d.live !== undefined) setLive(d.live ?? null)
    fullAt.current = Date.now()
  }
  React.useEffect(() => {
    setCase(null)
    void call<Read>(`/api/admin/cases/${encodeURIComponent(id)}`).then((r) => ("error" in r ? onNote({ tone: "bad", text: r.error }) : take(r.data)))
  }, [id, onNote])

  const refresh = React.useCallback(async () => {
    const whole = Date.now() - fullAt.current > 45 * 60_000
    const before = shown.current
    const after = whole ? 0 : lastMessageId(before)
    const r = await call<Read>(`/api/admin/cases/${encodeURIComponent(id)}${after ? `?after=${after}` : ""}`)
    if ("error" in r) return false
    const was = current.current
    const changed = !!was && (was.status !== r.data.case.status || was.escalated !== r.data.case.escalated)
    setCase((prev) => ({ ...r.data.case, sellerNumber: r.data.case.sellerNumber ?? prev?.sellerNumber ?? null }))
    const next = whole ? r.data.messages : mergeMessages(before, r.data.messages)
    if (next !== before) setMessages(next)
    if (whole) fullAt.current = Date.now()
    const fresh = next.length !== before.length
    if (fresh || changed) changedRef.current()
    return fresh || changed
  }, [id])
  useCaseLive({ topic: live, refresh, enabled: c !== null })

  const send = async (status?: CaseStatus) => {
    if (!draft.trim()) return
    setBusy(true)
    const r = await call<Read>(`/api/admin/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action: "reply", body: draft, internal: mode === "note", to: mode === "store" ? "store" : "buyer", ...(status ? { status } : {}) } })
    setBusy(false)
    if ("error" in r) return onNote({ tone: "bad", text: r.error })
    take(r.data)
    setDraft("")
    onNote({ tone: "good", text: mode === "note" ? "Note added. Only Storelib sees it." : status === "resolved" ? "Sent to the buyer and the store, by email too, and resolved." : "Sent to the buyer and the store, by email too." })
    onChanged()
  }
  const update = async (status: CaseStatus) => {
    setBusy(true)
    const r = await call<Read>(`/api/admin/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action: "update", status } })
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
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
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
            <ol className="space-y-3 px-4 py-4" aria-live="polite">
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
          <div className="space-y-3 lg:sticky lg:top-4">
            <OrderFacts order={order} store={store} />
          </div>
        </div>
      )}
    </div>
  )
}
