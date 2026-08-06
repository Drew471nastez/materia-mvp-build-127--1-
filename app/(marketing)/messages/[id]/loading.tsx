"use client"

import { useParams } from "next/navigation"
import { useState } from "react"

import { InitialAvatar } from "@/components/ui/initial-avatar"
import { readThreadPreview } from "@/lib/messages/thread-preview"
import { cn } from "@/lib/utils"

/**
 * The screen a conversation shows while the server is answering.
 *
 * ---------------------------------------------------------------------------
 * It used to be a spinner in the middle of an empty page
 * ---------------------------------------------------------------------------
 * /messages/[id] is `force-dynamic`, so every tap costs a server round trip
 * before the real screen exists. This file covers that wait, and what it used
 * to cover it with was: a grey circle where the avatar goes, two grey bars
 * where the name goes, and an `IosSpinner` centred in an otherwise blank white
 * surface.
 *
 * That is the reported "empty space, then the loader, then the chat" — and it
 * is not a bug in any single stage. Every stage does what it says. The problem
 * is that the FIRST thing a deliberate tap resolves into is a blank screen, so
 * the sequence reads as the app losing its place and then finding it again.
 *
 * ---------------------------------------------------------------------------
 * It now shows the actual conversation
 * ---------------------------------------------------------------------------
 * The inbox row that was just pressed already holds who this is, their picture,
 * the listing and which side the last message was on. lib/messages/
 * thread-preview.ts carries that across the navigation, and this reads it back.
 *
 * So the tap lands on the RIGHT PERSON'S NAME AND FACE immediately, with the
 * conversation's shape under it, and the messages fill in when the server
 * answers. Nothing is uncovered and nothing is revealed — the screen you asked
 * for is simply there, and then it has its contents.
 *
 * This is a client component, which a loading boundary is allowed to be. It has
 * to be: the preview lives in sessionStorage and the id comes from the route.
 *
 * ---------------------------------------------------------------------------
 * When there is no preview
 * ---------------------------------------------------------------------------
 * A deep link, a push notification, a cold reload, the back button — all arrive
 * with nothing stashed, and all fall back to the skeleton this file used to be,
 * minus the spinner. The skeleton is not a failure state; it is the honest
 * answer when the tab genuinely does not know who this conversation is with.
 *
 * Every measurement is taken from components/messages/thread.tsx — the same
 * `.thread-shell`, the 34px avatar, the 10px back button, the 15.5px name, the
 * composer's 44px field. Nothing may move at the handover, because a shift is
 * how one navigation goes back to reading as two arrivals.
 */
export default function ThreadLoading() {
  const params = useParams<{ id: string }>()
  /**
   * Read ONCE, during the first render, not in an effect.
   *
   * An effect runs after paint, so the first painted frame would be the
   * skeleton and the preview would replace it one frame later — a flash of
   * exactly the blank screen this file exists to remove, reintroduced by the
   * mechanism meant to fix it.
   */
  const [preview] = useState(() => readThreadPreview(params?.id))

  const name = preview?.name || ""

  return (
    <div className="thread-shell mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200">
      <div
        className="shrink-0 border-b border-neutral-100 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2 px-2 py-2">
          {/* Drawn, not skeletonised: it is on every conversation, and a grey
              circle in its place is one more thing that has to be swapped. */}
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-800">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          {preview ? (
            <InitialAvatar name={name} url={preview.avatarUrl} seed={preview.seed} size={34} />
          ) : (
            <span className="h-[34px] w-[34px] shrink-0 animate-pulse rounded-full bg-neutral-100" />
          )}

          {/* Two lines either way, because the real header carries presence
              under the name. One line here and two there means the header grows
              by a row at the swap and everything below it steps down. */}
          <span className="flex min-w-0 flex-1 flex-col">
            {preview ? (
              // Same size, weight and leading as the real one in thread.tsx, so
              // the name does not resettle by a pixel when it takes over.
              <span className="truncate text-[15.5px] font-semibold leading-[1.2] text-neutral-900">
                {name}
              </span>
            ) : (
              <span className="h-[15px] w-32 animate-pulse rounded bg-neutral-100" />
            )}
            {/* Presence is the one thing the row cannot know, so its line is
                held empty rather than guessed at — reserved at the height the
                real one occupies so nothing steps down when it fills in. */}
            <span className="h-[15px]" />
          </span>

          {/* The details button, reserved rather than drawn. Without it the name
              column is 40px wider here than in the real header, so a long name
              truncates at a different point and appears to change on handover. */}
          <span className="h-10 w-10 shrink-0" />
        </div>
      </div>

      {/* The listing strip, when there is one. Same 40px thumbnail and same
          height as the real one, so the messages start at the same y whichever
          screen is showing. */}
      {preview?.listingTitle && !preview.official && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-neutral-100 bg-white px-3 py-2">
          {preview.listingThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.listingThumb}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
              draggable={false}
            />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-lg bg-neutral-100" />
          )}
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-neutral-900">
            {preview.listingTitle}
          </span>
        </div>
      )}

      {/* NO SPINNER.

          A spinner centred in a blank surface is the "empty space" — it says
          the app is busy without saying what with, on a screen that has just
          told you exactly what you are waiting for. What is here instead is one
          bubble-shaped placeholder at the BOTTOM, where the newest message
          actually lives, so the real conversation arrives into a surface that
          already has the right shape at the right end.

          Bottom-anchored via `justify-end`, matching the real thread's scroller
          landing at its end. Without a preview there is no bubble at all —
          guessing at a side would be worse than an empty surface. */}
      <div className="thread-surface flex min-h-0 flex-1 flex-col justify-end gap-2 px-4 py-4">
        {preview?.lastFromMe !== null && preview !== null && (
          <span
            className={cn(
              "h-9 max-w-[68%] animate-pulse rounded-[20px] bg-neutral-100",
              preview.lastFromMe ? "self-end w-40 rounded-br-md" : "self-start w-48 rounded-bl-md",
            )}
          />
        )}
      </div>

      <div className="thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5">
        {/* No send button. It does not exist on the real composer either until
            there is something to send, and drawing a purple disc that the
            arriving screen immediately removes is a control flashing on and off
            for one navigation. */}
        <div className="flex items-end gap-2">
          <div className="h-11 w-11 shrink-0 rounded-full bg-neutral-100" />
          <div className="h-[44px] flex-1 rounded-3xl border border-neutral-200 bg-neutral-50" />
        </div>
      </div>
    </div>
  )
}
