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
import * as React from "react"
import { ArrowLeft, Inbox } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Empty, FIELD, Notice, Pill, api, dateTime } from "@/components/physical/ui"
import { CASE_REASON_LABELS, STATUS_FOR_STORE, type CaseMessage, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { card } from "../orders/order-parts"

const TONE: Record<CaseStatus, "blue" | "amber" | "gray" | "red"> = { store: "amber", buyer: "blue", storelib: "red", resolved: "gray" }
const AREA = cn(FIELD, "h-auto min-h-[120px] py-2.5 leading-[21px] sm:h-auto")

export function BuyerCasesList({ cases, error, onOpen }: { cases: CaseSummary[] | null; error: string | null; onOpen: (id: string) => void }) {
  if (error) return <Notice>{error}</Notice>
  if (cases === null) return <div className="min-h-[240px]" aria-busy="true" />
  if (cases.length === 0)
    return (
      <section className={cn(card, "p-2")}>
        <Empty title="No buyer has asked for help">
          When a buyer has a problem with an order (it hasn&apos;t arrived, it came damaged, they want a refund), they ask from their order page and it lands here and in your email. You answer first; either of you can ask Storelib to step in.
        </Empty>
      </section>
    )
  return (
    <section aria-label="Buyer cases" className={cn(card, "overflow-hidden")}>
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
                  {c.orderRef ? ` · #${c.orderRef}` : ""}
                </span>
                <span className="block truncate text-[12.5px] text-[#6b7280]">
                  {c.buyerName || c.buyerEmail} · {dateTime(c.lastMessageAt)}
                </span>
              </span>
              <Pill tone={TONE[c.status]} className="shrink-0">
                {c.unread ? "New message" : STATUS_FOR_STORE[c.status]}
              </Pill>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function BuyerCaseThread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [c, setCase] = React.useState<CaseSummary | null>(null)
  const [messages, setMessages] = React.useState<CaseMessage[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let live = true
    setCase(null)
    void api<{ case: CaseSummary; messages: CaseMessage[] }>(`/api/store/cases/${encodeURIComponent(id)}`).then((r) => {
      if (!live) return
      if ("error" in r) return setError(r.error)
      setCase(r.data.case)
      setMessages(r.data.messages)
      onChanged()
    })
    return () => {
      live = false
    }
  }, [id, onChanged])

  const act = async (action: "reply" | "escalate" | "resolve") => {
    if (action === "reply" && !reply.trim()) return
    setBusy(true)
    const r = await api<{ case: CaseSummary; messages: CaseMessage[] }>(`/api/store/cases/${encodeURIComponent(id)}`, { method: "POST", body: { action, body: reply } })
    setBusy(false)
    if ("error" in r) return toast.error(r.error)
    if (action !== "resolve") setReply("")
    if (r.data.case) setCase(r.data.case)
    if (r.data.messages) setMessages(r.data.messages)
    toast.success(action === "reply" ? "Sent to the buyer by email." : action === "escalate" ? "Storelib will look at the case and write to you both." : "Marked resolved.")
    onChanged()
  }

  const who = (m: CaseMessage) => (m.author === "store" ? "You" : m.author === "buyer" ? c?.buyerName || "The buyer" : "Storelib")

  return (
    <div className="space-y-3" data-buyer-case={id}>
      <button type="button" onClick={onBack} className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] hover:bg-white">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All buyer cases
      </button>
      {error ? <Notice>{error}</Notice> : null}
      {!c ? (
        <div className="min-h-[240px]" aria-busy="true" />
      ) : (
        <section className={cn(card, "overflow-hidden")}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f1f2f4] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="break-words text-[17px] font-semibold text-[#1a1a2e]">{CASE_REASON_LABELS[c.reason]}</h2>
              <p className="mt-0.5 text-[13px] text-[#6b7280] [overflow-wrap:anywhere]">
                {c.orderRef ? `Order #${c.orderRef} · ` : ""}
                {c.buyerName ? `${c.buyerName}, ` : ""}
                {c.buyerEmail} · Opened {dateTime(c.createdAt)}
              </p>
            </div>
            <Pill tone={TONE[c.status]}>{STATUS_FOR_STORE[c.status]}</Pill>
          </div>
          {c.escalated ? <p className="border-b border-[#f1f2f4] bg-[#fafafa] px-4 py-2.5 text-[13px] text-[#4b5563] sm:px-5">Storelib is helping with this case. Its messages go to you and the buyer.</p> : null}
          <ol className="space-y-3 px-4 py-4 sm:px-5">
            {messages.map((m) => (
              <li key={m.id} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5", m.author === "store" ? "ml-auto bg-[#1a1a2e] text-white" : m.author === "storelib" ? "border border-[#e5e7eb] bg-white text-[#1a1a2e]" : "bg-[#f3f4f6] text-[#1a1a2e]")} data-message={m.author}>
                <p className={cn("mb-1 text-[12px] font-medium", m.author === "store" ? "text-white/70" : "text-[#6b7280]")}>
                  {who(m)} · {dateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-[21px]">{m.body}</p>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t border-[#f1f2f4] px-4 py-4 sm:px-5">
            <label htmlFor="case-reply" className="sr-only">
              Your reply
            </label>
            <textarea id="case-reply" className={AREA} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder={c.status === "resolved" ? "Write to open it again" : "Write to the buyer. A replacement, a refund, a tracking number: say what you'll do."} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!c.escalated && c.status !== "resolved" ? (
                <button type="button" className="text-[13.5px] font-medium text-[#4b5563] underline underline-offset-4 hover:text-[#1a1a2e]" onClick={() => void act("escalate")} disabled={busy}>
                  Ask Storelib to step in
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                {c.status !== "resolved" ? (
                  <button type="button" className={BTN_SECONDARY} onClick={() => void act("resolve")} disabled={busy}>
                    Mark resolved
                  </button>
                ) : null}
                <button type="button" className={BTN_PRIMARY} onClick={() => void act("reply")} disabled={busy || !reply.trim()} data-case-reply="">
                  Send to buyer
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
