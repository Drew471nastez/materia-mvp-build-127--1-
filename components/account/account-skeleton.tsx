/**
 * The profile's shapes while they come, all `skeleton-deferred`: a quick
 * load never shows a grey block at all.
 *
 *   OverviewSkeleton   the overview's cards, under a header and tabs that
 *                      are already drawn (app/account/page.tsx streams them)
 *   AccountSkeleton    the whole profile, for the native app while its gate
 *                      recovers the session (app/account/layout.tsx)
 */

const BLOCK = "rounded-2xl border border-[#e5e7eb] bg-white shadow-sm"

export function OverviewSkeleton() {
  return (
    <div className="skeleton-deferred space-y-4 sm:space-y-5" aria-busy="true" data-account-skeleton="">
      <div className={BLOCK} style={{ height: 292 }} />
      <div className={BLOCK} style={{ height: 244 }} />
      <div className={BLOCK} style={{ height: 82 }} />
    </div>
  )
}

export function AccountSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-6 sm:px-6 sm:pt-10" aria-busy="true">
      <div className="skeleton-deferred">
        <div className="flex items-center gap-3.5 sm:gap-5">
          <div className="h-16 w-16 shrink-0 rounded-full bg-[#eceef1] sm:h-20 sm:w-20" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 rounded bg-[#eceef1]" />
            <div className="h-3.5 w-28 rounded bg-[#f1f3f5]" />
          </div>
        </div>
        <div className="mt-5 flex gap-1 sm:mt-6">
          <div className="h-10 w-[100px] rounded-full bg-[#eceef1]" />
          <div className="h-10 w-[88px] rounded-full bg-[#f1f3f5]" />
        </div>
        <div className="mt-5 sm:mt-6">
          <div className={BLOCK} style={{ height: 292 }} />
        </div>
      </div>
    </div>
  )
}
