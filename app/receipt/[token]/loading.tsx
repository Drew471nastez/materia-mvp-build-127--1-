/** Only shown when the receipt is slow to read; see .skeleton-deferred. After paying it is under the held paid screen (app/checkout/parts/success.tsx), which waits for [data-receipt]. */
export default function ReceiptLoading() {
  return (
    <main data-receipt-loading="" className="min-h-[100dvh] bg-[#f8f9fa] skeleton-deferred">
      <div className="mx-auto w-full max-w-[640px] px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10">
        <div className="flex h-11 items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="mt-5 h-[30px] w-56 rounded-lg bg-gray-200 animate-pulse" />
        <div className="mt-2 h-4 w-44 rounded bg-gray-100 animate-pulse" />
        <div className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-xl bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 h-9 w-full rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    </main>
  )
}
