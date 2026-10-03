"use client"

/**
 * ===========================================================================
 *  A COMMUNITY'S OVERVIEW
 * ===========================================================================
 * What to do next (only what is not done yet, each step gone once its row
 * exists), then the figures, every one counted from real rows on the
 * server (lib/communities/server/creator.ts loadOverview): members, who was
 * active and who joined in 30 days, paid members, monthly revenue from the
 * memberships that sell it, cancellations, posts and comments this week.
 * Then the next events, and what is waiting for a decision.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowRight, Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/memberships/state"
import { eventDateBadge, eventTime } from "@/lib/communities/format"
import type { CommunityHead, OverviewData } from "./view-types"
import { EVENT_KIND_LABEL } from "./logic"
import { Section, buttonSecondary, card } from "./parts"

function Figure({ label: name, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5 sm:py-4" data-figure={name}>
      <p className="truncate text-[12.5px] font-medium text-[#6b7280]">{name}</p>
      <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.01em] text-[#1a1a2e]">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{hint}</p> : null}
    </div>
  )
}

function CopyAddress({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false)
  const [origin, setOrigin] = React.useState("https://storelib.com")
  React.useEffect(() => setOrigin(window.location.origin), [])
  const full = `${origin}${path}`
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#4b5563]">{full.replace(/^https?:\/\//, "")}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(full).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          })
        }}
        className={cn(buttonSecondary, "h-10 shrink-0 sm:h-8")}
      >
        {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  )
}

export function Overview({ head, data, created }: { head: CommunityHead; data: OverviewData; created: boolean }) {
  const f = data.figures
  const base = `/app/community/${head.id}`
  const figures: { label: string; value: string; hint?: string }[] = [
    { label: "Members", value: f.members.toLocaleString("en-US") },
    { label: "Active, 30 days", value: f.active30d.toLocaleString("en-US") },
    { label: "New, 30 days", value: f.new30d.toLocaleString("en-US") },
    { label: "Posts this week", value: f.posts7d.toLocaleString("en-US"), hint: `${f.comments7d.toLocaleString("en-US")} ${f.comments7d === 1 ? "comment" : "comments"}` },
  ]
  if (data.sells && head.can.manage_pricing) {
    figures.push(
      { label: "Paid members", value: f.paidMembers.toLocaleString("en-US") },
      { label: "Monthly revenue", value: money(f.mrrCents, f.currency), hint: "From active memberships" },
      { label: "Cancellations, 30 days", value: f.cancellations30d.toLocaleString("en-US") },
    )
  }
  const waiting = [
    f.pendingRequests > 0 && head.can.approve_member ? { href: `${base}/members?status=pending`, text: `${f.pendingRequests} ${f.pendingRequests === 1 ? "request" : "requests"} to join` } : null,
    f.openReports > 0 && head.can.review_reports ? { href: `${base}/moderation`, text: `${f.openReports} open ${f.openReports === 1 ? "report" : "reports"}` } : null,
  ].filter((x): x is { href: string; text: string } => x !== null)

  return (
    <div className="space-y-4" data-overview="">
      {data.steps.length > 0 ? (
        <Section title={created ? "Your community is ready" : "Next steps"} hint={created ? "A few things to do next. Each one goes away once it is done." : undefined}>
          <ol className="-mx-1 divide-y divide-[#f1f2f4]" data-next-steps="">
            {data.steps.map((s, i) => (
              <li key={s.id} data-step={s.id} className="flex items-center gap-3 px-1 py-3 first:pt-0 last:pb-0">
                <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#e1e3e7] text-[12.5px] font-semibold tabular-nums text-[#4b5563]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{s.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-[#6b7280]">{s.detail}</p>
                </div>
                <Link href={s.href} className={cn(buttonSecondary, "h-10 shrink-0 sm:h-8")}>
                  {s.action}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <section className={cn(card, "overflow-hidden")} aria-label="Figures">
        {/* Hairlines between the figures are the 1px gaps of a grey grid behind white cells; blank cells finish the last row. */}
        <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-4" data-figures="">
          {figures.map((x) => (
            <div key={x.label} className="bg-white">
              <Figure label={x.label} value={x.value} hint={x.hint} />
            </div>
          ))}
          {Array.from({ length: (4 - (figures.length % 4)) % 4 }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden className={cn("bg-white", i >= figures.length % 2 && "max-sm:hidden")} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {head.eventsEnabled ? (
          <Section
            title="Upcoming events"
            action={
              head.can.manage_events ? (
                <Link href={`${base}/events`} className="-my-1 inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e] sm:min-h-8">
                  All events
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              ) : null
            }
          >
            {data.upcoming.length === 0 ? (
              <p className="text-[13.5px] text-[#6b7280]">
                No events scheduled.{" "}
                {head.can.manage_events ? (
                  <Link href={`${base}/events?new=1`} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                    Schedule one
                  </Link>
                ) : null}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.upcoming.map((e) => {
                  const d = eventDateBadge(e.startsAt)
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <span aria-hidden className="grid h-11 w-11 shrink-0 place-content-center rounded-xl border border-[#e5e7eb] text-center leading-none">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#b42318]">{d.month}</span>
                        <span className="mt-0.5 text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{d.day}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{e.title}</p>
                        <p className="truncate text-[12.5px] text-[#6b7280]">
                          {eventTime(e.startsAt, e.endsAt)} · {EVENT_KIND_LABEL[e.kind]}
                          <span className="sm:hidden">
                            {" "}
                            · {e.goingCount} going
                          </span>
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-[12.5px] tabular-nums text-[#6b7280] sm:inline">
                        {e.goingCount}
                        {e.capacity ? `/${e.capacity}` : ""} going
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        ) : null}

        <Section title="Waiting for you">
          {waiting.length === 0 ? (
            <p className="text-[13.5px] text-[#6b7280]">All clear.</p>
          ) : (
            <ul className="-my-1">
              {waiting.map((w) => (
                <li key={w.href}>
                  <Link href={w.href} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-[#d97706]" />
                      {w.text}
                    </span>
                    <ArrowRight aria-hidden className="h-4 w-4 text-[#9ca3af]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-[#f1f2f4] pt-3">
            <p className="mb-1.5 text-[12.5px] font-medium text-[#6b7280]">{head.status === "published" ? "Its address" : "Its address, once published"}</p>
            <CopyAddress path={data.publicUrl} />
          </div>
        </Section>
      </div>
    </div>
  )
}
