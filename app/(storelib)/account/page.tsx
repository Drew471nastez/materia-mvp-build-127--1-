import { Suspense } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { activityFor } from "@/lib/profile/activity-page"
import { readPrivacy } from "@/lib/profile/privacy"
import { ProfileActivity } from "@/components/profile/profile-activity"
import { AccountAbout } from "@/components/profile/account-about"
import { ACCOUNT_REFRESH_SCOPE } from "@/lib/profile/refresh-scope"
import { OverviewSkeleton } from "@/components/account/account-skeleton"
import { accountCommunitiesBody } from "@/components/account/account-communities-body"
import { secondaryDepth } from "@/components/ui/depth-button"
import { communitiesEnabled } from "@/lib/communities/flag"
import { accountIsCreator } from "@/lib/profile/account-creator"
import { profileForRequest } from "@/lib/auth/request-scope"
import { getStoreInternalPath } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

/**
 * Your activity, exactly as the Activity tab of your public profile lists
 * it (lib/profile/activity-page.ts with you as the viewer, so a list you
 * chose to hide is still yours to see, with a line saying so). Real
 * activity only: it used to end on "Joined Storelib", which is not
 * something anybody did, and the day you joined is said under About
 * instead (components/profile/account-about.tsx).
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
      refreshScope={ACCOUNT_REFRESH_SCOPE}
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
 * A CREATOR'S /account HAS NO ACTIVITY. The owner: "In creator pages or
 * creator profiles there should be no activity." Somebody with a live store
 * opens on their Communities, the list /account/communities draws, and the
 * Communities pill lights here (lib/profile/owner-pills.ts). With
 * communities switched off there is nothing of the profile's own to list,
 * so it is one line and the way to the page people do see: their store.
 */
async function creatorBody(user: User) {
  if (await communitiesEnabled().catch(() => false)) return accountCommunitiesBody(user.id)
  const handle = (await profileForRequest(user.id))?.username || null
  return (
    <div className="rounded-2xl border border-[#e4e7ec]/80 bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]" data-account-creator-page="">
      <p className="text-[14px] text-[#6b7280]">People who visit you see your store.</p>
      {handle ? (
        <Link href={getStoreInternalPath(handle)} className={cn(secondaryDepth, "mt-4 h-10 rounded-xl px-5 text-[14px]")}>
          View your page
        </Link>
      ) : null}
    </div>
  )
}

/**
 * /account: your profile, as everybody sees it, opened on Activity (on
 * Communities for a creator, see creatorBody). The person and the pills are
 * the layout's and are drawn at once; the list streams in under them, with
 * a deferred skeleton a quick answer never shows.
 */
export default async function AccountActivityRoute() {
  const user = await pageUser(accountLoginPath("/account"))
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  /* The layout asked the same question for the pills; cached for the request, so this is no second read. */
  const creator = await accountIsCreator(user.id)
  const name = (await profileForRequest(user.id))?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || "you"
  return (
    <>
      <Suspense fallback={<OverviewSkeleton />}>
        {/* A promise as the child, as app/app/payouts/page.tsx does: React waits for it inside this boundary. */}
        {creator ? creatorBody(user) : activityBody(user)}
      </Suspense>
      {/* The page ends the way /@handle ends: who this person is, in facts. Streamed, so it never holds the list up. */}
      <Suspense fallback={null}>
        {AccountAbout({ userId: user.id, name, joinedAt: user.created_at || null })}
      </Suspense>
    </>
  )
}
