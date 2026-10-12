/**
 * WHILE SETTINGS IS ON ITS WAY. The sheet rose empty and white, and the
 * whole form then dropped into it in one frame ("blank, then abruptly").
 * This holds the form's own shape in the meantime: the title and its line,
 * the column of groups from 1024px, the pill row below it, and one card.
 *
 * It only shows on a slow answer (.skeleton-deferred waits 200ms), so a
 * quick one goes straight from the sheet to the form with no grey flash.
 * The form then fades in over it (.library-content-enter, app/app/settings/_view).
 */
const BAR = "rounded-full bg-[#eceef1]"

export function SettingsPlaceholder() {
  return (
    <div aria-hidden data-settings-placeholder="" className="skeleton-deferred mx-auto max-w-4xl app-gutter pt-6 sm:pt-8 lg:max-w-[1200px]">
      <div className="mb-5 sm:mb-6">
        <div className={`${BAR} h-[26px] w-[120px] sm:h-[30px]`} />
        <div className={`${BAR} mt-2.5 h-[14px] w-[240px]`} />
      </div>
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="hidden space-y-3 py-1 lg:block">
          {[64, 96, 84, 72, 104, 88, 60].map((w, i) => (
            <div key={i} className="flex h-9 items-center px-3">
              <div className={`${BAR} h-[12px]`} style={{ width: w }} />
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <div className="mb-5 flex gap-2 sm:mb-6 lg:hidden">
            {[72, 84, 70, 96].map((w, i) => (
              <div key={i} className="h-[36px] rounded-full bg-[#f1f2f4]" style={{ width: w }} />
            ))}
          </div>
          <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
            <div className={`${BAR} h-[16px] w-[140px]`} />
            <div className={`${BAR} mt-2.5 h-[12px] w-[260px] max-w-full`} />
            <div className="mt-6 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className={`${BAR} h-[12px] w-[90px]`} />
                  <div className="mt-2 h-[44px] rounded-xl bg-[#f6f7f8]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
