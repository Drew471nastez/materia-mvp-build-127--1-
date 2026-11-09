"use client"

/**
 * SUPPORT › FROM BUYERS: a buyer's problem with an order (lib/support/
 * cases.ts), which comes to the store first.
 *
 * The list, newest activity first, with whose turn it is; one opens into its
 * thread (?case=<id>, so the email's button lands on it) with a reply box,
 * Ask Storelib to step in, and Mark resolved. What the store writes goes to
 * the buyer by email, from the store's name.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"
import { ArrowLeft, Inbox } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Empty, FIELD, Notice, Pill, api, dateTime } from "@/components/physical/ui"
import { CASE_REASON_LABELS, STATUS_FOR_STORE, type CaseMessage, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { card } from "../orders/order-parts"
import { CasePhotoStrip } from "@/components/support/case-photos"
import { lastMessageId, mergeMessages, useCaseLive } from "@/lib/support/use-case-live"
import { tt } from "@/lib/i18n/text"

const TONE: Record<CaseStatus, "blue" | "amber" | "gray" | "red"> = { store: "amber", buyer: "blue", storelib: "red", resolved: "gray" }
const AREA = cn(FIELD, "h-auto min-h-[96px] resize-none py-2.5 leading-[21px] sm:h-auto")

export function BuyerCasesList({ cases, error, onOpen }: { cases: CaseSummary[] | null; error: string | null; onOpen: (id: string) => void }) {
  if (error) return <Notice>{error}</Notice>
  if (cases === null) return <div className="min-h-[240px]" aria-busy="true" />
  if (cases.length === 0)
    return (
      <section className={cn(card, "p-2")}>
        <Empty title={tt("No buyer has asked for help")}>
          {tt("When a buyer has a problem with an order (it hasn't arrived, it came damaged, they want a refund), they ask from their order page and it lands here and in your email. You answer first; either of you can ask Storelib to step in.")}
        </Empty>
      </section>
    )
  return (
    <section aria-label={tt("Buyer cases")} className={cn(card, "overflow-hidden")}>
      <ul className="divide-y divide-[#f1f2f4]" data-buyer-cases="">
        {cases.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#fafafa]" data-case={c.id}>
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                <Inbox className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[14px] text-[#1a1a2e]", c.unread ? "font-semibold" : "font-medium")}>
                  {CASE_REASON_LABELS[c.reason]}
                  {c.sellerNumber ? ` · ${c.sellerNumber}` : c.orderRef ? ` · #${c.orderRef}` : ""}
                </span>
                <span className="block truncate text-[12.5px] text-[#6b7280]">
                  {c.buyerName || displayEmail(c.buyerEmail) || tt("Customer")} · {dateTime(c.lastMessageAt)}
                </span>
              </span>
              <Pill tone={TONE[c.status]} className="shrink-0">
                {c.unread ? tt("New message") : STATUS_FOR_STORE[c.status]}
              </Pill>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One case's thread with the reply box. `onBack` absent: drawn inside an order (components/support/order-messages-card.tsx), with no way back to the list. Live: the buyer's messages show as they arrive (lib/support/use-case-live.ts). */
