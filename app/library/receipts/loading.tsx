import { ListSkeleton } from "../loading"

export default function ReceiptsLoading() {
  return (
    <div className="skeleton-deferred">
      <ListSkeleton rows={4} />
    </div>
  )
}
