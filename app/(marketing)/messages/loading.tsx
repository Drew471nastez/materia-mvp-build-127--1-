/**
 * The shell the inbox paints the instant it is tapped.
 *
 * Without a loading boundary this route has no static shell for Next to cache,
 * so `prefetch` on the tab bar link had nothing to prefetch and every tap sat
 * on the previous screen until the RSC payload landed and the client bundle
 * hydrated. Only then did the inbox's own skeleton appear, and only after
 * /api/messages answered did "Niciun mesaj încă" — two waits stacked on top of
 * each other, which is why the empty state read as arriving late.
 *
 * It repeats the real header, the segmented control and MessagesInbox's own
 * ListSkeleton so the handover looks like data arriving rather than one screen
 * replacing another. The height math matches the inbox too: the bottom nav
 * already reserves its own strip in the marketing layout, so nothing here adds
 * a second reservation and the page has no empty space to scroll through.
 */
export default function MessagesLoading() {
  return (
    <div className="tab-enter mx-auto flex min-h-full max-w-2xl flex-col px-2">
      <h1 className="px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">Mesaje</h1>

      {/* The control is drawn, not skeletonised: its labels are constants, so
          showing them is both cheaper and less jarring than two grey pills. */}
      <div className="px-2 pb-2.5 pt-1">
        <div className="relative flex h-11 items-center rounded-full bg-neutral-100 p-1">
          <span
            aria-hidden
            className="absolute left-1 top-1 h-9 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_1px_rgba(15,15,15,0.04),0_2px_6px_-1px_rgba(15,15,15,0.12)] ring-1 ring-black/[0.03]"
          />
          <span className="relative flex h-9 flex-1 items-center justify-center text-[14.5px] font-semibold tracking-[-0.01em] text-neutral-900">
            Mesaje
          </span>
          <span className="relative flex h-9 flex-1 items-center justify-center text-[14.5px] font-medium tracking-[-0.01em] text-neutral-400">
            Notificări
          </span>
        </div>
      </div>

      <div className="px-2 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3.5">
            <div className="h-12 w-12 animate-pulse rounded-full bg-neutral-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-52 animate-pulse rounded bg-neutral-100" />
            </div>
            <div className="h-12 w-12 animate-pulse rounded-lg bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
