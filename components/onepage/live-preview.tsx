"use client"

/**
 * ===========================================================================
 *  THE EDITOR'S PREVIEW: THE LIVE PAGE, FRAMED
 * ===========================================================================
 * Both of the editor's previews, the phone beside the editor from 768px and
 * the whole screen behind Preview on a phone, show the published page's own
 * component at a phone's width, in a frame (components/onepage/preview-
 * document.tsx at /onepage-preview). What a creator sees here is what a
 * visitor's phone draws, because it is the same code drawing it; there is no
 * second drawing left to drift (scripts/check-onepage-parity.mjs measures the
 * two against each other, block by block, in every theme).
 *
 * The page goes to the frame as it is edited, in the shape the published
 * page is built from (lib/onepage/public-shape), one message per frame at
 * most however fast the typing is.
 *
 * ONE FRAME PER SCREEN. Each preview loads its frame only at the width it is
 * shown at, so a phone does not load the computer's phone and the other way
 * round.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useOnePage } from "@/lib/onepage/context"
import { publicOnePageFromDraft, type PublicOnePageData } from "@/lib/onepage/public-shape"
import { ONEPAGE_PREVIEW_CHANNEL, ONEPAGE_PREVIEW_PATH, type PreviewMessage } from "@/lib/onepage/preview-channel"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { useStoreCurrencyIfSet } from "@/lib/store/currency-context"

/** How long a frame has to say it is ready before it is loaded once more. */
const FRAME_READY_MS = 6000

/** The width the page is drawn at: a phone's, the one the live page is designed at. */
export const PREVIEW_PHONE_WIDTH = 390

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [query])
  return match
}

/**
 * The owner's live name and photo. The page is drawn from the profile's
 * photo, not from its own copy (lib/account/identity), so the preview reads
 * the profile too, once, on the owner's own client.
 *
 * And it listens after that: a photo changed in this editor, or in Settings
 * in another tab, is announced through the shell's store
 * (lib/account/avatar-store), so the preview changes with it instead of on
 * the next page load.
 */
export function useOwnerProfile(ownerId: string | undefined) {
  const [owner, setOwner] = useState<{ displayName: string | null; avatarUrl: string | null }>({ displayName: null, avatarUrl: null })
  const shellAvatar = useShellAvatar(owner.avatarUrl)
  useEffect(() => {
    if (!ownerId) return
    let live = true
    createClient()
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", ownerId)
      .maybeSingle()
      .then(
        ({ data }: { data: unknown }) => {
          if (!live || !data) return
          const row = data as { display_name?: string | null; avatar_url?: string | null }
          setOwner({ displayName: row.display_name ?? null, avatarUrl: row.avatar_url ?? null })
        },
        () => undefined,
      )
    return () => {
      live = false
    }
  }, [ownerId])
  return useMemo(() => ({ displayName: owner.displayName, avatarUrl: shellAvatar }), [owner.displayName, shellAvatar])
}

/** The editor's page, as the published page would be built from it: the draft first, then the owner's profile. */
function usePreviewPage(): PublicOnePageData | null {
  const { onepage } = useOnePage()
  const owner = useOwnerProfile(onepage?.owner_id)
  return useMemo(
    () => (onepage ? publicOnePageFromDraft(onepage as never, { displayName: owner.displayName, liveAvatarUrl: owner.avatarUrl }) : null),
    [onepage, owner.displayName, owner.avatarUrl],
  )
}

/** The colour the page starts on, so a dark page never shows white while its frame loads. */
function pageColour(page: PublicOnePageData | null): string {
  const t = page?.theme as { background_type?: string; background_gradient?: string | null; background_color?: string } | undefined
  if (!t) return "#ffffff"
  if (t.background_type === "gradient" && t.background_gradient) return t.background_gradient
  return t.background_color || "#ffffff"
}

/**
 * The frame itself: loads the preview document, hands it the page when it is
 * ready and every time the page changes, and says when it has first drawn.
 */
