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
import { useOnePageTeam } from "@/lib/onepage/team-context"
import { useOnePage } from "@/lib/onepage/context"
import { publicOnePageFromDraft, type PublicOnePageData } from "@/lib/onepage/public-shape"
import { ONEPAGE_PREVIEW_CHANNEL, ONEPAGE_PREVIEW_PATH, type PreviewMessage } from "@/lib/onepage/preview-channel"
import { cn } from "@/lib/utils"
import { notePreviewPick, PREVIEW_PICK_EVENT, validBlockId } from "@/lib/onepage/preview-select"
import { Clock } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { isScheduledNow, scheduleLabel } from "@/lib/onepage/extra-blocks"
import type { OnePageBlock } from "@/lib/onepage/types"
import { createClient } from "@/lib/supabase/client"
import { acceptAvatarRead, avatarReadToken, useShellAvatar } from "@/lib/account/avatar-store"
import { useStoreCurrencyIfSet } from "@/lib/store/currency-context"

/** How long a frame has to say it is ready before it is loaded once more. */
const FRAME_READY_MS = 6000
/** A frame out of sight is sent the page once edits have paused this long. */
const HIDDEN_SEND_MS = 250

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
  /* Round 41: a team member is handed the owner's name and photo with the page (lib/onepage/team-context): nothing is read from their browser, and the shell's photo (theirs) is never put in the owner's place. */
  const team = useOnePageTeam()
  const { onepage } = useOnePage()
  const [owner, setOwner] = useState<{ displayName: string | null; avatarUrl: string | null }>({ displayName: null, avatarUrl: onepage?.avatar_url ?? null })
  const shellAvatar = useShellAvatar(owner.avatarUrl, ownerId)
  useEffect(() => {
    if (!ownerId || team) return
    let live = true
    const refresh = () => {
      if (!live || document.hidden) return
      const started = avatarReadToken()
      createClient()
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", ownerId)
        .maybeSingle()
        .then(
          ({ data, error }: { data: unknown; error?: unknown }) => {
            if (!live || error || !data || Array.isArray(data)) return
            const row = data as { display_name?: string | null; avatar_url?: string | null }
            acceptAvatarRead(row.avatar_url ?? null, started)
            setOwner({ displayName: row.display_name ?? null, avatarUrl: row.avatar_url ?? null })
          },
          () => undefined,
        )
    }
    refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    return () => {
      live = false
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
    }
  }, [ownerId, team])
  return useMemo(
    () => (team ? { displayName: team.ownerName ?? null, avatarUrl: team.ownerAvatar ?? null } : { displayName: owner.displayName, avatarUrl: shellAvatar }),
    [team, owner.displayName, shellAvatar],
  )
}

/** The editor's page, as the published page would be built from it: the draft first, then the owner's profile. */
function usePreviewPage(): PublicOnePageData | null {
  const { onepage } = useOnePage()
  const owner = useOwnerProfile(onepage?.owner_id)
  /* Round AR: shaped again each minute while a block is scheduled, so it comes and goes on time here as it does live. */
  const scheduled = !!onepage?.draft_blocks?.some((b) => !!b?.schedule)
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    if (!scheduled) return
    const t = window.setInterval(() => setMinute((m) => m + 1), 60_000)
    return () => window.clearInterval(t)
  }, [scheduled])
  return useMemo(
    () => (onepage ? publicOnePageFromDraft(onepage as never, { displayName: owner.displayName, liveAvatarUrl: owner.avatarUrl }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onepage, owner.displayName, owner.avatarUrl, minute],
  )
}

/**
 * ROUND AR: WHAT THE SCHEDULE HIDES RIGHT NOW. A block outside its show
 * from / until window is left out of the preview exactly as it is left out
 * of the live page (lib/onepage/public-shape), so the preview says so, on a
 * small note over its foot: how many, and when the next one starts. Read
 * again every minute, so a block whose time has come appears and the note
 * goes without a reload.
 */
