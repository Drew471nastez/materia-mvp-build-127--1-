"use client"

/**
 * ===========================================================================
 *  A MEMBER'S OWN PAGE IN A COMMUNITY: MEMBERSHIP
 * ===========================================================================
 * Round 13, ask 29: "a member's own community settings: a Membership page
 * reachable from the '...' menu (notifications level, leave, and for paid:
 * manage/cancel subscription, contact the owner)". Four calm sections in the
 * middle column, the way /account's settings read (a white card each, a
 * title, a line under it, the controls):
 *
 *   YOUR MEMBERSHIP  what they are here, their plan, since when, until when;
 *                    for a paid plan, where it is managed and cancelled
 *   NOTIFICATIONS    what they hear about from this community (the four
 *                    levels the inbox has always had, saved at once)
 *   CONTACT          the owner, when the community takes messages
 *   LEAVE            the same confirm the About page has, which asks why
 *
 * CANCEL AND CONTACT ARE WORKER M'S (components/community/membership/**:
 * CancelMembership and ContactOwner). Until they are in this branch the two
 * slots below are marked by name and the page offers what already works:
 * Manage subscription, the member's own subscription page in their library,
 * where a plan is changed or cancelled. Nothing here is a dead button.
 */
import Link from "next/link"
import { useState } from "react"
import { relativeTime } from "@/lib/communities/format"
import type { MemberSource, NotifyLevel, Role } from "@/lib/communities/types"
import { JoinProvider, useLeave } from "@/components/community/public/join-controls"
import type { JoinStateView, PublicCommunityView } from "@/components/community/public/types"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { toast } from "./toast"
import { BTN_SECONDARY, CARD_RAISED } from "./ui"

export interface MembershipFacts {
  role: Role
  source: MemberSource | null
  joinedAt: string | null
  expiresAt: string | null
  /** The tier's name when they are on one ("Studio members"). */
  planName: string | null
  notifyLevel: NotifyLevel
}

/** What they hear about, each with the line that says what it means. The inbox's four levels (notifications.tsx). */
export const NOTIFY_CHOICES: { key: NotifyLevel; label: string; help: string }[] = [
  { key: "all", label: "Everything", help: "New posts, replies, mentions, events and likes." },
  { key: "important", label: "Everything but likes", help: "New posts, replies, mentions and events." },
  { key: "mentions", label: "Only mentions and replies", help: "When someone mentions you or replies to you." },
  { key: "none", label: "Nothing", help: "No notifications from this community." },
]

const ROLE_WORD: Record<Role, string> = { owner: "Owner", admin: "Admin", moderator: "Moderator", member: "Member" }

const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" })

/** "March 2, 2025", or null. */
export function longDate(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? LONG_DATE.format(t) : null
}

/**
 * The plan in plain words: the tier's name for a paid one, how they came in
 * otherwise. A paid source without a tier name says what kind it is.
 */
export function planLabel(f: Pick<MembershipFacts, "source" | "planName" | "role">): string {
  if (f.role === "owner") return "You run this community"
  if (f.source === "subscription") return f.planName ? `${f.planName}, subscription` : "Paid subscription"
  if (f.source === "purchase") return f.planName ? `${f.planName}, one payment` : "One payment"
  if (f.source === "product") return "Comes with a product you own"
  if (f.source === "invite") return "Joined by invite"
  return f.planName && f.planName !== "Members" ? f.planName : "Free"
}

const SECTION = `${CARD_RAISED} p-4 sm:p-5`
const H2 = "text-[16px] font-semibold text-[#1a1a2e]"
const LEAD = "mt-0.5 text-[13.5px] leading-snug text-[#6b7280]"

