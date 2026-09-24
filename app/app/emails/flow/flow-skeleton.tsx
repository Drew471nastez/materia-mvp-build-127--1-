/**
 * The builder's stand-in, for a slow load only (`skeleton-deferred`): the
 * bar at its size, the step column and the side panel where they will be.
 */
export default function FlowLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[68px] items-center gap-3 py-2">
          <div className="h-9 w-9 rounded-lg bg-[#eceef1]" />
          <div className="h-6 w-48 rounded-md bg-[#e9ebee]" />
          <div className="ml-auto h-8 w-24 rounded-lg bg-[#eceef1]" />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="mx-auto w-full max-w-[560px] space-y-6">
            {[64, 76, 52, 76].map((h, i) => (
              <div key={i} className="rounded-2xl border border-[#e5e7eb]/60 bg-white" style={{ height: h }} />
            ))}
          </div>
          <div className="hidden h-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white lg:block" />
        </div>
      </div>
    </div>
  )
}