function useScheduledAway(): { count: number; next: string | null } {
  const { onepage } = useOnePage()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return useMemo(() => {
    const all: OnePageBlock[] = []
    for (const b of (onepage?.draft_blocks ?? []) as OnePageBlock[]) {
      all.push(b)
      const kids = (b.data as { children?: OnePageBlock[] } | null)?.children
      if (b.type === "group" && Array.isArray(kids)) all.push(...kids)
    }
    const away = all.filter((b) => b?.enabled !== false && b?.schedule && !isScheduledNow(b, now))
    const soonest = away
      .map((b) => ({ b, start: Date.parse(b.schedule?.start_at || "") }))
      .filter((x) => !Number.isNaN(x.start) && x.start > now)
      .sort((a, c) => a.start - c.start)[0]
    return { count: away.length, next: soonest ? scheduleLabel(soonest.b, now)?.text ?? null : null }
  }, [onepage?.draft_blocks, now])
}

function ScheduledNote() {
  const { count, next } = useScheduledAway()
  if (!count) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3" data-preview-scheduled={count}>
      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-[#1a1a2e]/85 px-3 py-1.5 text-[11.5px] font-medium text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] backdrop-blur-sm">
        <Clock aria-hidden className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {tt("{count, plural, one {# scheduled block hidden now} other {# scheduled blocks hidden now}}", { count })}
          {next ? ` · ${next}` : ""}
        </span>
      </span>
    </div>
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
  pick,
  corner,
}: {
  /** Round AS: how round the screen around the frame is, in screen pixels; the page's corner buttons keep clear of it. */
  corner?: number
  /** Round AR: the phone beside the editor picks blocks (lib/onepage/preview-select): which is open, and what a pick does. */
  pick?: { selected: string | null; onPick: (id: string) => void }
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
  /*
    THE PHONE IS ZOOMED, NOT SCALED (round 42, "the straight top and bottom
    edges of a button's border fade out"). A transform scales a picture of
    the page: nothing in it is snapped to the screen's pixels any more, so
    a 1px border became 0.74 of a pixel smeared over two rows, nearly gone
    on a dark page, and only where it happened to land between pixels
    (often the top and bottom, rarely the sides). CSS zoom lays the page out
    at that size instead, so the browser snaps every edge as it does on a
    real screen: measured, the border reads at its full colour on all four
    sides, where the transform left it at a third. A browser that does not
    carry zoom into the frame (the frame's own width would then come out
    small) is given the transform, as before.
  */
  const [zoomed, setZoomed] = useState(true)
  const onFrameLoad = useCallback(() => {
    if (scale === 1 || typeof width !== "number") return
    try {
      const inner = frame.current?.contentWindow?.innerWidth ?? width
      if (Math.abs(inner - width) > 2) setZoomed(false)
    } catch {
      setZoomed(false)
    }
  }, [scale, width])
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn

  const pickRef = useRef(pick)
  pickRef.current = pick
  const sendPick = useCallback(() => {
    const win = frame.current?.contentWindow
    if (!win || !ready.current) return
    const p = pickRef.current
    win.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "select-mode", on: !!p, selected: p?.selected ?? null } satisfies PreviewMessage, window.location.origin)
  }, [])

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
        sendPick()
      } else if (data.kind === "select") {
        if (validBlockId(data.id)) pickRef.current?.onPick(data.id)
      } else if (data.kind === "drawn") {
        setDrawn(true)
        onDrawnRef.current?.()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [send, sendPick])

  /* Round AR: the frame hears which block is open as soon as it changes. */
  const pickOn = !!pick
  const pickSelected = pick?.selected ?? null
  useEffect(() => {
    sendPick()
  }, [pickOn, pickSelected, sendPick])

  /*
    A FRAME THAT NEVER ANSWERS IS LOADED ONCE MORE. A document that did not
    arrive (a dropped connection, a deploy landing between the editor and
    its frame) never says "ready", and the phone stayed the page's colour
    with nothing on it, for good. One more load after FRAME_READY_MS; the
    editor's own loader has long gone by then (ARRIVE_CAP_MS), so this
    holds nothing up.
  */
  const [attempt, setAttempt] = useState(0)
  /* The screen's corner in the page's own pixels (it is drawn at `scale`), for the corner buttons (components/onepage/preview-document). */
  const cornerQuery = corner ? `&corner=${Math.round((corner / scale) * 10) / 10}` : ""
  useEffect(() => {
    if (attempt > 0) return
    const id = window.setTimeout(() => { if (!ready.current) setAttempt(1) }, FRAME_READY_MS)
    return () => window.clearTimeout(id)
  }, [attempt])

  /*
    Every change, at most once a frame, while the frame can be seen. A frame
    kept warm out of sight (the phone's preview while the editor is shown, or
    the phone beside the editor at a width that hides it) draws the page once
    the typing pauses instead: it used to draw the whole page, and measure every
    word's legibility over it, on every letter typed, about half of what one
    keystroke cost on a phone slowed 4x (scripts/check-onepage-au2.mjs).
  */
  useEffect(() => {
    if (!ready.current) return
    const el = frame.current
    if (el && typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions)) {
      const id = window.setTimeout(send, HIDDEN_SEND_MS)
      return () => window.clearTimeout(id)
    }
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
        src={`${ONEPAGE_PREVIEW_PATH}${cornerQuery}${attempt ? `&again=${attempt}` : ""}`}
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
        data-preview-scale={scale === 1 ? undefined : zoomed ? "zoom" : "transform"}
        onLoad={onFrameLoad}
        data-drawn={drawn ? "" : undefined}
        /* The creator page's frame arrives on the same fade (app/globals.css creator-frame-in). */
        className={cn("absolute left-0 top-0 block border-0", drawn ? "creator-frame-in" : "opacity-0")}
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
          ...(scale === 1 ? null : zoomed ? { zoom: scale } : { transform: `scale(${scale})`, transformOrigin: "0 0" }),
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
/** The screen's own corner radius: drawn here once, and handed to the page so its corner buttons sit clear of it (round AS). */
export const PHONE_SCREEN_RADIUS = 34
const SCALE = SCREEN_W / PREVIEW_PHONE_WIDTH
const FRAME_H = Math.round(SCREEN_H / SCALE)

/**
 * The phone beside the editor, from 768px: a 307 by 627 handset around the
 * live page drawn at 390 wide and shown at 287.
 */
export function PhonePreview({ className, onDrawn }: { className?: string; onDrawn?: () => void }) {
  const page = usePreviewPage()
  const shown = useMedia("(min-width: 768px)")
  /*
    ROUND AR: CLICK A BLOCK IN THE PHONE TO EDIT IT. The editor opens it
    (lib/onepage/context selectedBlockId) and shows it in the Links list
    (components/onepage/onepage-editor and tabs/links-tab hear the event).
  */
  const { selectedBlockId, setSelectedBlockId } = useOnePage()
  const pick = useMemo(
    () => ({
      selected: selectedBlockId,
      onPick: (id: string) => {
        notePreviewPick(id)
        setSelectedBlockId(id)
        window.dispatchEvent(new CustomEvent(PREVIEW_PICK_EVENT, { detail: { id } }))
      },
    }),
    [selectedBlockId, setSelectedBlockId],
  )
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
      <div className="relative overflow-hidden" style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: PHONE_SCREEN_RADIUS, background: pageColour(page), isolation: "isolate" }}>
        {shown && <LivePreviewFrame page={page} width={PREVIEW_PHONE_WIDTH} height={FRAME_H} scale={SCALE} onDrawn={onDrawn} pick={pick} corner={PHONE_SCREEN_RADIUS} />}
        {shown ? <ScheduledNote /> : null}
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
      {shown ? <ScheduledNote /> : null}
    </div>
  )
}
