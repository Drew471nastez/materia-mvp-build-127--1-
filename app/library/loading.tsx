import { ListSkeleton } from "@/components/library/library-skeletons"

export { ListSkeleton, RowsSkeleton } from "@/components/library/library-skeletons"

/**
 * A library screen while it loads, in the shape the screen draws
 * (components/library/library-skeletons.tsx, one shape per screen), so
 * nothing moves when the real one lands. The heading and the pills are the
 * layout's and stay put.
 *
 * Deferred (.skeleton-deferred): a fast load never shows it. A press inside
 * the library does not wait for it at all: the stage draws the same shape in
 * the press's own frame and keeps this one out of sight until the screen
 * arrives (components/library/library-panel.tsx). So this is what a first
 * load, a reload or a link from outside the library shows.
 */
export const TAB_SKELETON = "skeleton-deferred"

export default function LibraryLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <ListSkeleton />
    </div>
  )
}
