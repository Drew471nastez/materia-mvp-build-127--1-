/**
 * The library while it loads: three rows in the shape the list draws
 * (components/library/library-home.tsx), so nothing moves when the real ones
 * land. The heading and the pills are the layout's and stay put.
 *
 * Deferred on a first load (.skeleton-deferred): a fast load never shows it.
 * After a pill was pressed it is shown at once instead, because the screen
 * it replaces is already gone and a blank wait is the one thing worse than a
 * skeleton (components/library/library-panel.tsx sets data-library-nav).
 */
export const TAB_SKELETON = "skeleton-deferred [[data-library-nav=tab]_&]:![animation:none] [[data-library-nav=tab]_&]:!opacity-100"

export default function LibraryLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <ListSkeleton />
    </div>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6" aria-hidden>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec] animate-pulse" />
          <div className="h-10 w-32 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec] animate-pulse" />
        </div>
        <div className="h-4 w-20 rounded bg-[#eceef1] animate-pulse" />
        <div className="divide-y divide-[#eef0f3] overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
              <div className="h-16 w-16 shrink-0 rounded-xl bg-[#f1f3f5] animate-pulse sm:h-[72px] sm:w-[72px]" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/5 rounded bg-[#eceef1] animate-pulse" />
                <div className="h-3.5 w-2/5 rounded bg-[#f1f3f5] animate-pulse" />
                <div className="h-3.5 w-1/3 rounded bg-[#f1f3f5] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden h-48 rounded-2xl border border-[#e4e7ec]/80 bg-white lg:block" />
    </div>
  )
}

/** Reviews and Receipts: one column of rows at most 760px wide, as those screens draw it. */
export function RowsSkeleton({ rows = 4, sections = 1 }: { rows?: number; sections?: number }) {
  return (
    <div className="max-w-[760px] space-y-7" aria-hidden>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s}>
          {sections > 1 ? <div className="mb-2.5 h-4 w-24 rounded bg-[#eceef1] animate-pulse" /> : null}
          <div className="divide-y divide-[#eef0f3] overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white">
            {Array.from({ length: s === 0 ? rows : Math.max(1, rows - 2) }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-[#f1f3f5] animate-pulse sm:h-12 sm:w-12" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-[#eceef1] animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-[#f1f3f5] animate-pulse" />
                </div>
                <div className="h-4 w-14 rounded bg-[#f1f3f5] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
