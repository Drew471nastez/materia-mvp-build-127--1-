import { RowsSkeleton, TAB_SKELETON } from "../loading"

/** One row per payment, in the shape components/library/library-receipts.tsx draws them. */
export default function ReceiptsLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <RowsSkeleton rows={4} />
    </div>
  )
}
