import { LIBRARY_TABS } from "./library-tab-list"

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
/** A card from 640px only: the wishlist is rows in one card on a phone and a grid of cards above it. */
const CARD_FROM_SM =
  "sm:rounded-2xl sm:border sm:border-[#e4e7ec]/80 sm:bg-white sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"

/** Products (components/library/library-home.tsx): search and order, the count, the rows; the sellers' column from 1024px. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6" aria-hidden>
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-10 flex-1 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]`} />
          <div className="h-10 w-[104px] rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]" />
        </div>
        <div className="flex h-9 gap-2 lg:hidden">
          {[44, 118, 124].map((w, i) => (
            <div key={i} className="h-9 rounded-full bg-white ring-1 ring-inset ring-[#e4e7ec]" style={{ width: w }} />
          ))}
        </div>
        <div className={`h-[18px] w-20 ${LINE} ${PULSE}`} />
        <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="px-4 py-4 sm:px-5">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-x-4">
                <div className={`h-16 w-16 rounded-xl sm:h-[72px] sm:w-[72px] ${SOFT} ${PULSE}`} />
                <div className="min-w-0 space-y-2 pt-0.5">
                  <div className={`h-4 w-4/5 ${LINE} ${PULSE}`} />
                  <div className={`h-3.5 w-1/2 ${SOFT} ${PULSE}`} />
                </div>
                <div className="col-span-2 mt-3 flex gap-2 sm:col-span-1 sm:mt-0">
                  <div className={`h-9 flex-1 rounded-[10px] sm:w-[120px] sm:flex-none ${SOFT} ${PULSE}`} />
                  <div className="h-9 w-9 rounded-[10px] bg-white ring-1 ring-inset ring-[#e4e7ec]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden space-y-4 lg:block">
        <div className={`${CARD} px-4 pb-3 pt-3.5`}>
          <div className={`h-3.5 w-16 ${LINE}`} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-3 flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full ${SOFT} ${PULSE}`} />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3.5 w-2/3 ${LINE} ${PULSE}`} />
                <div className={`h-3 w-1/3 ${SOFT}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Reviews and Receipts: one column of rows at most 760px wide, as those screens draw it. */
export function RowsSkeleton({ rows = 4, sections = 1 }: { rows?: number; sections?: number }) {
  return (
    <div className="max-w-[760px] space-y-7" aria-hidden>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s}>
          {sections > 1 ? <div className={`mb-2.5 h-4 w-24 ${LINE} ${PULSE}`} /> : null}
          <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {Array.from({ length: s === 0 ? rows : Math.max(1, rows - 2) }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className={`h-11 w-11 shrink-0 rounded-xl sm:h-12 sm:w-12 ${SOFT} ${PULSE}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-1/2 ${LINE} ${PULSE}`} />
                  <div className={`h-3 w-1/3 ${SOFT} ${PULSE}`} />
                </div>
                <div className={`h-4 w-14 ${SOFT} ${PULSE}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Courses (components/courses/courses-index.tsx): its heading and creator filter, the progress switch, the rows with a 16:9 cover. */
export function CoursesSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className={`h-7 w-32 sm:h-8 ${LINE} ${PULSE}`} />
        <div className="h-9 w-[132px] rounded-lg bg-white ring-1 ring-inset ring-[#e5e7eb]" />
      </div>
      <div className="mb-4 h-10 w-[260px] rounded-lg bg-[#f1f1f4]" />
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 border-b border-[#f0f0f2] p-3 last:border-0 sm:gap-4 sm:p-4">
            <div className={`aspect-video w-[112px] shrink-0 rounded-lg sm:w-[168px] ${SOFT} ${PULSE}`} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className={`h-4 w-2/3 ${LINE} ${PULSE}`} />
              <div className={`mt-2 h-3.5 w-28 ${SOFT} ${PULSE}`} />
              <div className="mt-auto pt-2.5">
                <div className="h-1.5 w-full rounded-full bg-[#ede9fe]" />
              </div>
            </div>
            <div className="hidden w-[200px] shrink-0 items-center justify-end sm:flex">
              <div className="h-10 w-32 rounded-lg bg-[#ede9fe]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Memberships (app/library/memberships/page.tsx): a line under the pills, then one card per membership. */
export function MembershipsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-0.5 pb-10 sm:px-0" aria-hidden>
      <div className={`mb-5 h-4 w-56 ${LINE} ${PULSE}`} />
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-[#e5e7eb]/70 bg-white px-3.5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:gap-4 sm:px-5 sm:py-4">
            <div className={`h-[52px] w-[52px] shrink-0 rounded-xl ${SOFT} ${PULSE}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-1/2 ${LINE} ${PULSE}`} />
              <div className={`h-3 w-1/3 ${SOFT} ${PULSE}`} />
              <div className={`h-3 w-2/5 ${SOFT}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The wishlist (components/wishlist/wishlist-content.tsx): the count, then on
 * a phone rows in one card, and from 640px a grid of cards with a 16:9 cover.
 */
export function WishlistSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div aria-hidden>
      <div className={`mb-3 h-[18px] w-24 ${LINE} ${PULSE}`} />
      <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-3 xl:grid-cols-4`}>
        {Array.from({ length: items }, (_, i) => (
          <div key={i} className={`grid grid-cols-[76px_minmax(0,1fr)] gap-x-3.5 px-4 py-4 sm:flex sm:flex-col sm:p-0 ${CARD_FROM_SM} sm:overflow-hidden`}>
            <div className={`row-span-2 h-[76px] w-[76px] rounded-xl sm:aspect-video sm:h-auto sm:w-full sm:rounded-none ${SOFT} ${PULSE}`} />
            <div className="min-w-0 space-y-2 pr-9 pt-0.5 sm:px-4 sm:pb-1 sm:pr-4 sm:pt-3.5">
              <div className={`h-4 w-4/5 ${LINE} ${PULSE}`} />
              <div className={`h-3.5 w-1/2 ${SOFT} ${PULSE}`} />
              <div className={`h-4 w-16 ${LINE} ${PULSE}`} />
            </div>
            <div className="mt-3 flex gap-2 sm:mt-auto sm:px-4 sm:pb-4 sm:pt-3">
              <div className={`h-9 flex-1 rounded-[10px] ${SOFT} ${PULSE}`} />
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
 * The heading and the pills, still: what the stage draws above a screen's
 * shape on the way back from a product, so the row is where it will be
 * before the real one is. The same sizes as library-tabs.tsx draws.
 */
export function TabsHeaderStill({ active }: { active: string }) {
  return (
    <div className="mb-5 sm:mb-6" aria-hidden>
      <div className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Library</div>
      <div className="-mx-4 mt-3 overflow-hidden px-4 py-0.5 sm:mx-0 sm:mt-4 sm:px-0">
        <div className="flex w-max items-center gap-2">
          {LIBRARY_TABS.map((t) => (
            <span
              key={t.href}
              className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] font-medium ${
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
export function skeletonFor(path: string): React.ReactNode {
  if (path === "/library") return <ListSkeleton />
  if (path === "/library/courses") return <CoursesSkeleton />
  if (path === "/library/memberships") return <MembershipsSkeleton />
  if (path === "/library/reviews") return <RowsSkeleton rows={3} sections={2} />
  if (path === "/library/receipts") return <RowsSkeleton rows={4} />
  if (path === "/library/wishlist") return <WishlistSkeleton />
  if (/^\/library\/products\/[^/]+$/.test(path)) return <ProductDetailSkeleton />
  return null
}
