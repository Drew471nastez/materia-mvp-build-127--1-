export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-white skeleton-deferred">
      <div className="mx-auto max-w-[820px] px-4 sm:px-6 py-20 animate-pulse">
        <div className="h-10 w-64 max-w-full bg-[#eceef1] rounded-lg mx-auto mb-4" />
        <div className="h-5 w-80 max-w-full bg-[#eceef1] rounded mx-auto mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[740px] overflow-hidden rounded-[28px] bg-white ring-1 ring-[#0f172a]/[0.06]">
              {/* The plan's header, the height the card draws it. */}
              <div className="h-[268px] bg-[#eceef1] sm:h-[292px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
