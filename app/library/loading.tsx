export default function LibraryLoading() {
  return (
    <div className="space-y-5 px-2 sm:px-0 animate-pulse">
      <div className="h-8 w-52 rounded bg-neutral-200" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-2xl bg-neutral-100" />
        <div className="h-28 rounded-2xl bg-neutral-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="aspect-video bg-neutral-100" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 rounded bg-neutral-200" />
              <div className="h-4 w-1/2 rounded bg-neutral-100" />
              <div className="h-4 w-1/3 rounded bg-neutral-100" />
            </div>
            <div className="border-t border-neutral-200 p-3">
              <div className="h-10 rounded-lg bg-neutral-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
