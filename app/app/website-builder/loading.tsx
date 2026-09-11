/**
 * The server render's stand-in — and almost never seen.
 *
 * It shows nothing for the first half second. A page that arrives inside that
 * window (the usual case: one query, one creator) goes straight from the old
 * page to the new one with no skeleton in between. Only a slow round-trip
 * fades this in, and then it is the page's real shapes at their real sizes,
 * so nothing jumps when the data lands.
 *
 * Which means this file is only correct while it matches the page. It stopped
 * being: it still drew two buttons beside the title and a row of five little
 * squares under the primary action, and the page has neither. Both are below
 * in the shape they are now — a title with the address under it, and three
 * full-width buttons.
 */
export default function WebsiteBuilderLoading() {
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] skeleton-deferred" style={{ animationDelay: "500ms" }}>
      <div className="mx-auto max-w-[1200px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        {/* Title, and the site's address under it. */}
        <div>
          <div className="h-[28px] w-28 rounded-md bg-[#e9ebee] sm:h-[32px]" />
          <div className="mt-2.5 h-4 w-52 rounded bg-[#eef0f3]" />
        </div>

        {/* The live website. */}
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="aspect-[16/10] bg-[#eef0f3]" />
            <div className="flex flex-col justify-center p-5 sm:p-6">
              <div className="h-3 w-10 rounded bg-[#e9ebee]" />
              <div className="mt-3 h-6 w-44 rounded-md bg-[#e9ebee]" />
              <div className="mt-2 h-3.5 w-52 rounded bg-[#eef0f3]" />
              {/* One primary, then two beside each other: the real block. */}
              <div className="mt-5 space-y-2">
                <div className="h-11 rounded-xl bg-[#e9ebee]" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-11 rounded-xl border border-[#e5e7eb] bg-white" />
                  <div className="h-11 rounded-xl border border-[#e5e7eb] bg-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The library. */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-20 rounded bg-[#e9ebee]" />
            <div className="h-11 w-[124px] rounded-xl border border-[#e5e7eb] bg-white" />
          </div>
          <div className="divide-y divide-[#eceef1] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 sm:p-4">
                <div className="aspect-[16/10] w-24 rounded-lg bg-[#eef0f3] sm:w-36" />
                <div className="flex-1">
                  <div className="h-[15px] w-40 rounded bg-[#e9ebee]" />
                  <div className="mt-2 h-3 w-48 rounded bg-[#eef0f3]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
