/**
 * Events and one event while they load, inside the member shell: the
 * heading at once, then the list's or the page's own shape, so nothing moves
 * when it arrives. The shapes are `skeleton-deferred` (app/globals.css):
 * invisible for the first 200ms, so a quick page never shows grey at all.
 */
const BLOCK = "rounded-md bg-[#eceef1]"

export function EventsSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading events">
      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">Events</h1>
        <span className="h-10 w-[180px] rounded-[10px] bg-[#eef0f3] sm:h-[38px]" />
      </header>
      <ul className="skeleton-deferred divide-y divide-[#eef0f3] overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex items-start gap-3.5 px-3.5 py-3.5 sm:gap-4 sm:px-4">
            <span className={`h-[52px] w-12 shrink-0 rounded-xl ${BLOCK}`} />
            <span className="flex flex-1 flex-col gap-2 pt-0.5">
              <span className={`h-3 w-1/3 ${BLOCK}`} />
              <span className={`h-4 w-2/3 ${BLOCK}`} />
              <span className={`h-3 w-1/4 ${BLOCK}`} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function EventSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the event" className="skeleton-deferred pb-10">
      <span className={`mb-3 block h-10 w-24 ${BLOCK}`} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <div className="flex flex-col gap-3">
          <span className={`aspect-[2/1] w-full rounded-2xl ${BLOCK}`} />
          <span className={`h-7 w-3/4 ${BLOCK}`} />
          <span className={`h-10 w-1/2 ${BLOCK}`} />
          <span className={`h-10 w-1/3 ${BLOCK}`} />
        </div>
        <span className="h-[260px] rounded-2xl border border-[#e4e7ec]/80 bg-white" />
      </div>
    </div>
  )
}
