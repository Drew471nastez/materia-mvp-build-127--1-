"use client"

/**
 * ===========================================================================
 *  A FORM'S RESPONSES AND INSIGHTS, AND THE WEBSITE INBOXES (round 51)
 * ===========================================================================
 * Drawn by ./forms-list.tsx (Contacts › Forms):
 *
 *   ResponsesPanel   a native form's responses, newest first, 50 at a time
 *                    (app/api/leads?form=<id>), each opening to its answers.
 *                    A response that left an email or phone has View
 *                    contact (/app/contacts/open?from=form_submission&id=),
 *                    an anonymous one does not.
 *   InsightsPanel    app/api/forms/<id>/insights: responses over 12 weeks,
 *                    where they came from, the follow up, a quiz's scores.
 *   SiteFormPanel    a form from the older website builder (site_forms),
 *                    read only, with View contact per response
 *                    (from=site_form_submission).
 *   MessagesInbox    what people wrote through a website's contact form
 *                    (site_contact_messages, the old Emails › Messages),
 *                    each opening as its own page (../message-detail).
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"
import Link from "next/link"
import { ChevronDown, Download } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { confirmForm } from "@/components/forms/form-confirm"
import { Shimmer, ShimmerBlock, ShimmerRows } from "@/components/ui/shimmer"
import { formsRequest } from "@/lib/forms/client"
import { answerText, type Answer } from "@/lib/forms/definition"
import type { FormInsights } from "@/lib/forms/insights"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, formatNumber, zoned } from "@/lib/i18n/format"
import { GUTTER, LIST_WIDTH, StatusBadge, buttonSecondary, card, iconButton } from "../../orders/order-parts"
import { ContactsHeader } from "../../contacts/contacts-header"
import type { MessageRow } from "../emails-home"

const muted = "text-[13px] text-[#6b7280]"
/* The body under the bar of a screen inside Forms: the list's own width and gutter (Coupons, Orders). */
const SCREEN = cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)

export function contactOpenHref(from: "form_submission" | "site_form_submission" | "subscriber" | "message", id: string): string {
  return `/app/contacts/open?from=${from}&id=${encodeURIComponent(id)}`
}

