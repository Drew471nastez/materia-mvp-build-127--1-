import { IosSpinner } from "@/components/explore/ios-spinner"
/**
 * The shell a conversation paints the instant a row is tapped.
 *
 * Without a loading boundary this route has no static shell for Next to cache,
 * so `prefetch` on an inbox row had nothing to prefetch and every tap sat on the
 * inbox — nothing moving, nothing acknowledging the tap — until the RSC payload
 * landed. Then the bundle hydrated and the thread painted a skeleton of its own,
 * and only after that did the messages appear. Three waits on one tap, with only
 * the last of them animated. That is what "it loads glitchy" was.
 *
 * Two of those are gone: page.tsx reads the conversation on the server, so the
 * real screen arrives with its messages already in it and never shows a skeleton
 * of its own. Which leaves this file with one job, and it is geometry. Every
 * measurement is taken from components/messages/thread.tsx — `.thread-shell` so
 * it is pinned to exactly the same box, the 34px avatar, the 10px back button,
 * the 15.5px name, the composer's 44px field and 44px send button. Nothing may
 * move at the handover; if anything does, one navigation reads as two arrivals
 * again no matter how quick it is.
 *
 * The bubbles are the only thing skeletonised, because they are the only thing
 * here that is not the same on every conversation.
 */
export default function ThreadLoading() {
  return (
    <div className="thread-shell mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200">
      <div
        className="shrink-0 border-b border-neutral-100 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2 px-2 py-2">
          {/* The back arrow is drawn, not skeletonised: it is on every
              conversation and a grey circle in its place would only be one more
              thing to swap. */}
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-800">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="h-[34px] w-[34px] shrink-0 animate-pulse rounded-full bg-neutral-100" />
          {/* Two lines, because the real header now carries presence under the
              name. One line here and two there means the whole header grows by
              a row at the swap, and everything below it steps down — the exact
              jump this file exists to prevent. */}
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="h-[15px] w-32 animate-pulse rounded bg-neutral-100" />
            <span className="h-[10px] w-16 animate-pulse rounded bg-neutral-100" />
          </span>
          {/* The details button. Drawn rather than skeletonised, like the back
              arrow, and present for the same reason as everything else here:
              without it the name column is 40px wider in the shell than in the
              real header, so the name and the presence line under it both shift
              left at the swap. */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300">
            <svg viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* THE LISTING STRIP, WHICH THIS FILE WAS MISSING.

            It is the largest single thing in the header — a 40px thumbnail with
            10px of padding above and below it and a hairline on top, sixty-one
            pixels — and the real conversation draws it for every thread that is
            about an item, which is nearly all of them. Without it here, the
            header GREW by a row at the handover and the entire conversation
            stepped down. That is exactly the jump the note at the top of this
            file says must never happen, and it was happening on every tap.

            The one thread with no listing is the official Storelib one, where
            this reserves a row the real screen does not draw and the header
            shrinks instead. That is one conversation per account against every
            other conversation there is, and it is the right way round: a header
            that settles into place on a system message is a smaller wrong than
            one that lurches on every conversation with a person.

            The thumbnail and the title pulse; the price does not, because a
            grey pill where a number goes reads as a price that failed to load.
            The Cumpără button is not here at all — it is `hidden md:inline-flex`
            on the real strip, so on a phone there is nothing to reserve. */}
        <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-neutral-100" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="h-[13px] w-40 animate-pulse rounded bg-neutral-100" />
          </span>
          <span className="h-[14px] w-14 shrink-0 animate-pulse rounded bg-neutral-100" />
        </div>
      </div>

      {/* A spinner, not a mock-up of a conversation.
          Grey bars pretending to be messages are a guess at content nobody can
          read, and the moment they are replaced by real words the swap is
          visible no matter how well the boxes line up. One quiet indicator says
          the honest thing — this is loading — and has nothing to be replaced BY.
          Centred, because that is where the eye already is. */}
      <div className="thread-surface flex min-h-0 flex-1 items-center justify-center">
        {/* THE SPINNER WAITS BEFORE IT SAYS ANYTHING.
            A prefetched conversation commits in well under a tenth of a second,
            and drawing a spinner for it is what made one tap look like two
            loads: an indicator appears, and is gone before it has finished a
            revolution, and then the messages arrive. Two events for one
            navigation, and the first of them was a lie — nothing was being
            waited for.
            `thread-wait` holds it at zero opacity for 160ms and fades it up
            over the next 200. A warm route is finished inside the hold and the
            spinner is never seen at all; a cold one fades it in rather than
            cutting to it. Opacity only, so the hold costs the compositor
            nothing while the payload is what the main thread should be busy
            with. */}
        <span className="thread-wait">
          <IosSpinner size={26} />
        </span>
      </div>

      <div className="thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5">
        {/* No send button. It does not exist on the real composer either until
            there is something to send, and drawing a purple disc here that the
            arriving screen immediately removes is a control that flashes on and
            off for one navigation. The photo button on the left is on every
            conversation, so it stays. */}
        <div className="flex items-end gap-2">
          <div className="h-11 w-11 shrink-0 rounded-full bg-neutral-100" />
          <div className="h-[44px] flex-1 rounded-3xl border border-neutral-200 bg-neutral-50" />
        </div>
      </div>
    </div>
  )
}
