/**
 * The profile's shapes while they come, all `skeleton-deferred`: a quick
 * load never shows a grey block at all.
 *
 *   OverviewSkeleton   the overview's cards, under a header and tabs that
 *                      are already drawn (app/account/page.tsx streams them)
 *   AccountSkeleton    the whole profile, for the native app while its gate
 *                      recovers the session (app/account/layout.tsx): the
 *                      phone's bar, the centred person, the tabs, a card
 */
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"

const BLOCK = "rounded-2xl border border-[#e5e7eb] bg-white shadow-sm"

export function OverviewSkeleton() {
  return (
    <div className="skeleton-deferred space-y-4 sm:space-y-5" aria-busy="true" data-account-skeleton="">
      <div className={BLOCK} style={{ height: 332 }} />
      <div className={BLOCK} style={{ height: 212 }} />
      <div className={BLOCK} style={{ height: 88 }} />
    </div>
  )
}

export function AccountSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] pb-10 md:pt-10" style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }} aria-busy="true">
      {/* The phone's bar is the page's own grey: its room, so nothing drops when the page arrives. */}
      <div className="md:hidden" style={{ height: "calc(52px + env(safe-area-inset-top, 0px))" }} />
      <div className="skeleton-deferred flex flex-col items-center pt-3 md:pt-0">
        <div className="h-24 w-24 rounded-full bg-[#eceef1] md:h-28 md:w-28" />
        <div className="mt-4 h-5 w-40 rounded bg-[#eceef1]" />
        <div className="mt-2.5 h-3.5 w-28 rounded bg-[#f1f3f5]" />
        <div className="mt-5 h-10 w-[140px] rounded-xl bg-[#f1f3f5]" />
        <div className="mt-5 flex gap-1 md:mt-6">
          <div className="h-10 w-[104px] rounded-full bg-[#eceef1]" />
          <div className="h-10 w-[104px] rounded-full bg-[#f1f3f5]" />
        </div>
        <div className="mt-5 w-full md:mt-6">
          <div className={BLOCK} style={{ height: 332 }} />
        </div>
      </div>
    </div>
  )
}
