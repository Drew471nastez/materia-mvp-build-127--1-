"use client"

/**
 * ===========================================================================
 *  A COMMUNITY'S OVERVIEW
 * ===========================================================================
 * Every figure here is counted from real rows on the server
 * (lib/communities/server/creator.ts loadOverview): members, who was active
 * and who joined in 30 days, posts and comments this week, and when the
 * community sells memberships, paid members, monthly revenue and
 * cancellations. Nothing is estimated and nothing is drawn as a sample.
 *
 * ROUND 32, THE OWNER: "a genuinely useful, clean dashboard". From 1280px it
 * is the figures across the top, in the /app Analytics row's type
 * (components/app/metric-tab), and under them two columns:
 *
 *   the work      what is left to set up (only what is not done, each step
 *                 gone once its row exists), what happened lately (the
 *                 newest posts and members, ./view-types OverviewActivity),
 *                 the next events
 *   the side      what is waiting for a decision, the things a creator does
 *                 most (write, invite, schedule, edit the page), and the
 *                 community's link to copy or open
 *
 * Under 1280px it is one column, in the order that matters on a phone: the
 * figures, what is waiting, the setup, the shortcuts, the activity, the
 * events, the link. The two columns are `display: contents` there, so one
 * list can be ordered without drawing anything twice.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/memberships/state"
import { eventDateBadge, eventTime, relativeTime } from "@/lib/communities/format"
import { AppAvatar } from "@/components/app/app-avatar"
import type { CommunityHead, OverviewActivity, OverviewData } from "./view-types"
import { EVENT_KIND_LABEL } from "./logic"
import { EDITOR_CARD_TITLE, buttonPrimary, buttonSecondary, card } from "./parts"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale } from "@/lib/i18n/format"

/** A card of the overview: the /app card, its heading and an optional link at the heading's right. */
function Panel({ title, aside, children, className, ...rest }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={cn(card, "min-w-0 app-card-x py-4 sm:py-5", className)}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className={EDITOR_CARD_TITLE}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function AsideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mr-1.5 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[13px] font-medium text-[#4b5563] outline-none transition-colors hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] sm:min-h-8">
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  )
}

/**
 * ONE FIGURE, in the /app Analytics row's type (components/app/metric-tab.tsx): a quiet name, the number at 22px, a
 * line under it. A figure that has a screen of its own opens it.
 */
function Figure({ label: name, value, foot, href }: { label: string; value: string; foot?: string; href?: string }) {
  const body = (
    <>
      <span className="block truncate text-[12px] font-medium text-[#6b7280]">{name}</span>
      <span className="mt-0.5 block truncate text-[20px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] sm:text-[22px]">{value}</span>
      <span className="block min-h-4 truncate text-[11px] text-[#9ca3af]">{foot ?? ""}</span>
    </>
  )
  const cls = "block min-w-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5"
  return href ? (
    <Link href={href} data-figure={name} className={cn(cls, "outline-none transition-colors duration-150 hover:bg-[#fafafa] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.2)]")}>
      {body}
    </Link>
  ) : (
    <div data-figure={name} className={cls}>
      {body}
    </div>
  )
}

function CopyAddress({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false)
  const [origin, setOrigin] = React.useState("https://storelib.com")
  React.useEffect(() => setOrigin(window.location.origin), [])
  const full = `${origin}${path}`
  return (
    <div className="min-w-0">
      <p className="truncate rounded-lg bg-[#f7f7f8] px-3 py-2.5 text-[13px] text-[#4b5563]" data-overview-address="">
        {full.replace(/^https?:\/\//, "")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(full).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            })
          }}
          className={cn(buttonSecondary, "flex-1 justify-center sm:flex-none")}
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied ? tt("Copied") : tt("Copy link")}
        </button>
        <a href={path} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "flex-1 justify-center sm:flex-none")}>
          {tt("Open")}
          <ExternalLink aria-hidden className="h-3.5 w-3.5 text-[#6b7280]" />
        </a>
      </div>
    </div>
  )
}

