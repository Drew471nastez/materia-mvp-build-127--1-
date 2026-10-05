"use client"

/**
 * ===========================================================================
 *  WHY PEOPLE LEFT (round 12, ask 12)
 * ===========================================================================
 * On a community's overview in the dashboard, for its owner and admins:
 * how many people who left gave each of the six reasons (lib/communities/
 * leave-reasons.ts), as one quiet list with a thin bar for each share, and
 * the latest notes they wrote. Every figure is a counted row of
 * community_leave_reasons (part 98); nothing until somebody has answered,
 * and no card at all before part 98 has run.
 *
 * No hooks; its figures come from the page (app/app/community/[id]/page.tsx).
 */
import { LEAVE_REASON_SHORT, type LeaveReason, type LeaveReasonsSummary } from "@/lib/communities/leave-reasons"
import { relativeTime } from "@/lib/communities/format"
import { Section } from "./parts"

export function LeaveReasonsCard({ summary }: { summary: LeaveReasonsSummary }) {
  const { total, counts, notes } = summary
  const shown = [...counts].sort((a, b) => b.count - a.count)
  return (
    <Section title="Why people left" hint={total ? `${total.toLocaleString("en-US")} ${total === 1 ? "person said" : "people said"} why, when they left.` : "When members leave they can say why. Their answers show up here."} id="why-people-left">
      {total > 0 ? (
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2" data-leave-reasons="">
          <ul className="space-y-2.5" aria-label="Reasons">
            {shown.map((c) => {
              const share = total ? Math.round((c.count / total) * 100) : 0
              return (
                <li key={c.reason} data-leave-count={c.reason}>
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className={c.count ? "font-medium text-[#1a1a2e]" : "text-[#9ca3af]"}>{LEAVE_REASON_SHORT[c.reason as LeaveReason]}</span>
                    <span className="shrink-0 tabular-nums text-[#6b7280]">
                      {c.count.toLocaleString("en-US")}
                      {c.count ? <span className="text-[#9ca3af]"> · {share}%</span> : null}
                    </span>
                  </div>
                  <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
                    <div className="h-full rounded-full bg-[#1a1a2e]" style={{ width: `${share}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <div>
            <p className="text-[12.5px] font-medium text-[#6b7280]">Latest notes</p>
            {notes.length ? (
              <ul className="mt-2 divide-y divide-[#f1f2f4]" data-leave-notes="">
                {notes.map((n, i) => (
                  <li key={i} className="py-2.5 first:pt-1">
                    <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-[#262633]">{n.note}</p>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                      {LEAVE_REASON_SHORT[n.reason]} · <time dateTime={n.createdAt} suppressHydrationWarning>{relativeTime(n.createdAt)}</time>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13.5px] text-[#6b7280]">Nobody has written a note yet.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13.5px] text-[#6b7280]" data-leave-reasons-empty="">Nobody has left with a reason yet.</p>
      )}
    </Section>
  )
}
