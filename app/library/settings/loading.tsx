export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Header card skeleton — matches the new page header card */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-neutral-200 animate-pulse" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 animate-pulse shrink-0" />
            <div className="h-7 w-20 rounded-lg bg-neutral-100 animate-pulse mt-8 sm:mt-0" />
          </div>
          <div className="h-6 w-28 rounded bg-neutral-200 animate-pulse mb-2" />
          <div className="h-4 w-48 rounded bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 mb-6 pb-1">
        <div className="h-9 w-24 rounded-full bg-neutral-100 animate-pulse" />
        <div className="h-9 w-24 rounded-full bg-neutral-100 animate-pulse" />
      </div>

      {/* Avatar + form skeleton */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-neutral-100 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-neutral-200 animate-pulse" />
            <div className="h-3 w-24 rounded bg-neutral-100 animate-pulse" />
          </div>
        </div>

        {/* Form fields */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 rounded bg-neutral-100 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-neutral-100 animate-pulse" />
          </div>
        ))}

        {/* Button */}
        <div className="h-10 w-32 rounded-lg bg-neutral-200 animate-pulse" />
      </div>
    </div>
  )
}
