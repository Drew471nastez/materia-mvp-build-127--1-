export default function CreateCouponLoading() {
  return (
    <div className="h-full flex flex-col bg-gray-50/40">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shrink-0">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse shrink-0" />
          <div className="h-5 w-36 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {/* Code */}
            <div className="px-5 sm:px-6 py-5 space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
            </div>
            {/* Discount */}
            <div className="px-5 sm:px-6 py-5 space-y-2">
              <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-11 w-36 sm:w-40 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            </div>
            {/* Applies to */}
            <div className="px-5 sm:px-6 py-5 space-y-2">
              <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-10 flex-1 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-10 flex-1 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            </div>
            {/* Usage limit */}
            <div className="px-5 sm:px-6 py-5 space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
            </div>
            {/* Option rows */}
            <div className="px-5 sm:px-6 py-4">
              <div className="h-5 w-48 rounded bg-gray-100 animate-pulse" />
            </div>
            <div className="px-5 sm:px-6 py-4">
              <div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />
            </div>
            <div className="px-5 sm:px-6 py-4">
              <div className="h-5 w-44 rounded bg-gray-100 animate-pulse" />
            </div>
            {/* Active */}
            <div className="px-5 sm:px-6 py-4 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-40 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="w-11 h-6 rounded-full bg-gray-200 animate-pulse shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto flex gap-3">
          <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-11 flex-1 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
