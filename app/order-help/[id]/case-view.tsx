"use client"

/**
 * The buyer's side of a case: what they wrote, the store's answers, and
 * Storelib's once it is asked in. They write back, ask Storelib to step in
 * (once, with an optional note), or say it's sorted. Everything they send
 * reaches the store by email; once Storelib is in, Storelib too.
 */
import * as React from "react"
import { CASE_REASON_LABELS, STATUS_FOR_BUYER, type CaseMessage, type CaseSummary } from "@/lib/support/cases"
import { cn } from "@/lib/utils"

type Store = { name: string; logoUrl: string | null; email: string | null; phone: string | null; websiteUrl: string | null }

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function CaseView({ id, k, initial, store }: { id: string; k: string; initial: { case: CaseSummary; messages: CaseMessage[] }; store: Store }) {
  const [c, setCase] = React.useState(initial.case)
  const [messages, setMessages] = React.useState(initial.messages)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)

  const act = async (action: "reply" | "escalate" | "resolve") => {
    if (action === "reply" && !draft.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/order-help/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k, action, body: draft }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setError(body?.error || "That didn't go through. Try again in a moment.")
      if (body?.case) setCase(body.case)
      if (body?.messages) setMessages(body.messages)
      setDraft("")
      setAsking(false)
      setDone(action === "reply" ? `Sent to ${c.escalated ? `${store.name} and Storelib` : store.name}.` : action === "escalate" ? "Storelib will read the whole case and write to you and the store here." : "Marked as sorted. Write again any time to open it.")
    } catch {
      setError("That didn't go through. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const who = (m: CaseMessage) => (m.author === "buyer" ? "You" : m.author === "store" ? store.name : "Storelib")
  return (
    <main className="min-h-dvh bg-[#f8f9fa]">
      <header className="border-b border-[#eef0f2] bg-white">
        <div className="mx-auto flex h-16 max-w-[680px] items-center gap-2.5 px-4 sm:px-6">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-8 w-auto max-w-[120px] rounded-md object-contain" />
          ) : null}
          <span className="truncate text-[17px] font-semibold text-[#1a1a2e]">{store.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[680px] space-y-4 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold text-[#1a1a2e]">{CASE_REASON_LABELS[c.reason]}</h1>
              <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{c.orderRef ? `Order #${c.orderRef} · ` : ""}Opened {when(c.createdAt)}</p>
            </div>
            <span className={cn("inline-flex rounded-full px-2.5 py-[3px] text-[12px] font-medium", c.status === "resolved" ? "bg-[#f3f4f6] text-[#4b5563]" : c.status === "buyer" ? "bg-[#eff6ff] text-[#1d4ed8]" : "bg-[#fef3c7] text-[#92400e]")}>{STATUS_FOR_BUYER[c.status]}</span>
          </div>
          {c.escalated ? <p className="mt-3 rounded-xl bg-[#f8f9fa] px-3.5 py-2.5 text-[13.5px] text-[#4b5563]">Storelib is helping with this case. Its messages go to you and {store.name}.</p> : null}
        </section>

        <ol className="space-y-3" data-case-thread="">
          {messages.map((m) => (
            <li key={m.id} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5", m.author === "buyer" ? "ml-auto bg-[#1a1a2e] text-white" : m.author === "storelib" ? "border border-[#e5e7eb] bg-white text-[#1a1a2e]" : "bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}>
              <p className={cn("mb-1 text-[12px] font-medium", m.author === "buyer" ? "text-white/70" : "text-[#6b7280]")}>
                {who(m)} · {when(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[22px]">{m.body}</p>
            </li>
          ))}
        </ol>

        <section className="space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {done ? <p className="rounded-xl bg-[#f0fdf4] px-3.5 py-2.5 text-[13.5px] text-[#166534]">{done}</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] text-[#991b1b]">{error}</p> : null}
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-medium text-[#1a1a2e]">{asking ? "Anything Storelib should know? (optional)" : c.status === "resolved" ? "Write to open the case again" : "Your reply"}</span>
            <textarea value={draft} maxLength={5000} rows={4} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[15px] leading-[22px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)]" />
          </label>
          {asking ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAsking(false)} className="inline-flex h-10 items-center rounded-[10px] px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void act("escalate")} className="inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44] disabled:opacity-60" data-case-escalate="">
                Ask Storelib to step in
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-3">
                {!c.escalated && c.status !== "resolved" ? (
                  <button type="button" onClick={() => setAsking(true)} className="text-[13.5px] font-medium text-[#4b5563] underline underline-offset-4 hover:text-[#1a1a2e]">
                    Ask Storelib to step in
                  </button>
                ) : null}
                {c.status !== "resolved" ? (
                  <button type="button" disabled={busy} onClick={() => void act("resolve")} className="text-[13.5px] font-medium text-[#4b5563] underline underline-offset-4 hover:text-[#1a1a2e]">
                    It&apos;s sorted
                  </button>
                ) : null}
              </div>
              <button type="button" disabled={busy || !draft.trim()} onClick={() => void act("reply")} className="inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44] disabled:opacity-60" data-case-send="">
                Send
              </button>
            </div>
          )}
          {!c.escalated && c.status !== "resolved" ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]">Give {store.name} a day or two to answer. If it isn&apos;t sorted out, Storelib reads the whole case and helps you both.</p> : null}
        </section>

        <p className="text-center text-[13px] leading-[20px] text-[#6b7280]">
          {store.email ? <a href={`mailto:${store.email}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">Email {store.name}</a> : null}
          {store.phone ? <> · <a href={`tel:${store.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">{store.phone}</a></> : null}
          {store.websiteUrl ? <> · <a href={store.websiteUrl} className="font-medium text-[#1a1a2e] underline underline-offset-4">Visit the store</a></> : null}
        </p>
      </div>
    </main>
  )
}
