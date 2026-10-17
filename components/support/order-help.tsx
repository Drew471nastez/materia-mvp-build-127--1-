"use client"

/**
 * "CONTACT THE SHOP", on the buyer's order page and receipt.
 *
 * One panel with every way the buyer has to reach the business about this
 * order: a message to the shop (what it is about, a few words, photos),
 * the order's own Cancel order and Return items when they are open, and
 * the shop's email and phone. The message becomes a case on the order
 * (lib/support/cases.ts): the shop is emailed and answers from the order,
 * the buyer gets the answer by email with a link back to the thread, and
 * Storelib can be asked in when a problem with the goods or a refund goes
 * unanswered for three days. An order that already has an open case shows
 * that case first; a new message joins it. In the language of the page it
 * sits on (app/checkout/parts/words.tsx), English elsewhere.
 */
import * as React from "react"
import { Mail, Phone } from "lucide-react"
import { reasonsFor, type CaseReason } from "@/lib/support/cases"
import { CasePhotoPicker, caseRequestBody, useCasePhotos } from "@/components/support/case-photos"
import { cn } from "@/lib/utils"
import { useCt } from "@/app/checkout/parts/words"
import type { CheckoutT } from "@/lib/markets/checkout-words"

/* What a message is about, in the page's language (lib/support/cases.ts CASE_REASON_LABELS, the shop's side of the same list). */
function reasonLabel(r: CaseReason, ct: CheckoutT): string {
  switch (r) {
    case "question": return ct("A question")
    case "change_address": return ct("Change the address")
    case "cancel": return ct("Cancel the order")
    case "not_arrived": return ct("It hasn't arrived")
    case "damaged": return ct("It arrived damaged")
    case "wrong_item": return ct("I got the wrong item")
    case "missing_item": return ct("Something is missing")
    case "return": return ct("I want to return it")
    case "refund": return ct("I want a refund")
    case "access": return ct("I can't open what I bought")
    case "other": return ct("Something else")
  }
}

/** A flow of the order's own the panel points to: Cancel order, Return items. */
export interface HelpShortcut {
  /** Which flow: its link carries data-cancel-button or data-return-button, as the page's own buttons did. */
  kind: "cancel" | "return"
  label: string
  /** One line under it: "Until the shop starts on it", "Until 3 Nov". */
  hint?: string | null
  onOpen: () => void
}

