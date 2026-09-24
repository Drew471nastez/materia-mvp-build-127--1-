/**
 * Analytics, while the server is still reading it. Most visits never see
 * this: `skeleton-late` keeps it invisible for the first 450ms, and the
 * router keeps a page it already has for five minutes. When it does show,
 * it is the page's outline and nothing more (the title, the period row, the
 * chart card and the first row of reports), so the real page lands in the
 * same places and nothing on it flickers.
 */
export default function AnalyticsLoading() {
  const bone = "rounded-md bg-[#eef0f2]"
  const card = "rounded-2xl border border-[#e5e7eb]/60 bg-white"
  return (
    <div className="h-full overflow-hidden page-scroll bg-[#fafafa] select-none skeleton-late">
      {/* The announcement bar's height, so the page below lands where it will be. */}
      <div className="h-[40px] w-full bg-[#8b5cf6] md:h-[42px]" />
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <div className={`${bone} h-8 w-32`} />
        <div className="mt-6 flex flex-wrap gap-3">
          <div className={`${bone} h-10 w-36 rounded-xl`} />
          <div className={`${bone} hidden h-10 w-44 rounded-full sm:block`} />
        </div>
        <div className={`${card} mt-6 h-[380px]`} />
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className={`${card} h-[300px]`} />
          <div className={`${card} hidden h-[300px] md:block`} />
          <div className={`${card} hidden h-[300px] xl:block`} />
        </div>
      </div>
    </div>
  )
}
