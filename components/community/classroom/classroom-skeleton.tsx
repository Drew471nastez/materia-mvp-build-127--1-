/**
 * The classroom and a course while they load, inside the member shell: the
 * page's own heading at once and the shapes of what is coming, the same
 * grid and sizes as the page so nothing moves when it arrives. The shapes
 * are `skeleton-deferred` (app/globals.css): invisible for the first 200ms,
 * so a quick page never shows grey at all.
 */
const BLOCK = "rounded-md bg-[#eceef1]"

export function ClassroomSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the classroom">
      <header className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">Classroom</h1>
      </header>
      <ul className="skeleton-deferred grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex flex-row gap-3 overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white p-3 min-[520px]:flex-col min-[520px]:gap-0 min-[520px]:p-0">
            <span className={`aspect-[16/9] w-[116px] shrink-0 ${BLOCK} rounded-lg min-[520px]:w-full min-[520px]:rounded-none`} />
            <span className="flex flex-1 flex-col gap-2 min-[520px]:px-3.5 min-[520px]:pb-3.5 min-[520px]:pt-3">
              <span className={`h-4 w-4/5 ${BLOCK}`} />
              <span className={`h-3 w-1/2 ${BLOCK}`} />
              <span className={`mt-3 h-1.5 w-full ${BLOCK}`} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CourseSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the course" className="skeleton-deferred pb-10">
      <div className="mb-4 flex items-start gap-3 sm:mb-5">
        <span className={`h-9 w-9 shrink-0 ${BLOCK} rounded-lg`} />
        <span className="flex flex-1 flex-col gap-2">
          <span className={`h-6 w-2/3 ${BLOCK}`} />
          <span className={`h-3.5 w-1/3 ${BLOCK}`} />
        </span>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <span className="-mx-4 block aspect-video bg-[#e4e6ea] sm:mx-0 sm:rounded-2xl" />
        <span className={`hidden h-[420px] rounded-2xl lg:block ${BLOCK}`} />
      </div>
    </div>
  )
}
