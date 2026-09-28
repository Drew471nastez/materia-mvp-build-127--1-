import type { Metadata } from "next"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadLibraryMemberships } from "@/lib/memberships/library"
import { NOT_SET_UP, viewerOf } from "@/lib/memberships/server"
import { MembershipsList } from "@/components/memberships/library-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Memberships" }

/**
 * /library/memberships: every membership this person has, from any creator
 * (lib/memberships/library.ts). Signed in only; the library layout sees to
 * that, and in the app its gate restores the session first.
 */
export default async function LibraryMembershipsPage() {
  const { user } = await currentUserForRequest()
  const viewer = viewerOf(user)
  if (!viewer) return null
  const list = await loadLibraryMemberships(createAdminClient(), viewer)
  const count = list.available ? list.current.length : 0
  return (
    <div data-page-memberships="" className="mx-auto max-w-3xl px-0.5 pb-10 sm:px-0">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Memberships</h1>
          <p className="mt-0.5 text-[14px] text-[#6b7280]">
            {!list.available ? "" : count === 0 ? "Creators you support, and what they post for members" : `${count} ${count === 1 ? "membership" : "memberships"} running`}
          </p>
        </div>
      </header>
      {list.available ? (
        <MembershipsList current={list.current} ended={list.ended} />
      ) : (
        <div className="rounded-2xl border border-[#e5e7eb]/70 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280]">{NOT_SET_UP}</div>
      )}
    </div>
  )
}
