import { WishlistSkeleton } from "@/components/wishlist/wishlist-skeleton"
import { isLibraryProduct, libraryTabs } from "./library-tab-list"
import { LIBRARY_TITLE, LIBRARY_TITLE_GAP } from "./library-ui"
import { LIBRARY_COMMUNITIES, LIBRARY_COURSES, LIBRARY_HOME, LIBRARY_MEMBERSHIPS, LIBRARY_RECEIPTS, LIBRARY_REVIEWS, LIBRARY_WISHLIST } from "@/lib/library/paths"

export { WishlistSkeleton }

/**
 * ===========================================================================
 *  EVERY LIBRARY SCREEN'S SHAPE WHILE IT LOADS, IN ONE PLACE
 * ===========================================================================
 * Two readers draw these. The routes' own loading.tsx, on a first load or a
 * navigation nobody announced. And the library's stage (library-panel.tsx),
 * which draws the next screen's shape in the frame a pill or a product is
 * pressed, while the old screen fades out over it. Both read the same
 * component, so the shape the stage fades in is the shape the route would
 * have shown, and both are the shape the real screen then draws: the same
 * card, the same row heights, the same thumbnail sizes. When the real one
 * lands nothing under the pills changes size.
 *
 * No hooks and no "use client": the server renders them in loading.tsx and
 * the stage renders them in the browser.
 */

const LINE = "rounded bg-[#eceef1]"
const SOFT = "rounded bg-[#f1f3f5]"
const PULSE = "animate-pulse motion-reduce:animate-none"
const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"

