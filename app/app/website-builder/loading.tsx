/**
 * The server render's stand-in. Same boxes, same sizes, same places as the
 * page it covers, so nothing jumps when the data arrives — and deferred
 * (`skeleton-deferred`) so a fast load never shows it at all.
 */
export default function WebsiteBuilderLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-[26px] w-28 animate-pulse rounded-lg bg-gray-200 sm:h-[30px]" />
            <div className="mt-2 h-[14px] w-64 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-[200px] animate-pulse rounded-xl border border-gray-200 bg-white" />
            <div className="h-10 w-[136px] animate-pulse rounded-xl border border-gray-200 bg-white" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="bg-[#f8f9fa] p-4 sm:p-5">
              <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
                <div className="h-8 border-b border-[#eceef1] bg-[#f8f9fa]" />
                <div className="aspect-[16/10] animate-pulse bg-gray-100" />
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="h-6 w-16 animate-pulse rounded-full bg-emerald-50" />
              <div className="mt-3 h-6 w-48 animate-pulse rounded-md bg-gray-200" />
              <div className="mt-4 space-y-2">
                <div className="h-[14px] w-52 animate-pulse rounded bg-gray-100" />
                <div className="h-[14px] w-44 animate-pulse rounded bg-gray-100" />
                <div className="h-[14px] w-56 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="mt-8 flex gap-2">
                <div className="h-11 flex-1 animate-pulse rounded-xl bg-violet-200" />
                <div className="h-11 w-[108px] animate-pulse rounded-xl border border-gray-200 bg-white" />
                <div className="h-11 w-11 animate-pulse rounded-xl border border-gray-200 bg-white" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-9 w-28 animate-pulse rounded-lg border border-gray-200 bg-white" />
            </div>
          </div>
          <div className="divide-y divide-[#eceef1] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 sm:p-4">
                <div className="aspect-[16/10] w-[112px] animate-pulse rounded-lg bg-gray-100 sm:w-[144px]" />
                <div className="flex-1">
                  <div className="h-[15px] w-40 animate-pulse rounded bg-gray-200" />
                  <div className="mt-2 h-[13px] w-56 animate-pulse rounded bg-gray-100" />
                </div>
                <div className="hidden gap-2 sm:flex">
                  <div className="h-9 w-24 animate-pulse rounded-lg border border-gray-200 bg-white" />
                  <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200" />
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 pb-6">
          <div className="flex items-end justify-between">
            <div className="h-5 w-36 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="aspect-[16/10] animate-pulse bg-gray-100" />
                <div className="p-4">
                  <div className="h-[14px] w-28 animate-pulse rounded bg-gray-200" />
                  <div className="mt-2 h-[12px] w-20 animate-pulse rounded bg-gray-100" />
                  <div className="mt-3 h-[12px] w-full animate-pulse rounded bg-gray-100" />
                  <div className="mt-4 flex gap-2">
                    <div className="h-9 flex-1 animate-pulse rounded-lg bg-gray-200" />
                    <div className="h-9 w-20 animate-pulse rounded-lg border border-gray-200 bg-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
