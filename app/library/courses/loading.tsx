/** The list's shape while it is read. */
export default function CoursesLoading() {
  return (
    <div className="skeleton-deferred">
      <div className="mb-5 h-7 w-32 rounded bg-neutral-200" />
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 border-b border-neutral-100 p-4 last:border-0">
            <div className="aspect-video w-28 shrink-0 rounded-lg bg-neutral-100 sm:w-40" />
            <div className="flex-1">
              <div className="h-5 w-2/3 rounded bg-neutral-200" />
              <div className="mt-2 h-4 w-28 rounded bg-neutral-100" />
              <div className="mt-4 h-1.5 w-full max-w-[280px] rounded bg-neutral-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
