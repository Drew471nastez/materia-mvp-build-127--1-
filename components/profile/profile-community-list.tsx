/**
 * ===========================================================================
 *  THE COMMUNITIES A PERSON IS IN, ON THEIR PROFILE
 * ===========================================================================
 * The owner asked for "a different, clean UI for that list": the profile is
 * about a person, so the communities they are in read as a list of places
 * on their page, not as Explore's grid of big cover cards competing with
 * them. Each is the shared card's compact row (components/explore/
 * community-card.tsx, layout "row", the one the library lists your own
 * communities with): its mark, its name, who runs it, a line about it and
 * its real member count, the whole row one link and one easy press.
 *
 *   RUNS        the communities they made, first, when they made any
 *   MEMBER OF   the ones they joined (only when they show them, decided by
 *               the page: lib/profile/privacy)
 *
 * With both, each gets a small heading; with one, none. Real counts only,
 * from the cards the page already read (lib/profile/profile-communities).
 * One community card on Storelib (tests/community-cards), so nothing here
 * draws a card of its own.
 *
 * No "use client": the profile is drawn on the server.
 */
import { ExploreCommunityCard } from "@/components/explore/community-card"
import type { CommunityCard } from "@/lib/communities/types"

function Group({ title, cards, owned }: { title: string | null; cards: CommunityCard[]; owned: boolean }) {
  if (!cards.length) return null
  return (
    <section aria-label={title ?? "Communities"} className="min-w-0">
      {title ? <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">{title}</h2> : null}
      <ul className="space-y-2.5" data-profile-community-list={owned ? "owned" : "member"}>
        {cards.map((c, i) => (
          <li key={c.id} className="min-w-0" data-profile-community={c.slug}>
            <ExploreCommunityCard card={c} layout="row" priority={i < 3} />
          </li>
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
