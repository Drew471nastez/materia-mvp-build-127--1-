import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { fullUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadLibraryMemberships } from "@/lib/memberships/library"
import { NOT_SET_UP, viewerOf } from "@/lib/memberships/server"
import { provenViewer } from "@/lib/memberships/viewer"
import { MembershipsList } from "@/components/memberships/library-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Memberships" }

/**
 * /library/memberships: every membership this person has, from any creator
 * (lib/memberships/library.ts). Signed in only; the library layout sees to
 * that, and in the app its gate restores the session first.
 *
 * NOT A PILL ANY MORE. Memberships are communities now: the ones bought on
 * their own are rows of the library's Products, labelled Membership, and a
 * paid community's is under Communities. This address keeps answering for
 * the links and emails that point at it, with every membership listed, so
 * it has its own way back to the library instead of the pills above.
 */
export default async function LibraryMembershipsPage() {
  const { user } = await fullUserForRequest()
  const viewer = await provenViewer(viewerOf(user))
  if (!viewer) return null
  const list = await loadLibraryMemberships(createAdminClient(), viewer)
  const count = list.available ? list.current.length : 0
  return (
    <div data-page-memberships="" className="space-y-3 pb-4">
      <Link href="/account/library" className="-mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-[13.5px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Library
      </Link>
      {list.available && count > 0 ? (
        <p className="text-[14px] text-[#6b7280]">
          {count} {count === 1 ? "membership" : "memberships"} · posts from creators you support
        </p>
      ) : null}
      {list.available ? (
        <MembershipsList current={list.current} ended={list.ended} />
      ) : (
        <div className={`rounded-2xl border border-[#e4e7ec]/80 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]`}>{NOT_SET_UP}</div>
      )}
    </div>
  )
}
