export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto max-w-[820px] px-4 sm:px-6 py-20 animate-pulse">
        <div className="h-10 w-64 max-w-full bg-[#eceef1] rounded-lg mx-auto mb-4" />
        <div className="h-5 w-80 max-w-full bg-[#eceef1] rounded mx-auto mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[560px] bg-white rounded-2xl border border-[#e5e7eb]" />
          ))}
        </div>
      </div>
    </div>
  )
}
