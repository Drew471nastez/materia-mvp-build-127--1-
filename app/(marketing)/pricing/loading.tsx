export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#faf5ff] skeleton-deferred">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 animate-pulse">
        <div className="h-10 w-64 bg-gray-200 rounded-xl mx-auto mb-4" />
        <div className="h-5 w-80 max-w-full bg-gray-200 rounded mx-auto mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[520px] bg-white rounded-2xl border border-gray-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