export function OrderHelp({
  kind,
  token,
  storeName,
  openCase,
  className,
  contact,
  cancel,
  returns,
}: {
  kind: "physical" | "digital"
  token: string
  storeName: string
  openCase?: { link: string; status: string } | null
  className?: string
  /** Settings › Store details: how else to reach the shop. `emailHref`: a mailto with the letter already started (lib/physical/seller-mailto.ts). */
  contact?: { email: string | null; phone: string | null; emailHref?: string | null } | null
  cancel?: HelpShortcut | null
  returns?: HelpShortcut | null
}) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<CaseReason | null>(null)
  const [message, setMessage] = React.useState("")
  const [trap, setTrap] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{ link: string; photosNotKept: boolean } | null>(null)
  const ct = useCt()
  const photos = useCasePhotos(ct)

  /* "Get help with this order" in an email lands here (#get-help) with the form already open. */
  React.useEffect(() => {
    if (window.location.hash === "#get-help" || window.location.hash === "#contact") setOpen(true)
  }, [])

  const send = async () => {
    setError(null)
    if (!reason) return setError(ct("Choose what it's about."))
    if (message.trim().length < 10) return setError(ct("Tell {shop} a bit more, so they can help the first time.", { shop: storeName }))
    setSending(true)
    try {
      const req = caseRequestBody({ kind, token, reason, message, website: trap }, photos.photos)
      const res = await fetch("/api/order-help", { method: "POST", headers: req.headers, body: req.body })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setError(body?.error ? ct(String(body.error)) : ct("That didn't go through. Try again in a moment."))
      photos.clear()
      setMessage("")
      setReason(null)
      setOpen(false)
      setSent({ link: String(body?.link ?? ""), photosNotKept: body?.photosNotKept === true })
    } catch {
      setError(ct("That didn't go through. Check your connection and try again."))
    } finally {
      setSending(false)
    }
  }

  const link = sent?.link || openCase?.link || null
  const shortcut = reason === "cancel" ? cancel : reason === "return" ? returns : null
  const others = [cancel, returns].filter((x): x is HelpShortcut => !!x)

  return (
    <section id="get-help" className={cn("scroll-mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5", className)} data-order-help="">
      <div id="contact" className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{ct("Need help with this order?")}</h2>
          <p className="mt-0.5 text-[14px] leading-[21px] text-[#6b7280]" data-order-help-state={sent ? "sent" : link ? "open" : "new"}>
            {sent ? ct("Sent to {shop}. Their reply comes to your email.", { shop: storeName }) : link ? ct("Your conversation with {shop} is open.", { shop: storeName }) : ct("Write to {shop} about anything with this order.", { shop: storeName })}
          </p>
        </div>
        {!open ? (
          <div className="flex flex-wrap gap-2">
            {link ? (
              <a href={link} className="inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44]" data-order-help-case="">
                {ct("See the conversation")}
              </a>
            ) : null}
            <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex h-10 items-center rounded-[10px] px-4 text-[14px] font-semibold", link ? "border border-[#d9dce1] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]" : "bg-[#1a1a2e] text-white hover:bg-[#2a2a44]")} data-order-help-open="">
              {link ? ct("Write again") : ct("Contact the shop")}
            </button>
          </div>
        ) : null}
      </div>
      {sent?.photosNotKept ? <p className="mt-2 text-[13px] text-[#92400e]">{ct("Your message was sent. The photos couldn't be kept yet; send them by email if the shop asks.")}</p> : null}

      {open ? (
        <div className="mt-4 space-y-3" data-order-help-form="">
          <div>
            <p className="mb-2 text-[13.5px] font-medium text-[#1a1a2e]">{ct("What is it about?")}</p>
            <div role="radiogroup" aria-label={ct("What is it about?")} className="flex flex-wrap gap-2">
              {reasonsFor(kind).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={cn("h-9 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", reason === r ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d9dce1] text-[#4b5563] hover:bg-[#f8f9fa]")} data-topic={r}>
                  {reasonLabel(r, ct)}
                </button>
              ))}
            </div>
          </div>
          {shortcut ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f9fa] px-3.5 py-2.5" data-help-shortcut={reason ?? ""}>
              <p className="min-w-0 text-[13.5px] leading-5 text-[#4b5563]">{reason === "cancel" ? ct("You can ask to cancel straight from this page.") : ct("You can start a return straight from this page.")}</p>
              <button type="button" onClick={shortcut.onOpen} className="inline-flex h-9 items-center rounded-[10px] border border-[#d9dce1] bg-white px-3 text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f3f4f6]">
                {shortcut.label}
              </button>
            </div>
          ) : null}
          {reason === "change_address" ? <p className="rounded-xl bg-[#f8f9fa] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#4b5563]">{ct("Write the whole new address. {shop} can change it until the order ships.", { shop: storeName })}</p> : null}
          <label className="block">
            <span className="sr-only">{ct("Your message")}</span>
            <textarea value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={kind === "physical" ? ct("What happened? A photo of any damage helps.") : ct("What happened?")} className="w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[16px] leading-[22px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] sm:text-[15px]" data-order-help-message="" />
          </label>
          {/* Left empty by people; a script that fills every field is refused. */}
          <input type="text" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="pointer-events-none fixed left-[-9999px] top-0 h-px w-px opacity-0" />
          <CasePhotoPicker state={photos} disabled={sending} ct={ct} />
          {error ? <p role="alert" className="text-[13.5px] text-[#b91c1c]">{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center justify-center rounded-[10px] px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6] sm:h-10">
              {ct("Close")}
            </button>
            <button type="button" onClick={() => void send()} disabled={sending} className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a44] disabled:opacity-60 sm:h-10" data-order-help-send="">
              {sending ? ct("Sending") : ct("Send to {shop}", { shop: storeName })}
            </button>
          </div>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
            {ct("{shop} answers by email, with a link back to the conversation. If something you received is damaged or missing, or a refund is owed, and {shop} hasn't answered in three days, you can ask Storelib for help.", { shop: storeName })}
          </p>
        </div>
      ) : null}

      {others.length ? (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#eef0f2] pt-3" data-help-options="">
          {others.map((o) => (
            <div key={o.label}>
              <button type="button" onClick={o.onOpen} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" {...(o.kind === "cancel" ? { "data-cancel-button": "" } : { "data-return-button": "" })}>
                {o.label}
              </button>
              {o.hint ? <p className="text-[12.5px] text-[#6b7280]">{o.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {contact && (contact.email || contact.phone) ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#eef0f2] pt-3 text-[13.5px]" data-help-contact="">
          {contact.email ? (
            <a href={contact.emailHref || `mailto:${contact.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-[#1a1a2e] [overflow-wrap:anywhere] hover:underline">
              <Mail className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
              {contact.email}
            </a>
          ) : null}
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-[#1a1a2e] hover:underline">
              <Phone className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
              {contact.phone}
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
