export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-7 w-28 rounded bg-neutral-200 animate-pulse mb-2" />
        <div className="h-4 w-48 rounded bg-neutral-100 animate-pulse" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200 pb-px">
        <div className="h-9 w-20 rounded-lg bg-neutral-100 animate-pulse" />
        <div className="h-9 w-20 rounded-lg bg-neutral-100 animate-pulse" />
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
