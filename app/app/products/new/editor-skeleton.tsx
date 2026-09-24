/**
 * The product editor's stand-in, for a slow load only. It is invisible for
 * its first 300ms and then fades in (`skeleton-deferred`, held back a little
 * longer here), so a product that arrives quickly, which with the hover
 * prefetch is most of them, never shows it at all.
 *
 * The same frame as product-editor.tsx at the same sizes: the 56px bar (64px
 * and a 44px row of section tabs from 640px), then the first sections as
 * cards in a 760px column. When the real form lands nothing around it moves.
 */
const bone = "rounded-md bg-[#eceef1]"
const CARD = "mb-3 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"

function Heading({ width }: { width: number }) {
  return (
    <div>
      <div className={`${bone} h-4 sm:h-[18px]`} style={{ width }} />
      <div className={`${bone} mt-2 h-3 w-56 max-w-full bg-[#f1f2f4]`} />
    </div>
  )
}

export function EditorSkeleton({ editing }: { editing: boolean }) {
  return (
    <div aria-hidden className="page-scroll h-full overflow-hidden bg-[#f8f9fa] skeleton-deferred" style={{ animationDelay: "300ms" }}>
      <div className="bg-[#f8f9fa]">
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
          <div className="h-11 w-[66px] shrink-0 sm:hidden" />
          <div className="-ml-2 hidden h-9 w-9 sm:block" />
          <div className="min-w-0 flex-1 px-1 sm:px-0">
            <div className={`${bone} h-4 w-32 sm:h-5 sm:w-44`} />
            <div className={`${bone} mt-1.5 h-2.5 w-16 bg-[#f1f2f4]`} />
          </div>
          {editing ? <div className="h-10 w-10 shrink-0 sm:h-8 sm:w-8" /> : null}
          <div className="hidden h-8 w-[66px] rounded-lg border border-[#e3e4e8] bg-white sm:block" />
          <div className="h-10 w-[68px] shrink-0 rounded-[10px] bg-[#e4dcfb] sm:h-8 sm:w-[60px] sm:rounded-lg" />
        </div>
        <div className="mx-auto hidden h-11 max-w-[760px] items-start gap-0.5 px-6 sm:flex">
          {[64, 60, 72, 72, 48].map((w, i) => (
            <div key={i} className={`h-8 rounded-lg ${i === 0 ? "bg-[#e6e8eb]" : ""}`} style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] px-4 pt-3 sm:px-6 sm:pt-4">
        <div className={CARD}>
          <Heading width={56} />
          <div>
            <div className={`${bone} mb-2 h-3 w-10`} />
            <div className="h-11 rounded-md border border-[#e5e7eb] bg-white" />
          </div>
        </div>
        <div className={CARD}>
          <Heading width={128} />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="aspect-video rounded-lg bg-[#f1f2f4]" />
            <div className="aspect-video rounded-lg bg-[#f1f2f4]" />
          </div>
        </div>
        <div className={CARD}>
          <Heading width={80} />
          <div className="h-[180px] rounded-lg border border-[#e5e7eb] bg-white" />
        </div>
      </div>
    </div>
  )
}
