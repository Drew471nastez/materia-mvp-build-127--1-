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
import { StatusBadge } from "@/app/(storelib)/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import type { MemberSource } from "@/lib/communities/types"
import type { CommunityHead, MemberRowView } from "./view-types"
import { ROLE_LABEL, takenAwayLine, type MemberChoice } from "./logic"
import { Dialog, buttonSecondary, shortDate } from "./parts"
import { Facts } from "./ui-kit"
import { sectionTitle } from "./member-actions"
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
  const kept = React.useRef<MemberRowView | null>(member)
  if (member) kept.current = member
  const m = member ?? kept.current
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
            </div>
          </div>
        </div>

        {pending && m.requestNote ? <p className="rounded-xl border border-[#eef0f2] px-4 py-3 text-[14px] leading-relaxed text-[#1a1a2e]" data-member-note="">&ldquo;{m.requestNote}&rdquo;</p> : null}
        {(out || m.mutedUntil) && m.acted ? <p className="text-[13.5px] leading-snug text-[#4b5563]" data-member-acted="">{takenAwayLine(m)}</p> : null}

        <Facts items={facts} />

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
