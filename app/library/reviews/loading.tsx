import { ListSkeleton } from "../loading"

export default function ReviewsLoading() {
  return (
    <div className="skeleton-deferred">
      <ListSkeleton rows={4} />
    </div>
  )
}
