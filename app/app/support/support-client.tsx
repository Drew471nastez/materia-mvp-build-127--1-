"use client"

/**
 * SUPPORT: two inboxes. From buyers: a buyer's problem with an order, which
 * comes to the store first (./buyer-cases.tsx, lib/support/cases.ts).
 * Storelib: the store asking Storelib for help, and the answers.
 *
 * The list of requests, newest activity first, with whose turn it is; one
 * opens into its thread (?ticket=<id>, so the email's Reply button lands
 * on it) with a reply box and Mark resolved. New request asks what it's
 * about, a subject, the details and, when it's about one, the order number.
 */
import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, LifeBuoy, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Empty, FIELD, Field, Modal, Notice, Pill, SelectInput, TextInput, api, dateTime } from "@/components/physical/ui"
import { STATUS_FOR_STORE, TOPICS, TOPIC_LABELS, type TicketMessage, type TicketStatus, type TicketSummary, type Topic } from "@/lib/support/tickets"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"
import { BuyerCaseThread, BuyerCasesList } from "./buyer-cases"
import type { CaseSummary } from "@/lib/support/cases"
import { tt } from "@/lib/i18n/text"

const TONE: Record<TicketStatus, "blue" | "amber" | "gray"> = { open: "blue", waiting: "amber", resolved: "gray" }
const AREA = cn(FIELD, "h-auto min-h-[132px] py-2.5 leading-[21px] sm:h-auto")

