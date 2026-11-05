/** The player's shape while the course is read: the video, then the lessons beside it. */
export default function CourseLoading() {
  return (
    <div className="skeleton-deferred pb-10">
      <div className="mb-5 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-neutral-100" />
        <div className="flex-1">
          <div className="h-6 w-2/3 max-w-[360px] rounded bg-neutral-200" />
          <div className="mt-2 h-4 w-32 rounded bg-neutral-100" />
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="-mx-4 aspect-video bg-neutral-200 sm:mx-0 sm:rounded-2xl" />
        <div className="mt-4 hidden h-[420px] rounded-2xl border border-neutral-200 bg-white lg:mt-0 lg:block" />
      </div>
    </div>
  )
}