export function when(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }))}, ${d.toLocaleTimeString(appLocale(), zoned({ hour: "numeric", minute: "2-digit" }))}`
}

export function sourceWord(kind: string | null | undefined): string {
  switch (kind) {
    case "onepage":
      return tt("OnePage")
    case "website":
      return tt("Website")
    case "creator_page":
      return tt("Creator Page")
    default:
      return tt("Form link")
  }
}

function statusWord(status: string): string {
  switch (status) {
    case "contacted":
      return tt("Contacted")
    case "qualified":
      return tt("Qualified")
    case "converted":
      return tt("Converted")
    default:
      return tt("New")
  }
}

interface Response {
  id: string
  answers: Answer[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  submitted_at: string
  status: string
  source_kind: string
  score: number
}

/** Somebody left a way to reach them: the response belongs to a person. */
export function identifiable(r: { contact_email?: string | null; contact_phone?: string | null }): boolean {
  return Boolean((r.contact_email && r.contact_email.trim()) || (r.contact_phone && r.contact_phone.trim()))
}

function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      {detail ? <p className="mt-1 max-w-[380px] text-[13px] text-[#6b7280]">{detail}</p> : null}
    </div>
  )
}

function AnswerList({ answers }: { answers: { label: string; value: string }[] }) {
  if (!answers.length) return <p className={muted}>{tt("No answers")}</p>
  return (
    <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
      {answers.map((a, i) => (
        <React.Fragment key={`${a.label}-${i}`}>
          <dt className="text-[#6b7280]">{a.label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-[#1a1a2e]">{a.value || "–"}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** A response's follow up, as a badge's tone: new wants attention, converted is done. */
function statusTone(status: string): "attention" | "success" | "neutral" {
  return status === "new" ? "attention" : status === "converted" ? "success" : "neutral"
}

const FOLLOW_UP = ["new", "contacted", "qualified", "converted"] as const

/*
  WAVE 8, A TAB IS THERE WHEN IT IS PRESSED (the owner: "switching must be
  smooth and clean, no flash, no blank"). A form's first page of responses
  and its insights are kept for the tab, per form, and read ahead the moment
  the form opens (./forms-list mounts both panels behind Edit), so pressing
  Responses or Insights shows them at once; a kept answer is shown and read
  again quietly behind it. Only a form opened straight onto one of them
  waits, behind a skeleton the shape of what is coming.
*/
type ResponsesPage = { leads: Response[]; next: string | null }
const responsesKept = new Map<string, ResponsesPage>()
const insightsKept = new Map<string, FormInsights>()

/**
 * A FORM'S RESPONSES (wave 7, the owner: "smoother, cleaner"). One card, as
 * the Orders and People lists: a toolbar (how many, Export CSV), then the
 * responses as a table from 640px (who, sent, from, follow up) and as
 * stacked rows on a phone. Who answered is a link to their contact profile
 * (/app/contacts/open?from=form_submission, which checks the store owns the
 * response); an anonymous response says so. The follow up (New, Contacted,
 * Qualified, Converted) changes in place from the badge (PATCH
 * /api/leads/<id>, the owner's own rows only), which is how a lead becomes
 * a customer here. A row opens to its answers, View contact and Delete.
 */
export function ResponsesPanel({ formId, quiz, focus = null, onCount }: { formId: string; quiz: boolean; focus?: string | null; onCount?: (by: number) => void }) {
  const kept = responsesKept.get(formId)
  const [rows, setRows] = React.useState<Response[]>(kept?.leads ?? [])
  const [next, setNext] = React.useState<string | null>(kept?.next ?? null)
  const [loading, setLoading] = React.useState(!kept)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(focus)

  const load = React.useCallback(
    async (before: string | null) => {
      setLoading(true)
      setError(null)
      const q = new URLSearchParams({ form: formId })
      if (before) q.set("before", before)
      const r = await formsRequest<{ leads: Response[]; next: string | null }>(`/api/leads?${q}`, { fallback: tt("Responses could not be loaded. Try again.") })
      setLoading(false)
      if (r.error) return setError(r.error)
      const page = r.data?.leads ?? []
      if (!before) responsesKept.set(formId, { leads: page, next: r.data?.next ?? null })
      setRows((all) => (before ? [...all, ...page] : page))
      setNext(r.data?.next ?? null)
      /* A response named by the address (?response=) that is not on the first page: read it alone, at the top. */
      if (!before && focus && !page.some((x) => x.id === focus)) {
        const one = await formsRequest<{ leads: Response[] }>(`/api/leads?form=${encodeURIComponent(formId)}&lead=${encodeURIComponent(focus)}`)
        const found = one.data?.leads?.[0]
        if (found) setRows((all) => [found, ...all.filter((x) => x.id !== found.id)])
      }
    },
    [formId, focus],
  )
  React.useEffect(() => {
    void load(null)
  }, [load])
  /* What is on screen is what the next visit shows first (a follow up changed, a response deleted). */
  React.useEffect(() => {
    const k = responsesKept.get(formId)
    if (k && !loading) responsesKept.set(formId, { leads: rows.slice(0, k.leads.length), next: k.next })
  }, [rows, formId, loading])
  /* The response the address names, opened and in view. */
  React.useEffect(() => {
    if (!focus || !rows.some((r) => r.id === focus)) return
    document.querySelector(`[data-response-row="${focus}"]`)?.scrollIntoView({ block: "center" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, rows.length])

  const setStatus = async (r: Response, status: string) => {
    if (status === r.status) return
    const was = r.status
    setRows((all) => all.map((x) => (x.id === r.id ? { ...x, status } : x)))
    const res = await formsRequest(`/api/leads/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ status }), fallback: tt("Not changed. Try again.") })
    if (res.error) {
      setRows((all) => all.map((x) => (x.id === r.id ? { ...x, status: was } : x)))
      setError(res.error)
    }
  }
  const remove = async (r: Response) => {
    const yes = await confirmForm({ title: tt("Delete this response?"), body: tt("Its answers and any files sent with it are deleted. The person stays in your contacts if they are there for anything else."), confirm: tt("Delete"), cancel: tt("Cancel") })
    if (yes !== true) return
    const res = await formsRequest(`/api/leads/${encodeURIComponent(r.id)}`, { method: "DELETE", fallback: tt("The response was not deleted. Try again.") })
    if (res.error) return setError(res.error)
    setRows((all) => all.filter((x) => x.id !== r.id))
    onCount?.(-1)
  }

  const statusMenu = (r: Response, extra?: string) => (
    <ResponsiveActionMenu
      title={tt("Follow up")}
      align="end"
      trigger={
        <button type="button" className={cn("inline-flex min-h-8 items-center gap-1 rounded-lg px-1 outline-none hover:bg-[#f1f2f4] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] max-md:min-h-11", extra)} aria-label={tt("Follow up: {status}", { status: statusWord(r.status) })} data-response-status={r.status} onClick={(e) => e.stopPropagation()}>
          <StatusBadge tone={statusTone(r.status)}>{statusWord(r.status)}</StatusBadge>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 text-[#9ca3af]" />
        </button>
      }
      items={FOLLOW_UP.map((k) => ({ label: statusWord(k), onClick: () => void setStatus(r, k), disabled: k === r.status }))}
    />
  )

  const count = rows.length
  return (
    <section className={cn(card, "overflow-hidden")} aria-label={tt("Responses")} data-form-responses={formId}>
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[#eef0f2] py-2 pl-4 pr-2.5">
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">
          {tt("Responses")}
          {count ? <span className="ml-1.5 font-normal tabular-nums text-[#9ca3af]">{formatNumber(count)}{next ? "+" : ""}</span> : null}
        </h2>
        <a className={cn(buttonSecondary, "max-md:h-10 max-md:rounded-xl max-md:text-[14px]")} href={`/api/leads/export?form=${encodeURIComponent(formId)}`} data-responses-export="">
          <Download aria-hidden className="h-4 w-4" />
          {tt("Export CSV")}
        </a>
      </div>
      {loading && !rows.length ? (
        <ShimmerRows rows={4} header={false} cols={["40%", "20%", "14%"]} label={tt("Loading")} />
      ) : error && !rows.length ? (
        <Empty title={tt("Responses did not load")} detail={error} />
      ) : !rows.length ? (
        <Empty title={tt("No responses yet")} detail={tt("Responses show here as soon as someone sends the form.")} />
      ) : (
        <>
          <div className="hidden h-9 items-center gap-3 bg-[#f7f7f8] pl-4 pr-12 text-[12px] font-medium text-[#4b5563] sm:flex" aria-hidden>
            <span className="min-w-0 flex-1">{tt("Person")}</span>
            <span className="w-[136px] shrink-0">{tt("Sent")}</span>
            <span className="w-[112px] shrink-0 max-md:hidden">{tt("From")}</span>
            <span className="w-[132px] shrink-0">{tt("Follow up")}</span>
          </div>
          <ul className="divide-y divide-[#f1f2f4]">
            {rows.map((r) => {
              const open = openId === r.id
              const who = r.contact_name || displayEmail(r.contact_email) || r.contact_phone
              const sub = r.contact_name ? displayEmail(r.contact_email) || r.contact_phone : null
              const href = identifiable(r) ? contactOpenHref("form_submission", r.id) : null
              const toggle = () => setOpenId(open ? null : r.id)
              return (
                <li key={r.id} data-response-row={r.id} className={cn(open && "bg-[#fcfcfd]")}>
                  <div
                    className="flex min-h-[60px] cursor-pointer items-center gap-3 py-2 pl-4 pr-1.5 hover:bg-[#fafbfb] max-sm:min-h-[68px]"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return
                      toggle()
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      {href ? (
                        <Link href={href} className="block truncate text-[14px] font-medium text-[#1a1a2e] hover:underline max-sm:text-[15px]" data-response-person="">
                          {who}
                        </Link>
                      ) : (
                        <span className="block truncate text-[14px] font-medium text-[#6b7280] max-sm:text-[15px]">{who || tt("Anonymous response")}</span>
                      )}
                      <span className="block truncate text-[13px] text-[#6b7280]">
                        <span className="sm:hidden">
                          {[when(r.submitted_at), sourceWord(r.source_kind), quiz ? tt("Score {n}", { n: r.score }) : null].filter(Boolean).join(" · ")}
                        </span>
                        <span className="max-sm:hidden">{[sub, quiz ? tt("Score {n}", { n: r.score }) : null].filter(Boolean).join(" · ") || "\u00a0"}</span>
                      </span>
                    </div>
                    <span className="w-[136px] shrink-0 truncate text-[13px] text-[#4b5563] max-sm:hidden">{when(r.submitted_at)}</span>
                    <span className="w-[112px] shrink-0 truncate text-[13px] text-[#4b5563] max-md:hidden">{sourceWord(r.source_kind)}</span>
                    <span className="shrink-0 sm:w-[132px]">{statusMenu(r, "-ml-1")}</span>
                    <button type="button" className={cn(iconButton, "h-9 w-9 shrink-0 max-md:h-11 max-md:w-11")} aria-expanded={open} aria-label={open ? tt("Hide answers") : tt("Show answers")} onClick={toggle}>
                      <ChevronDown aria-hidden className={cn("h-4 w-4 text-[#9ca3af] transition-transform duration-150", open && "rotate-180")} />
                    </button>
                  </div>
                  {open ? (
                    <div className="space-y-4 px-4 pb-4 pt-1" data-response-answers="">
                      <div className="rounded-xl border border-[#eef0f2] bg-white p-3.5">
                        <AnswerList answers={(r.answers ?? []).map((a) => ({ label: a.label, value: a.file ? a.file.name : answerText(a) }))} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {href ? (
                          <Link className={cn(buttonSecondary, "max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]")} href={href} data-view-contact="">
                            {tt("View contact")}
                          </Link>
                        ) : (
                          <p className={muted}>{tt("Sent without contact details.")}</p>
                        )}
                        <button type="button" className="ml-auto inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-[#b42318] hover:bg-[#fef3f2] max-md:h-11 max-md:text-[15px]" onClick={() => void remove(r)} data-response-delete="">
                          {tt("Delete response")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {next ? (
        <div className="border-t border-[#f1f2f4] px-4 py-3">
          <button type="button" className={buttonSecondary} disabled={loading} onClick={() => void load(next)}>
            {loading ? tt("Loading") : tt("Show more")}
          </button>
        </div>
      ) : null}
      {error && rows.length ? (
        <p role="alert" className="px-4 pb-3 text-[13px] font-medium text-[#b42318]">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function Bars({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const top = Math.max(1, ...items.map((i) => i.count))
  const total = items.reduce((a, i) => a + i.count, 0) || 1
  return (
    <ul className="space-y-3" aria-label={label}>
      {items.map((i) => (
        <li key={i.label} className="text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[#1a1a2e]">{i.label}</span>
            <span className="shrink-0 tabular-nums text-[#6b7280]">
              <span className="font-medium text-[#1a1a2e]">{formatNumber(i.count)}</span> · {Math.round((i.count / total) * 100)}%
            </span>
          </div>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
            <span className="block h-full rounded-full bg-[#8b5cf6]" style={{ width: `${Math.round((i.count / top) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A FORM'S INSIGHTS (wave 7): the numbers first, in one strip of stat cells
 * as the Orders page draws its own (responses, the last 30 days, how many
 * left a way to reach them, how many were converted), then the weeks as a
 * chart with its scale, then where responses came from and how far the
 * follow up got, each with its share. app/api/forms/<id>/insights.
 */
export function InsightsPanel({ formId }: { formId: string }) {
  const [data, setData] = React.useState<FormInsights | null>(() => insightsKept.get(formId) ?? null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    void formsRequest<{ insights: FormInsights }>(`/api/forms/${formId}/insights`, { fallback: tt("Insights could not be loaded. Try again.") }).then((r) => {
      if (!live) return
      if (r.error || !r.data) {
        if (!insightsKept.has(formId)) setError(r.error || tt("Insights could not be loaded. Try again."))
      } else {
        insightsKept.set(formId, r.data.insights)
        setData(r.data.insights)
      }
    })
    return () => {
      live = false
    }
  }, [formId])
  if (error) return <section className={card}><Empty title={tt("Insights did not load")} detail={error} /></section>
  if (!data) return <InsightsSkeleton />
  if (!data.total) return <section className={card}><Empty title={tt("No responses yet")} detail={tt("Insights show once the form has responses.")} /></section>
  const weekTop = Math.max(1, ...data.weeks.map((w) => w.count))
  const box = cn(card, "p-4 sm:p-5")
  const pct = (n: number) => `${Math.round((n / Math.max(1, data.total)) * 100)}%`
  const converted = data.statuses.converted ?? 0
  const stats = [
    { label: tt("Responses"), value: formatNumber(data.total), note: null },
    { label: tt("Last 30 days"), value: formatNumber(data.last30), note: null },
    { label: tt("Left contact details"), value: formatNumber(data.identified), note: pct(data.identified) },
    { label: tt("Converted"), value: formatNumber(converted), note: pct(converted) },
  ]
  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(appLocale(), { month: "short", day: "numeric", timeZone: "UTC" })
  }
  return (
    <div className="space-y-3" data-form-insights={formId}>
      <section className={cn(card, "grid grid-cols-2 overflow-hidden md:grid-cols-4")} aria-label={tt("Summary")} data-insights-stats="">
        {stats.map((f, i) => (
          <div key={f.label} className={cn("min-w-0 px-4 py-3.5 sm:px-5", i % 2 === 1 && "border-l border-[#eef0f2]", i >= 2 && "max-md:border-t max-md:border-[#eef0f2]", i === 2 && "md:border-l md:border-[#eef0f2]")}>
            <p className="truncate text-[12.5px] text-[#6b7280]">{f.label}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{f.value}</span>
              {f.note ? <span className="text-[12.5px] tabular-nums text-[#6b7280]">{f.note}</span> : null}
            </p>
          </div>
        ))}
      </section>
      <section className={box}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Responses per week")}</h2>
          <span className="text-[12.5px] text-[#6b7280]">{tt("The last 12 weeks.")}</span>
        </div>
        <div className="mt-4 flex h-[120px] items-end gap-1.5 border-b border-[#eef0f2] sm:gap-2" role="img" aria-label={tt("Responses per week, last 12 weeks")}>
          {data.weeks.map((w) => (
            <span key={w.start} title={`${day(w.start)}: ${w.count}`} className="relative flex h-full flex-1 items-end">
              <span className={cn("block w-full rounded-t-[4px]", w.count ? "bg-[#8b5cf6]" : "bg-[#eceef1]")} style={{ height: `${Math.max(3, Math.round((w.count / weekTop) * 100))}%` }} />
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] tabular-nums text-[#9ca3af]">
          <span>{data.weeks[0] ? day(data.weeks[0].start) : ""}</span>
          <span>{tt("Most in a week: {n}", { n: formatNumber(weekTop) })}</span>
          <span>{data.weeks.length ? day(data.weeks[data.weeks.length - 1].start) : ""}</span>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        <section className={box}>
          <h2 className="mb-3.5 text-[14px] font-semibold text-[#1a1a2e]">{tt("Where responses came from")}</h2>
          <Bars label={tt("Where responses came from")} items={Object.entries(data.sources).map(([k, n]) => ({ label: sourceWord(k), count: n }))} />
        </section>
        <section className={box}>
          <h2 className="mb-3.5 text-[14px] font-semibold text-[#1a1a2e]">{tt("Follow up")}</h2>
          <Bars label={tt("Follow up")} items={["new", "contacted", "qualified", "converted"].map((k) => ({ label: statusWord(k), count: data.statuses[k] ?? 0 }))} />
        </section>
      </div>
      {data.scores ? (
        <section className={box}>
          <h2 className="mb-3.5 text-[14px] font-semibold text-[#1a1a2e]">{tt("Quiz scores")}</h2>
          <Bars label={tt("Quiz scores")} items={data.scores.map((s) => ({ label: s.label, count: s.count }))} />
        </section>
      ) : null}
      <p className={cn(muted, "px-1")}>
        {tt("Storelib counts responses that were sent. Visits that did not send the form are not recorded.")}
        {data.capped ? ` ${tt("Figures cover the newest 5,000 responses.")}` : ""}
      </p>
    </div>
  )
}

/** Insights on their way: the stat strip and the weeks' chart, in their own room (components/ui/shimmer). */
function InsightsSkeleton() {
  return (
    <Shimmer className="space-y-3" label={tt("Loading")}>
      <section className={cn(card, "grid grid-cols-2 overflow-hidden md:grid-cols-4")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("px-4 py-3.5 sm:px-5", i % 2 === 1 && "border-l border-[#eef0f2]", i >= 2 && "max-md:border-t max-md:border-[#eef0f2]", i === 2 && "md:border-l md:border-[#eef0f2]")}>
            <ShimmerBlock className="h-3 w-20" />
            <ShimmerBlock className="mt-2.5 h-5 w-12" />
          </div>
        ))}
      </section>
      <section className={cn(card, "p-4 sm:p-5")}>
        <ShimmerBlock className="h-3.5 w-36" />
        <ShimmerBlock className="mt-4 h-[120px] w-full rounded-lg" />
        <ShimmerBlock className="mt-2 h-3 w-full max-w-[60%]" />
      </section>
    </Shimmer>
  )
}

interface SiteFormAnswer {
  form: { id: string; name: string; site_name: string | null }
  responses: { id: string; fields: Record<string, unknown>; created_at: string }[]
}

export function SiteFormPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = React.useState<SiteFormAnswer | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    void formsRequest<SiteFormAnswer>(`/api/forms/site/${id}`, { fallback: tt("This form could not be loaded. Try again.") }).then((r) => {
      if (!live) return
      if (r.error || !r.data) setError(r.error || tt("This form could not be loaded. Try again."))
      else setData(r.data)
    })
    return () => {
      live = false
    }
  }, [id])
  const text = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
  const hasContact = (f: Record<string, unknown>) => Object.keys(f).some((k) => /e-?mail|phone/i.test(k) && text(f[k]).trim())
  return (
    <>
      {/* One bar, the Forms list's own (Back to Forms, the form's name), not a second header under it. */}
      <ContactsHeader title={data?.form.name || tt("Website form")} onBack={onBack} />
      <div className={SCREEN} data-site-form={id}>
        {data?.form.site_name ? <p className={cn(muted, "mt-1")}>{tt("Website: {name}", { name: data.form.site_name })}</p> : null}
        <section className={cn(card, "mt-3 overflow-hidden")} aria-label={tt("Responses")}>
          {error ? (
            <Empty title={tt("This form did not load")} detail={error} />
          ) : !data ? (
            <ShimmerRows rows={3} header={false} cols={["40%", "20%"]} label={tt("Loading")} />
          ) : !data.responses.length ? (
            <Empty title={tt("No responses yet")} />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
              {data.responses.map((r) => {
                const open = openId === r.id
                const entries = Object.entries(r.fields)
                const who = entries.find(([k]) => /name/i.test(k))?.[1] ?? entries.find(([k]) => /e-?mail/i.test(k))?.[1]
                return (
                  <li key={r.id}>
                    <button type="button" className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafbfb]" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{text(who) || tt("Anonymous response")}</span>
                        <span className="block truncate text-[13px] text-[#6b7280]">{when(r.created_at)}</span>
                      </span>
                      <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", open && "rotate-180")} />
                    </button>
                    {open ? (
                      <div className="space-y-3 px-4 pb-4">
                        <AnswerList answers={entries.map(([k, v]) => ({ label: k, value: text(v) }))} />
                        {hasContact(r.fields) ? (
                          <a className={buttonSecondary + " inline-flex"} href={contactOpenHref("site_form_submission", r.id)} data-view-contact="">
                            {tt("View contact")}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

/** The website contact form's inbox: the old Emails › Messages list, newest first, new ones in bold. */
export function MessagesInbox({ rows, onOpen, onBack }: { rows: MessageRow[]; onOpen: (m: MessageRow) => void; onBack: () => void }) {
  return (
    <>
      <ContactsHeader title={tt("Website contact form")} onBack={onBack} />
      <div className={SCREEN} data-messages-inbox="">
        <section className={cn(card, "mt-3 overflow-hidden")} aria-label={tt("Messages")}>
          {!rows.length ? (
            <Empty title={tt("No messages yet")} detail={tt("What people send through the contact form on your websites shows here.")} />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
              {rows.map((m) => (
                <li key={m.id}>
                  <button type="button" className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafbfb]" onClick={() => onOpen(m)} data-message-row={m.id}>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", m.read_at ? "bg-transparent" : "bg-[#8b5cf6]")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[14px] text-[#1a1a2e]", m.read_at ? "font-medium" : "font-semibold")}>{m.name || displayEmail(m.email)}</span>
                      <span className="block truncate text-[13px] text-[#6b7280]">{m.subject || m.message}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-[#6b7280]">{when(m.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
