"use client"

/**
 * ===========================================================================
 *  THE BUYER'S CONVERSATION WITH THE SHOP (app/order-help/<id>?k=...)
 * ===========================================================================
 * What they wrote, the shop's answers, and Storelib's once it is asked in,
 * live: a new message from the shop or Storelib shows without a reload
 * (lib/support/use-case-live.ts: the case's broadcast channel, with polling
 * under it). They write back with photos, mark it sorted, or, when the rule
 * allows (lib/support/cases.ts buyerEscalation and the server's gate), ask
 * Storelib to step in: offered quietly beside the order, never in the way.
 *
 * Laid out for a phone first: the way back to the order at the top, the
 * conversation, the reply box under it, then the order and the shop. From
 * 1024 pixels the order and the shop sit in a column beside the
 * conversation, which stays at a reading width on a large screen.
 *
 * In the language the order was placed in (app/checkout/parts/words.tsx),
 * English on storelib.com.
 */
import * as React from "react"
import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react"
import { type CaseMessage, type CaseReason, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { cn } from "@/lib/utils"
import { CasePhotoPicker, CasePhotoStrip, caseRequestBody, useCasePhotos } from "@/components/support/case-photos"
import { reasonLabel } from "@/components/support/order-help"
import { useCheckoutLang, useCt } from "@/app/checkout/parts/words"
import type { CheckoutT } from "@/lib/markets/checkout-words"
import { lastMessageId, mergeMessages, useCaseLive } from "@/lib/support/use-case-live"

type Store = { name: string; logoUrl: string | null; email: string | null; phone: string | null; websiteUrl: string | null }
export type BuyerEscalation = { can: boolean; from: string | null }
/** Where the buyer goes back to: their order's page, on the host they are on. */
export type CaseOrder = { path: string | null }

/** How long a full read's photo links are trusted before the next read signs them again (they last an hour). */
const FULL_READ_EVERY_MS = 45 * 60_000

function statusLabel(s: CaseStatus, ct: CheckoutT): string {
  switch (s) {
    case "store": return ct("Waiting on the shop")
    case "buyer": return ct("The shop replied")
    case "storelib": return ct("With Storelib")
    case "resolved": return ct("Resolved")
  }
}

const STATUS_TONE: Record<CaseStatus, string> = {
  store: "bg-[#fef3c7] text-[#92400e]",
  buyer: "bg-[#eff6ff] text-[#1d4ed8]",
  storelib: "bg-[#f3f4f6] text-[#1a1a2e]",
  resolved: "bg-[#f3f4f6] text-[#4b5563]",
}

const fmt = (lang: string, iso: string, o: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat(lang, o).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString("en", o)
  }
}
const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function CaseView({
  id,
  k,
  initial,
  store,
  order,
  live,
}: {
  id: string
  k: string
  initial: { case: CaseSummary; messages: CaseMessage[]; escalation?: BuyerEscalation }
  store: Store
  order?: CaseOrder | null
  /** The case's live channel (lib/support/case-live-server.ts caseTopic); without it the page polls. */
  live?: string | null
}) {
  const ct = useCt()
  const lang = useCheckoutLang()
  const [c, setCase] = React.useState(initial.case)
  const [messages, setMessages] = React.useState(initial.messages)
  const [escalation, setEscalation] = React.useState<BuyerEscalation>(initial.escalation ?? { can: false, from: null })
  const photos = useCasePhotos(ct)
  const [draft, setDraft] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState<null | "reply" | "escalate" | "resolve">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const boxRef = React.useRef<HTMLTextAreaElement>(null)
  const fullAt = React.useRef(Date.now())
  const shown = React.useRef(messages)
  shown.current = messages

  const when = (iso: string) => fmt(lang, iso, { hour: "2-digit", minute: "2-digit" })
  const dayOf = (iso: string) => fmt(lang, iso, { weekday: "short", day: "numeric", month: "short" })
  const dayLabel = (iso: string) => {
    const today = new Date()
    const yesterday = new Date(Date.now() - 86_400_000)
    if (dayKey(iso) === dayKey(today.toISOString())) return ct("Today")
    if (dayKey(iso) === dayKey(yesterday.toISOString())) return ct("Yesterday")
    return fmt(lang, iso, { weekday: "long", day: "numeric", month: "long" })
  }

  /* The done line goes after a few seconds: it is a receipt, not a state. */
  React.useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(null), 5000)
    return () => window.clearTimeout(t)
  }, [done])

  /* The reply box grows with what is written, up to a point. */
  React.useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = "auto"
    box.style.height = `${Math.min(box.scrollHeight, 260)}px`
  }, [draft])

  /* What is new since the last message on screen; every 45 minutes the whole thread, so photo links never run out. */
  const refresh = React.useCallback(async (): Promise<boolean> => {
    const full = Date.now() - fullAt.current > FULL_READ_EVERY_MS
    const after = full ? 0 : lastMessageId(shown.current)
    const res = await fetch(`/api/order-help/${encodeURIComponent(id)}?k=${encodeURIComponent(k)}${after ? `&after=${after}` : ""}`, { cache: "no-store" })
    if (!res.ok) return false
    const body = (await res.json().catch(() => null)) as { case?: CaseSummary; messages?: CaseMessage[]; escalation?: BuyerEscalation } | null
    if (!body?.case) return false
    if (full) fullAt.current = Date.now()
    const before = shown.current
    const next = full ? (body.messages ?? before) : mergeMessages(before, body.messages ?? [])
    const fresh = next.length !== before.length || next[next.length - 1]?.id !== before[before.length - 1]?.id
    setCase((was) => (was.status === body.case!.status && was.escalated === body.case!.escalated ? was : body.case!))
    if (full || fresh) setMessages(next)
    if (body.escalation) setEscalation(body.escalation)
    return fresh || body.case.status !== c.status
  }, [id, k, c.status])
  useCaseLive({ topic: live ?? null, refresh })

  /* A message arriving while the end of the conversation is in view is brought into view; someone reading higher up is left where they are. */
  const count = messages.length
  const seen = React.useRef(count)
  React.useEffect(() => {
    if (count <= seen.current) return
    seen.current = count
    const end = endRef.current
    if (!end) return
    const top = end.getBoundingClientRect().top
    if (top < window.innerHeight + 320) end.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" })
  }, [count])

  const act = async (action: "reply" | "escalate" | "resolve") => {
    if (action === "reply" && !draft.trim()) return
    setBusy(action)
    setError(null)
    try {
      const words = action === "reply" ? draft : action === "escalate" ? note : ""
      const req = caseRequestBody({ k, action, body: words }, action === "reply" ? photos.photos : [])
      const res = await fetch(`/api/order-help/${encodeURIComponent(id)}`, { method: "POST", headers: req.headers, body: req.body })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setError(body?.error ? ct(String(body.error)) : ct("That didn't go through. Try again in a moment."))
      if (body?.case) setCase(body.case)
      if (body?.messages) {
        setMessages(body.messages)
        fullAt.current = Date.now()
      }
      if (body?.escalation) setEscalation(body.escalation)
      if (action === "reply") {
        setDraft("")
        photos.clear()
      }
      if (action === "escalate") {
        setNote("")
        setAsking(false)
      }
      setDone(
        action === "reply"
          ? body?.photosNotKept
            ? ct("Sent. The photos couldn't be kept yet; send them by email if the shop asks.")
            : c.escalated
              ? ct("Sent to {shop} and Storelib.", { shop: store.name })
              : ct("Sent to {shop}.", { shop: store.name })
          : action === "escalate"
            ? ct("Storelib has your case and will write to you and {shop} here.", { shop: store.name })
            : ct("Marked as sorted. Write again any time to open it."),
      )
    } catch {
      setError(ct("That didn't go through. Check your connection and try again."))
    } finally {
      setBusy(null)
    }
  }

  const who = (m: CaseMessage) => (m.author === "buyer" ? ct("You") : m.author === "store" ? store.name : "Storelib")
  const orderRef = c.orderRef ? `#${c.orderRef}` : null
  const mailto = store.email ? `mailto:${store.email}${orderRef ? `?subject=${encodeURIComponent(ct("Order {orderRef}", { orderRef }))}` : ""}` : null
  const showsStorelib = !c.escalated && c.status !== "resolved" && (escalation.can || !!escalation.from)

  return (
    <main className="min-h-dvh bg-[#f8f9fa]" data-case-page="">
      <header className="border-b border-[#eef0f2] bg-white">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-8 w-auto max-w-[120px] shrink-0 rounded-md object-contain" />
          ) : null}
          <span className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">{store.name}</span>
          {store.websiteUrl ? (
            <a href={store.websiteUrl} className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#1a1a2e] sm:inline-flex" data-case-visit-store="">
              {ct("Visit the shop")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1120px] px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        {order?.path ? (
          <a href={order.path} className="-ml-2 mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] transition-colors hover:bg-white hover:text-[#1a1a2e]" data-case-back="">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {orderRef ? ct("Back to order {orderRef}", { orderRef }) : ct("Back to your order")}
          </a>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-labelledby="case-title" data-case-conversation="">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-[#f1f2f4] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h1 id="case-title" className="text-[19px] font-semibold leading-[26px] text-[#1a1a2e] sm:text-[21px]">
                  {reasonLabel(c.reason as CaseReason, ct)}
                </h1>
                <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{ct("Opened {date}", { date: dayOf(c.createdAt) })}</p>
              </div>
              <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-[3px] text-[12.5px] font-medium", STATUS_TONE[c.status])} data-case-status={c.status}>
                {statusLabel(c.status, ct)}
              </span>
            </div>
            {c.escalated ? <p className="border-b border-[#f1f2f4] bg-[#fafafa] px-4 py-2.5 text-[13.5px] leading-5 text-[#4b5563] sm:px-6">{ct("Storelib is helping with this case. Its messages go to you and {shop}.", { shop: store.name })}</p> : null}

            <ol className="space-y-1 px-3 py-4 sm:px-5" data-case-thread="" aria-live="polite">
              {messages.map((m, i) => {
                const mine = m.author === "buyer"
                const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt)
                const sameSide = i > 0 && !newDay && messages[i - 1].author === m.author
                return (
                  <li key={m.id} className={cn(newDay ? "pt-1" : sameSide ? "pt-0.5" : "pt-2.5")} data-message={m.author}>
                    {newDay ? (
                      <p className="mb-2.5 text-center text-[12px] font-medium text-[#9ca3af]" aria-hidden>
                        {dayLabel(m.createdAt)}
                      </p>
                    ) : null}
                    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("min-w-0 max-w-[85%] sm:max-w-[75%]", mine && "text-right")}>
                        {!sameSide ? (
                          <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">
                            {who(m)} <span className="font-normal text-[#9ca3af]">· {when(m.createdAt)}</span>
                          </p>
                        ) : null}
                        <div className={cn("inline-block rounded-2xl px-3.5 py-2.5 text-left", mine ? "rounded-tr-md bg-[#1a1a2e] text-white" : m.author === "storelib" ? "rounded-tl-md border border-[#e5e7eb] bg-white text-[#1a1a2e]" : "rounded-tl-md bg-[#f3f4f6] text-[#1a1a2e]")}>
                          {m.body ? <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] [overflow-wrap:anywhere]">{m.body}</p> : null}
                          <CasePhotoStrip photos={m.photos} dark={mine} ct={ct} />
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div ref={endRef} />

            <form
              className="space-y-3 border-t border-[#f1f2f4] px-4 py-4 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault()
                void act("reply")
              }}
              data-case-reply-form=""
            >
              <label htmlFor="case-reply" className="sr-only">
                {ct("Your reply")}
              </label>
              <textarea
                id="case-reply"
                ref={boxRef}
                value={draft}
                maxLength={5000}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void act("reply")
                  }
                }}
                placeholder={c.status === "resolved" ? ct("Write to open the case again") : ct("Write to {shop}", { shop: store.name })}
                className="block min-h-[88px] w-full resize-none rounded-[12px] border border-[#d9dce1] px-3.5 py-2.5 text-[16px] leading-[22px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] sm:text-[15px]"
              />
              {error ? (
                <p role="alert" className="rounded-xl bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] text-[#991b1b]">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <CasePhotoPicker state={photos} disabled={busy !== null} ct={ct} />
                <button type="submit" disabled={busy !== null || !draft.trim()} className="ml-auto inline-flex h-11 shrink-0 items-center rounded-[10px] bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a44] disabled:opacity-50 sm:h-10" data-case-send="">
                  {busy === "reply" ? ct("Sending") : ct("Send")}
                </button>
              </div>
              <p className={cn("min-h-[20px] text-[13px] leading-5 text-[#166534] transition-opacity duration-300", done ? "opacity-100" : "opacity-0")} role="status" data-case-done="">
                {done ?? ""}
              </p>
            </form>
          </section>

          <aside className="min-w-0 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:sticky lg:top-6" data-case-aside="">
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[12.5px] font-medium text-[#6b7280]">{ct("Your order")}</p>
              <p className="mt-0.5 text-[16px] font-semibold text-[#1a1a2e]">{orderRef ?? store.name}</p>
              {order?.path ? (
                <a href={order.path} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[10px] border border-[#d9dce1] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa]" data-case-order-link="">
                  {ct("View your order")}
                </a>
              ) : null}
              {c.status !== "resolved" ? (
                <button type="button" disabled={busy !== null} onClick={() => void act("resolve")} className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-[10px] text-[13.5px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] disabled:opacity-60" data-case-resolve="">
                  {ct("It's sorted")}
                </button>
              ) : null}
            </div>

            {mailto || store.phone || store.websiteUrl ? (
              <div className="space-y-2 border-t border-[#f1f2f4] px-4 py-4 text-[14px] sm:px-5" data-case-contact="">
                <p className="text-[12.5px] font-medium text-[#6b7280]">{store.name}</p>
                {mailto ? (
                  <a href={mailto} className="flex min-w-0 items-center gap-2 text-[#1a1a2e] [overflow-wrap:anywhere] hover:underline">
                    <Mail className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                    {store.email}
                  </a>
                ) : null}
                {store.phone ? (
                  <a href={`tel:${store.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-[#1a1a2e] hover:underline">
                    <Phone className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                    {store.phone}
                  </a>
                ) : null}
                {store.websiteUrl ? (
                  <a href={store.websiteUrl} className="flex items-center gap-2 text-[#1a1a2e] hover:underline sm:hidden">
                    <ExternalLink className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                    {ct("Visit the shop")}
                  </a>
                ) : null}
              </div>
            ) : null}

            {showsStorelib ? (
              <div className="border-t border-[#f1f2f4] px-4 py-4 sm:px-5" data-case-escalation={escalation.can ? "now" : "later"}>
                {escalation.can ? (
                  asking ? (
                    <div className="space-y-2.5">
                      <label htmlFor="case-storelib-note" className="block text-[13.5px] font-medium text-[#1a1a2e]">
                        {ct("Anything Storelib should know? (optional)")}
                      </label>
                      <textarea id="case-storelib-note" value={note} maxLength={5000} rows={3} onChange={(e) => setNote(e.target.value)} className="block w-full resize-y rounded-[10px] border border-[#d9dce1] px-3 py-2 text-[16px] leading-[22px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] sm:text-[14px]" />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAsking(false)} className="inline-flex h-9 items-center rounded-[10px] px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]">
                          {ct("Cancel")}
                        </button>
                        <button type="button" disabled={busy !== null} onClick={() => void act("escalate")} className="inline-flex h-9 items-center rounded-[10px] bg-[#1a1a2e] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#2a2a44] disabled:opacity-60" data-case-escalate="">
                          {busy === "escalate" ? ct("Sending") : ct("Ask Storelib")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[13px] leading-[19px] text-[#6b7280]">{ct("{shop} hasn't answered for three days. Storelib can read this conversation and help you both.", { shop: store.name })}</p>
                      <button type="button" onClick={() => setAsking(true)} className="mt-2 text-[13.5px] font-medium text-[#1a1a2e] underline underline-offset-4" data-case-ask-storelib="">
                        {ct("Ask Storelib for help")}
                      </button>
                    </>
                  )
                ) : (
                  <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{ct("If {shop} hasn't answered by {date}, you can ask Storelib to look at this case here.", { shop: store.name, date: dayOf(escalation.from!) })}</p>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  )
}
