export default function ProductsLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header skeleton - exact match */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-[26px] sm:h-[30px] w-24 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-[14px] w-40 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
          <div className="w-full sm:w-[130px] h-[44px] bg-violet-200 rounded-xl animate-pulse" />
        </div>

        {/* Tab Pills & Search skeleton - exact match */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* Tab pills skeleton */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-[72px] bg-white border border-gray-200 rounded-xl animate-pulse shadow-sm" />
              <div className="h-8 w-[40px] bg-gray-100 rounded-full animate-pulse" />
              <div className="h-8 w-[72px] bg-gray-100 rounded-full animate-pulse" />
            </div>
            {/* Search & Export buttons skeleton */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white border border-gray-200 rounded-lg animate-pulse shadow-sm" />
              <div className="w-9 h-9 bg-white border border-gray-200 rounded-lg animate-pulse shadow-sm" />
            </div>
          </div>
        </div>

        {/* Mobile view skeleton - exact match to card structure */}
        <div className="grid gap-4 sm:hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex gap-3">
                {/* Thumbnail - 64x64 rounded-xl */}
                <div className="h-16 w-16 shrink-0 bg-gray-200 rounded-xl animate-pulse" />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="h-[14px] w-3/4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-[13px] w-16 bg-gray-100 rounded mt-2 animate-pulse" />
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop view skeleton - TABLE structure, exact match */}
        <div className="hidden sm:block bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="table-scroll">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="px-5 py-4 text-left">
                    <div className="h-[13px] w-16 bg-gray-200 rounded animate-pulse" />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <div className="h-[13px] w-10 bg-gray-200 rounded animate-pulse" />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <div className="h-[13px] w-12 bg-gray-200 rounded animate-pulse" />
                  </th>
                  <th className="px-5 py-4 text-right">
                    <div className="h-[13px] w-14 bg-gray-200 rounded animate-pulse ml-auto" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="border-b border-[#e5e7eb]/60 last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail - 48x48 rounded-lg */}
                        <div className="h-12 w-12 shrink-0 bg-gray-200 rounded-lg animate-pulse" />
                        <div className="h-[14px] w-32 bg-gray-200 rounded animate-pulse" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-[14px] w-14 bg-gray-200 rounded animate-pulse" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-6 w-20 bg-violet-100 rounded-full animate-pulse" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-8 w-14 bg-gray-100 rounded-lg animate-pulse" />
                        <div className="h-8 w-14 bg-gray-100 rounded-lg animate-pulse" />
                        <div className="h-8 w-16 bg-gray-100 rounded-lg animate-pulse" />
                        <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
