/*
  While the server reads the offers: the page's own shape (the bar, the card,
  its toolbar and a few rows), only on a slow answer. .skeleton-deferred waits
  200ms before it shows, so a quick one goes straight to the list with no
  grey flash.
*/
const BAR = "rounded-full bg-[#eceef1]"

export default function OffersLoading() {
  return (
    <div aria-hidden data-offers-placeholder="" className="skeleton-deferred h-full overflow-hidden bg-[#f8f9fa]">
      <div className="app-gutter mx-auto max-w-[1200px] lg:max-w-[1323px] lg:px-[35px]">
        <div className="flex min-h-[66px] items-center justify-between pb-2 pt-[14px] lg:min-h-[73px]">
          <div className={`${BAR} h-[24px] w-[200px] lg:h-[30px]`} />
          <div className="h-8 w-[104px] rounded-lg bg-[#eceef1]" />
        </div>
        <div className="mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2">
          <div className="flex h-[52px] items-center gap-2 border-b border-[#eef0f2] px-3 md:h-12">
            {[44, 64, 82, 40].map((w, i) => (
              <div key={i} className="h-[14px] rounded-full bg-[#f1f2f4]" style={{ width: w }} />
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[72px] items-center gap-3 border-t border-[#f1f2f4] px-3 first:border-t-0 md:h-14 lg:h-[62px]">
              <div className="h-10 w-10 rounded-[9px] bg-[#eceef1]" />
              <div className="min-w-0 flex-1">
                <div className={`${BAR} h-[12px] w-[160px] max-w-[60%]`} />
                <div className={`${BAR} mt-2 h-[10px] w-[220px] max-w-[80%] bg-[#f3f4f6]`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
