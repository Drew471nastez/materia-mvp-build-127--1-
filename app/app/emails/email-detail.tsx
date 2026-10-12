"use client"

/**
 * ===========================================================================
 *  ONE EMAIL, OPENED OVER THE LIST
 * ===========================================================================
 * What a creator looks for, in that order: did it go out and to whom, how
 * many opened and clicked, which links, and the email itself as the reader
 * got it. Drawn the way an order is (app/app/orders/order-detail.tsx): the
 * bar with back, the subject, its status and what can be done now, on the
 * first frame. It comes in and goes back as one layer, with Orders' own move
 * (app/app/orders/order-motion.ts, run by ./emails-client.tsx), so nothing
 * inside it animates on its own; the list under it was never unmounted.
 *
 * Every number is read from the send's own rows by
 * app/api/email/campaigns/[id]/report, which checks the email is this
 * creator's. The email is the HTML that went out, in a sandboxed frame with
 * scripts off (components/email/compose/email-preview.tsx).
 */

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, Copy, ExternalLink, MoreHorizontal, Send, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { HelpLabel } from "@/components/app/help-label"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { EmailPreview, type PreviewMode } from "@/components/email/compose/email-preview"
import { ComposeDialog } from "@/components/email/compose/ui"
import { useCached, refresh } from "@/components/email/emails-cache"
import { STATUS_LABEL, readStatus, type CampaignStatus } from "@/lib/email-campaigns/state"
import { cn } from "@/lib/utils"
import { GUTTER, ORDER_WIDTH, OrderBarFrame, StatusBadge, buttonPrimary, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { loadReport, reportKey, type EmailReport } from "./emails-data"
import { tt, ttx } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

export interface EmailSeed {
  id: string
  subject: string
  status?: string
  sent_at?: string | null
  scheduled_at?: string | null
}

export type EmailAction = "unschedule" | "stop" | "retry" | "duplicate" | "delete" | "test"

const AUDIENCE: Record<string, string> = {
  get all() { return tt("All subscribers") },
  get subscribers() { return tt("All subscribers") },
  get last_24h() { return tt("Joined in the last 24 hours") },
  get last_7days() { return tt("Joined in the last 7 days") },
  get last_30days() { return tt("Joined in the last 30 days") },
  get last_90days() { return tt("Joined in the last 90 days") },
  get onepage() { return tt("Joined on your OnePage") },
  get store_builder() { return tt("Joined on your website") },
  get segment() { return tt("A segment") },
}

function when(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" }))
}

const n = (v: number) => Math.round(v).toLocaleString(appLocale())
function pct(part: number, whole: number): string {
  if (!whole) return ""
  return `${Math.round((part / whole) * 1000) / 10}%`
}

export function statusTone(s: CampaignStatus): "neutral" | "attention" | "critical" | "success" {
  if (s === "failed" || s === "partially_failed") return "critical"
  if (s === "queued" || s === "sending" || s === "scheduled") return "attention"
  if (s === "sent") return "success"
  return "neutral"
}

export function EmailDetail({
  seed,
  onBack,
  onAction,
  onNotice,
}: {
  seed: EmailSeed
  onBack: () => void
  /** Runs an action on the server and answers with the words to show. */
  onAction: (id: string, action: EmailAction) => Promise<string | null>
  onNotice: (message: string) => void
}) {
  const router = useRouter()
  const { data: report, error } = useCached<EmailReport>(reportKey(seed.id), () => loadReport(seed.id))
  const c = report?.campaign
  const status = readStatus(c?.status ?? seed.status)
  const subject = (c?.subject ?? seed.subject ?? "").replace(/\s*\(Resend\)\s*$/, "") || (report ? tt("Untitled") : "")
  const [busy, setBusy] = React.useState<EmailAction | null>(null)
  const [dialog, setDialog] = React.useState<null | "delete" | "test">(null)
  /* A computer sees the email at its own 600px, scaled to the column; a phone sees it life size. */
  const [mode, setMode] = React.useState<PreviewMode>(() => (typeof window !== "undefined" && window.innerWidth >= 1024 ? "desktop" : "mobile"))
  const running = status === "queued" || status === "sending"

  /* While it sends, the numbers are read again every few seconds. */
  React.useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => refresh(reportKey(seed.id)), 3000)
    return () => window.clearInterval(t)
  }, [running, seed.id])

  /* Escape goes back, as on an order. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialog) return
      if (document.querySelector("[role=dialog], [role=menu]")) return
      onBack()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onBack, dialog])

  const run = async (action: EmailAction) => {
    if (busy) return
    setBusy(action)
    try {
      const message = await onAction(seed.id, action)
      if (message) onNotice(message)
      refresh(reportKey(seed.id))
    } finally {
      setBusy(null)
    }
  }

  const editHref = `/app/emails/edit/${seed.id}`
  const failed = report?.stats?.failed ?? 0
  const items: ActionMenuItem[] = [
    { label: tt("Send a test to yourself"), icon: <Send className="h-4 w-4" />, onClick: () => setDialog("test") },
    ...(status === "sent" || status === "partially_failed" || status === "failed" || status === "cancelled" || running
      ? []
      : [{ label: tt("Duplicate"), icon: <Copy className="h-4 w-4" />, onClick: () => void run("duplicate") }]),
    ...(failed > 0 && !running && (status === "partially_failed" || status === "failed")
      ? [{ label: tt("Send again to the {failed} not sent", { failed: n(failed) }), icon: <Send className="h-4 w-4" />, onClick: () => void run("retry") }]
      : []),
    ...(running ? [] : [{ label: tt("Delete"), icon: <Trash2 className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setDialog("delete") }]),
  ]

  const primary =
    status === "draft" || status === "scheduled" ? (
      <Link href={editHref} prefetch className={buttonPrimary} onMouseEnter={() => router.prefetch(editHref)}>
        {tt("Edit")}
      </Link>
    ) : running ? (
      <button type="button" className={cn(buttonSecondary, "text-[#b42318]")} disabled={busy !== null} onClick={() => void run("stop")}>
        {busy === "stop" ? tt("Stopping") : tt("Stop sending")}
      </button>
    ) : (
      <button type="button" className={buttonPrimary} disabled={busy !== null} onClick={() => void run("duplicate")}>
        {busy === "duplicate" ? tt("Copying") : tt("Duplicate")}
      </button>
    )

  const audience = c ? AUDIENCE[c.audience_type] ?? tt("All subscribers") : ""
  const subtitle =
    status === "scheduled"
      ? tt("Goes out {date}{value}", { date: when(c?.scheduled_at ?? seed.scheduled_at), value: audience ? tt(" to {value}", { value: audience.toLowerCase() }) : "" })
      : status === "draft"
        ? tt("Draft{value}", { value: c?.updated_at ? tt(", edited {date}", { date: when(c.updated_at) }) : "" })
        : `${running ? tt("Started") : tt("Sent")} ${when(c?.sent_at ?? seed.sent_at)}${audience ? tt(" to {value}", { value: audience.toLowerCase() }) : ""}`

  return (
    <>
      <OrderBarFrame
        back={
          <button type="button" onClick={onBack} aria-label={tt("Back to emails")} className={cn(iconButton, "h-9 w-9")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        title={
          <>
            <h1 className="line-clamp-2 min-w-0 max-w-full break-words text-[18px] font-bold leading-6 text-[#1a1a2e] sm:line-clamp-1 sm:text-[20px] sm:leading-7">{subject}</h1>
            <StatusBadge tone={statusTone(status)}>{STATUS_LABEL[status]}</StatusBadge>
          </>
        }
        actions={
          <>
            {status === "scheduled" ? (
              <button type="button" className={cn(buttonSecondary, "hidden sm:inline-flex")} disabled={busy !== null} onClick={() => void run("unschedule")}>
                {busy === "unschedule" ? tt("Unscheduling") : tt("Unschedule")}
              </button>
            ) : null}
            <ResponsiveActionMenu
              title={subject}
              menuWidth="w-64"
              items={status === "scheduled" ? [{ label: tt("Unschedule"), onClick: () => void run("unschedule") }, ...items] : items}
              trigger={
                <button type="button" className={cn(buttonSecondary, "shrink-0 px-2.5 sm:px-3")} disabled={busy !== null} aria-label={tt("More actions")}>
                  <span className="hidden sm:inline">{tt("More actions")}</span>
                  <MoreHorizontal className="h-4 w-4 sm:hidden" />
                  <ChevronDown className="hidden h-4 w-4 sm:block" />
                </button>
              }
            />
            {primary}
          </>
        }
        subtitle={subtitle}
      />

      <div key={seed.id} className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
        {!report ? (
          error ? (
            <div className={cn(card, "px-5 py-10 text-center")}>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("This email could not be opened")}</p>
              <p className="mt-1 text-[13px] text-[#6b7280]">{error}</p>
              <button type="button" className={cn(buttonSecondary, "mt-4")} onClick={() => refresh(reportKey(seed.id))}>
                {tt("Try again")}
              </button>
            </div>
          ) : (
            <WaitingArea className="h-[420px]" />
          )
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
            {report.stats ? <Performance report={report} className="lg:col-start-1 lg:row-start-1" /> : null}
            <section aria-label={tt("The email")} className={cn(card, "min-w-0 overflow-hidden lg:col-start-1", report.stats ? "lg:row-start-2" : "lg:row-start-1")}>
              {report.html ? (
                <EmailPreview
                  html={report.html}
                  senderName={report.sender?.name ?? ""}
                  subject={c?.subject ?? ""}
                  previewText={c?.preview_text ?? ""}
                  mode={mode}
                  onMode={setMode}
                  when={c?.sent_at && status !== "draft" && status !== "scheduled" ? when(c.sent_at) : c?.scheduled_at && status === "scheduled" ? when(c.scheduled_at) : "now"}
                />
              ) : (
                <p className="px-5 py-10 text-center text-[13px] text-[#6b7280]">{tt("Nothing to show yet.")}</p>
              )}
            </section>
            <div className="grid min-w-0 content-start gap-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <Details report={report} audience={audience} />
              {report.stats && report.links.length ? <Links links={report.links} /> : null}
            </div>
          </div>
        )}
      </div>

      <ComposeDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={tt("Delete this email?")}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setDialog(null)}>
              {tt("Cancel")}
            </button>
            <button
              type="button"
              className={cn(buttonPrimary, "bg-[#b42318] hover:bg-[#9b1c14] active:bg-[#861912]")}
              disabled={busy !== null}
              onClick={async () => {
                setDialog(null)
                await run("delete")
              }}
            >
              {tt("Delete")}
            </button>
          </>
        }
      >
        <p className="text-[14px] text-[#1a1a2e]">
          {status === "draft" || status === "scheduled" ? tt("The draft is removed and nothing is sent.") : tt("The email and its numbers are removed from Storelib. What was sent stays in people's inboxes.")}
        </p>
      </ComposeDialog>

      <TestDialog open={dialog === "test"} onClose={() => setDialog(null)} campaignId={seed.id} />
    </>
  )
}

/* ─── The numbers ─────────────────────────────────────────────────────── */

