/**
 * ===========================================================================
 *  THE COMMUNITIES A PERSON IS IN, ON THEIR PROFILE
 * ===========================================================================
 * The owner asked for "a different, clean UI for that list": the profile is
 * about a person, so the communities they are in read as a list of places
 * on their page, not as Explore's grid of big cover cards competing with
 * them. One white card (the app's card), a row per community: its logo, its
 * name, who runs it and how many are in it, and a chevron. The whole row is
 * the link, 64px tall, so it is one easy press on a phone.
 *
 *   RUNS        the communities they made, first, when they made any
 *   MEMBER OF   the ones they joined (only when they show them, decided by
 *               the page: lib/profile/privacy)
 *
 * With both, each gets a small heading; with one, none. Real counts only,
 * from the cards the page already read (lib/profile/profile-communities).
 *
 * No "use client": the profile is drawn on the server; the logo is the one
 * avatar component, as a mark (a community has a name, not a face).
 */
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { compactCount } from "@/lib/communities/format"
import type { CommunityCard } from "@/lib/communities/types"

const CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

function Row({ card, owned }: { card: CommunityCard; owned: boolean }) {
  const by = owned ? null : card.creator?.name?.trim() || null
  const members = `${compactCount(card.memberCount)} ${card.memberCount === 1 ? "member" : "members"}`
  return (
    <li>
      <Link
        href={card.url}
        className="group/row flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f6f7f9] pointer-fine:hover:bg-[#fafafa] active:bg-[#f4f5f7] active:duration-0 sm:px-5"
        data-profile-community={card.slug}
      >
        <AppAvatar src={card.logoUrl} name={card.name} alt="" size={44} kind="mark" markWhileLoading className="rounded-[11px] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-[1.3] text-[#1a1a2e]">{card.name}</span>
          <span className="mt-0.5 block truncate text-[13px] leading-[1.35] text-[#6b7280]">
            {by ? (
              <>
                by <span className="text-[#4b5563]">{by}</span>
                <span className="mx-1.5 text-[#c4c8cf]" aria-hidden>
                  ·
                </span>
              </>
            ) : null}
            {members}
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#c4c8cf] transition-[translate] duration-150 pointer-fine:group-hover/row:translate-x-0.5" strokeWidth={2} aria-hidden />
      </Link>
    </li>
  )
}

function Group({ title, cards, owned }: { title: string | null; cards: CommunityCard[]; owned: boolean }) {
  if (!cards.length) return null
  return (
    <section aria-label={title ?? "Communities"} className="min-w-0">
      {title ? <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">{title}</h2> : null}
      <ul className={`${CARD} divide-y divide-[#f0f1f3]`} data-profile-community-list={owned ? "owned" : "member"}>
        {cards.map((c) => (
          <Row key={c.id} card={c} owned={owned} />
        ))}
      </ul>
    </section>
  )
}

export function ProfileCommunityList({ owned, member }: { owned: CommunityCard[]; member: CommunityCard[] }) {
  const both = owned.length > 0 && member.length > 0
  return (
    <div className="mx-auto w-full max-w-[680px] space-y-6" data-profile-communities="">
      <Group title={both ? "Runs" : null} cards={owned} owned />
      <Group title={both ? "Member of" : null} cards={member} owned={false} />
    </div>
  )
}
