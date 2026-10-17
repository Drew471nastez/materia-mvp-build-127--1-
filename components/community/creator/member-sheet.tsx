"use client"

/**
 * ===========================================================================
 *  ONE MEMBER, OPENED (round 32)
 * ===========================================================================
 * The owner: Members needs "a member detail sheet with actions". Pressing a
 * row in Members opens this: the dialog every section uses on a computer,
 * the shared bottom sheet on a phone (parts.tsx Dialog).
 *
 * At the top, who they are: the picture, the name, the username and (for the
 * owner and admins) the email, and a word for anything out of the ordinary
 * (muted, complimentary, a request, taken out). Then what the list's columns
 * said, all in one place: role, tier, level and points, when they joined,
 * when they were last here, how they got in; for a request, the note they
 * wrote; for somebody taken out, who did it and why.
 *
 * ROUND 34, the owner: a member opened must also show "relevant activity and
 * engagement", their "subscription status" and "basic member access and
 * purchase information", without a second screen. So once the sheet is open
 * it asks GET /api/app/community/<id>/members/<userId> for three more things
 * (lib/communities/member-detail.ts) and puts them under the facts:
 *
 *   HERE      what they posted, commented and liked in this community, and
 *             when they last posted. A figure that cannot be read says so;
 *             it never shows a nought it does not know.
 *   ACCESS    what their membership is doing now in one line, when it ends,
 *             and who invited or approved them.
 *   PROGRAMS  the programs of this community they have access to, and
 *             whether each was bought or given. The server sends this only
 *             to somebody the manage_members permission reaches, because an
 *             enrolment is private; a moderator is sent null and the rows
 *             are not drawn.
 * Never an amount, a card or a Stripe id: the server does not send them.
 *
 * Then the ways to reach them (a message in the community, their profile,
 * an email) and everything this person may do to that one, from the same
 * choices the row's menu offers (./member-actions memberChoices, the rules
 * the server applies), grouped as the menu groups them. A choice closes the
 * sheet and runs the way the menu runs it: its confirmation, its mute length
 * or its tier picker opens next.
 */
import * as React from "react"
import { ExternalLink, Mail, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import type { MemberSource } from "@/lib/communities/types"
import type { CommunityHead, MemberRowView } from "./view-types"
import { ROLE_LABEL, takenAwayLine, type MemberChoice } from "./logic"
import { Dialog, buttonSecondary, shortDate } from "./parts"
import { Facts } from "./ui-kit"
import { sectionTitle } from "./member-actions"
import { engagementLine, subscriptionLine, type MemberDetail } from "@/lib/communities/member-detail"
import { tt } from "@/lib/i18n/text"

/** How somebody got in, in a word or two. */
export function sourceWords(source: MemberSource): string {
  switch (source) {
    case "owner":
      return tt("Owner")
    case "free":
      return tt("Joined free")
    case "subscription":
      return tt("Subscription")
    case "purchase":
      return tt("Bought access")
    case "product":
      return tt("With a product")
    case "invite":
      return tt("Invited")
    case "manual":
      return tt("Complimentary")
    default:
      return "Storelib"
  }
}

/*
  WHAT WAS READ, KEPT FOR THE VISIT. Opening the same row twice does not ask
  twice, and closing a sheet mid flight does not leave a request to land on
  nothing: the answer is filed under the member and the sheet reads it.
*/
const kept = new Map<string, MemberDetail>()

function useMemberDetail(communityId: string, userId: string | null): { detail: MemberDetail | null; loading: boolean } {
  const [detail, setDetail] = React.useState<MemberDetail | null>(() => (userId ? kept.get(userId) ?? null : null))
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (!userId) return
    const have = kept.get(userId)
    if (have) {
      setDetail(have)
      return
    }
    setDetail(null)
    setLoading(true)
    const stop = new AbortController()
    void (async () => {
      try {
        const res = await fetch(`/api/app/community/${communityId}/members/${userId}`, { signal: stop.signal })
        const body = (await res.json().catch(() => ({}))) as { detail?: MemberDetail }
        if (stop.signal.aborted) return
        if (res.ok && body.detail) {
          kept.set(userId, body.detail)
          setDetail(body.detail)
        }
      } catch {
        /* Nothing read: the sheet says so rather than showing a figure. */
      } finally {
        if (!stop.signal.aborted) setLoading(false)
      }
    })()
    return () => stop.abort()
  }, [communityId, userId])
  return { detail, loading }
}

