"use client"

/**
 * ===========================================================================
 *  REVIEWS › REQUESTS
 * ===========================================================================
 * The emails that ask buyers for a review (review_requests, one per order
 * line, sent by the hourly run: lib/reviews/requests-server.ts), and how
 * they are sent.
 *
 *   the list       newest first: who, which product, and where it is
 *                  (scheduled for a day, sent, reminded, reviewed, or
 *                  stopped and why). One row can be sent now, sent again a
 *                  day after it last went, cancelled before it goes or
 *                  before its reminder, or tried again after a failed send
 *                  (lib/reviews/request-copy.ts requestActions).
 *   timing         days after a download or a course, days after a parcel
 *                  was delivered or shipped, and the one reminder
 *   the email      the store's own subject, heading, words, button and
 *                  sender name, with {first_name}, {product} and {store}
 *                  filled in, drawn beside it by the template that sends it
 *
 * One address is asked once about one product: a second order of it is
 * skipped as a duplicate.
 */
import * as React from "react"
import { Loader2, Search } from "lucide-react"
import { Field, Notice, SelectInput, TextInput, Toggle } from "@/components/physical/ui"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, formatNumber, zoned } from "@/lib/i18n/format"
import { EMAIL_COPY_LIMITS, type ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { requestActions, requestState, type RequestAction, type RequestState } from "@/lib/reviews/request-copy"
import type { RequestFilter, RequestList, RequestRow, SellerProduct } from "@/lib/reviews/dashboard-server"
import { Pill, usePill } from "@/app/app/coupons/coupon-parts"
import { RowMenuButton, StatusBadge, buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { REVIEWS_BODY } from "./reviews-nav"

const day = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric" }))
}

const FILTERS: { id: RequestFilter; label: () => string }[] = [
  { id: "all", label: () => tt("All") },
  { id: "scheduled", label: () => tt("Scheduled") },
  { id: "sent", label: () => tt("Sent") },
  { id: "reviewed", label: () => tt("Reviewed") },
  { id: "stopped", label: () => tt("Stopped") },
]

const SKIP_WORD: Record<string, () => string> = {
  cancelled: () => tt("Cancelled by you"),
  duplicate: () => tt("Already asked about this product"),
  reviewed: () => tt("Already reviewed"),
  unsubscribed: () => tt("Turned review emails off"),
  not_open: () => tt("Refunded or not paid"),
  own_order: () => tt("Your own order"),
  no_product: () => tt("Product not sold any more"),
  test_sale: () => tt("Test sale"),
  too_late: () => tt("Too long after the purchase"),
  before_app: () => tt("Bought before Storelib Reviews was on"),
  no_order: () => tt("Order not found"),
  send_failed: () => tt("The email could not be delivered"),
  reminder_failed: () => tt("The reminder could not be delivered"),
}

function stateLine(row: RequestRow, state: RequestState): { tone: "neutral" | "attention" | "critical" | "success"; text: string } {
  switch (state) {
    case "scheduled":
      return { tone: "neutral", text: tt("Scheduled for {date}", { date: day(row.due_at) }) }
    case "sent":
      return { tone: "neutral", text: tt("Sent {date}", { date: day(row.last_sent_at ?? row.sent_at) }) }
    case "reminded":
      return { tone: "neutral", text: tt("Reminded {date}", { date: day(row.reminded_at) }) }
    case "reviewed":
      return { tone: "success", text: tt("Reviewed") }
    case "cancelled":
      return { tone: "neutral", text: tt("Cancelled") }
    case "failed":
      return { tone: "critical", text: tt("Not delivered") }
    default:
      return { tone: "neutral", text: tt("Not sent") }
  }
}

const ACTION_LABEL: Record<RequestAction, () => string> = {
  send_now: () => tt("Send now"),
  resend: () => tt("Send again"),
  cancel: () => tt("Cancel"),
  retry: () => tt("Try again"),
}

export function RequestsPanel({ initial, products, settings: initialSettings, ready }: { initial: RequestList; products: SellerProduct[]; settings: ReviewsAppSettings; ready: boolean }) {
  const [list, setList] = React.useState(initial)
  const [filter, setFilter] = React.useState<RequestFilter>("all")
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [busyRow, setBusyRow] = React.useState<string | null>(null)
  const [settings, setSettings] = React.useState(initialSettings)
  const [notice, say] = usePill()
  const ask = React.useRef(0)
  const byProduct = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const load = React.useCallback(async (f: RequestFilter, p: number, q: string) => {
    const n = ++ask.current
    setLoading(true)
    const params = new URLSearchParams({ filter: f, page: String(p), ...(q ? { q } : {}) })
    const res = await fetch(`/api/app/reviews/requests?${params}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null)
    const data = res?.ok ? ((await res.json().catch(() => null)) as RequestList | null) : null
    if (n !== ask.current) return
    setLoading(false)
    if (data && Array.isArray(data.rows) && data.counts) setList(data)
    else say(tt("The list did not load. Check your connection and try again."), "error")
  }, [say])

  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => void load(filter, page, search.trim()), search ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [filter, page, search, load])

  const act = async (row: RequestRow, action: RequestAction) => {
    setBusyRow(row.id)
    const res = await fetch(`/api/app/reviews/requests/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), credentials: "same-origin" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusyRow(null)
    if (!res?.ok) return say(data.error || tt("That did not work. Try again."), "error")
    if (data.row) setList((l) => ({ ...l, rows: l.rows.map((r) => (r.id === row.id ? { ...r, ...data.row } : r)) }))
    say(action === "cancel" ? tt("Cancelled. No more emails about this order.") : tt("Sent"))
    void load(filter, page, search.trim())
  }

  return (
    <div className={REVIEWS_BODY} data-reviews-requests="">
      <Pill notice={notice} />
      {!ready ? (
        <Notice tone="amber" className="mt-3">
          {tt("Request emails need the database update (SQL part 134).")}
        </Notice>
      ) : !settings.enabled ? (
        <Notice tone="gray" className="mt-3">
          {tt("Storelib Reviews is off, so no request emails go out. Turn it on in Settings.")}
        </Notice>
      ) : !settings.request.enabled ? (
        <Notice tone="gray" className="mt-3">
          {tt("Request emails are off. Turn them on under Email and timing.")}
        </Notice>
      ) : null}

      <section aria-label={tt("Request emails")} className={cn(card, "mt-3 overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5">
          <div role="tablist" aria-label={tt("Filter requests")} className="orders-strip -my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 md:basis-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => {
                  setFilter(f.id)
                  setPage(1)
                }}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
                  filter === f.id ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
                )}
                data-requests-filter={f.id}
              >
                {f.label()}
                <span className="tabular-nums text-[#9ca3af]">{formatNumber(list.counts[f.id] ?? 0)}</span>
              </button>
            ))}
          </div>
          <label className="relative mx-1 mb-1 block w-full md:mb-0 md:w-[240px]">
            <span className="sr-only">{tt("Search by name or email")}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={tt("Name or email")}
              className="h-10 w-full rounded-lg border border-[#e3e4e8] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] md:h-8 md:text-[13px]"
            />
          </label>
        </div>

        {list.rows.length ? (
          <ul className={cn("divide-y divide-[#f1f2f4] transition-opacity", loading && "opacity-55")} aria-busy={loading}>
            {list.rows.map((row) => {
              const state = requestState(row)
              const line = stateLine(row, state)
              const actions = requestActions(row)
              const product = row.product_id ? byProduct.get(row.product_id) : null
              const why = state === "skipped" || state === "cancelled" || state === "failed" ? (row.skip_reason ? SKIP_WORD[row.skip_reason]?.() : null) : null
              return (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3.5 md:items-center md:px-5" data-request-row={row.id} data-request-state={state}>
                  <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{row.first_name || row.email.split("@")[0]}</p>
                      <p className="truncate text-[13px] text-[#6b7280]">{row.email}</p>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-[#4b5563] md:mt-0">{product?.title ?? tt("A product")}</p>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:mt-0">
                      <StatusBadge tone={line.tone}>{line.text}</StatusBadge>
                      {why ? <span className="truncate text-[12.5px] text-[#6b7280]">{why}</span> : state === "sent" && row.reminded_at === null && settings.request.reminder ? <span className="text-[12.5px] text-[#9ca3af]">{tt("One reminder to come")}</span> : null}
                    </div>
                  </div>
                  {busyRow === row.id ? (
                    <span className="flex h-9 w-9 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" aria-hidden />
                    </span>
                  ) : actions.length ? (
                    <ResponsiveActionMenu
                      title={row.first_name || row.email}
                      align="end"
                      trigger={<RowMenuButton label={tt("Actions for this request")} className="-mr-1.5 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />}
                      items={actions.map((a) => ({ label: ACTION_LABEL[a](), onClick: () => void act(row, a), ...(a === "cancel" ? { variant: "destructive" as const, separatorBefore: actions.length > 1 } : {}) }))}
                    />
                  ) : (
                    <span className="h-9 w-9" aria-hidden />
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{search || filter !== "all" ? tt("No requests here") : tt("No request emails yet")}</p>
            <p className="mx-auto mt-1 max-w-[440px] text-[14px] text-[#6b7280]">
              {search || filter !== "all"
                ? tt("Try another filter.")
                : tt("When someone buys, a request is scheduled here for the day you choose below. Orders from before Storelib Reviews was on are never asked.")}
            </p>
          </div>
        )}
        {list.pages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[#eef0f2] px-4 py-2.5 md:px-5">
            <p className="text-[13px] tabular-nums text-[#6b7280]">{tt("Page {page} of {pages}", { page: list.page, pages: list.pages })}</p>
            <div className="flex gap-2">
              <button type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
                {tt("Previous")}
              </button>
              <button type="button" disabled={loading || page >= list.pages} onClick={() => setPage((p) => p + 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
                {tt("Next")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {ready ? <EmailSettings settings={settings} onSaved={setSettings} /> : null}
    </div>
  )
}

/* ── Email and timing ──────────────────────────────────────────────── */

type Email = ReviewsAppSettings["email"]
type Request = ReviewsAppSettings["request"]

function EmailSettings({ settings, onSaved }: { settings: ReviewsAppSettings; onSaved: (s: ReviewsAppSettings) => void }) {
  const [request, setRequest] = React.useState<Request>(settings.request)
  const [email, setEmail] = React.useState<Email>(settings.email)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [which, setWhich] = React.useState<"first" | "reminder">("first")
  const [preview, setPreview] = React.useState<{ subject: string; fromName: string; html: string } | null>(null)
  const dirty = JSON.stringify(request) !== JSON.stringify(settings.request) || JSON.stringify(email) !== JSON.stringify(settings.email)
  const setR = (p: Partial<Request>) => {
    setSaved(false)
    setRequest((r) => ({ ...r, ...p }))
  }
  const setE = (p: Partial<Email>) => {
    setSaved(false)
    setEmail((e) => ({ ...e, ...p }))
  }

  /* The email as it would go, drawn again a moment after typing stops. */
  React.useEffect(() => {
    let live = true
    const t = window.setTimeout(async () => {
      const res = await fetch("/api/app/reviews/requests/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, request, reminder: which === "reminder" }), credentials: "same-origin" }).catch(() => null)
      const data = res?.ok ? await res.json().catch(() => null) : null
      if (live && data?.html) setPreview(data)
    }, 350)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [email, request, which])

  const save = async () => {
    setBusy(true)
    setError(null)
    const res = await fetch("/api/store/reviews-app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, email }), credentials: "same-origin" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return setError(data.error || tt("It could not be saved."))
    onSaved(data.settings)
    setRequest(data.settings.request)
    setEmail(data.settings.email)
    setSaved(true)
  }

  const days = (raw: string, max: number, min = 0) => {
    const n = Math.round(Number(raw))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
  }

  return (
    <section aria-labelledby="request-email" className={cn(card, "mt-3 overflow-hidden")} data-request-email="">
      <h2 id="request-email" className="border-b border-[#f1f2f4] px-4 py-3 text-[15px] font-semibold text-[#1a1a2e] sm:px-6">
        {tt("Email and timing")}
      </h2>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 px-4 py-5 sm:px-6">
          <Toggle label={tt("Review request email")} description={tt("Sent as your store, with five stars to tap. One per item bought.")} checked={request.enabled} onChange={(v) => setR({ enabled: v })} />
          <div className={cn("space-y-4", !request.enabled && "opacity-60")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tt("Downloads and courses: days after purchase")} htmlFor="rq-digital">
                <TextInput id="rq-digital" type="number" min={0} max={60} inputMode="numeric" value={String(request.digitalDays)} onChange={(e) => setR({ digitalDays: days(e.target.value, 60) })} />
              </Field>
              <Field label={tt("Shipped items: days after")} htmlFor="rq-physical">
                <div className="flex gap-2">
                  <TextInput id="rq-physical" type="number" min={0} max={60} inputMode="numeric" className="w-20" value={String(request.physicalDays)} onChange={(e) => setR({ physicalDays: days(e.target.value, 60) })} />
                  <SelectInput aria-label={tt("Counted from")} className="flex-1" value={request.physicalFrom} onChange={(v) => setR({ physicalFrom: v === "shipped" ? "shipped" : "delivered" })}>
                    <option value="delivered">{tt("delivery")}</option>
                    <option value="shipped">{tt("shipping")}</option>
                  </SelectInput>
                </div>
              </Field>
            </div>
            <Toggle label={tt("One reminder")} description={tt("Only to buyers who have not reviewed yet. Never more than one.")} checked={request.reminder} onChange={(v) => setR({ reminder: v })} />
            {request.reminder ? (
              <Field label={tt("Days after the first email")} htmlFor="rq-reminder">
                <TextInput id="rq-reminder" type="number" min={1} max={30} inputMode="numeric" className="w-24" value={String(request.reminderDays)} onChange={(e) => setR({ reminderDays: days(e.target.value, 30, 1) })} />
              </Field>
            ) : null}

            <div className="border-t border-[#f1f2f4] pt-4">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Your words")}</p>
              <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{tt("Leave a field empty to use Storelib's. {a}, {b} and {c} fill themselves in.", { a: "{first_name}", b: "{product}", c: "{store}" })}</p>
            </div>
            <Field label={tt("Sender name")} htmlFor="rq-from" hint={tt("What the inbox shows, followed by via Storelib. Empty is your store's name.")}>
              <TextInput id="rq-from" value={email.fromName} maxLength={EMAIL_COPY_LIMITS.fromName} onChange={(e) => setE({ fromName: e.target.value })} />
            </Field>
            <Field label={tt("Subject")} htmlFor="rq-subject">
              <TextInput id="rq-subject" value={email.subject} maxLength={EMAIL_COPY_LIMITS.subject} placeholder={tt("How is {name}?", { name: "{product}" })} onChange={(e) => setE({ subject: e.target.value })} />
            </Field>
            <Field label={tt("Heading")} htmlFor="rq-heading">
              <TextInput id="rq-heading" value={email.heading} maxLength={EMAIL_COPY_LIMITS.heading} onChange={(e) => setE({ heading: e.target.value })} />
            </Field>
            <Field label={tt("Message")} htmlFor="rq-body" hint={tt("A blank line starts a new paragraph.")}>
              <textarea
                id="rq-body"
                value={email.body}
                maxLength={EMAIL_COPY_LIMITS.body}
                onChange={(e) => setE({ body: e.target.value })}
                rows={4}
                className="block w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
              />
            </Field>
            <Field label={tt("Button")} htmlFor="rq-button">
              <TextInput id="rq-button" value={email.button} maxLength={EMAIL_COPY_LIMITS.button} placeholder={tt("Write a review")} onChange={(e) => setE({ button: e.target.value })} />
            </Field>
            {request.reminder ? (
              <>
                <Field label={tt("Reminder subject")} htmlFor="rq-rsubject">
                  <TextInput id="rq-rsubject" value={email.reminderSubject} maxLength={EMAIL_COPY_LIMITS.reminderSubject} onChange={(e) => setE({ reminderSubject: e.target.value })} />
                </Field>
                <Field label={tt("Reminder message")} htmlFor="rq-rbody">
                  <textarea
                    id="rq-rbody"
                    value={email.reminderBody}
                    maxLength={EMAIL_COPY_LIMITS.reminderBody}
                    onChange={(e) => setE({ reminderBody: e.target.value })}
                    rows={3}
                    className="block w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
                  />
                </Field>
              </>
            ) : null}
            <Toggle label={tt("Product picture")} description={tt("The product's picture and name at the top of the email.")} checked={email.showProduct} onChange={(v) => setE({ showProduct: v })} />
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !dirty} onClick={() => void save()} className={cn(buttonPrimary, "h-10 px-4 text-[14px]")} data-request-email-save="">
              {busy ? tt("Saving") : tt("Save")}
            </button>
            {dirty ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRequest(settings.request)
                  setEmail(settings.email)
                }}
                className={cn(buttonSecondary, "h-10 px-4 text-[14px]")}
              >
                {tt("Discard")}
              </button>
            ) : saved ? (
              <span className="text-[13px] text-[#067647]" role="status">
                {tt("Saved")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[#f1f2f4] bg-[#f8f9fa] px-4 py-5 sm:px-6 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-[#4b5563]">{tt("Preview")}</p>
            {request.reminder ? (
              <div className="flex rounded-lg bg-[#eceef1] p-0.5" role="tablist" aria-label={tt("Which email")}>
                {(["first", "reminder"] as const).map((w) => (
                  <button key={w} type="button" role="tab" aria-selected={which === w} onClick={() => setWhich(w)} className={cn("h-9 rounded-md px-2.5 text-[13px] font-medium md:h-8 md:text-[12.5px]", which === w ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#4b5563]")}>
                    {w === "first" ? tt("First email") : tt("Reminder")}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
            <div className="border-b border-[#f1f2f4] px-3.5 py-2.5 text-[13px]">
              <p className="truncate text-[#6b7280]">
                {tt("From")} <span className="font-medium text-[#1a1a2e]">{preview?.fromName ?? ""}</span>
              </p>
              <p className="mt-0.5 truncate font-semibold text-[#1a1a2e]">{preview?.subject ?? ""}</p>
            </div>
            {preview ? (
              <iframe title={tt("Email preview")} srcDoc={preview.html} sandbox="" className="block h-[560px] w-full bg-white" data-request-preview="" />
            ) : (
              <div className="flex h-[560px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#9ca3af]" aria-hidden />
              </div>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[#9ca3af]">{tt("Your newest product and the name Maya stand in for a real order.")}</p>
        </div>
      </div>
    </section>
  )
}
