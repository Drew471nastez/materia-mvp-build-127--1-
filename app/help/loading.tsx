export default function HelpLoading() {
  return (
    <div className="min-h-screen bg-white skeleton-deferred">
      {/* Hero / header band */}
      <div className="bg-gradient-to-b from-[#fafafa] to-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          {/* Back button stub */}
          <div className="h-8 w-20 rounded-lg bg-gray-100 animate-pulse mb-6" />

          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-violet-100 animate-pulse shrink-0 mt-1" />
            <div className="flex-1 space-y-3">
              {/* Title */}
              <div className="h-9 sm:h-11 w-52 sm:w-72 rounded-xl bg-gray-200 animate-pulse" />
              {/* Subtitle */}
              <div className="h-4 w-80 rounded-md bg-gray-100 animate-pulse" />
              {/* Search bar */}
              <div className="mt-5 max-w-xl">
                <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">

        {/* Category grid */}
        <section>
          <div className="h-7 w-40 rounded-lg bg-gray-200 animate-pulse mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 p-5 space-y-3"
                style={{ opacity: 1 - i * 0.08 }}
              >
                {/* Icon + title row */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                  <div className="h-5 w-32 rounded-md bg-gray-200 animate-pulse" />
                </div>
                {/* Description */}
                <div className="h-3.5 w-full rounded bg-gray-100 animate-pulse" />
                {/* Article links */}
                <div className="space-y-2 pt-1">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="h-3 rounded bg-gray-100 animate-pulse" style={{ width: `${75 - j * 8}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Popular articles list */}
        <section>
          <div className="h-7 w-44 rounded-lg bg-gray-200 animate-pulse mb-5" />
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-gray-100 animate-pulse shrink-0" />
                  <div className="h-4 rounded-md bg-gray-200 animate-pulse" style={{ width: `${200 - i * 15}px` }} />
                </div>
                <div className="h-3.5 w-24 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
