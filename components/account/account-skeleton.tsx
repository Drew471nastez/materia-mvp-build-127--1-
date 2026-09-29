/**
 * The profile's shapes while they come, all `skeleton-deferred`: a quick
 * load never shows a grey block at all.
 *
 *   OverviewSkeleton   the page under the person, who is already drawn
 *                      (app/account/page.tsx streams the rest)
 *   AccountSkeleton    the whole profile, for the native app while its gate
 *                      recovers the session (app/account/layout.tsx): the
 *                      centred person, Edit profile, and the library card
 */
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"

const BLOCK = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

export function OverviewSkeleton() {
  return (
    <div className="skeleton-deferred space-y-4 sm:space-y-5" aria-busy="true" data-account-skeleton="">
      <div className={BLOCK} style={{ height: 372 }} />
      <div className={BLOCK} style={{ height: 88 }} />
    </div>
  )
}

export function AccountSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] pt-6 pb-10" style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }} aria-busy="true">
      <div className="skeleton-deferred flex flex-col items-center">
        <div className="h-[112px] w-[112px] rounded-full bg-[#eceef1] md:h-[128px] md:w-[128px]" />
        <div className="mt-4 h-5 w-40 rounded bg-[#eceef1]" />
        <div className="mt-2.5 h-3.5 w-36 rounded bg-[#f1f3f5]" />
        <div className="mt-4 h-10 w-[140px] rounded-xl bg-[#f1f3f5]" />
        <div className="mt-6 w-full">
          <div className={BLOCK} style={{ height: 372 }} />
        </div>
      </div>
    </div>
  )
}