export function BuyerCaseThread({ id, onBack, onChanged, embedded }: { id: string; onBack?: () => void; onChanged: () => void; embedded?: boolean }) {
  const [c, setCase] = React.useState<CaseSummary | null>(null)
  const [messages, setMessages] = React.useState<CaseMessage[]>([])
  const [answerBy, setAnswerBy] = React.useState<string | null>(null)
  const [live, setLive] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const shown = React.useRef(messages)
  shown.current = messages
  const current = React.useRef(c)
  current.current = c
  const fullAt = React.useRef(0)
  const endRef = React.useRef<HTMLDivElement>(null)
  const boxRef = React.useRef<HTMLTextAreaElement>(null)
  const changedRef = React.useRef(onChanged)
  React.useEffect(() => {
    changedRef.current = onChanged
  })

  type Read = { case: CaseSummary; messages: CaseMessage[]; answerBy?: string | null; live?: string | null }
  const take = React.useCallback((d: Read, whole: boolean) => {
    setCase((was) => ({ ...d.case, sellerNumber: d.case.sellerNumber ?? was?.sellerNumber ?? null }))
    setMessages((was) => (whole ? d.messages : mergeMessages(was, d.messages)))
    setAnswerBy(d.answerBy ?? null)
    if (d.live !== undefined) setLive(d.live ?? null)
    if (whole) fullAt.current = Date.now()
  }, [])

  React.useEffect(() => {
    let alive = true
    setCase(null)
    setMessages([])
    void api<Read>(`/api/store/cases/${encodeURIComponent(id)}`).then((r) => {
      if (!alive) return
      if ("error" in r) return setError(r.error)
      setError(null)
      take(r.data, true)
      changedRef.current()
    })
    return () => {
      alive = false
    }
  }, [id, take])

  /* What is new since the last message on screen; every 45 minutes the whole thread, so photo links never run out. */
  const refresh = React.useCallback(async () => {
    const whole = Date.now() - fullAt.current > 45 * 60_000
    const before = shown.current
    const after = whole ? 0 : lastMessageId(before)
    const r = await api<Read>(`/api/store/cases/${encodeURIComponent(id)}${after ? `?after=${after}` : ""}`)
    if ("error" in r) return false
    const was = current.current
    const changed = !!was && (was.status !== r.data.case.status || was.escalated !== r.data.case.escalated)
    setCase({ ...r.data.case, sellerNumber: r.data.case.sellerNumber ?? was?.sellerNumber ?? null })
    const next = whole ? r.data.messages : mergeMessages(before, r.data.messages)
    if (whole || next !== before) setMessages(next)
    setAnswerBy(r.data.answerBy ?? null)
    if (whole) fullAt.current = Date.now()
    const fresh = next.length !== before.length
    if (fresh || changed) changedRef.current()
    return fresh || changed
  }, [id])
  useCaseLive({ topic: live, refresh, enabled: c !== null })

  /* A new message while the end of the thread is in view is brought into view. */
  const count = messages.length
  const seen = React.useRef(0)
  React.useEffect(() => {
    const before = seen.current
    seen.current = count
    if (!before || count <= before) return
    const end = endRef.current
    if (end && end.getBoundingClientRect().top < window.innerHeight + 320) end.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" })
  }, [count])

  React.useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = "auto"
    box.style.height = `${Math.min(Math.max(box.scrollHeight, 96), 280)}px`
  }, [reply, c])

  const act = async (action: "reply" | "escalate" | "resolve") => {
    if (action === "reply" && !reply.trim()) return
    setBusy(true)
    const r = await api<Read>(`/api/store/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action, body: reply } })
    setBusy(false)
    if ("error" in r) return toast.error(r.error)
    if (action !== "resolve") setReply("")
    if (r.data.case) take(r.data, true)
    toast.success(action === "reply" ? tt("Sent. The buyer sees it now and by email.") : action === "escalate" ? tt("Storelib will look at the case and write to you both.") : tt("Marked resolved."))
    changedRef.current()
  }

  const who = (m: CaseMessage) => (m.author === "store" ? tt("You") : m.author === "buyer" ? c?.buyerName || tt("The buyer") : "Storelib")
  const due = answerBy && c && !c.escalated && c.status === "store" ? answerBy : null
  const overdue = due ? Date.parse(due) <= Date.now() : false

  return (
    <div className="space-y-3" data-buyer-case={id}>
      {onBack ? (
        <button type="button" onClick={onBack} className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] hover:bg-white">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {tt("All buyer cases")}
        </button>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {!c ? (
        <div className={cn(embedded ? "" : card, "min-h-[240px]")} aria-busy="true" />
      ) : (
        <section className={cn(embedded ? "" : card, "overflow-hidden")}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f1f2f4] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="break-words text-[17px] font-semibold text-[#1a1a2e]">{CASE_REASON_LABELS[c.reason]}</h2>
              <p className="mt-0.5 text-[13px] text-[#6b7280] [overflow-wrap:anywhere]">
                {c.sellerNumber ? tt("Order {sellerNumber}{value} · ", { sellerNumber: c.sellerNumber, value: c.orderRef ? tt(" (buyer's reference {orderRef})", { orderRef: c.orderRef }) : "" }) : c.orderRef ? tt("Order #{orderRef} · ", { orderRef: c.orderRef }) : ""}
                {c.buyerName ? `${c.buyerName}, ` : ""}
                {tt("{buyerEmail} · Opened {date}", { buyerEmail: displayEmail(c.buyerEmail) || tt("Customer"), date: dateTime(c.createdAt) })}
              </p>
            </div>
            <Pill tone={TONE[c.status]}>{STATUS_FOR_STORE[c.status]}</Pill>
          </div>
          {c.escalated ? <p className="border-b border-[#f1f2f4] bg-[#fafafa] px-4 py-2.5 text-[13px] text-[#4b5563] sm:px-5">{tt("Storelib is helping with this case. Its messages go to you and the buyer.")}</p> : null}
          <ol className="px-4 py-4 sm:px-5" aria-live="polite">
            {messages.map((m, i) => {
              const mine = m.author === "store"
              const sameSide = i > 0 && messages[i - 1].author === m.author && Date.parse(m.createdAt) - Date.parse(messages[i - 1].createdAt) < 30 * 60_000
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start", i === 0 ? "" : sameSide ? "pt-1" : "pt-3")} data-message={m.author}>
                  <div className={cn("min-w-0 max-w-[88%] sm:max-w-[75%]", mine && "text-right")}>
                    {!sameSide ? (
                      <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">
                        {who(m)} <span className="font-normal text-[#9ca3af]">· {dateTime(m.createdAt)}</span>
                      </p>
                    ) : null}
                    <div className={cn("inline-block rounded-2xl px-3.5 py-2.5 text-left", mine ? "rounded-tr-md bg-[#1a1a2e] text-white" : m.author === "storelib" ? "rounded-tl-md border border-[#e5e7eb] bg-white text-[#1a1a2e]" : "rounded-tl-md bg-[#f3f4f6] text-[#1a1a2e]")}>
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-[21px] [overflow-wrap:anywhere]">{m.body}</p>
                      <CasePhotoStrip photos={m.photos} dark={mine} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <div ref={endRef} />
          <div className="space-y-2.5 border-t border-[#f1f2f4] px-4 py-4 sm:px-5">
            {due ? (
              <p className={cn("text-[13px] leading-[19px]", overdue ? "text-[#92400e]" : "text-[#6b7280]")} data-case-answer-by={overdue ? "now" : "later"}>
                {overdue ? tt("The buyer can now ask Storelib to step in. Answer here to keep it between you.") : tt("Answer by {date}. After that the buyer can ask Storelib to step in.", { date: dateTime(due) })}
              </p>
            ) : null}
            <label htmlFor={`case-reply-${id}`} className="sr-only">
              {tt("Your reply")}
            </label>
            <textarea
              id={`case-reply-${id}`}
              ref={boxRef}
              className={AREA}
              value={reply}
              maxLength={5000}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void act("reply")
                }
              }}
              placeholder={c.status === "resolved" ? tt("Write to open it again") : tt("Write to the buyer. A replacement, a refund, a tracking number: say what you'll do.")}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!c.escalated && c.status !== "resolved" ? (
                <button type="button" className="text-[13px] font-medium text-[#6b7280] underline underline-offset-4 hover:text-[#1a1a2e]" onClick={() => void act("escalate")} disabled={busy}>
                  {tt("Ask Storelib to step in")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                {c.status !== "resolved" ? (
                  <button type="button" className={BTN_SECONDARY} onClick={() => void act("resolve")} disabled={busy}>
                    {tt("Mark resolved")}
                  </button>
                ) : null}
                <button type="button" className={BTN_PRIMARY} onClick={() => void act("reply")} disabled={busy || !reply.trim()} data-case-reply="">
                  {tt("Send to buyer")}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
