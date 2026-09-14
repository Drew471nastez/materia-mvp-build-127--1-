"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, EDITED WHERE IT LIVES
 * ===========================================================================
 * The frame holds the real /u/<handle>, signed in, so every control a creator
 * already has on their page is the control they use here. Nothing is
 * reimplemented, so nothing can drift from what a visitor sees.
 *
 * `?embedded=1` tells the page it is inside the workspace, and the proxy
 * relaxes X-Frame-Options only for that exact combination. At its own address
 * the page stays unframeable by anybody, us included.
 *
 * ---------------------------------------------------------------------------
 *  ITS OWN SCREEN, AND THE BAR IS NEARLY EMPTY
 * ---------------------------------------------------------------------------
 * There is no sidebar, so the arrow at the left of the bar is the way back.
 * And the three tools that used to sit up here are gone from it: the bar's
 * own editor opens from the bar, the colour schemes live in Edit profile,
 * and the reload button was asking a creator to do the editor's job.
 *
 * What is left is whose page this is and where it lives. Everything that
 * changes the page is ON the page, next to the thing it changes, which is
 * the whole argument for framing the real page rather than redrawing it.
 *
 * ---------------------------------------------------------------------------
 *  TWO FRAMES, AND THE NEW ONE FADES UP OVER THE OLD
 * ---------------------------------------------------------------------------
 * A colour scheme is applied server side, so seeing it means fetching the
 * page again. Reloading the one frame in place unmounts the document first,
 * and for the width of a round trip the canvas is white — which read as "it
 * broke and came back" on every single change.
 *
 * So there are two frames. A change loads into the hidden one; when it says
 * it has loaded, it comes to the front and fades up over the old one, which
 * stays fully opaque underneath until it is covered. There is never a frame
 * of empty canvas, and the change reads as a change rather than as a cut.
 *
 * ---------------------------------------------------------------------------
 *  THE PAGE ASKS FOR A RELOAD WHEN IT HAS CHANGED
 * ---------------------------------------------------------------------------
 * The controls are inside the frame now, so the workspace has to hear about a
 * save from in there. The page posts one message when it has written
 * something, and the workspace loads the new version into the hidden frame.
 * Nobody presses anything.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"

import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { CreatorPageShare } from "@/components/app/creator-page-share"
import { CREATOR_EDITOR_CHANNEL } from "@/lib/store-builder/editor-channel"
import { cn } from "@/lib/utils"

export function CreatorPageWorkspace({
  handle,
  displayName,
  published,
}: {
  handle: string
  displayName: string
  published: boolean
}) {
  const router = useRouter()
  const [shareOpen, setShareOpen] = useState(false)
  const [isPhone, setIsPhone] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const srcFor = (v: number) => `/u/${encodeURIComponent(handle)}?embedded=1&v=${v}`

  // ── The two frames ──────────────────────────────────────────────────────
  /** Which frame is showing, and what each one has been told to load. */
  const [front, setFront] = useState<0 | 1>(0)
  const [srcs, setSrcs] = useState<[string, string]>([srcFor(0), ""])
  const [firstLoad, setFirstLoad] = useState(true)
  const version = useRef(0)
  const frames = useRef<Array<HTMLIFrameElement | null>>([null, null])

  /** Load the page again, into the frame nobody is looking at. */
  const reframe = useCallback(() => {
    version.current += 1
    const back = front === 0 ? 1 : 0
    setSrcs((s) => {
      const next: [string, string] = [s[0], s[1]]
      next[back] = srcFor(version.current)
      return next
    })
  }, [front, handle]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFrameLoad = (index: 0 | 1) => {
    if (firstLoad) setFirstLoad(false)
    /** The hidden frame finished: it becomes the front, and the old front is idle. */
    if (index !== front && srcs[index]) setFront(index)
  }

  /**
   * THE PAGE TELLS THE WORKSPACE WHEN IT HAS WRITTEN SOMETHING.
   *
   * Every control that changes this page is inside the frame now — the bar's
   * editor, the profile dialog with the colour schemes in it, the About
   * editor. They all save through /api/creator-profile, and the workspace
   * has no other way to know a save happened, which is why there used to be a
   * reload button in the bar asking a creator to notice for it.
   *
   * So the page says so, once, and the new version loads into the frame
   * nobody is looking at. The swap is the cross-fade below.
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { channel?: string; kind?: string } | null
      if (!data || data.channel !== CREATOR_EDITOR_CHANNEL) return
      if (data.kind === "saved") reframe()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [reframe])

  return (
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden bg-[#f1f1f3]">
      {/*
        ONE LIGHT ROW, AND ALMOST NOTHING IN IT.

        It carried an Edit-the-bar button, a colour-scheme menu and a reload.
        All three have gone: the first two are controls ON the page now, beside
        the things they change, and the third was the editor asking a creator
        to fetch the page again after a save it already knows about.

        What is left is the way back, whose page this is and where it lives,
        and the address.
      */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e7eb] bg-white px-3 py-2 sm:gap-2 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/app")}
          aria-label="Back to Storelib"
          title="Back to Storelib"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">{displayName}</p>
          <p className="truncate text-[11px] leading-tight text-[#9ca3af]">
            storelib.com/u/{handle}
            {published ? "" : "  ·  not published yet"}
          </p>
        </div>

        {/*
          THE ADDRESS, NOT A ONE-WAY DOOR.

          This was a bare link out, so the only thing the bar could do with
          the page's own address was leave for it. Opening the card first puts
          the address somewhere it can be copied, says in words that a creator
          page needs no publishing, and is the way to a custom domain.
          Opening the page is still one tap inside it.
        */}
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/*
        THE CANVAS. Inset and bordered on a desktop so the page has edges of
        its own. Not on a phone: a gutter and a hairline around a 390px page
        eats the content it frames. There, the page simply is the screen.
      */}
      <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-2.5">
        <div className="relative h-full w-full overflow-hidden bg-white md:rounded-xl md:border md:border-[#e5e7eb] md:shadow-[0_12px_36px_-20px_rgba(0,0,0,0.35)]">
          {firstLoad && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <BuilderLoader tone="light" lines={["Loading your page"]} />
            </div>
          )}
          {([0, 1] as const).map((i) =>
            srcs[i] ? (
              <iframe
                key={i}
                ref={(el) => { frames.current[i] = el }}
                src={srcs[i]}
                title={i === front ? `${displayName}'s creator page` : "Loading the next version"}
                aria-hidden={i !== front}
                onLoad={() => onFrameLoad(i)}
                className={cn(
                  "absolute inset-0 block h-full w-full border-0 bg-white",
                  /*
                    The front frame carries the fade. Moving the class between
                    the two elements is what restarts the animation, so every
                    swap plays it and a re-render in between does not.

                    The other frame stays OPAQUE rather than being hidden:
                    fading in over a transparent frame would show the white
                    canvas underneath for a third of a second, which on a dark
                    scheme is the flash this whole arrangement exists to
                    remove.
                  */
                  i === front ? "creator-frame-in z-[2]" : "z-[1] pointer-events-none",
                )}
              />
            ) : null,
          )}
        </div>
      </div>

      <CreatorPageShare open={shareOpen} onClose={() => setShareOpen(false)} handle={handle} isPhone={isPhone} />
    </div>
  )
}
