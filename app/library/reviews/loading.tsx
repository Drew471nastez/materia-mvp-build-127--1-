import { RowsSkeleton, TAB_SKELETON } from "../loading"

/** To review and Your reviews, in the shape components/library/library-reviews.tsx draws them. */
export default function ReviewsLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <RowsSkeleton rows={3} sections={2} />
    </div>
  )
}