function Row({ label, children, k }: { label: string; children: React.ReactNode; k: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2" data-membership-fact={k}>
      <dt className="shrink-0 text-[14px] text-[#6b7280]">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** A radio list in Storelib's form style: a ring that fills, the choice in ink, its line in grey under it. Saved on the press. */
function NotifyChoices({ communityId, initial }: { communityId: string; initial: NotifyLevel }) {
  const [level, setLevel] = useState<NotifyLevel>(initial)
  const [saving, setSaving] = useState<NotifyLevel | null>(null)
  const choose = async (next: NotifyLevel) => {
    if (next === level || saving) return
    const was = level
    setLevel(next)
    setSaving(next)
    const r = await api(`${apiBase(communityId)}/me`, { method: "PATCH", body: { notifyLevel: next } })
    setSaving(null)
    if (!r.ok) {
      setLevel(was)
      return toast(r.error)
    }
    toast("Saved")
  }
  return (
    <div role="radiogroup" aria-label="What you hear about from this community" className="mt-3 divide-y divide-[#f0f1f3]" data-membership-notify="">
      {NOTIFY_CHOICES.map((c) => {
        const on = level === c.key
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => void choose(c.key)}
            data-notify-choice={c.key}
            className="flex w-full touch-manipulation items-start gap-3 py-3 text-left outline-none first:pt-1 last:pb-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
          >
            <span
              aria-hidden
              className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-[border-color,background-color] duration-150 motion-reduce:transition-none ${on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#c9ccd3] bg-white"}`}
            >
              <span className={`h-[7px] w-[7px] rounded-full bg-white transition-[scale,opacity] duration-150 motion-reduce:transition-none ${on ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium leading-snug text-[#1a1a2e]">{c.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[#6b7280]">{c.help}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LeaveSection({ paying, manageHref, name }: { paying: boolean; manageHref: string | null; name: string }) {
  const { canLeave, open, busy, error } = useLeave()
  if (!canLeave) return null
  return (
    <section className={SECTION} aria-labelledby="membership-leave" data-membership-leave-section="">
      <h2 id="membership-leave" className={H2}>
        Leave {name}
      </h2>
      {paying && manageHref ? (
        /* One way to cancel on the page: Manage subscription, in Your membership above. */
        <p className={LEAD} data-membership-cancel-first="">
          Your plan renews until you cancel it. To leave, cancel it under Your membership; you keep access until the end of the period you paid for.
        </p>
      ) : (
        <>
          <p className={LEAD}>You can join again later. Your posts and comments stay.</p>
          <div className="mt-3.5">
            <button type="button" onClick={open} disabled={busy} className={`${BTN_SECONDARY} text-[#b42318]`} data-membership-leave="">
              Leave community
            </button>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-2.5 text-[13px] text-[#b42318]">
          {error}
        </p>
      ) : null}
    </section>
  )
}

export function MembershipPage({ community, join, askWhy, facts }: { community: PublicCommunityView; join: JoinStateView; askWhy: boolean; facts: MembershipFacts }) {
  const paying = facts.source === "subscription" && !!join.manageHref
  const since = longDate(facts.joinedAt)
  const until = longDate(facts.expiresAt)
  return (
    <JoinProvider community={community} join={join} askWhy={askWhy}>
      <div className="max-w-[720px] space-y-3" data-membership-page="">
        <PageTitle title="Membership" detail={community.name} />

        <section className={SECTION} aria-labelledby="membership-yours" data-membership-yours="">
          <h2 id="membership-yours" className={H2}>
            Your membership
          </h2>
          <dl className="mt-2 divide-y divide-[#f0f1f3]">
            <Row label="Role" k="role">
              {ROLE_WORD[facts.role] ?? "Member"}
            </Row>
            <Row label="Plan" k="plan">
              {planLabel(facts)}
            </Row>
            {since ? (
              <Row label="Member since" k="since">
                <span title={relativeTime(facts.joinedAt!)}>{since}</span>
              </Row>
            ) : null}
            {until ? (
              <Row label={paying ? "Current period ends" : "Access until"} k="until">
                {until}
              </Row>
            ) : null}
          </dl>
          {paying ? (
            <div className="mt-3.5 flex flex-wrap gap-2" data-membership-billing="">
              {/*
                SLOT: CancelMembership (worker M, components/community/membership/**). When it is in this branch it is mounted here,
                beside Manage subscription: <CancelMembership communityId={community.id} slug={community.slug} endsAt={facts.expiresAt} />.
                Until then Manage subscription is where a plan is cancelled (the member's subscription page in their library).
              */}
              <Link href={join.manageHref!} className={BTN_SECONDARY} data-membership-manage="">
                Manage subscription
              </Link>
            </div>
          ) : null}
        </section>

        <section className={SECTION} aria-labelledby="membership-notify" data-membership-notify-section="">
          <h2 id="membership-notify" className={H2}>
            Notifications
          </h2>
          <p className={LEAD}>What you hear about from {community.name}.</p>
          <NotifyChoices communityId={community.id} initial={facts.notifyLevel} />
        </section>

        {/*
          SLOT: ContactOwner (worker M, components/community/membership/**): a section here, "Contact the owner", with the form
          (subject and message, delivered to the owner's inbox) and their public contact email when they chose to show it:
          <ContactOwner communityId={community.id} ownerName={community.creator?.name ?? null} />. Nothing is drawn until it is in.
        */}

        <LeaveSection paying={paying} manageHref={join.manageHref} name={community.name} />
      </div>
    </JoinProvider>
  )
}
