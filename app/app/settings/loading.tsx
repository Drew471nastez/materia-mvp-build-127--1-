import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="h-full overflow-y-scroll bg-[#fafafa]" style={{ scrollbarGutter: 'stable' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <Skeleton className="h-7 sm:h-8 w-28 mb-2 bg-[#e5e7eb]" />
            <Skeleton className="h-4 w-56 bg-[#e5e7eb]" />
          </div>
          {/* Store URL */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40 bg-[#e5e7eb]" />
            <Skeleton className="h-7 w-7 rounded-lg bg-[#e5e7eb]" />
          </div>
        </div>

        {/* Pill Tab Navigation */}
        <div className="mb-6 sm:mb-8 flex gap-1 p-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              className={`h-9 sm:h-10 rounded-full bg-[#e5e7eb] ${
                i === 1 ? "w-24" : i === 2 ? "w-22" : i === 3 ? "w-20" : i === 4 ? "w-26" : "w-20"
              }`}
              style={{ width: i === 1 ? 96 : i === 2 ? 88 : i === 3 ? 80 : i === 4 ? 104 : 80 }}
            />
          ))}
        </div>

        {/* Profile Photo Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] mb-4 sm:mb-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 sm:h-[72px] sm:w-[72px] rounded-full bg-[#e5e7eb]" />
            <div className="flex-1">
              <Skeleton className="h-5 w-28 mb-1 bg-[#e5e7eb]" />
              <Skeleton className="h-4 w-40 mb-3 bg-[#e5e7eb]" />
              <Skeleton className="h-9 w-24 rounded-lg bg-[#e5e7eb]" />
            </div>
          </div>
        </div>

        {/* Personal Information Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-4 rounded bg-[#e5e7eb]" />
            <Skeleton className="h-5 w-40 bg-[#e5e7eb]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Skeleton className="h-4 w-20 mb-2 bg-[#e5e7eb]" />
              <Skeleton className="h-11 w-full rounded-xl bg-[#e5e7eb]" />
            </div>
            <div>
              <Skeleton className="h-4 w-20 mb-2 bg-[#e5e7eb]" />
              <Skeleton className="h-11 w-full rounded-xl bg-[#e5e7eb]" />
            </div>
          </div>
        </div>

        {/* Email Address Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-4 rounded bg-[#e5e7eb]" />
            <Skeleton className="h-5 w-28 bg-[#e5e7eb]" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 flex-1 rounded-xl bg-[#e5e7eb]" />
            <Skeleton className="h-9 w-28 rounded-lg bg-[#e5e7eb]" />
          </div>
        </div>

        {/* Address Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-4 rounded bg-[#e5e7eb]" />
            <Skeleton className="h-5 w-32 bg-[#e5e7eb]" />
          </div>
          <div className="space-y-4">
            <div>
              <Skeleton className="h-4 w-28 mb-2 bg-[#e5e7eb]" />
              <Skeleton className="h-11 w-full rounded-xl bg-[#e5e7eb]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-4 w-12 mb-2 bg-[#e5e7eb]" />
                <Skeleton className="h-11 w-full rounded-xl bg-[#e5e7eb]" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2 bg-[#e5e7eb]" />
                <Skeleton className="h-11 w-full rounded-xl bg-[#e5e7eb]" />
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <Skeleton className="h-11 w-32 rounded-xl bg-[#e5e7eb]" />
        </div>
      </div>
    </div>
  )
}
