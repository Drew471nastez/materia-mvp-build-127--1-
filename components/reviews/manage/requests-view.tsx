"use client"

/**
 * ===========================================================================
 *  STORELIB REVIEWS › REQUESTS
 * ===========================================================================
 * The emails that ask buyers for a review, in three cards:
 *
 *   REQUESTS       every one, newest first, a page at a time: scheduled,
 *                  sent, opened (when the mail provider reports it),
 *                  reminded, submitted, or skipped with why. "Ask an order"
 *                  sends one now to a recent order's buyer, with every cap
 *                  kept: one link an order a week, never a reviewed,
 *                  refunded, unsubscribed or own order.
 *   WHEN THEY GO   days after a download or a delivery, and the one reminder
 *                  (the app's settings, drawn by ReviewsAppPanel's requests
 *                  section, so it is set here only)
 *   THE EMAIL      the subject, heading, text and button of the ask and of
 *                  the reminder, with a preview drawn by the code that sends
 *                  it (lib/reviews/request-email.ts) in the store's colours
 */
import * as React from "react"
import { Loader2, Search, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { api } from "@/components/physical/ui"
import { ReviewsAppPanel } from "@/components/app/settings/reviews-app-panel"
import { EmailFrame } from "./email-frame"
import { COPY_LIMITS, DEFAULT_COPY, type CopyField, type EmailCopy } from "@/lib/emails/customer-custom"
import type { ManagedRequest, RequestShown } from "@/lib/reviews/manage"
import { StatusBadge, buttonPrimary, buttonSecondary } from "@/app/app/orders/order-parts"
import { Pill, usePill } from "@/app/app/coupons/coupon-parts"
import { CARD, CARD_HEAD, H3, MUTED, Placeholder, SEG, Sheet, shortDate, useRead, errorOf } from "./parts"

type Filter = "all" | "scheduled" | "sent" | "opened" | "submitted" | "skipped"

const FILTER_LABEL: Record<Filter, () => string> = {
  all: () => tt("All"),
  scheduled: () => tt("Scheduled"),
  sent: () => tt("Sent"),
  opened: () => tt("Opened"),
  submitted: () => tt("Reviewed"),
  skipped: () => tt("Not sent"),
}

const SHOWN: Record<RequestShown, { label: () => string; tone: "neutral" | "attention" | "critical" | "success" }> = {
  scheduled: { label: () => tt("Scheduled"), tone: "neutral" },
  sent: { label: () => tt("Sent"), tone: "neutral" },
  opened: { label: () => tt("Opened"), tone: "neutral" },
  reminded: { label: () => tt("Reminder sent"), tone: "neutral" },
  submitted: { label: () => tt("Reviewed"), tone: "success" },
  skipped: { label: () => tt("Not sent"), tone: "attention" },
  failed: { label: () => tt("Failed"), tone: "critical" },
}

/** Why one was not sent, in the store's words (lib/reviews/manage SKIP_WORDS, the server's codes). */
const WHY: Record<string, () => string> = {
  no_order: () => tt("The order is gone"),
  not_open: () => tt("Refunded, failed or disputed"),
  before_app: () => tt("Bought before the app was on"),
  test_sale: () => tt("A test sale"),
  reviewed: () => tt("Already reviewed"),
  own_order: () => tt("Your own order"),
  no_product: () => tt("The product was deleted"),
  unsubscribed: () => tt("They turned review emails off"),
  too_late: () => tt("Too long after it was due"),
  send_failed: () => tt("The email could not be sent"),
  reminder_failed: () => tt("The reminder could not be sent"),
  asked_recently: () => tt("Asked in the last 7 days"),
  done: () => tt("Already finished"),
  app_off: () => tt("Storelib Reviews is off"),
}

interface RequestList {
  rows: ManagedRequest[]
  total: number
  page: number
  pageSize: number
  tracked: boolean
  ready: boolean
}

export function RequestsView() {
  const [filter, setFilter] = React.useState<Filter>("all")
  const [page, setPage] = React.useState(1)
  const [typed, setTyped] = React.useState("")
  const [q, setQ] = React.useState("")
  const [asking, setAsking] = React.useState(false)
  const [notice, say] = usePill()
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(typed.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [typed])
  const { data, error, loading, reload } = useRead<RequestList>(`/api/app/reviews/requests?filter=${filter}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 25

  return (
    <div className="space-y-4 sm:space-y-5" data-reviews-requests="">
      <Pill notice={notice} />
      <section className={cn(CARD, "overflow-hidden")} aria-labelledby="requests-title">
        <div className={CARD_HEAD}>
          <h3 id="requests-title" className={H3}>
            {tt("Review requests")}
          </h3>
          <button type="button" onClick={() => setAsking(true)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-requests-ask="">
            <Send className="h-3.5 w-3.5" aria-hidden />
            {tt("Ask an order")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5">
          <div role="tablist" aria-label={tt("Filter requests")} className="-my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 [scrollbar-width:none] md:basis-auto [&::-webkit-scrollbar]:hidden">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); setPage(1) }} className={SEG(filter === f)} data-requests-filter={f}>
                {FILTER_LABEL[f]()}
              </button>
            ))}
          </div>
          <label className="relative mx-1 mb-1 w-full md:mb-0 md:w-[220px]">
            <span className="sr-only">{tt("Search by email")}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tt("Search by email")} className="h-10 w-full rounded-lg border border-[#e3e4e8] bg-white pl-9 pr-3 text-[16px] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] md:h-8 md:text-[13px]" />
          </label>
        </div>
        {data && !data.tracked ? <p className="border-b border-[#eef0f2] bg-[#fafbfb] px-4 py-2 text-[12.5px] text-[#6b7280]">{tt("Opens show here after the database update (SQL part 215).")}</p> : null}
        {error && !data ? (
          <p className="m-4 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p>
        ) : !data ? (
          <div className="space-y-2 p-4" aria-label={tt("Loading")}>
            <Placeholder className="h-12" />
            <Placeholder className="h-12" />
            <Placeholder className="h-12" />
          </div>
        ) : rows.length ? (
          <>
            <ul className={cn("divide-y divide-[#f1f2f4] transition-opacity duration-150", loading && "opacity-60")}>
              {rows.map((r) => {
                const shown = SHOWN[r.shown]
                return (
                  <li key={r.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5" data-request-row={r.shown}>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{r.first_name ? `${r.first_name} · ` : ""}{r.email}</p>
                      <p className="truncate text-[12.5px] text-[#6b7280]">{r.product?.title ?? tt("A deleted product")}</p>
                    </div>
                    <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
                      {r.shown === "scheduled" && r.due_at ? tt("Goes {date}", { date: shortDate(r.due_at) }) : r.sent_at ? tt("Sent {date}", { date: shortDate(r.sent_at) }) : null}
                      {r.reminded_at ? ` · ${tt("reminder {date}", { date: shortDate(r.reminded_at) })}` : ""}
                      {r.manual ? ` · ${tt("sent by you")}` : ""}
                      {(r.shown === "skipped" || r.shown === "failed") && r.skip_reason ? <span className="block text-[#92400e]">{WHY[r.skip_reason]?.() ?? r.skip_reason}</span> : null}
                    </p>
                    <span className="sm:justify-self-end">
                      <StatusBadge tone={shown.tone}>{shown.label()}</StatusBadge>
                    </span>
                  </li>
                )
              })}
            </ul>
            {total > pageSize ? (
              <div className="flex items-center justify-between gap-2 border-t border-[#f1f2f4] px-4 py-3">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
                  {tt("Previous")}
                </button>
                <span className="text-[13px] tabular-nums text-[#6b7280]">{tt("Page {page} of {pages}", { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}</span>
                <button type="button" disabled={page * pageSize >= total || loading} onClick={() => setPage((p) => p + 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
                  {tt("Next")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{filter === "all" && !q ? tt("No requests yet") : tt("No requests here")}</p>
            <p className={cn(MUTED, "mx-auto mt-1 max-w-[380px]")}>{filter === "all" && !q ? tt("Orders placed after you turned the app on are asked on the schedule below.") : tt("Try another filter.")}</p>
          </div>
        )}
      </section>

      <section className={cn(CARD, "overflow-hidden")} aria-labelledby="requests-when">
        <div className={CARD_HEAD}>
          <h3 id="requests-when" className={H3}>
            {tt("When they go")}
          </h3>
        </div>
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <ReviewsAppPanel sections={["requests"]} />
        </div>
      </section>

      <RequestEmailCard onSaved={(m) => say(m)} onError={(m) => say(m, "error")} />

      {asking ? (
        <AskSheet
          onClose={() => setAsking(false)}
          onSent={() => {
            say(tt("Review request sent"))
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── Asking one order by hand ─────────────────────────────────────────── */

interface AskableOrder {
  id: string
  email: string
  first_name: string | null
  product: string | null
  created_at: string
  request: string | null
}

function AskSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [typed, setTyped] = React.useState("")
  const [q, setQ] = React.useState("")
  const [sending, setSending] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<Record<string, { ok: boolean; text: string }>>({})
  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(typed.trim()), 300)
    return () => window.clearTimeout(t)
  }, [typed])
  const { data, loading } = useRead<{ orders: AskableOrder[] }>(`/api/app/reviews/requests?orders=1${q ? `&q=${encodeURIComponent(q)}` : ""}`)
  const send = async (o: AskableOrder) => {
    setSending(o.id)
    const r = await api<{ sent: boolean; reason?: string }>("/api/app/reviews/requests", { method: "POST", body: { orderId: o.id } })
    setSending(null)
    if (r.ok && r.data.sent) {
      setResult((x) => ({ ...x, [o.id]: { ok: true, text: tt("Sent") } }))
      onSent()
      return
    }
    const reason = (r.ok ? r.data.reason : (r.data as { reason?: string } | undefined)?.reason) ?? ""
    setResult((x) => ({ ...x, [o.id]: { ok: false, text: WHY[reason]?.() ?? (r.ok ? tt("It was not sent.") : errorOf(r)) } }))
  }
  const already = (s: string | null) => (s === "reviewed" ? tt("Reviewed") : s === "sent" || s === "reminded" ? tt("Asked") : s === "skipped" || s === "failed" ? tt("Not sent before") : s === "scheduled" ? tt("Scheduled") : null)
  return (
    <Sheet
      labelId="ask-order-title"
      title={tt("Ask an order for a review")}
      onClose={onClose}
      busy={!!sending}
      footer={
        <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:ml-auto sm:h-10 sm:flex-none sm:text-[14px]")}>
          {tt("Done")}
        </button>
      }
    >
      <p className={MUTED}>{tt("Sends the review email now. One per order a week, and never to an order that was reviewed, refunded or turned review emails off.")}</p>
      <label className="relative mt-3 block">
        <span className="sr-only">{tt("Search orders")}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        <input type="search" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tt("Buyer's email or name")} className="h-11 w-full rounded-xl border border-[#e3e4e8] bg-white pl-9 pr-3 text-[16px] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] sm:h-10 sm:text-[14px]" />
      </label>
      <ul className={cn("mt-3 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]", loading && "opacity-60")}>
        {(data?.orders ?? []).map((o) => {
          const res = result[o.id]
          const before = already(o.request)
          return (
            <li key={o.id} className="flex items-center gap-3 px-3 py-2.5" data-ask-order={o.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{o.email}</p>
                <p className="truncate text-[12.5px] text-[#6b7280]">
                  {o.product ?? tt("A deleted product")} · {shortDate(o.created_at)}
                  {before ? ` · ${before}` : ""}
                </p>
                {res ? <p className={cn("text-[12.5px]", res.ok ? "text-[#067647]" : "text-[#92400e]")}>{res.text}</p> : null}
              </div>
              <button type="button" disabled={!!sending || res?.ok || o.request === "reviewed"} onClick={() => void send(o)} className={cn(buttonSecondary, "h-9 shrink-0 px-3")}>
                {sending === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {tt("Send")}
              </button>
            </li>
          )
        })}
        {data && data.orders.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-[#6b7280]">{tt("No orders found.")}</li> : null}
        {!data ? <li className="p-3"><Placeholder className="h-10" /></li> : null}
      </ul>
    </Sheet>
  )
}

/* ── The email ────────────────────────────────────────────────────────── */

type Kind = "request" | "reminder"
/** A review email has these four parts; preview text and a footer note are the store emails' own. */
type ReviewField = "subject" | "heading" | "body" | "button"
const FIELDS: ReviewField[] = ["subject", "heading", "body", "button"]
const FIELD_LABEL: Record<ReviewField, () => string> = { subject: () => tt("Subject"), heading: () => tt("Heading"), body: () => tt("Text"), button: () => tt("Button") }
const PLACES = ["customer_name", "items", "shop_name"] as const
const PLACE_LABEL: Record<(typeof PLACES)[number], () => string> = { customer_name: () => tt("First name"), items: () => tt("Product"), shop_name: () => tt("Store name") }

/** The standard words, as the editor shows them (lib/emails/customer-custom DEFAULT_COPY, review_request and review_reminder). */
const STANDARD: Record<Kind, Record<ReviewField, string>> = { request: DEFAULT_COPY.review_request, reminder: DEFAULT_COPY.review_reminder }

function RequestEmailCard({ onSaved, onError }: { onSaved: (m: string) => void; onError: (m: string) => void }) {
  const loaded = useRead<{ ready: boolean; copy: Record<Kind, EmailCopy | null> }>("/api/app/reviews/request-email")
  const [kind, setKind] = React.useState<Kind>("request")
  const [draft, setDraft] = React.useState<Record<Kind, Record<ReviewField, string>> | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [preview, setPreview] = React.useState<{ subject: string; html: string } | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const focused = React.useRef<{ field: ReviewField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)

  const fill = (c: EmailCopy | null | undefined, k: Kind): Record<ReviewField, string> => ({ subject: c?.subject ?? STANDARD[k].subject, heading: c?.heading ?? STANDARD[k].heading, body: c?.body ?? STANDARD[k].body, button: c?.button ?? STANDARD[k].button })
  React.useEffect(() => {
    if (loaded.data && !draft) setDraft({ request: fill(loaded.data.copy.request, "request"), reminder: fill(loaded.data.copy.reminder, "reminder") })
  }, [loaded.data, draft])

  const words = draft?.[kind]
  const saved = loaded.data ? fill(loaded.data.copy[kind], kind) : null
  const dirty = !!words && !!saved && FIELDS.some((f) => words[f] !== saved[f])
  const standard = !!words && FIELDS.every((f) => words[f] === STANDARD[kind][f])

  /* The preview follows the words after a pause, drawn by the code that sends the email. The first one is asked for at once (round 27): there is no typing to wait for, and the grey box under it stayed half a second for nothing. */
  const firstPreview = React.useRef(true)
  React.useEffect(() => {
    if (!words) return
    const wait = firstPreview.current ? 0 : 450
    firstPreview.current = false
    const t = window.setTimeout(() => {
      void api<{ subject: string; html: string }>("/api/app/reviews/request-email", { method: "POST", body: { kind, copy: words } }).then((r) => {
        if (r.ok) {
          setPreview(r.data)
          setPreviewError(null)
        } else setPreviewError(errorOf(r))
      })
    }, wait)
    return () => window.clearTimeout(t)
  }, [kind, words])

  const set = (f: ReviewField, v: string) => setDraft((d) => (d ? { ...d, [kind]: { ...d[kind], [f]: v.slice(0, COPY_LIMITS[f]) } } : d))
  const insert = (key: string) => {
    const at = focused.current
    const f = at?.field ?? "body"
    const token = `{{${key}}}`
    const el = at?.el
    const cur = words?.[f] ?? ""
    const start = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    set(f, cur.slice(0, start) + token + cur.slice(end))
    window.requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = async (reset = false) => {
    if (!words) return
    setSaving(true)
    const r = await api<{ copy: EmailCopy | null }>("/api/app/reviews/request-email", { method: "PUT", body: { kind, copy: reset ? null : words } })
    setSaving(false)
    if (!r.ok) return onError(errorOf(r))
    loaded.set((d) => (d ? { ...d, copy: { ...d.copy, [kind]: r.data.copy } } : d))
    setDraft((d) => (d ? { ...d, [kind]: fill(r.data.copy, kind) } : d))
    onSaved(reset ? tt("Standard words back") : tt("Email saved"))
  }

  return (
    <section className={cn(CARD, "overflow-hidden")} aria-labelledby="request-email-title" data-request-email="">
      <div className={CARD_HEAD}>
        <h3 id="request-email-title" className={H3}>
          {tt("Request email")}
        </h3>
        <div className="flex gap-0.5" role="tablist">
          {(["request", "reminder"] as Kind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={SEG(kind === k)} data-email-kind={k}>
              {k === "request" ? tt("First email") : tt("Reminder")}
            </button>
          ))}
        </div>
      </div>
      {loaded.data && !loaded.data.ready ? <p className="border-b border-[#eef0f2] bg-[#fff8e6] px-4 py-2 text-[13px] text-[#5c4300]">{tt("Changing the words needs a database update (SQL part 129). The preview still works.")}</p> : null}
      {!words ? (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <Placeholder className="h-64" />
          <Placeholder className="h-64" />
        </div>
      ) : (
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <label key={f} className="block">
                <span className="text-[13px] font-medium text-[#1a1a2e]">{FIELD_LABEL[f]()}</span>
                {f === "body" ? (
                  <textarea
                    value={words.body}
                    rows={5}
                    onChange={(e) => set("body", e.target.value)}
                    onFocus={(e) => (focused.current = { field: "body", el: e.currentTarget })}
                    className="mt-1 block w-full resize-y rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-[16px] leading-relaxed text-[#1a1a2e] outline-none focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[14px]"
                    data-email-field="body"
                  />
                ) : (
                  <input
                    value={words[f]}
                    onChange={(e) => set(f, e.target.value)}
                    onFocus={(e) => (focused.current = { field: f, el: e.currentTarget })}
                    className="mt-1 h-10 w-full rounded-lg border border-[#e3e4e8] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:h-9 sm:text-[14px]"
                    data-email-field={f}
                  />
                )}
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-[#6b7280]">{tt("Insert")}</span>
              {PLACES.map((p) => (
                <button key={p} type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => insert(p)} className="inline-flex h-7 items-center rounded-md border border-[#e3e4e8] bg-white px-2 text-[12.5px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                  {PLACE_LABEL[p]()}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Your words are used for buyers who bought in your website's language. Buyers who bought in another language get the standard email in theirs.")}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!standard ? (
                <button type="button" disabled={saving} onClick={() => void save(true)} className="mr-auto text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
                  {tt("Use the standard words")}
                </button>
              ) : null}
              {dirty ? (
                <button type="button" disabled={saving} onClick={() => saved && setDraft((d) => (d ? { ...d, [kind]: saved } : d))} className={buttonSecondary}>
                  {tt("Discard")}
                </button>
              ) : null}
              <button type="button" disabled={saving || !dirty || loaded.data?.ready === false} onClick={() => void save()} className={cn(buttonPrimary, "ml-auto")} data-email-save="">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {tt("Save")}
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] text-[#6b7280]">
              {tt("Subject")}: <span className="font-medium text-[#1a1a2e]">{preview?.subject ?? ""}</span>
            </p>
            <div className="mt-2" data-email-preview="">
              {preview ? <EmailFrame title={tt("Email preview")} html={preview.html} /> : <Placeholder className="h-[560px]" />}
            </div>
            {previewError ? <p className="mt-2 text-[13px] text-[#b42318]">{previewError}</p> : null}
            <p className="mt-2 text-[12px] text-[#9ca3af]">{tt("A sample with your store's name, logo and colour.")}</p>
          </div>
        </div>
      )}
    </section>
  )
}
