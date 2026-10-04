/**
 * ===========================================================================
 *  YOUR COMMUNITIES, AS A PAGE OF YOUR PROFILE
 * ===========================================================================
 * Every community you run or are in, and the ones you have asked to join
 * (lib/communities/server/public.ts libraryCommunities), one row each with
 * where you stand in it. Drawn by /account/communities (the Communities
 * pill) and by /account itself for a creator, whose profile has no Activity
 * (app/account/page.tsx), so the two are one list and never drift apart.
 *
 * No "use client": a server component that reads with the service role.
 */
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { NOT_SET_UP } from "@/lib/communities/server/db"
import { libraryCommunities } from "@/lib/communities/server/public"
import { readPrivacy } from "@/lib/profile/privacy"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"

export async function accountCommunitiesBody(userId: string) {
  const db = createAdminClient()
  const [list, privacy] = await Promise.all([libraryCommunities(userId, db), readPrivacy(db, userId)])
  const active = list.rows.filter((r) => r.status === "active").length
  return (
    <div data-page-communities="" className="space-y-3 pb-4">
      {list.available && active > 0 ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-[14px] text-[#6b7280]">
          <span>
            {active} {active === 1 ? "community" : "communities"}
          </span>
          {!privacy.showCommunities ? (
            <>
              <span aria-hidden>·</span>
              <span data-profile-only-you="">Only you can see the ones you are in.</span>
              <Link href="/account/settings?section=privacy" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                Change
              </Link>
            </>
          ) : null}
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