/** Hairlines between six cells: two columns on a phone, three from 640px. */
const CELL_EDGES = [
  "",
  "border-l",
  "border-t sm:border-t-0 sm:border-l",
  "border-l border-t sm:border-l-0",
  "border-t sm:border-l",
  "border-l border-t",
]

function Performance({ report, className }: { report: EmailReport; className?: string }) {
  const s = report.stats!
  const c = report.campaign
  /* Delivery reports come from the provider's webhook. Without any, rates are of what was sent. */
  const reported = s.delivered > 0 || s.bounced > 0
  const base = reported ? s.delivered : s.sent
  const cells: { label: string; help: string; value: string; note?: string }[] = [
    { label: tt("Sent"), help: tt("Emails the email service accepted for delivery."), value: n(s.sent), note: s.waiting ? tt("{waiting} waiting", { waiting: n(s.waiting) }) : undefined },
    {
      label: ttx("emails", "Delivered"),
      help: tt("Emails the receiving mail server confirmed. Reported by the email service a little after sending."),
      value: reported ? n(s.delivered) : "–",
      note: reported ? pct(s.delivered, s.sent) : tt("no reports yet"),
    },
    {
      label: tt("Opened"),
      help: tt("People who opened it at least once. Some mail apps load pictures for everyone and some for nobody, so treat it as a guide."),
      value: c.track_opens ? n(s.opened) : "Off",
      note: c.track_opens ? pct(s.opened, base) : tt("not counted"),
    },
    { label: tt("Clicked"), help: tt("People who clicked at least one link."), value: n(s.clicked), note: pct(s.clicked, base) },
    { label: tt("Bounced"), help: tt("Addresses the receiving server refused for good. They are not sent to again."), value: n(s.bounced + s.complained), note: s.complained ? tt("{complained} marked it as spam", { complained: n(s.complained) }) : pct(s.bounced, s.sent) },
    { label: tt("Unsubscribed"), help: tt("People who left your list from this email."), value: n(s.unsubscribed), note: pct(s.unsubscribed, base) },
  ]
  const notes = [
    s.unknown ? tt("{unknown} may not have arrived: the email service did not answer, so {unknown, plural, one {it was} other {they were}} not sent again.", { unknown: s.unknown }) : null,
    s.failed ? tt("{failed, plural, one {# was} other {# were}} not sent.{value}", { failed: s.failed, value: c.last_error && !/may have arrived/.test(c.last_error) ? ` ${c.last_error}` : "" }) : null,
    s.skipped ? tt("{skipped} left your list before {skipped, plural, one {their turn and was} other {their turn and were}} not sent.", { skipped: s.skipped }) : null,
  ].filter(Boolean) as string[]
  return (
    <section aria-label={tt("How it did")} className={cn(card, "min-w-0 overflow-hidden", className)}>
      <div className="orders-strip grid grid-cols-2 sm:grid-cols-3">
        {cells.map((r, i) => (
          <div
            key={r.label}
            className={cn("flex min-w-0 flex-col border-[#eef0f2] px-4 py-3", CELL_EDGES[i])}
          >
            <HelpLabel label={r.label} description={r.help} className="whitespace-nowrap text-[12px] font-medium text-[#4b5563]" />
            <div className="mt-1 flex min-w-0 items-baseline gap-2">
              <span className="text-[20px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{r.value}</span>
              {r.note ? <span className="truncate text-[12px] tabular-nums text-[#6b7280]">{r.note}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {notes.length ? (
        <div className="space-y-1 border-t border-[#eef0f2] bg-[#fafbfb] px-4 py-3 text-[13px] text-[#4b5563]" role="status">
          {notes.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-[#6b7280]">{label}</dt>
      <dd className="min-w-0 break-words text-[#1a1a2e]">{children}</dd>
    </div>
  )
}

function Details({ report, audience }: { report: EmailReport; audience: string }) {
  const c = report.campaign
  const s = report.sender
  return (
    <section aria-label={tt("Details")} className={cn(card, "min-w-0")}>
      <h2 className="px-4 pt-3.5 text-[14px] font-semibold text-[#1a1a2e]">{tt("Details")}</h2>
      <dl className="divide-y divide-[#f1f2f4] px-4 pb-2 pt-1">
        <Row label={tt("To")}>
          {audience}
          {report.stats ? <span className="text-[#6b7280]"> · {n(report.stats.sent + report.stats.failed + report.stats.unknown + report.stats.waiting)} {tt("people")}</span> : null}
        </Row>
        {s ? (
          <Row label={tt("From")}>
            {s.name}
            <span className="block text-[12px] text-[#6b7280]">{tt("Replies go to {replyTo}", { replyTo: s.replyTo })}</span>
          </Row>
        ) : null}
        <Row label={tt("Subject")}>{c.subject || tt("No subject")}</Row>
        <Row label={tt("Preview")}>{c.preview_text ? c.preview_text : <span className="text-[#9ca3af]">{tt("None")}</span>}</Row>
        {c.scheduled_at && c.status === "scheduled" ? <Row label={tt("Goes out")}>{when(c.scheduled_at)}</Row> : null}
        {c.sent_at && c.status !== "draft" && c.status !== "scheduled" ? <Row label={tt("Sent")}>{when(c.sent_at)}</Row> : null}
        {c.completed_at ? <Row label={tt("Finished")}>{when(c.completed_at)}</Row> : null}
        <Row label={tt("Opens")}>{c.track_opens ? tt("Counted") : tt("Not counted")}</Row>
        {s && !s.address ? (
          <Row label={tt("Address")}>
            <span className="text-[#5c4300]">{tt("None in the footer.")} </span>
            <Link href="/app/settings" className="font-medium text-[#1a1a2e] underline underline-offset-2">
              {tt("Add it in Settings")}
            </Link>
          </Row>
        ) : null}
      </dl>
    </section>
  )
}

function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}${u.search}`
  } catch {
    return url
  }
}

function Links({ links }: { links: EmailReport["links"] }) {
  return (
    <section aria-label={tt("Links clicked")} className={cn(card, "min-w-0")}>
      <h2 className="px-4 pt-3.5 text-[14px] font-semibold text-[#1a1a2e]">{tt("Links clicked")}</h2>
      <ul className="divide-y divide-[#f1f2f4] px-4 pb-2 pt-1">
        {links.map((l) => (
          <li key={l.url} className="flex min-w-0 items-center gap-3 py-2 text-[13px]">
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 flex-1 items-center gap-1 text-[#1a1a2e] hover:underline" title={l.url}>
              <span className="truncate">{linkLabel(l.url)}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-[#9ca3af]" aria-hidden />
            </a>
            <span className="shrink-0 tabular-nums text-[#4b5563]">{n(l.people)}</span>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-3 text-[12px] text-[#6b7280]">{tt("People who clicked each link")}</p>
    </section>
  )
}

function TestDialog({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }) {
  const [state, setState] = React.useState<{ busy: boolean; done: string | null; error: string | null }>({ busy: false, done: null, error: null })
  React.useEffect(() => {
    if (open) setState({ busy: false, done: null, error: null })
  }, [open])
  const send = async () => {
    setState({ busy: true, done: null, error: null })
    const res = await fetch("/api/email/send-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setState({ busy: false, done: res?.ok ? data.sent_to ?? tt("your address") : null, error: res?.ok ? null : data.error ?? tt("The test was not sent.") })
  }
  return (
    <ComposeDialog
      open={open}
      onClose={onClose}
      title={tt("Send a test")}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {state.done ? tt("Done") : tt("Cancel")}
          </button>
          {!state.done ? (
            <button type="button" className={buttonPrimary} disabled={state.busy} onClick={() => void send()}>
              {state.busy ? tt("Sending") : tt("Send test")}
            </button>
          ) : null}
        </>
      }
    >
      <p className="text-[14px] text-[#1a1a2e]">{state.done ? tt("Sent to {done}. It can take a minute to arrive.", { done: state.done }) : tt("This email, as your subscribers get it, to your own address.")}</p>
      {state.error ? <p className="mt-2 text-[13px] text-[#b42318]">{state.error}</p> : null}
    </ComposeDialog>
  )
}

export type { EmailReport }
