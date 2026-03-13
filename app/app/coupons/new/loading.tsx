export default function CreateCouponLoading() {
  return (
    <div className="h-full overflow-y-auto bg-gray-50/40">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse shrink-0" />
          <div className="h-5 w-36 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Form card */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 space-y-5">
          {/* Code field */}
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
          </div>
          {/* Discount */}
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
            <div className="flex gap-2">
              <div className="h-11 w-40 rounded-xl bg-gray-100 animate-pulse" />
              <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
            </div>
          </div>
          {/* Applies to */}
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
            <div className="flex gap-2">
              <div className="h-10 flex-1 rounded-xl bg-gray-100 animate-pulse" />
              <div className="h-10 flex-1 rounded-xl bg-gray-100 animate-pulse" />
            </div>
          </div>
          {/* Usage limit */}
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
          </div>
          {/* Toggleable sections */}
          <div className="h-12 w-full rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-gray-100 animate-pulse" />
          {/* Active row */}
          <div className="h-16 w-full rounded-xl bg-gray-100 animate-pulse" />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-4">
          <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-11 flex-1 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
