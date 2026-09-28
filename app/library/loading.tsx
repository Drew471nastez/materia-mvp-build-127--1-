/**
 * The library while it loads: its heading, its tabs and three rows in the
 * shape the list draws (components/library/library-home.tsx), so nothing
 * moves when the real ones land. Deferred: a fast load never shows it.
 */
export default function LibraryLoading() {
  return (
    <div className="skeleton-deferred">
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
