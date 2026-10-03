import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { NOT_SET_UP } from "@/lib/communities/server/db"
import { libraryCommunities } from "@/lib/communities/server/public"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Communities" }

/**
 * /library/communities: every community this person is in, and the ones they
 * have asked to join (lib/communities/server/public.ts libraryCommunities).
 * Signed in only; the library layout sees to that. A 404 with communities
 * switched off, like every community address.
 */
export default async function LibraryCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const { user } = await currentUserForRequest()
  if (!user) return null
  const list = await libraryCommunities(user.id)
  const active = list.rows.filter((r) => r.status === "active").length
  return (
    <div data-page-communities="" className="space-y-3 pb-4">
      {list.available && active > 0 ? (
        <p className="text-[14px] text-[#6b7280]">
          {active} {active === 1 ? "community" : "communities"}
        </p>
      ) : null}
      {list.available ? (
        <LibraryCommunitiesList rows={list.rows} />
      ) : (
        <div className="rounded-2xl border border-[#e4e7ec]/80 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">{NOT_SET_UP}</div>
      )}
    </div>
  )
}