/** The rows under the facts: what they did here, what their access is doing, and the programs they have. */
function MemberMore({ detail, loading, status }: { detail: MemberDetail | null; loading: boolean; status: string }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-t border-[#f1f2f4] py-2 first:border-t-0">
      <span className="shrink-0 text-[12.5px] text-[#6b7280]">{label}</span>
      <span className="min-w-0 truncate text-right text-[13.5px] text-[#1a1a2e]">{value}</span>
    </div>
  )
  if (!detail) {
    return (
      <p className="text-[13px] text-[#6b7280]" data-member-more={loading ? "reading" : "unread"}>
        {loading ? tt("Reading what they did here") : tt("What they did here could not be read.")}
      </p>
    )
  }
  const e = detail.engagement
  const a = detail.access
  return (
    <div className="space-y-4" data-member-more="read">
      <div data-member-engagement="">
        <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">{tt("Here")}</p>
        <div className="rounded-xl border border-[#eef0f2] px-4 py-1">
          {row(tt("Activity"), engagementLine(e))}
          {row(tt("Last posted"), e.lastPostAt ? relativeTime(e.lastPostAt) : tt("Never"))}
        </div>
      </div>
      <div data-member-access="">
        <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">{tt("Access")}</p>
        <div className="rounded-xl border border-[#eef0f2] px-4 py-1">
          {row(tt("Membership"), subscriptionLine(a, status))}
          {a.expiresAt ? row(tt("Ends"), shortDate(a.expiresAt) || "–") : null}
          {a.invitedBy ? row(tt("Invited by"), a.invitedBy) : null}
          {a.approvedBy ? row(tt("Approved by"), a.approvedBy) : null}
        </div>
      </div>
      {detail.learning && detail.learning.length ? (
        <div data-member-programs="">
          <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">{tt("Programs")}</p>
          <div className="rounded-xl border border-[#eef0f2] px-4 py-1">
            {detail.learning.map((l) => row(l.title, l.how === "bought" ? tt("Bought") : tt("Given")))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MemberSheet({
  head,
  member,
  choices,
  showLevel,
  onClose,
  onChoose,
}: {
  head: CommunityHead
  member: MemberRowView | null
  choices: MemberChoice[]
  showLevel: boolean
  onClose: () => void
  /** A choice from the sheet: it closes, then the choice runs as the menu runs it. */
  onChoose: (choice: MemberChoice) => void
}) {
  /* What is drawn stays while the sheet goes down. */
  const held = React.useRef<MemberRowView | null>(member)
  if (member) held.current = member
  const m = member ?? held.current
  const more = useMemberDetail(head.id, member && member.status !== "pending" ? member.userId : null)
  if (!m) return null
  const pending = m.status === "pending"
  const out = m.status !== "active" && m.status !== "pending"
  const active = m.status === "active"
  const facts: { label: string; value: React.ReactNode }[] = pending
    ? [
        { label: tt("Asked"), value: shortDate(m.requestedAt) || "–" },
        { label: tt("Tier"), value: m.tierName ?? "–" },
      ]
    : [
        { label: tt("Role"), value: ROLE_LABEL[m.role] },
        { label: tt("Tier"), value: m.tierName ?? "–" },
        ...(showLevel ? [{ label: tt("Level"), value: <span className="tabular-nums">{tt("Level {level}", { level: m.level })} <span className="text-[#9ca3af]">· {tt("{n, plural, one {# point} other {# points}}", { n: m.points })}</span></span> }] : []),
        { label: tt("Joined"), value: shortDate(m.joinedAt) || "–" },
        { label: tt("Last active"), value: m.lastActiveAt ? relativeTime(m.lastActiveAt) : tt("Not yet") },
        { label: tt("How they joined"), value: sourceWords(m.source) },
      ]

  /* The choices in the menu's groups, each group under its name. */
  const groups: { name: string; items: MemberChoice[] }[] = []
  for (const c of choices) {
    const name = c.section ? sectionTitle(c.section) : ""
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.items.push(c)
    else groups.push({ name, items: [c] })
  }

  const linkClass = cn(buttonSecondary, "h-10 flex-1 gap-1.5 px-3 sm:h-9")
  return (
    <Dialog open={member !== null} onClose={onClose} title={m.name} footer={<button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>{tt("Close")}</button>}>
      <div className="space-y-4" data-member-sheet={m.userId}>
        <div className="flex items-center gap-3.5">
          <MemberAvatar src={m.avatarUrl ?? undefined} name={m.name} size={52} className="h-[52px] w-[52px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-[#4b5563]">{[m.username ? `@${m.username}` : null, m.email].filter(Boolean).join(" · ") || ROLE_LABEL[m.role]}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pending ? <StatusBadge tone="attention">{m.approved ? tt("Approved, waiting for payment") : tt("Asked to join")}</StatusBadge> : null}
              {out ? <StatusBadge tone="neutral">{m.status === "banned" ? tt("Banned") : m.status === "removed" ? tt("Removed") : m.status === "paused" ? tt("Suspended") : m.status === "expired" ? tt("Expired") : tt("Left")}</StatusBadge> : null}
              {active && m.role !== "member" ? <StatusBadge tone="neutral">{ROLE_LABEL[m.role]}</StatusBadge> : null}
              {m.mutedUntil ? <StatusBadge tone="attention">{tt("Muted until {date}", { date: shortDate(m.mutedUntil) })}</StatusBadge> : null}
              {m.source === "manual" ? <StatusBadge tone="neutral">{tt("Complimentary")}</StatusBadge> : null}
              {m.featured ? <StatusBadge tone="neutral">{tt("Featured")}</StatusBadge> : null}
            </div>
          </div>
        </div>

        {pending && m.requestNote ? <p className="rounded-xl border border-[#eef0f2] px-4 py-3 text-[14px] leading-relaxed text-[#1a1a2e]" data-member-note="">&ldquo;{m.requestNote}&rdquo;</p> : null}
        {(out || m.mutedUntil) && m.acted ? <p className="text-[13.5px] leading-snug text-[#4b5563]" data-member-acted="">{takenAwayLine(m)}</p> : null}

        <Facts items={facts} />

        {/* Round 34: what they did here, what their access is doing, and the programs they have (asked for once the sheet is open). */}
        {pending ? null : <MemberMore detail={more.detail} loading={more.loading} status={m.status} />}

        {active ? (
          <div className="flex gap-2" data-member-links="">
            <a href={`/community/${head.slug}?dm=${m.userId}`} target="_blank" rel="noopener noreferrer" className={linkClass} data-member-message="">
              <MessageCircle aria-hidden className="h-4 w-4" />
              {tt("Message")}
            </a>
            <a href={`/community/${head.slug}/members/${m.userId}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <ExternalLink aria-hidden className="h-4 w-4" />
              {tt("Profile")}
            </a>
            {m.email ? (
              <a href={`mailto:${m.email}`} className={linkClass}>
                <Mail aria-hidden className="h-4 w-4" />
                {tt("Email")}
              </a>
            ) : null}
          </div>
        ) : null}

        {groups.length ? (
          <div className="space-y-3" data-member-choices="">
            {groups.map((g, gi) => (
              <div key={`${g.name}-${gi}`}>
                {g.name ? <p className="mb-1 px-1 text-[12px] font-medium text-[#6b7280]">{g.name}</p> : null}
                <div className="overflow-hidden rounded-xl border border-[#eef0f2]">
                  {g.items.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => onChoose(c)}
                      data-member-choice={c.key}
                      className={cn(
                        "flex min-h-12 w-full cursor-pointer items-center border-t border-[#f1f2f4] px-4 text-left text-[14.5px] outline-none transition-colors duration-100 first:border-t-0 hover:bg-[#fafafb] active:bg-[#f3f4f6] focus-visible:bg-[#f3f4f6] sm:min-h-11 sm:text-[14px] [-webkit-tap-highlight-color:transparent]",
                        c.danger ? "text-[#b42318]" : "text-[#1a1a2e]",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : m.role === "owner" ? (
          <p className="text-[13px] text-[#6b7280]">{tt("The owner cannot be changed here.")}</p>
        ) : null}
      </div>
    </Dialog>
  )
}