/** The setup checklist: one list, the next step's action filled, the rest quiet, folded past four. */
function NextSteps({ steps, created }: { steps: OverviewData["steps"]; created: boolean }) {
  const [all, setAll] = React.useState(false)
  const shown = all ? steps : steps.slice(0, 4)
  return (
    <Panel
      title={created ? tt("Your community is ready") : tt("Set up")}
      aside={<span className="shrink-0 text-[13px] tabular-nums text-[#9ca3af]">{tt("{n, plural, one {# step left} other {# steps left}}", { n: steps.length })}</span>}
      data-next-steps-card=""
      aria-label={created ? tt("Your community is ready") : tt("Set up")}
    >
      <ol className="-my-1 divide-y divide-[#f1f2f4]" data-next-steps="">
        {shown.map((s, i) => (
          <li key={s.id} data-step={s.id} data-step-next={i === 0 ? "" : undefined} className="flex min-h-14 items-start gap-3 py-3 sm:items-center sm:py-2.5">
            <span aria-hidden className={cn("mt-px h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] sm:mt-0", i === 0 ? "border-[#1a1a2e]" : "border-[#d5d8de]")} />
            {/* On a phone the action goes under the words, so the words keep the row's width. */}
            <span className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#1a1a2e]">{s.title}</span>
                <span className="block text-[13px] leading-snug text-[#6b7280]">{s.detail}</span>
              </span>
              <Link href={s.href} className={cn(i === 0 ? buttonPrimary : buttonSecondary, "shrink-0 self-start sm:self-auto")}>
                {s.action}
              </Link>
            </span>
          </li>
        ))}
      </ol>
      {steps.length > 4 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 inline-flex min-h-10 items-center text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e] sm:min-h-8" data-steps-toggle="">
          {all ? tt("Show fewer") : tt("Show all {n}", { n: steps.length })}
        </button>
      ) : null}
    </Panel>
  )
}

