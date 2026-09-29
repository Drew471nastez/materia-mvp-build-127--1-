import { skeletonFor } from "./library-skeletons"

/**
 * What a library tab's loading.tsx draws: the same shape the stage uses on a
 * press (`still`, no pulse), marked so library-panel knows the route has not
 * answered yet.
 */
export function LibraryRouteSkeleton({ path }: { path: string }) {
  const shape = skeletonFor(path, true)
  if (!shape) {
    return <div className="min-h-[14rem]" aria-hidden data-library-loading="" />
  }
  return (
    <div data-library-skeleton="" className="min-h-[14rem]" aria-busy="true" aria-label="Loading">
      {shape}
    </div>
  )
}
