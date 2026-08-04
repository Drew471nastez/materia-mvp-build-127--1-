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
    <div className="thread-shell screen-push mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200">
      <div
        className="shrink-0 border-b border-neutral-100 bg-white/95"
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
          <span className="flex min-w-0 flex-1 items-center">
            <span className="h-[15px] w-32 animate-pulse rounded bg-neutral-100" />
          </span>
        </div>
      </div>

      {/* A spinner, not a mock-up of a conversation.
          Grey bars pretending to be messages are a guess at content nobody can
          read, and the moment they are replaced by real words the swap is
          visible no matter how well the boxes line up. One quiet indicator says
          the honest thing — this is loading — and has nothing to be replaced BY.
          Centred, because that is where the eye already is. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <IosSpinner size={26} />
      </div>

      <div className="thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5">
        <div className="flex items-end gap-2">
          <div className="h-[44px] flex-1 rounded-3xl border border-neutral-200 bg-neutral-50" />
          <div className="h-11 w-11 shrink-0 rounded-full bg-[#7c3aed]/25" />
        </div>
      </div>
    </div>
  )
}
