"use client"

/**
 * "GET HELP WITH THIS ORDER", on the buyer's order page and receipt.
 *
 * What's wrong (the reasons that fit this kind of order) and a few words,
 * sent to the store as a case (lib/support/cases.ts). The buyer is told
 * where it went and gets a link to follow it, here and by email. An order
 * that already has an open case shows that case instead of a second form.
 */
import * as React from "react"
import { CASE_REASON_LABELS, reasonsFor, type CaseReason } from "@/lib/support/cases"
import { cn } from "@/lib/utils"

export function OrderHelp({ kind, token, storeName, openCase, className }: { kind: "physical" | "digital"; token: string; storeName: string; openCase?: { link: string; status: string } | null; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<CaseReason | null>(null)
  const [message, setMessage] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<string | null>(null)

  const send = async () => {
    setError(null)
    if (!reason) return setError("Choose what's wrong.")
    setSending(true)
    try {
      const res = await fetch("/api/order-help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, token, reason, message }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setError(body?.error || "That didn't go through. Try again in a moment.")
      setSent(String(body?.link ?? ""))
    } catch {
      setError("That didn't go through. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const link = sent ?? openCase?.link ?? null
  return (
    <section className={cn("rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)} data-order-help="">
      {link ? (
        <div>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{sent ? `Sent to ${storeName}` : `Your case with ${storeName} is open`}</p>
          <p className="mt-1 text-[14px] leading-[21px] text-[#6b7280]">{sent ? "Their reply comes to your email. You can follow the case and write back from its page, and ask Storelib to step in if it isn't sorted out." : "Follow it and write back from its page."}</p>
          <a href={link} className="mt-3 inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44]">
            See your case
          </a>
        </div>
      ) : !open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">Something wrong with your order?</p>
            <p className="mt-0.5 text-[14px] text-[#6b7280]">Tell {storeName}. Storelib can step in if it isn&apos;t sorted out.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center rounded-[10px] border border-[#d9dce1] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]" data-order-help-open="">
            Get help
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[15px] font-semibold text-[#1a1a2e]">What&apos;s wrong?</p>
          <div role="radiogroup" aria-label="What's wrong" className="flex flex-wrap gap-2">
            {reasonsFor(kind).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={cn("h-9 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", reason === r ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d9dce1] text-[#4b5563] hover:bg-[#f8f9fa]")}>
                {CASE_REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="sr-only">Your message</span>
            <textarea value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={kind === "physical" ? "What happened? A photo of any damage helps; you can send it when the store replies." : "What happened?"} className="w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[15px] leading-[22px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)]" />
          </label>
          {error ? <p role="alert" className="text-[13.5px] text-[#b91c1c]">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-[10px] px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]">
              Cancel
            </button>
            <button type="button" onClick={() => void send()} disabled={sending} className="inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44] disabled:opacity-60" data-order-help-send="">
              {sending ? "Sending" : `Send to ${storeName}`}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
