/**
 * ===========================================================================
 *  THE COMMUNITIES SOMEBODY IS IN: /account/communities
 * ===========================================================================
 * One row per community, drawn by the one community card in its compact
 * shape (components/explore/community-card.tsx, layout "row"): the same
 * mark, title face, creator line and stats row as Explore, led by where
 * they stand in it, a role when they hold one, the tier, or "Request sent"
 * while an admin has not answered. The whole row opens the community (a
 * request opens its About). Requests come after the communities they are in.
 *
 * No hooks: drawn on the server and by the probe.
 */
import { ExploreCommunityCard, type CommunityStanding } from "@/components/explore/community-card"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import type { Role } from "@/lib/communities/types"
import type { LibraryCommunityRow } from "./types"

const ROLE_WORD: Partial<Record<Role, string>> = { owner: "Owner", admin: "Admin", moderator: "Moderator" }

export function standingOf(row: Pick<LibraryCommunityRow, "status" | "role" | "tierName">): CommunityStanding {
  if (row.status === "pending") return { label: "Request sent", pending: true }
  return { label: ROLE_WORD[row.role] ?? row.tierName ?? "Member" }
}

export function LibraryCommunitiesList({ rows }: { rows: LibraryCommunityRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-communities-empty="">
        <LibraryEmptyState title="No communities yet" description="Communities you join show up here, with the ones you've asked to join." ctaLabel="Find a community" ctaHref="/explore?type=communities" />
      </div>
    )
  }
  return (
    <ul className="space-y-2.5" aria-label="Your communities" data-library-communities="">
      {rows.map((r) => (
        <li key={r.id} data-community-row={r.slug} className="min-w-0">
          <ExploreCommunityCard card={r.card} layout="row" standing={standingOf(r)} href={r.status === "pending" ? `${r.url}/about` : r.url} />
        </li>
      ))}
    </ul>
  )
}
