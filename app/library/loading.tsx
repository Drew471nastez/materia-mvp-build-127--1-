export { ListSkeleton, RowsSkeleton } from "@/components/library/library-skeletons"

/** Library tabs no longer flash a grey skeleton on every navigation. */
export const TAB_SKELETON = ""

export default function LibraryLoading() {
  return <div className="min-h-[12rem]" aria-hidden data-library-loading="" />
}
