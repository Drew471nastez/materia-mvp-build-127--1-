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
 * ROUND 26, THE OWNER: "too complicated and crowded ... too many statistics,
 * controls, and unnecessary information ... it should help creators
 * understand their community in seconds". Round 33 drew eight figures in two
 * rows (Per paid member was the two money figures divided; New, 30 days and
 * Cancellations had cells of their own) and a card for the link the header
 * already opens. Now:
 *
 *   FOUR FIGURES AT MOST   Members (how many joined in 30 days under it),
 *                          Active in 30 days, and either Paid members
 *                          (cancellations under it) and Monthly revenue for a
 *                          community that sells, or Posts this week for one
 *                          that does not. On a phone they are rows, the word
 *                          on the left and the number on the right, not
 *                          squeezed columns; two by two up to 1024px.
 *   WHAT IS WAITING        requests to join and open reports, only when
 *                          there are some
 *   SET UP                 what is left of the setup list, only while
 *                          something is
 *   SHORTCUTS              write, invite, schedule, edit the page, copy the
 *                          link (once published), each for a role that may
 *   RECENT ACTIVITY        the newest posts and members
 *   UPCOMING EVENTS        only when one is scheduled
 *
 * From 1280px the work (setup, activity) is the wide column and the rest the
 * narrow one; under it one column in the order that matters on a phone. The
 * two columns are `display: contents` there, so one list is ordered without
 * drawing anything twice. No selector, no chart: Analytics has those.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowRight, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/memberships/state"
import { eventDateBadge, eventTime, relativeTime } from "@/lib/communities/format"
import { AppAvatar } from "@/components/app/app-avatar"
import type { CommunityHead, OverviewActivity, OverviewData } from "./view-types"
import { EVENT_KIND_LABEL } from "./logic"
import { EDITOR_CARD_TITLE, buttonPrimary, buttonSecondary, card, useToast } from "./parts"
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
 * line under it. On a phone the same three as a row: the name with its line under it on the left, the number on the
 * right (one grid, its cells placed differently, so nothing is drawn twice). A figure that has a screen of its own opens
 * it.
 */
export interface OverviewFigure {
  label: string
  value: string
  foot?: string
  href?: string
}