/** Products (components/library/library-home.tsx): search and order, the count, the rows; reviews aside from 1024px. */
export function ListSkeleton({ rows = 4, still = false }: { rows?: number; still?: boolean }) {
  const pulse = still ? "" : PULSE
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6" aria-hidden>
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-10 flex-1 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]`} />
          <div className="h-10 w-[104px] rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]" />
        </div>
        <div className={`h-[18px] w-20 ${LINE} ${pulse}`} />
        <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="px-4 py-4 sm:px-5">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-x-4">
                <div className={`h-16 w-16 rounded-xl sm:h-[72px] sm:w-[72px] ${SOFT} ${pulse}`} />
                <div className="min-w-0 space-y-2 pt-0.5">
                  <div className={`h-4 w-4/5 ${LINE} ${pulse}`} />
                  <div className={`h-3.5 w-1/2 ${SOFT} ${pulse}`} />
                </div>
                <div className="col-span-2 mt-3 flex gap-2 sm:col-span-1 sm:mt-0">
                  <div className={`h-9 flex-1 rounded-[10px] sm:w-[120px] sm:flex-none ${SOFT} ${pulse}`} />
                  <div className="h-9 w-9 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={`${CARD} hidden px-4 py-3 lg:block`}>
          <div className={`h-3.5 w-40 ${LINE} ${pulse}`} />
          {[0, 1].map((i) => (
            <div key={i} className="mt-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-full ${SOFT} ${pulse}`} />
              <div className={`h-3.5 flex-1 max-w-[120px] ${LINE} ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden space-y-4 lg:block">
        <div className={`h-16 ${CARD}`} />
      </div>
    </div>
  )
}

/** Reviews and Receipts: one column of rows at most 760px wide, as those screens draw it. */
export function RowsSkeleton({ rows = 4, sections = 1, still = false }: { rows?: number; sections?: number; still?: boolean }) {
  const pulse = still ? "" : PULSE
  return (
    <div className="max-w-[760px] space-y-7" aria-hidden>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s}>
          {sections > 1 ? <div className={`mb-2.5 h-4 w-24 ${LINE} ${pulse}`} /> : null}
          <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {Array.from({ length: s === 0 ? rows : Math.max(1, rows - 2) }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className={`h-11 w-11 shrink-0 rounded-xl sm:h-12 sm:w-12 ${SOFT} ${pulse}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-1/2 ${LINE} ${pulse}`} />
                  <div className={`h-3 w-1/3 ${SOFT} ${pulse}`} />
                </div>
                <div className={`h-4 w-14 ${SOFT} ${pulse}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Courses (components/courses/courses-index.tsx): empty card or list rows, matching what that tab usually shows. */
export function CoursesSkeleton({ empty = false, still = false }: { empty?: boolean; still?: boolean }) {
  const pulse = still ? "" : PULSE
  if (empty) {
    return (
      <div className={`${CARD} px-5 py-14 sm:py-16`} aria-hidden>
        <div className={`mx-auto h-5 w-36 ${LINE} ${pulse}`} />
        <div className={`mx-auto mt-3 h-4 w-72 max-w-full ${SOFT} ${pulse}`} />
        <div className={`mx-auto mt-6 h-10 w-40 rounded-[10px] ${SOFT} ${pulse}`} />
      </div>
    )
  }
  return (
    <div className="space-y-3" aria-hidden>
      <div className="flex items-center justify-between gap-2">
        <div className="h-10 w-[300px] max-w-full rounded-[10px] bg-[#eef0f3]" />
        <div className="hidden h-10 w-[132px] rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec] sm:block" />
      </div>
      <div className={`h-[18px] w-20 ${LINE} ${pulse}`} />
      <div className={`${CARD} overflow-hidden`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 border-b border-[#eef0f3] p-3 last:border-0 sm:gap-4 sm:p-4">
            <div className={`aspect-video w-[112px] shrink-0 rounded-lg sm:w-[168px] ${SOFT} ${pulse}`} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className={`h-4 w-2/3 ${LINE} ${pulse}`} />
              <div className={`mt-2 h-3.5 w-28 ${SOFT} ${pulse}`} />
              <div className="mt-auto pt-2.5">
                <div className="h-1.5 w-full rounded-full bg-[#eceef1]" />
              </div>
            </div>
            <div className="hidden w-[200px] shrink-0 items-center justify-end sm:flex">
              <div className="h-10 w-32 rounded-lg bg-[#eceef1]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Memberships: subtitle line and either a quiet empty card (stage) or row shapes. */
export function MembershipsSkeleton({ still = false }: { still?: boolean }) {
  const pulse = still ? "" : PULSE
  if (still) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className={`h-4 w-56 max-w-full ${LINE}`} />
        <div className={`${CARD} px-5 py-14 sm:py-16`}>
          <div className={`mx-auto h-5 w-40 ${LINE}`} />
          <div className={`mx-auto mt-3 h-4 w-64 max-w-full ${SOFT}`} />
          <div className={`mx-auto mt-6 h-10 w-36 rounded-[10px] ${SOFT}`} />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3" aria-hidden>
      <div className={`h-4 w-56 max-w-full ${LINE} ${pulse}`} />
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className={`flex items-center gap-3.5 ${CARD} px-3.5 py-3.5 sm:px-5 sm:py-4`}>
            <div className={`h-[52px] w-[52px] shrink-0 rounded-xl ${SOFT} ${pulse}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-1/2 ${LINE} ${pulse}`} />
              <div className={`h-3 w-1/3 ${SOFT} ${pulse}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Communities (components/account/account-communities-body.tsx): the count,
 * then a row per community as components/explore/community-card.tsx draws it
 * in a list (a 57px mark, the name, the by line, a line of facts).
 */
export function CommunitiesSkeleton({ still = false }: { still?: boolean }) {
  const pulse = still ? "" : PULSE
  return (
    <div className="space-y-3 pb-4" aria-hidden>
      <div className={`h-[18px] w-28 ${LINE} ${pulse}`} />
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-3.5 rounded-lg border border-[#e4e7ec]/80 bg-white px-3.5 py-3.5 sm:gap-4 sm:px-5 sm:py-4">
            <div className={`h-[57px] w-[57px] shrink-0 rounded-xl ${SOFT} ${pulse}`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-4 w-1/2 ${LINE} ${pulse}`} />
              <div className={`h-3 w-1/3 ${SOFT} ${pulse}`} />
              <div className={`h-3 w-2/5 ${SOFT} ${pulse}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One purchase (components/library/library-product.tsx): the back control, the picture and title, the files, the seller. */
export function ProductDetailSkeleton() {
  return (
    <div aria-hidden>
      <div className="-mt-1 mb-2 flex h-11 items-center">
        <div className="h-9 w-[92px] rounded-full bg-white ring-1 ring-inset ring-[#e4e7ec]" />
      </div>
      <div className="flex items-start gap-4">
        <div className={`h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24 ${SOFT} ${PULSE}`} />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className={`h-6 w-3/4 ${LINE} ${PULSE}`} />
          <div className={`h-4 w-1/2 ${SOFT} ${PULSE}`} />
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className={`${CARD} space-y-3 px-4 py-4 sm:px-5`}>
          <div className={`h-4 w-12 ${LINE}`} />
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${SOFT} ${PULSE}`} />
              <div className={`h-4 flex-1 ${LINE} ${PULSE}`} />
              <div className={`h-9 w-[104px] rounded-[10px] ${SOFT} ${PULSE}`} />
            </div>
          ))}
        </div>
        <div className={`${CARD} h-36`} />
      </div>
    </div>
  )
}

/**
 * The pills, still: what the stage draws above a screen's shape when the
 * row is not on the screen yet, so it is where it will be before the real
 * one is. The same sizes as library-tabs.tsx draws. No "Library" heading
 * over them any more: the library is a pill of the profile now, and the
 * profile's own Library pill above says where this is.
 */
export function TabsHeaderStill({ active }: { active: string }) {
  return (
    <div className="mb-5 sm:mb-6" aria-hidden>
      {/* The page's title, where the live head draws it (library-tabs.tsx), so coming back to the list moves nothing. */}
      <p className={`${LIBRARY_TITLE} ${LIBRARY_TITLE_GAP}`}>Library</p>
      <div className="-mx-4 overflow-hidden px-4 py-0.5 sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-2">
          {libraryTabs().map((t) => (
            <span
              key={t.href}
              className={`inline-flex h-10 items-center justify-center rounded-full border px-4 text-[13px] font-medium sm:h-9 ${
                t.href === active
                  ? "border-[#d7dadf] bg-[#e2e4e8] text-[#1a1a2e] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
                  : "border-[#e4e7ec] bg-white text-[#6b7280]"
              }`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The shape of whatever is at `path`, or null for a screen that has none of its own here. */
export function skeletonFor(path: string, still = false): React.ReactNode {
  if (path === LIBRARY_HOME) return <ListSkeleton still={still} />
  /* Empty-card shape while the stage waits: matches the common empty tab and avoids a list→empty jump. */
  if (path === LIBRARY_COURSES) return <CoursesSkeleton empty={still} still={still} />
  if (path === LIBRARY_MEMBERSHIPS) return <MembershipsSkeleton still={still} />
  if (path === LIBRARY_REVIEWS) return <RowsSkeleton rows={3} sections={2} still={still} />
  if (path === LIBRARY_RECEIPTS) return <RowsSkeleton rows={4} still={still} />
  if (path === LIBRARY_WISHLIST) return <WishlistSkeleton still={still} />
  if (path === LIBRARY_COMMUNITIES) return <CommunitiesSkeleton still={still} />
  if (isLibraryProduct(path)) return <ProductDetailSkeleton />
  return null
}
