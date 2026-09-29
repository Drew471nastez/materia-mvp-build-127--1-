import { LibraryRouteSkeleton } from "@/components/library/library-route-skeleton"

export { ListSkeleton, RowsSkeleton } from "@/components/library/library-skeletons"

export const TAB_SKELETON = ""

export default function LibraryLoading() {
  return <LibraryRouteSkeleton path="/library" />
}