export function LivePreviewFrame({
  page,
  width,
  height,
  scale = 1,
  onDrawn,
  title = "Preview of your OnePage",
}: {
  page: PublicOnePageData | null
  /** The frame's own viewport, in CSS pixels. */
  width: number | string
  height: number | string
  /** Drawn smaller than it is laid out: the phone beside the editor. */
  scale?: number
  onDrawn?: () => void
  title?: string
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = useRef(false)
  const latest = useRef(page)
  latest.current = page
  /* The store's currency, as /app's provider has it (app/app/layout.tsx LiveStoreCurrency): the live page's prices are in it. */
  const currency = useStoreCurrencyIfSet()
  const latestCurrency = useRef(currency)
  latestCurrency.current = currency
  const [drawn, setDrawn] = useState(false)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn

  const send = useCallback(() => {
    const win = frame.current?.contentWindow
    if (!win || !ready.current || !latest.current) return
    win.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "page", page: latest.current, currency: latestCurrency.current } satisfies PreviewMessage, window.location.origin)
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const data = e.data as PreviewMessage | null
      if (!data || data.channel !== ONEPAGE_PREVIEW_CHANNEL) return
      if (data.kind === "ready") {
        /* Also after the frame reloads on its own (a new build): it asks again. */
        ready.current = true
        send()
      } else if (data.kind === "drawn") {
        setDrawn(true)
        onDrawnRef.current?.()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [send])

  /*
    A FRAME THAT NEVER ANSWERS IS LOADED ONCE MORE. A document that did not
    arrive (a dropped connection, a deploy landing between the editor and
    its frame) never says "ready", and the phone stayed the page's colour
    with nothing on it, for good. One more load after FRAME_READY_MS; the
    editor's own loader has long gone by then (ARRIVE_CAP_MS), so this
    holds nothing up.
  */
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (attempt > 0) return
    const id = window.setTimeout(() => { if (!ready.current) setAttempt(1) }, FRAME_READY_MS)
    return () => window.clearTimeout(id)
  }, [attempt])

  /* Every change, at most once a frame. */
  useEffect(() => {
    if (!ready.current) return
    const id = requestAnimationFrame(send)
    return () => cancelAnimationFrame(id)
  }, [page, currency, send])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: typeof width === "number" ? width * scale : width,
        height: typeof height === "number" ? height * scale : height,
        background: pageColour(page),
      }}
    >
      <iframe
        ref={frame}
        src={attempt ? `${ONEPAGE_PREVIEW_PATH}&again=${attempt}` : ONEPAGE_PREVIEW_PATH}
        title={title}
        /*
          THE PREVIEW CANNOT TAKE THE EDITOR ANYWHERE (round 11). No
          allow-top-navigation and no allow-popups: whatever the page inside
          tries, the editor stays and no tab opens. The page's own links are
          stopped with a note before this is ever reached
          (components/onepage/preview-document); this is the floor under it.
        */
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
        data-onepage-preview-frame=""
        data-drawn={drawn ? "" : undefined}
        /* The creator page's frame arrives on the same fade (app/globals.css creator-frame-in). */
        className={cn("absolute left-0 top-0 block border-0", drawn ? "creator-frame-in" : "opacity-0")}
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "0 0",
          background: "transparent",
          colorScheme: "light",
        }}
      />
    </div>
  )
}

/* The phone's own screen, inside its 10px bezel. */
const SCREEN_W = 287
const SCREEN_H = 607
const SCALE = SCREEN_W / PREVIEW_PHONE_WIDTH
const FRAME_H = Math.round(SCREEN_H / SCALE)

/**
 * The phone beside the editor, from 768px: a 307 by 627 handset around the
 * live page drawn at 390 wide and shown at 287.
 */
export function PhonePreview({ className, onDrawn }: { className?: string; onDrawn?: () => void }) {
  const page = usePreviewPage()
  const shown = useMedia("(min-width: 768px)")
  const side = (style: React.CSSProperties) => (
    <div aria-hidden className="absolute w-[3px] bg-[#1a1a1a]" style={style} />
  )
  return (
    <div
      className={cn("relative shrink-0", className)}
      data-onepage-phone=""
      style={{ width: 307, height: 627, borderRadius: 46, backgroundColor: "#1a1a1a", padding: 10, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}
    >
      {side({ left: -2, top: 85, height: 28, borderRadius: "2px 0 0 2px" })}
      {side({ left: -2, top: 125, height: 44, borderRadius: "2px 0 0 2px" })}
      {side({ left: -2, top: 180, height: 44, borderRadius: "2px 0 0 2px" })}
      {side({ right: -2, top: 145, height: 55, borderRadius: "0 2px 2px 0" })}
      <div className="relative overflow-hidden" style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 34, background: pageColour(page), isolation: "isolate" }}>
        {shown && <LivePreviewFrame page={page} width={PREVIEW_PHONE_WIDTH} height={FRAME_H} scale={SCALE} onDrawn={onDrawn} />}
      </div>
    </div>
  )
}

/**
 * The whole screen behind Preview, on a phone: the live page at the phone's
 * own width. Kept by the editor once it has been opened, so the second look
 * is the page as it was left, scrolled where it was.
 */
export function MobilePreviewContent({ onDrawn }: { onDrawn?: () => void }) {
  const page = usePreviewPage()
  const shown = useMedia("(max-width: 767px)")
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" data-onepage-mobile-preview="" style={{ background: pageColour(page) }}>
      {shown && <LivePreviewFrame page={page} width="100%" height="100%" onDrawn={onDrawn} />}
    </div>
  )
}
