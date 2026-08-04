/**
 * The shell the inbox paints the instant it is tapped.
 *
 * Without a loading boundary this route has no static shell for Next to cache,
 * so `prefetch` on the tab bar link had nothing to prefetch and every tap sat
 * on the previous screen until the RSC payload landed and the client bundle
 * hydrated. Only then did the inbox's own skeleton appear, and only after
 * /api/messages answered did the conversations — three waits stacked on top of
 * each other, which is why the inbox read as arriving in pieces. Two of those
 * are gone: page.tsx now fetches the first payload on the server and the client
 * starts with rows in hand, so this shell hands over directly to the real list.
 *
 * Which makes the geometry below the whole job. Every measurement here is
 * copied from components/messages/inbox.tsx — the header padding, the 44px
 * switcher track, the card's radius and hairline, the 8px row padding, the
 * 14px above and below a 48px avatar, the divider inset to 68px where the text
 * column starts. Nothing may move when the swap happens; if it does, the
 * handover reads as two events again no matter how fast it is.
 *
 * Nothing here animates its own arrival any more. The entrance belongs to the
 * navigation, not to whichever of the two things rendered — it is played once,
 * by <main> in the marketing layout, so the tap looks the same whether this
 * shell was shown at all. See components/marketing/tab-transition.tsx.
 */
export default function MessagesLoading() {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-2">
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

      {/* The same flex child the real list sits in, so the card starts at the
          same y whichever of the two is on screen. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-8 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white md:mb-10">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="relative flex items-center gap-3 px-2 py-3.5 after:pointer-events-none after:absolute after:bottom-0 after:left-[68px] after:right-2 after:h-px after:bg-neutral-100 after:content-[''] last:after:hidden"
            >
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
    </div>
  )
}
