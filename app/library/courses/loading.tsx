import { TAB_SKELETON } from "../loading"

/**
 * The list's shape while it is read (components/courses/courses-index.tsx):
 * the progress filter, the count line, then rows in the library's card. No
 * heading block: "Library" above the pills is the only heading, so the
 * skeleton does not draw one that the loaded screen then takes away.
 */
export default function CoursesLoading() {
  return (
    <div data-library-skeleton="" className={`space-y-3 ${TAB_SKELETON}`} aria-hidden>
      <div className="h-10 w-[300px] max-w-full rounded-[10px] bg-[#eef0f3] animate-pulse" />
      <div className="h-4 w-20 rounded bg-[#eceef1] animate-pulse" />
      <div className="divide-y divide-[#eef0f3] overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
            <div className="aspect-video w-[112px] shrink-0 rounded-lg bg-[#f1f3f5] animate-pulse sm:w-[168px]" />
            <div className="flex-1">
              <div className="h-5 w-2/3 rounded bg-[#eceef1] animate-pulse" />
              <div className="mt-2 h-4 w-28 rounded bg-[#f1f3f5] animate-pulse" />
              <div className="mt-4 h-1.5 w-full max-w-[280px] rounded bg-[#f1f3f5] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
