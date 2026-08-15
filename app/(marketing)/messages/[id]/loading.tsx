/**
 * ===========================================================================
 *  THE SHELL A CONVERSATION PAINTS THE INSTANT A ROW IS PRESSED
 * ===========================================================================
 *
 * BACK, AND THE REASON IT COULD COME BACK IS THE LAYOUT.
 *
 * This file existed, and was deleted, because on a desktop it was the wrong
 * SHAPE: the real screen is a split view, a loading file cannot fetch the
 * conversation list to fill the left column, so opening a thread threw the
 * two-pane layout away, drew a narrow skeleton card where the column had been,
 * and snapped back. That objection died with the refactor — the column is the
 * messages LAYOUT's now (see app/(marketing)/messages/layout.tsx), so a loading
 * boundary here renders INSIDE the right-hand pane and the column is never
 * involved.
 *
 * And without it, switching conversations showed the WRONG ONE. Next keeps the
 * previous page painted until the next RSC payload lands, so clicking a second
 * conversation left the first one's messages on screen for the length of the
 * request and then replaced them — which reads exactly as the app flashing
 * somebody else's conversation at you, because that is what it was doing.
 *
 * Its one job is geometry. Every measurement is taken from
 * components/messages/thread.tsx — `.thread-shell` so it is pinned to the same
 * box, the 34px avatar, the 10px back button, the 15.5px name, the composer's
 * 44px field. Nothing may move at the handover; if anything does, one
 * navigation reads as two arrivals again no matter how quick it is.
 *
 * Nothing in the exchange area is skeletonised, and nothing spins there. The
 * conversation that replaces this shell carries its own cover over that exact
 * region, on the same `.thread-surface`, and owns the only loading indicator in
 * the arrival — so this draws the chrome, matches its geometry, and gets out of
 * the way.
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

      {/* NOTHING IN HERE, AND THAT IS THE FIX.

          There used to be a spinner, and the conversation that replaces this
          shell has ONE OF ITS OWN — a cover over the exchange, held until the
          data and the pictures are both ready (see `covered` in
          components/messages/thread.tsx). So one tap drew two: this one faded
          in, was cut off mid-revolution when the shell was replaced, and a
          second appeared a quarter of a second later at a different size. That
          is the "loading icon appears and disappears and then it loads again"
          — it was never one indicator behaving badly, it was two of them
          taking turns.

          Empty, this area is `.thread-surface` — exactly what the cover
          underneath is, down to the dot pattern, because the cover is deliberately
          the same surface rather than flat white. So the swap from this shell
          to the real conversation changes NOTHING on screen: same header, same
          composer, same textured panel between them. The screen simply stops
          being a placeholder without any moment that announces it.

          The waiting is still said out loud — the header above pulses, which is
          what a skeleton is for — and if the wait turns out to be long, the
          conversation's own cover raises the one spinner there is. */}
      <div className="thread-surface min-h-0 flex-1" />

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
