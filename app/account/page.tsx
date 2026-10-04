import { Suspense } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { activityFor } from "@/lib/profile/activity-page"
import { readPrivacy } from "@/lib/profile/privacy"
import { ProfileActivity } from "@/components/profile/profile-activity"
import { OverviewSkeleton } from "@/components/account/account-skeleton"

export const dynamic = "force-dynamic"

/**
 * Your activity, exactly as the Activity tab of your public profile lists
 * it (lib/profile/activity-page.ts with you as the viewer, so a list you
 * chose to hide is still yours to see, with a line saying so). It always
 * ends on the day you joined, so it is never an empty box.
 */
async function activityBody(user: User) {
  const db = createAdminClient()
  const [page, privacy] = await Promise.all([
    activityFor(db, { userId: user.id, viewerId: user.id }).catch(() => ({ items: [], next: null, hidden: false })),
    readPrivacy(db, user.id),
  ])
  return (
    <ProfileActivity
      userId={user.id}
      initial={page.items}
      initialNext={page.next}
      now={Date.now()}
      joinedAt={user.created_at || null}
      hiddenNote={
        privacy.showActivity ? undefined : (
          <p className="mb-3 flex flex-wrap items-center justify-center gap-x-1.5 rounded-xl bg-[#f1f2f4] px-4 py-2.5 text-center text-[13px] leading-[1.45] text-[#4b5563]" data-profile-only-you="">
            Only you can see your activity.
            <Link href="/account/settings?section=privacy" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
              Change
            </Link>
          </p>
        )
      }
      emptyText="Nothing here yet. Join a community or review something you bought and it shows up here."
    />
  )
}

/**
 * /account: your profile, as everybody sees it, opened on Activity. The
 * person and the pills are the layout's and are drawn at once; the list
 * streams in under them, with a deferred skeleton a quick answer never shows.
 */
export default async function AccountActivityRoute() {
  const user = await pageUser(accountLoginPath("/account"))
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      {/* A promise as the child, as app/app/payouts/page.tsx does: React waits for it inside this boundary. */}
      {activityBody(user)}
    </Suspense>
  )
}