export function SupportClient() {
  const router = useRouter()
  const params = useSearchParams()
  const openId = params.get("ticket")
  const caseId = params.get("case")
  /* From buyers first: a buyer waiting on the store is the more urgent of the two. */
  const view: "buyers" | "storelib" = params.get("view") === "storelib" || openId ? "storelib" : "buyers"
  const [tickets, setTickets] = React.useState<TicketSummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cases, setCases] = React.useState<CaseSummary[] | null>(null)
  const [casesError, setCasesError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  const load = React.useCallback(async () => {
    const r = await api<{ tickets: TicketSummary[] }>("/api/support/tickets")
    if ("error" in r) return setError(r.error)
    setError(null)
    setTickets(r.data.tickets)
  }, [])
  const loadCases = React.useCallback(async () => {
    const r = await api<{ cases: CaseSummary[] }>("/api/store/cases")
    if ("error" in r) {
      setCasesError(r.error)
      return setCases([])
    }
    setCasesError(null)
    setCases(r.data.cases)
  }, [])
  /* Both lists, at once: switching between them shows what is already there. */
  React.useEffect(() => {
    void load()
    void loadCases()
  }, [load, loadCases])

  const go = (id: string | null) => router.replace(id ? `/app/support?view=storelib&ticket=${id}` : "/app/support?view=storelib", { scroll: false })
  const goCase = (id: string | null) => router.replace(id ? `/app/support?case=${id}` : "/app/support", { scroll: false })
  const waiting = (cases ?? []).filter((c) => c.status === "store" || c.unread).length

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-support="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Support")}</h1>
        <button type="button" className={cn(BTN_PRIMARY, "gap-1.5")} onClick={() => setCreating(true)} data-support-new="">
          <Plus className="h-4 w-4" aria-hidden />
          {tt("New request")}
        </button>
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <div role="tablist" aria-label={tt("Support")} className="mb-4 inline-flex rounded-xl bg-[#eef0f2] p-1" data-support-tabs="">
          {([
            ["buyers", waiting ? tt("From buyers ({waiting})", { waiting }) : tt("From buyers")],
            ["storelib", "Storelib"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => router.replace(id === "storelib" ? "/app/support?view=storelib" : "/app/support", { scroll: false })}
              className={cn("h-8 rounded-lg px-3.5 text-[13.5px] font-medium transition-colors", view === id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "buyers" ? (
          caseId ? <BuyerCaseThread id={caseId} onBack={() => goCase(null)} onChanged={loadCases} /> : <BuyerCasesList cases={cases} error={casesError} onOpen={goCase} />
        ) : error ? <Notice className="mb-3">{error}</Notice> : openId ? (
          <Thread id={openId} onBack={() => go(null)} onChanged={load} />
        ) : tickets === null ? (
          <div className="min-h-[240px]" aria-busy="true" />
        ) : tickets.length === 0 ? (
          <section className={cn(card, "p-2")}>
            <Empty title={tt("Ask us anything")} action={<button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)}>{tt("New request")}</button>}>
              {tt("An order, a payout, a dispute, your website or something that isn't working. A real person at Storelib reads every one and replies here.")}
            </Empty>
          </section>
        ) : (
          <section aria-label={tt("Your requests")} className={cn(card, "overflow-hidden")}>
            <ul className="divide-y divide-[#f1f2f4]" data-support-list="">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => go(t.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#fafafa]" data-ticket={t.id}>
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                      <LifeBuoy className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[14px] text-[#1a1a2e]", t.unread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                      <span className="block truncate text-[12.5px] text-[#6b7280]">
                        {TOPIC_LABELS[t.topic]} · {dateTime(t.lastMessageAt)}
                      </span>
                    </span>
                    <Pill tone={TONE[t.status]} className="shrink-0">
                      {t.unread ? tt("New reply") : STATUS_FOR_STORE[t.status]}
                    </Pill>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <NewRequest
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false)
          setTickets((list) => [t, ...(list ?? [])])
          go(t.id)
        }}
      />
    </div>
  )
}

function NewRequest({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: TicketSummary) => void }) {
  const [topic, setTopic] = React.useState<Topic>("orders")
  const [subject, setSubject] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [orderRef, setOrderRef] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)

  const send = async () => {
    setSending(true)
    setError(null)
    const r = await api<{ ticket: TicketSummary }>("/api/support/tickets", { method: "POST", body: { topic, subject, message, orderRef } })
    setSending(false)
    if ("error" in r) return setError(r.error)
    setSubject("")
    setMessage("")
    setOrderRef("")
    toast.success(tt("Sent. We'll reply here and by email."))
    onCreated(r.data.ticket)
  }

  const showsOrder = topic === "orders" || topic === "disputes" || topic === "shipping" || topic === "payments"
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tt("New request")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void send()} disabled={sending} data-support-send="">
            {sending ? tt("Sending") : tt("Send")}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-support-form="">
        {error ? <Notice>{error}</Notice> : null}
        <Field label={tt("What's it about?")} htmlFor="support-topic">
          <SelectInput id="support-topic" value={topic} onChange={(v) => setTopic(v as Topic)}>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {TOPIC_LABELS[t]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label={tt("Subject")} htmlFor="support-subject">
          <TextInput id="support-subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder={tt("Payout hasn't arrived")} />
        </Field>
        {showsOrder ? (
          <Field label={tt("Order number")} hint={tt("Optional. The code after # on the order.")} htmlFor="support-order">
            <TextInput id="support-order" value={orderRef} maxLength={61} onChange={(e) => setOrderRef(e.target.value)} placeholder="#1A2B3C4D" />
          </Field>
        ) : null}
        <Field label={tt("Details")} hint={tt("What happened, what you expected, and anything you've tried.")} htmlFor="support-message">
          <textarea id="support-message" className={AREA} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Never send passwords or card details. We'll never ask for them.")}</p>
      </div>
    </Modal>
  )
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [ticket, setTicket] = React.useState<TicketSummary | null>(null)
  const [messages, setMessages] = React.useState<TicketMessage[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let live = true
    setTicket(null)
    void api<{ ticket: TicketSummary; messages: TicketMessage[] }>(`/api/support/tickets/${encodeURIComponent(id)}`).then((r) => {
      if (!live) return
      if ("error" in r) return setError(r.error)
      setTicket(r.data.ticket)
      setMessages(r.data.messages)
      onChanged()
    })
    return () => {
      live = false
    }
  }, [id, onChanged])

  const send = async () => {
    if (!reply.trim()) return
    setBusy(true)
    const r = await api<{ ticket: TicketSummary; messages: TicketMessage[] }>(`/api/support/tickets/${encodeURIComponent(id)}`, { method: "POST", body: { action: "reply", body: reply } })
    setBusy(false)
    if ("error" in r) return toast.error(r.error)
    setReply("")
    if (r.data.ticket) setTicket(r.data.ticket)
    if (r.data.messages) setMessages(r.data.messages)
    onChanged()
  }

  const resolve = async () => {
    setBusy(true)
    const r = await api(`/api/support/tickets/${encodeURIComponent(id)}`, { method: "POST", body: { action: "resolve" } })
    setBusy(false)
    if ("error" in r) return toast.error(r.error)
    setTicket((t) => (t ? { ...t, status: "resolved" } : t))
    onChanged()
  }

  return (
    <div className="space-y-3" data-support-thread={id}>
      <button type="button" onClick={onBack} className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] hover:bg-white">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {tt("All requests")}
      </button>
      {error ? <Notice>{error}</Notice> : null}
      {!ticket ? (
        <div className="min-h-[240px]" aria-busy="true" />
      ) : (
        <section className={cn(card, "overflow-hidden")}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f1f2f4] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="break-words text-[17px] font-semibold text-[#1a1a2e]">{ticket.subject}</h2>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                {TOPIC_LABELS[ticket.topic]}
                {ticket.orderRef ? tt(" · Order #{orderRef}", { orderRef: ticket.orderRef }) : ""} · {tt("Opened {date}", { date: dateTime(ticket.createdAt) })}
              </p>
            </div>
            <Pill tone={TONE[ticket.status]}>{STATUS_FOR_STORE[ticket.status]}</Pill>
          </div>
          <ol className="space-y-3 px-4 py-4 sm:px-5" data-support-messages="">
            {messages.map((m) => (
              <li key={m.id} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5", m.author === "creator" ? "ml-auto bg-[#1a1a2e] text-white" : "bg-[#f3f4f6] text-[#1a1a2e]")} data-message={m.author}>
                <p className={cn("mb-1 text-[12px] font-medium", m.author === "creator" ? "text-white/70" : "text-[#6b7280]")}>
                  {m.author === "creator" ? tt("You") : tt("Storelib support")} · {dateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-[21px]">{m.body}</p>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t border-[#f1f2f4] px-4 py-4 sm:px-5">
            <label htmlFor="support-reply" className="sr-only">
              {tt("Your reply")}
            </label>
            <textarea id="support-reply" className={AREA} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder={ticket.status === "resolved" ? tt("Write to open it again") : tt("Write a reply")} />
            <div className="flex flex-wrap justify-end gap-2">
              {ticket.status !== "resolved" ? (
                <button type="button" className={BTN_SECONDARY} onClick={() => void resolve()} disabled={busy}>
                  {tt("Mark resolved")}
                </button>
              ) : null}
              <button type="button" className={BTN_PRIMARY} onClick={() => void send()} disabled={busy || !reply.trim()} data-support-reply="">
                {tt("Send reply")}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
