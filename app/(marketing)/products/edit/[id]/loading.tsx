/**
 * The shell the plus button opens onto, painted immediately.
 *
 * Without a loading boundary a route cannot be usefully prefetched — there is
 * no static shell to cache, so the tap waits out the whole render before
 * anything changes on screen, and the plus icon finishes its turn into a page
 * that has not arrived. With this, the frame is there on the first frame and
 * the form fills into it.
 */
export default function EditListingLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="h-6 w-48 animate-pulse rounded bg-neutral-100" />

      {/* Photo wells */}
      <div className="mt-6 grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>

      {/* Title, description, then the row of attribute pickers */}
      <div className="mt-6 space-y-3">
        <div className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
      <div className="mt-4 space-y-px overflow-hidden rounded-2xl">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse bg-neutral-100" />
        ))}
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-2xl bg-neutral-100" />
    </div>
  )
}
