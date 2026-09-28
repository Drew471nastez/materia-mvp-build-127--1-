/** One purchase while it loads, in the shape it draws (components/library/library-product.tsx). */
export default function ProductLoading() {
  return (
    <div className="skeleton-deferred" aria-hidden>
      <div className="mb-3 h-9 w-24 rounded-lg bg-[#eceef1] animate-pulse" />
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 rounded-2xl bg-[#f1f3f5] animate-pulse sm:h-24 sm:w-24" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-6 w-3/4 rounded bg-[#eceef1] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-[#f1f3f5] animate-pulse" />
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className="space-y-3 rounded-2xl border border-[#e4e7ec]/80 bg-white p-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[#f1f3f5] animate-pulse" />
              <div className="h-4 flex-1 rounded bg-[#eceef1] animate-pulse" />
              <div className="h-9 w-[104px] rounded-[10px] bg-[#eceef1] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-36 rounded-2xl border border-[#e4e7ec]/80 bg-white" />
      </div>
    </div>
  )
}