function Figure({ label: name, value, foot, href }: OverviewFigure) {
  const body = (
    <>
      <span className="col-start-1 row-start-1 block truncate text-[13px] font-medium leading-5 text-[#6b7280] sm:text-[12px] sm:leading-[18px]">{name}</span>
      <span className="col-start-2 row-span-2 row-start-1 block truncate text-right text-[20px] font-semibold leading-7 tabular-nums tracking-tight text-[#1a1a2e] sm:col-start-1 sm:row-span-1 sm:row-start-2 sm:mt-0.5 sm:text-left sm:text-[22px]">{value}</span>
      <span className="col-start-1 row-start-2 block h-4 truncate text-[12px] leading-4 text-[#9ca3af] sm:row-start-3 sm:text-[11px]">{foot ?? ""}</span>
    </>
  )
  const cls = "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 bg-white px-4 py-3 sm:grid-cols-1 sm:items-start sm:px-5 sm:py-3.5"
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

/** The figures' columns: rows on a phone, two by two up to 1024px, then one row. The frame draws the same (./section-frame). */
export function figureColumns(n: number): string {
  return n >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
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
              {/* Round 33: the app step goes to /api/get-app (it picks the store) and the intro is a video elsewhere, so both open a new tab. */}
              {s.href.startsWith("/api/") || /^https?:/.test(s.href) ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={cn(i === 0 ? buttonPrimary : buttonSecondary, "shrink-0 self-start sm:self-auto")}>
                  {s.action}
                </a>
              ) : (
                <Link href={s.href} className={cn(i === 0 ? buttonPrimary : buttonSecondary, "shrink-0 self-start sm:self-auto")}>
                  {s.action}
                </Link>
              )}
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
  const toast = useToast()
  const base = `/app/community/${head.slug}`
  const n = (v: number) => v.toLocaleString(appLocale())
  const canSeeMembers = head.can.manage_members || head.can.approve_member || head.can.invite
  const sells = data.sells && head.can.manage_pricing === true
  /* Four at most, none twice: who joined and who cancelled are the lines under the counts they change. */
  const figures: OverviewFigure[] = [
    { label: tt("Members"), value: n(f.members), foot: f.new30d > 0 ? tt("+{n} in 30 days", { n: n(f.new30d) }) : undefined, href: canSeeMembers ? `${base}/members` : undefined },
    { label: tt("Active, 30 days"), value: n(f.active30d), foot: f.members ? tt("{p}% of members", { p: Math.round((f.active30d / Math.max(1, f.members)) * 100) }) : undefined },
    ...(sells
      ? [
          { label: tt("Paid members"), value: n(f.paidMembers), foot: f.cancellations30d > 0 ? tt("{n, plural, one {# cancellation} other {# cancellations}} in 30 days", { n: f.cancellations30d }) : undefined },
          { label: tt("Monthly revenue"), value: money(f.mrrCents, f.currency), foot: tt("From active memberships"), href: head.can.view_analytics ? `${base}/analytics` : undefined },
        ]
      : [{ label: tt("Posts this week"), value: n(f.posts7d), foot: tt("{n, plural, one {# comment} other {# comments}}", { n: f.comments7d }), href: head.can.moderate_content ? `${base}/feed` : undefined }]),
  ]
  const waiting = [
    f.pendingRequests > 0 && head.can.approve_member ? { href: `${base}/members?status=pending`, text: tt("{pendingRequests, plural, one {# request} other {# requests}} to join", { pendingRequests: f.pendingRequests }) } : null,
    f.openReports > 0 && head.can.review_reports ? { href: `${base}/moderation`, text: tt("{openReports} open {openReports, plural, one {report} other {reports}}", { openReports: f.openReports }) } : null,
  ].filter((x): x is { href: string; text: string } => x !== null)
  /* What a creator does most, each only for a role that may; and the link to share once there is a page to share (round 26: it was a card of its own). */
  const actions = [
    head.can.post ? { href: `${base}/feed`, label: tt("Write a post") } : null,
    head.can.invite ? { href: `${base}/members?invite=1`, label: tt("Invite people") } : null,
    head.eventsEnabled && head.can.manage_events ? { href: `${base}/events?new=1`, label: tt("Schedule an event") } : null,
    head.can.manage_settings ? { href: `${base}/page`, label: tt("Edit the page") } : null,
  ].filter((x): x is { href: string; label: string } => x !== null)
  const shareable = head.status === "published" && !head.suspended
  const copyLink = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}${data.publicUrl}`).then(
      () => toast(tt("Link copied")),
      () => toast(tt("The link could not be copied")),
    )
  }
  const recent = data.recent ?? []
  /* ROUND 14: a price nobody can pay is said once. The checklist says it when this person sees the checklist. */
  const unsellable = (data.pricedEventsUnsellable ?? 0) > 0 && !data.steps.some((s) => s.id === "event_payouts")
  const row = "-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-150 hover:bg-[#f7f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.2)]"

  return (
    <div className="flex flex-col gap-4" data-overview="">
      <section className={cn(card, "order-0 overflow-hidden")} aria-label={tt("Figures")}>
        <div className={cn("grid grid-cols-1 gap-px bg-[#eef0f2]", figureColumns(figures.length))} data-figures="">
          {figures.map((x) => (
            <Figure key={x.label} {...x} />
          ))}
        </div>
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
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4" data-overview-side="">
          {waiting.length ? (
            <Panel title={tt("Waiting for you")} className="order-1" data-overview-waiting="">
              <ul className="-my-1">
                {waiting.map((w) => (
                  <li key={w.href}>
                    <Link href={w.href} className={row}>
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

          {actions.length || shareable ? (
            <Panel title={tt("Shortcuts")} className="order-3" data-overview-actions="">
              <ul className="-my-1 divide-y divide-[#f1f2f4]">
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className={row} data-overview-action="">
                      <span className="truncate">{a.label}</span>
                      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </Link>
                  </li>
                ))}
                {shareable ? (
                  <li>
                    {/* As wide as the link rows: they run 8px past the card's padding on each side (-mx-2). */}
                    <button type="button" onClick={copyLink} className={cn(row, "w-[calc(100%+1rem)] text-left")} data-overview-action="" data-overview-copy="">
                      <span className="truncate">{tt("Copy link")}</span>
                      <Copy aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </button>
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          {head.eventsEnabled && (data.upcoming.length > 0 || unsellable) ? (
            <Panel title={tt("Upcoming events")} aside={head.can.manage_events ? <AsideLink href={`${base}/events`}>{tt("All events")}</AsideLink> : null} className="order-5" data-overview-events="">
              {unsellable ? (
                <p className="mb-3 rounded-lg border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b4e00]" data-events-unsellable="">
                  {data.pricedEventsUnsellable === 1 ? tt("One event has a ticket price, but payouts are not connected, so nobody can buy it.") : tt("{pricedEventsUnsellable} events have a ticket price, but payouts are not connected, so nobody can buy them.", { pricedEventsUnsellable: data.pricedEventsUnsellable })}
                </p>
              ) : null}
              {data.upcoming.length ? (
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
                            {eventTime(e.startsAt, e.endsAt)} · {EVENT_KIND_LABEL[e.kind]} · {tt("{goingCount} going", { goingCount: e.goingCount })}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
