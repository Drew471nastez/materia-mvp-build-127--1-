"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, EDITED WHERE IT LIVES
 * ===========================================================================
 * The frame holds the real creator page at /<handle>, signed in, so every
 * control a creator already has on their page is the control they use here.
 * Nothing is reimplemented, so nothing can drift from what a visitor sees.
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

import { BuilderLoader, useDelayedFlag, useLinger } from "@/components/website-builder/builder-loader"
import { SPINNER_WAIT_MS } from "@/components/ui/activity-spinner"
import { LEAVING_SEEN_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { CreatorPageShare } from "@/components/app/creator-page-share"
import { SaveNotification } from "@/components/ui/save-notification"
import { CREATOR_EDITOR_CHANNEL } from "@/lib/store-builder/editor-channel"
import { cn } from "@/lib/utils"
import { getMainDomain, getStoreInternalPath } from "@/lib/url-helpers"
import { HtmlClass } from "@/components/platform/html-class"
import { tt } from "@/lib/i18n/text"

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
  /**
   * =======================================================================
   *  LEAVING THE EDITOR LOOKS LIKE LEAVING THE OTHER ONE
   * =======================================================================
   * Back was a bare `router.push`, so on a phone the editor simply sat there
   * for as long as /app took to arrive and then cut to it. The website
   * builder already answers this: the glass goes up the instant Back is
   * pressed, the squares say something is happening, and the navigation has
   * a ceiling so it cannot hang on a slow route.
   *
   * The same three, from the same places — `.wb-leaving` is a global class
   * and `navigateWithCeiling` is a pure helper — rather than a second
   * arrangement that drifts from it.
   */
  const [leaving, setLeaving] = useState(false)
  const cancelCeiling = useRef<(() => void) | null>(null)

  const leave = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    cancelCeiling.current?.()
    /**
     * THE SCREEN THAT SAYS YOU ARE LEAVING IS WORTH SEEING.
     *
     * This pushed immediately. /app is warm — it is the page a creator came
     * from and it is prefetched below — so the navigation beat the paint and
     * the screen was never on the glass: a press, and then somewhere else.
     * That is why "there should be the going back loading" reads as missing
     * when the code for it is right there.
     *
     * The push waits long enough for the first word to be readable and short
     * enough that nobody waits for it. Same number as the website builder,
     * from the same reasoning, because these are the same moment.
     */
    const start = window.setTimeout(() => {
      cancelCeiling.current = navigateWithCeiling(
        () => router.push("/app"),
        () => window.location.assign("/app"),
        (cb, ms) => window.setTimeout(cb, ms),
        (id) => window.clearTimeout(id),
      )
    }, LEAVING_SEEN_MS)
    cancelCeiling.current = () => window.clearTimeout(start)
  }, [leaving, router])

  /**
   * The way out, warmed while nothing else is happening, so leaving is a
   * repaint rather than a round trip.
   */
  useEffect(() => {
    const warm = () => {
      try {
        router.prefetch("/app")
      } catch {
        /* A router that will not prefetch still navigates. */
      }
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 4000 })
      return () => (w as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(id)
  }, [router])

  /**
   * The glass BLOCKS, which is the point of it — a second press on a control
   * that is already on its way out is how you get two of whatever it does.
   * That is also why it has to be able to come back down. A bfcache restore,
   * an in-history return, or a navigation that simply did not happen would
   * otherwise leave the editor alive, looking normal, and taking no input.
   */
  useEffect(() => {
    if (!leaving) return
    const revive = () => setLeaving(false)
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) revive() }
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("popstate", revive)
    const watchdog = window.setTimeout(revive, 6000)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("popstate", revive)
      window.clearTimeout(watchdog)
      cancelCeiling.current?.()
    }
  }, [leaving])
  const [shareOpen, setShareOpen] = useState(false)
  /** "Saved", after an editor inside the frame has saved and closed. */
  const [savedToast, setSavedToast] = useState(0)
  const [isPhone, setIsPhone] = useState(false)

  /**
   * =========================================================================
   *  THE WORKSPACE DOES NOT SCROLL, AND iOS IS TOLD SO TWICE
   * =========================================================================
   * The canvas is a frame that fills the screen and scrolls inside itself;
   * this document has nothing to scroll. iOS disagrees the moment a keyboard
   * opens over a field in the frame: it scrolls the OUTER page up by the
   * keyboard's height to reveal the field, whatever overflow says, and the
   * result is the toolbar gone off the top and a strip of grey under the
   * canvas. The sheet inside the frame now pads its own content for the
   * keyboard (see mobile-editor-sheet), so the field is already visible and
   * that scroll buys nothing — and it is put back the moment it happens,
   * again once the keyboard's animation has landed, because iOS re-applies
   * it during the animation.
   */
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    /* The class half of the shield opt-out; `:has(.cp-editor)` is the other,
       and either alone is enough. See app/globals.css. */
    root.classList.add("cp-fullscreen")
    const prev = [root.style.overflow, root.style.height, body.style.overflow, body.style.height]
    root.style.overflow = "hidden"
    root.style.height = "100%"
    body.style.overflow = "hidden"
    body.style.height = "100%"

    const vv = window.visualViewport
    let settle = 0
    const putBack = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)
    }
    const onViewport = () => {
      requestAnimationFrame(putBack)
      window.clearTimeout(settle)
      settle = window.setTimeout(putBack, 320)
    }
    vv?.addEventListener("resize", onViewport)
    vv?.addEventListener("scroll", onViewport)
    window.addEventListener("scroll", putBack)
    return () => {
      vv?.removeEventListener("resize", onViewport)
      vv?.removeEventListener("scroll", onViewport)
      window.removeEventListener("scroll", putBack)
      window.clearTimeout(settle)
      root.classList.remove("cp-fullscreen")
      ;[root.style.overflow, root.style.height, body.style.overflow, body.style.height] = prev
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  /*
    THE CANONICAL ADDRESS, NOT THE OLD ONE. This framed `/u/<handle>`, which
    is now a 308 to `/<handle>` — so every preview load, and every reload
    after a change, paid a redirect before it started. Worse, the redirect
    landed on an address the proxy's framing rule did not cover, so the frame
    was refused outright and the canvas showed a broken rectangle.

    getStoreInternalPath is the one helper that decides where a creator page
    lives; using it here means this cannot drift from it again.
  */
  const srcFor = (v: number) => `${getStoreInternalPath(encodeURIComponent(handle))}?embedded=1&v=${v}`

  // ── The two frames ──────────────────────────────────────────────────────
  /** Which frame is showing, and what each one has been told to load. */
  const [front, setFront] = useState<0 | 1>(0)
  const [srcs, setSrcs] = useState<[string, string]>([srcFor(0), ""])
  const [firstLoad, setFirstLoad] = useState(true)
  /** Mounted while loading AND for the length of its own fade afterwards. */
  const loaderVisible = useLinger(firstLoad, 320)
  /* The squares only for a load that is genuinely slow (SPINNER_WAIT_MS, as everywhere else): a quick one is a plain surface, then the page. */
  const loaderShown = useDelayedFlag(firstLoad, SPINNER_WAIT_MS)
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

  /*
    THE PAGE IS SHOWN WHEN IT CAN PAINT, NOT WHEN ITS LAST PICTURE IS IN.
    The frame's load event waits for every image, font and tag on the page,
    and the loader stayed up for all of it. The page is the same origin, so
    its document can be read: once its markup is parsed and its stylesheets
    are applied it is drawn, and the loader fades onto it. A frame that is
    not readable (a sign-in redirect elsewhere) is left to its load event.
  */
  useEffect(() => {
    if (!firstLoad) return
    let raf = 0
    const look = () => {
      try {
        const f = frames.current[0]
        const doc = f?.contentDocument
        const href = f?.contentWindow?.location.href ?? ""
        const styled = !!doc && Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).every((l) => !!l.sheet)
        if (doc && href && href !== "about:blank" && doc.readyState !== "loading" && doc.body?.childElementCount && styled) {
          setFirstLoad(false)
          return
        }
      } catch {
        return
      }
      raf = requestAnimationFrame(look)
    }
    raf = requestAnimationFrame(look)
    return () => cancelAnimationFrame(raf)
  }, [firstLoad])

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
      if (data.kind === "saved") {
        reframe()
        /* The frame's own toast would go with the frame it is in; the workspace says it instead. */
        setSavedToast((n) => n + 1)
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [reframe])

  return (
    /*
      `cp-editor` is read by app/globals.css, which stands down the fixed black
      shield the native shell paints over the safe area. Every ordinary page in
      the app wants that shield because its header is black; this one's bar is
      white and pads itself into the same strip, so the shield was a black band
      under the clock with the editor starting below it.
    */
    <div className="cp-editor relative flex h-svh min-h-0 flex-col overflow-hidden bg-[#f1f1f3]">
      <HtmlClass name="with-cp-editor" />
      {/*
        ONE LIGHT ROW, AND ALMOST NOTHING IN IT.

        It carried an Edit-the-bar button, a colour-scheme menu and a reload.
        All three have gone: the first two are controls ON the page now, beside
        the things they change, and the third was the editor asking a creator
        to fetch the page again after a save it already knows about.

        What is left is the way back, whose page this is and where it lives,
        and the address.
      */}
      {/*
        UNDER THE STATUS BAR, NOT BEHIND IT. In the iOS shell the webview runs
        edge to edge, so a bar at top:0 is painted behind the clock and the
        battery — 44 points of it, which is nearly all of it. That is why
        "the top bar is not showing" on a phone: it was there, and the status
        bar was on top of it. The inset is real on iOS and zero in a browser,
        so it is read, never branched on.
      */}
      <div
        /*
          THE HAIRLINE IS AN INSET SHADOW, NOT A BORDER.

          It was `border-b`, and the dim below is `absolute inset-0` — which
          resolves against the PADDING box. A border sits outside that, so
          the one thing on this bar the dim could not reach was the 1px line
          at the bottom of it: a lit hairline straight across a dimmed
          screen, which is exactly what it looked like.

          An inset shadow is painted inside the padding box, so it is under
          the dim like everything else and goes with it. Same 1px, same
          colour, same place.
        */
        /*
          THE BAR'S HEIGHT IS ITS PADDING, NOT ITS CONTROLS.

          8px above and below a 36px button is 52px of chrome over a page the
          whole screen is meant to be showing. It is 5px now, so the bar is
          46px — six pixels back, which is what was asked for and about as far
          as this can go from the top.

          NOT BY SHRINKING THE BUTTONS. The other way to find those pixels is
          h-9 to h-8, and that takes the back control from 36px to 32px on a
          surface that is used with a thumb. The padding costs nothing to
          give up; a touch target does.

          The safe-area inset stays outside the arithmetic, so the bar sits
          below the notch by exactly as much as it did.
        */
        className="relative flex shrink-0 items-center gap-1.5 bg-white px-3 pb-[5px] shadow-[inset_0_-1px_0_#e5e7eb] sm:gap-2 sm:px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 5px)" }}
      >
        <button
          type="button"
          onClick={leave}
          aria-label={tt("Back to Storelib")}
          title={tt("Back to Storelib")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">{displayName}</p>
          <p className="truncate text-[11px] leading-tight text-[#9ca3af]">
            {/*
              THE ADDRESS AS IT IS, not as it was. The creator page moved to
              storelib.com/<handle>; this line went on reading /u/<handle>, so
              a creator was being shown the one address of their page that now
              only redirects. Built from the same helper the frame uses so the
              label and the thing it labels cannot disagree.
            */}
            {getMainDomain()}{getStoreInternalPath(handle)}
            {published ? "" : tt("  ·  not published yet")}
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
          <span className="hidden sm:inline">{tt("Share")}</span>
        </button>
      </div>

      {/*
        THE CANVAS IS THE WINDOW'S WIDTH, EDGE TO EDGE, ON EVERY SCREEN.

        It was inset by 10px and bordered on a desktop, so the page inside was
        drawn 20px narrower than the same page in a browser tab. That is not
        a margin, it is a different page: a window near a breakpoint laid the
        products out one way here and another way live, and the banner came
        out a different shape, so a cover positioned here sat differently on
        the live page. At the window's full width the page's breakpoints and
        its banner are exactly the live page's. The bar's hairline above it
        is the only edge it needs.
      */}
      <div className="min-h-0 flex-1 overflow-hidden p-0">
        <div className="relative h-full w-full overflow-hidden bg-white">
          {/*
            =================================================================
             THE LOADER LEAVES ACROSS THE PAGE, IT DOES NOT VANISH
            =================================================================
            It was removed from the tree the instant the frame reported
            loaded. The page under it plays a 320ms fade-in, so what was
            actually on screen was: a loader, gone in one frame, and then a
            page part-way through arriving. That single frame of nothing is
            the cut — the page "appears too abruptly" because the thing in
            front of it disappeared rather than got out of the way.

            `useLinger` keeps it mounted for a beat after the frame is ready
            and `data-leaving` fades it out over 260ms, which is the same
            pair the website builder's canvas uses. The page rises in
            underneath while the loader goes, so there is never a frame with
            neither on it.
          */}
          {loaderVisible && (
            <div
              className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"
              data-leaving={!firstLoad}
              aria-hidden={!firstLoad}
            >
              {loaderShown && <BuilderLoader tone="light" lines={[tt("Loading your page")]} />}
            </div>
          )}
          {([0, 1] as const).map((i) =>
            srcs[i] ? (
              <iframe
                key={i}
                ref={(el) => { frames.current[i] = el }}
                src={srcs[i]}
                title={i === front ? tt("{displayName}'s creator page", { displayName }) : tt("Loading the next version")}
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

      <SaveNotification key={savedToast} show={savedToast > 0} message={tt("Saved")} duration={2200} />

      <CreatorPageShare open={shareOpen} onClose={() => setShareOpen(false)} handle={handle} isPhone={isPhone} />

      {/* The builder's own going-back screen: dark glass over everything, with
          the loader drawn in white on it. `tone` names the surface it is ON. */}
      {leaving && (
        <div className="wb-leaving" role="status" aria-live="polite" aria-label={tt("Going back")}>
          <BuilderLoader className="wb-leaving-content" tone="dark" lines={[tt("Going back"), tt("Almost there")]} />
        </div>
      )}
    </div>
  )
}
