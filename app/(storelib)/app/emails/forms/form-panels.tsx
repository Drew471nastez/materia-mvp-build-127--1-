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
import * as React from "react"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { ShimmerRows } from "@/components/ui/shimmer"
import { TrendMiniChart } from "@/components/analytics/trend-mini-chart"
import { formsRequest } from "@/lib/forms/client"
import { answerText, type Answer } from "@/lib/forms/definition"
import type { FormInsights } from "@/lib/forms/insights"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, formatNumber, zoned } from "@/lib/i18n/format"
import { StatusBadge, buttonSecondary, card, iconButton } from "../../orders/order-parts"
import type { MessageRow } from "../emails-home"

const muted = "text-[13px] text-[#6b7280]"
const NO_COMPARE: number[] = []

export function contactOpenHref(from: "form_submission" | "site_form_submission" | "subscriber", id: string): string {
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

export function ResponsesPanel({ formId, quiz, focus = null }: { formId: string; quiz: boolean; focus?: string | null }) {
  const [rows, setRows] = React.useState<Response[]>([])
  const [next, setNext] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
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

  return (
    <section className={cn(card, "overflow-hidden")} aria-label={tt("Responses")} data-form-responses={formId}>
      <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3">
        {/* The tab above already says Responses (round 52): the bar says the order and holds the export. */}
        <p className="text-[13px] text-[#6b7280]">{tt("Newest first")}</p>
        <a className={buttonSecondary} href={`/api/leads/export?form=${encodeURIComponent(formId)}`} data-responses-export="">
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
        <ul className="divide-y divide-[#f1f2f4]">
          {rows.map((r) => {
            const open = openId === r.id
            const who = r.contact_name || r.contact_email || r.contact_phone
            return (
              <li key={r.id} data-response-row={r.id}>
                <button type="button" className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafbfb]" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{who || tt("Anonymous response")}</span>
                    <span className="block truncate text-[13px] text-[#6b7280]">
                      {when(r.submitted_at)} · {sourceWord(r.source_kind)}
                      {quiz ? ` · ${tt("Score {n}", { n: r.score })}` : ""}
                    </span>
                  </span>
                  <StatusBadge tone={r.status === "new" ? "attention" : "neutral"}>{statusWord(r.status)}</StatusBadge>
                  <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", open && "rotate-180")} />
                </button>
                {open ? (
                  <div className="space-y-3 px-4 pb-4" data-response-answers="">
                    <AnswerList answers={(r.answers ?? []).map((a) => ({ label: a.label, value: a.file ? a.file.name : answerText(a) }))} />
                    {identifiable(r) ? (
                      <a className={buttonSecondary + " inline-flex"} href={contactOpenHref("form_submission", r.id)} data-view-contact="">
                        {tt("View contact")}
                      </a>
                    ) : (
                      <p className={muted}>{tt("Sent without contact details.")}</p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
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

/**
 * A breakdown, drawn as Analytics draws its top rows (app/(storelib)/app/
 * analytics/analytics-reports.tsx Trend): the name and the figure on one
 * line, a thin grey bar under them for its share (round 52; it was a black
 * bar on a track, a style no other page used).
 */
const ROW_FILL = "bg-[linear-gradient(180deg,#e8eaee_0%,#dcdfe4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(16,24,40,0.04)]"
function Bars({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const top = Math.max(1, ...items.map((i) => i.count))
  return (
    <ol className="flex flex-col gap-2" aria-label={label}>
      {items.map((i) => (
        <li key={i.label} className="min-w-0">
          <div className="flex h-[18px] items-baseline gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate text-[#303036]">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{formatNumber(i.count)}</span>
          </div>
          <div aria-hidden className={cn(ROW_FILL, "mt-0.5 h-1 rounded-full")} style={{ width: `${Math.max(2, Math.round((i.count / top) * 100))}%` }} />
        </li>
      ))}
    </ol>
  )
}

/** "Oct 21", for a week's first day (YYYY-MM-DD), the bucket names Analytics' charts read. */
function weekLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(appLocale(), { month: "short", day: "numeric", timeZone: "UTC" })
}

export function InsightsPanel({ formId }: { formId: string }) {
  const [data, setData] = React.useState<FormInsights | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    void formsRequest<{ insights: FormInsights }>(`/api/forms/${formId}/insights`, { fallback: tt("Insights could not be loaded. Try again.") }).then((r) => {
      if (!live) return
      if (r.error || !r.data) setError(r.error || tt("Insights could not be loaded. Try again."))
      else setData(r.data.insights)
    })
    return () => {
      live = false
    }
  }, [formId])
  if (error) return <section className={card}><Empty title={tt("Insights did not load")} detail={error} /></section>
  if (!data) return <section className={card}><ShimmerRows rows={3} header={false} cols={["30%", "50%"]} label={tt("Loading")} /></section>
  if (!data.total) return <section className={card}><Empty title={tt("No responses yet")} detail={tt("Insights show once the form has responses.")} /></section>
  const box = cn(card, "p-4 sm:p-5")
  return (
    <div className="space-y-4" data-form-insights={formId}>
      {/* The figures in one strip, as Emails and Orders draw theirs. */}
      <section className={cn(card, "flex overflow-hidden")} aria-label={tt("Responses")}>
        {[
          { label: tt("Responses"), value: data.total },
          { label: tt("Last 30 days"), value: data.last30 },
          { label: tt("Left contact details"), value: data.identified },
        ].map((f, i) => (
          <div key={f.label} className={cn("min-w-0 flex-1 px-4 py-3", i > 0 && "border-l border-[#eef0f2]")}>
            <p className="truncate text-[12px] font-medium text-[#4b5563]">{f.label}</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{formatNumber(f.value)}</p>
          </div>
        ))}
      </section>
      {/* Analytics' own trend chart (components/analytics/trend-mini-chart): its line, its hover readout. */}
      <section className={box} data-insights-weeks="">
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Responses per week")}</h2>
        <p className={muted}>{tt("The last 12 weeks.")}</p>
        <div className="mt-4">
          <TrendMiniChart labels={data.weeks.map((w) => weekLabel(w.start))} current={data.weeks.map((w) => w.count)} previous={NO_COMPARE} format={(n) => formatNumber(n)} height={120} label={tt("Responses")} />
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={box}>
          <h2 className="mb-3 text-[14px] font-semibold text-[#1a1a2e]">{tt("Where responses came from")}</h2>
          <Bars label={tt("Where responses came from")} items={Object.entries(data.sources).map(([k, n]) => ({ label: sourceWord(k), count: n }))} />
        </section>
        <section className={box}>
          <h2 className="mb-3 text-[14px] font-semibold text-[#1a1a2e]">{tt("Follow up")}</h2>
          <Bars label={tt("Follow up")} items={["new", "contacted", "qualified", "converted"].map((k) => ({ label: statusWord(k), count: data.statuses[k] ?? 0 }))} />
        </section>
      </div>
      {data.scores ? (
        <section className={box}>
          <h2 className="mb-3 text-[14px] font-semibold text-[#1a1a2e]">{tt("Quiz scores")}</h2>
          <Bars label={tt("Quiz scores")} items={data.scores.map((s) => ({ label: s.label, count: s.count }))} />
        </section>
      ) : null}
      <p className={muted}>
        {tt("Storelib counts responses that were sent. Visits that did not send the form are not recorded.")}
        {data.capped ? ` ${tt("Figures cover the newest 5,000 responses.")}` : ""}
      </p>
    </div>
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
    <div data-site-form={id}>
      <header className="flex min-h-[48px] items-center gap-1.5">
        <button type="button" onClick={onBack} className={cn(iconButton, "-ml-1.5 h-9 w-9")} aria-label={tt("Back to forms")}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-bold text-[#1a1a2e]">{data?.form.name || tt("Website form")}</h2>
          {data?.form.site_name ? <p className={muted}>{tt("Website: {name}", { name: data.form.site_name })}</p> : null}
        </div>
      </header>
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
  )
}

/** The website contact form's inbox: the old Emails › Messages list, newest first, new ones in bold. */
export function MessagesInbox({ rows, onOpen, onBack }: { rows: MessageRow[]; onOpen: (m: MessageRow) => void; onBack: () => void }) {
  return (
    <div data-messages-inbox="">
      <header className="flex min-h-[48px] items-center gap-1.5">
        <button type="button" onClick={onBack} className={cn(iconButton, "-ml-1.5 h-9 w-9")} aria-label={tt("Back to forms")}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <h2 className="truncate text-[20px] font-bold text-[#1a1a2e]">{tt("Website contact form")}</h2>
      </header>
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
                    <span className={cn("block truncate text-[14px] text-[#1a1a2e]", m.read_at ? "font-medium" : "font-semibold")}>{m.name || m.email}</span>
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
  )
}