function ActivityLine({ a }: { a: OverviewActivity }) {
  return (
    <li data-activity={a.kind}>
      <Link href={a.href} className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors duration-150 hover:bg-[#f7f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.2)]">
        <AppAvatar src={a.avatarUrl} name={a.name} alt="" size={32} markWhileLoading lazy className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-[#6b7280]">
            <Rich text={a.kind === "post" ? tt("{name} posted") : tt("{name} joined")} parts={{ name: <span className="font-medium text-[#1a1a2e]">{a.name}</span> }} />
          </span>
          {a.text ? <span className="block truncate text-[13px] text-[#6b7280]">{a.text}</span> : null}
        </span>
        <time dateTime={a.at} suppressHydrationWarning className="shrink-0 text-[12.5px] tabular-nums text-[#9ca3af]">
          {relativeTime(a.at)}
        </time>
      </Link>
    </li>
  )
}

export function Overview({ head, data, created }: { head: CommunityHead; data: OverviewData; created: boolean }) {
  const f = data.figures
  const base = `/app/community/${head.slug}`
  const n = (v: number) => v.toLocaleString(appLocale())
  const canSeeMembers = head.can.manage_members || head.can.approve_member || head.can.invite
  const community: { label: string; value: string; foot?: string; href?: string }[] = [
    { label: tt("Members"), value: n(f.members), href: canSeeMembers ? `${base}/members` : undefined },
    { label: tt("Active, 30 days"), value: n(f.active30d), foot: f.members ? tt("{p}% of members", { p: Math.round((f.active30d / Math.max(1, f.members)) * 100) }) : undefined },
    { label: tt("Posts this week"), value: n(f.posts7d), foot: tt("{n, plural, one {# comment} other {# comments}}", { n: f.comments7d }), href: head.can.moderate_content ? `${base}/feed` : undefined },
    { label: tt("New, 30 days"), value: n(f.new30d), href: canSeeMembers ? `${base}/members` : undefined },
  ]
  const moneyFigures: typeof community =
    data.sells && head.can.manage_pricing
      ? [
          { label: tt("Paid members"), value: n(f.paidMembers) },
          { label: tt("Monthly revenue"), value: money(f.mrrCents, f.currency), foot: tt("From active memberships"), href: head.can.view_analytics ? `${base}/analytics` : undefined },
          /* Round 33: the fourth cell, so the two rows share their columns; the same two counts, divided. */
          { label: tt("Per paid member"), value: f.paidMembers > 0 ? money(Math.round(f.mrrCents / f.paidMembers), f.currency) : money(0, f.currency), foot: tt("Each month") },
          { label: tt("Cancellations, 30 days"), value: n(f.cancellations30d) },
        ]
      : []
  const waiting = [
    f.pendingRequests > 0 && head.can.approve_member ? { href: `${base}/members?status=pending`, text: tt("{pendingRequests, plural, one {# request} other {# requests}} to join", { pendingRequests: f.pendingRequests }) } : null,
    f.openReports > 0 && head.can.review_reports ? { href: `${base}/moderation`, text: tt("{openReports} open {openReports, plural, one {report} other {reports}}", { openReports: f.openReports }) } : null,
  ].filter((x): x is { href: string; text: string } => x !== null)
  /* What a creator does most, each only for a role that may. */
  const actions = [
    head.can.post ? { href: `${base}/feed`, label: tt("Write a post") } : null,
    head.can.invite ? { href: `${base}/members?invite=1`, label: tt("Invite people") } : null,
    head.eventsEnabled && head.can.manage_events ? { href: `${base}/events?new=1`, label: tt("Schedule an event") } : null,
    head.can.manage_settings ? { href: `${base}/page`, label: tt("Edit the page") } : null,
  ].filter((x): x is { href: string; label: string } => x !== null)
  const recent = data.recent ?? []

  return (
    <div className="flex flex-col gap-4" data-overview="">
      <section className={cn(card, "order-0 overflow-hidden")} aria-label={tt("Figures")}>
        <div className="grid grid-cols-2 gap-px bg-[#eef0f2] sm:grid-cols-4" data-figures="">
          {community.map((x) => (
            <Figure key={x.label} {...x} />
          ))}
        </div>
        {moneyFigures.length ? (
          <div className="grid grid-cols-2 gap-px border-t border-[#eef0f2] bg-[#eef0f2] sm:grid-cols-4" data-figures-money="">
            {moneyFigures.map((x) => (
              <div key={x.label} className="min-w-0 bg-white">
                <Figure {...x} />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="contents xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-4" data-overview-columns="">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4" data-overview-main="">
          {data.steps.length > 0 ? (
            <div className="order-2 min-w-0">
              <NextSteps steps={data.steps} created={created} />
            </div>
          ) : null}

          <Panel title={tt("Recent activity")} aside={head.can.moderate_content ? <AsideLink href={`${base}/feed`}>{tt("All posts")}</AsideLink> : null} className="order-4" data-overview-activity="">
            {recent.length ? (
              <ul className="-my-1">
                {recent.map((a) => (
                  <ActivityLine key={a.id} a={a} />
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-[#6b7280]">{tt("Nothing yet. New posts and new members show up here.")}</p>
            )}
          </Panel>

          {head.eventsEnabled ? (
            <Panel title={tt("Upcoming events")} aside={head.can.manage_events ? <AsideLink href={`${base}/events`}>{tt("All events")}</AsideLink> : null} className="order-5" data-overview-events="">
              {/* ROUND 14: a price nobody can pay is said once. The checklist says it when this person sees the checklist. */}
              {(data.pricedEventsUnsellable ?? 0) > 0 && !data.steps.some((s) => s.id === "event_payouts") ? (
                <p className="mb-3 rounded-lg border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b4e00]" data-events-unsellable="">
                  {data.pricedEventsUnsellable === 1 ? tt("One event has a ticket price, but payouts are not connected, so nobody can buy it.") : tt("{pricedEventsUnsellable} events have a ticket price, but payouts are not connected, so nobody can buy them.", { pricedEventsUnsellable: data.pricedEventsUnsellable })}
                </p>
              ) : null}
              {data.upcoming.length === 0 ? (
                <p className="text-[13.5px] text-[#6b7280]">
                  {tt("No events scheduled.")}{" "}
                  {head.can.manage_events ? (
                    <Link href={`${base}/events?new=1`} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                      {tt("Schedule one")}
                    </Link>
                  ) : null}
                </p>
              ) : (
                <ul className="-my-1 divide-y divide-[#f1f2f4]">
                  {data.upcoming.map((e) => {
                    const d = eventDateBadge(e.startsAt)
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
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
                              · {tt("{goingCount} going", { goingCount: e.goingCount })}
                            </span>
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-[12.5px] tabular-nums text-[#6b7280] sm:inline">
                          {e.goingCount}
                          {e.capacity ? `/${e.capacity}` : ""} {tt("going")}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4" data-overview-side="">
          {waiting.length ? (
            <Panel title={tt("Waiting for you")} className="order-1" data-overview-waiting="">
              <ul className="-my-1">
                {waiting.map((w) => (
                  <li key={w.href}>
                    <Link href={w.href} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#d97706]" />
                        <span className="truncate">{w.text}</span>
                      </span>
                      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {actions.length ? (
            <Panel title={tt("Shortcuts")} className="order-3" data-overview-actions="">
              <ul className="-my-1 divide-y divide-[#f1f2f4]">
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-150 hover:bg-[#f7f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.2)]" data-overview-action="">
                      <span className="truncate">{a.label}</span>
                      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title={head.status === "published" ? tt("Community link") : tt("Community link, once published")} className="order-6" data-overview-share="">
            <CopyAddress path={data.publicUrl} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
