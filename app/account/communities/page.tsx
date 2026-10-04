import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { createAdminClient } from "@/lib/supabase/admin"
import { communitiesEnabled } from "@/lib/communities/flag"
import { NOT_SET_UP } from "@/lib/communities/server/db"
import { libraryCommunities } from "@/lib/communities/server/public"
import { readPrivacy } from "@/lib/profile/privacy"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Communities" }

/**
 * /account/communities: the Communities pill of your profile. Every
 * community you run or are in, and the ones you have asked to join
 * (lib/communities/server/public.ts libraryCommunities), one row each with
 * where you stand in it. It used to be a tab of the library
 * (/library/communities, which now answers with this address). A 404 with
 * communities switched off, like every community address.
 */
export default async function AccountCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser(accountLoginPath("/account/communities"))
  if (!user) return null
  const db = createAdminClient()
  const [list, privacy] = await Promise.all([libraryCommunities(user.id, db), readPrivacy(db, user.id)])
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
