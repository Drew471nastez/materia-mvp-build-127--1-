import { TAB_SKELETON } from "../loading"

/** The memberships list's shape while it is read (app/library/memberships/page.tsx): a line under the pills, then the cards. */
export default function MembershipsLoading() {
  return (
    <div data-library-skeleton="" className={`mx-auto max-w-3xl px-0.5 pb-10 sm:px-0 ${TAB_SKELETON}`} aria-hidden>
      <div className="mb-5 h-4 w-56 rounded bg-[#eceef1] animate-pulse" />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#e4e7ec]/80 bg-white px-4 py-4">
            <div className="h-11 w-11 shrink-0 rounded-full bg-[#f1f3f5] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-[#eceef1] animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-[#f1f3f5] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
