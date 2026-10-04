/**
 * ===========================================================================
 *  THE COMMUNITIES SOMEBODY IS IN: /library/communities
 * ===========================================================================
 * One row per community, the way the memberships tab draws a membership
 * (components/memberships/library-list.tsx): its logo, its name, whose it
 * is, and where they stand in it, a role when they hold one, the tier, or
 * "Request sent" while an admin has not answered. The whole row opens the
 * community. Requests come after the communities they are in.
 *
 * No hooks: drawn on the server and by the probe.
 */
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { memberCountLabel } from "@/lib/communities/format"
import type { Role } from "@/lib/communities/types"
import { cn } from "@/lib/utils"
import type { LibraryCommunityRow } from "./types"

const ROLE_WORD: Partial<Record<Role, string>> = { owner: "Owner", admin: "Admin", moderator: "Moderator" }

function Logo({ row }: { row: LibraryCommunityRow }) {
  const src = row.logoUrl || row.coverUrl
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={optimizedImageUrl(src, 128)} alt="" width={52} height={52} loading="lazy" decoding="async" className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover" />
    )
  }
  return <AppAvatar src={null} name={row.name} alt="" size={52} className="rounded-xl" />
}

function Row({ row }: { row: LibraryCommunityRow }) {
  const pending = row.status === "pending"
  const standing = pending ? "Request sent" : ROLE_WORD[row.role] ?? row.tierName ?? "Member"
  return (
    <li>
      <Link
        href={pending ? `${row.url}/about` : row.url}
        data-community-row={row.slug}
        className={cn(
          "group/row flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-[#e5e7eb]/70 bg-white px-3.5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#d9dce1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:gap-4 sm:px-5 sm:py-4",
          pending && "bg-white/70",
        )}
      >
        <Logo row={row} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15.5px] font-semibold leading-snug", pending ? "text-[#4b5563]" : "text-[#1a1a2e]")}>{row.name}</p>
          {row.creatorName ? <p className="truncate text-[13px] text-[#6b7280]">by {row.creatorName}</p> : null}
          <p className="mt-1 truncate text-[13px] text-[#6b7280]">
            <span className={cn("font-medium", pending ? "text-[#92400e]" : "text-[#1a1a2e]")}>{standing}</span>
            <span aria-hidden> · </span>
            <span className="tabular-nums">{memberCountLabel(row.memberCount)}</span>
          </p>
        </div>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate] duration-150 group-hover/row:translate-x-0.5" />
      </Link>
    </li>
  )
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
        <Row key={r.id} row={r} />
      ))}
    </ul>
  )
}
