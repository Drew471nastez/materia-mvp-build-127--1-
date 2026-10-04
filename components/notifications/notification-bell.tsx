"use client"

/**
 * ===========================================================================
 *  THE BELL: EVERYTHING THAT HAPPENED FOR THIS PERSON, IN ONE LIST
 * ===========================================================================
 * A bell with the unread count (99+ past 99) that opens the person's
 * notifications: everything from the communities they joined and their own
 * inbox (a new follower, a new product or community from somebody they
 * follow, a new post in a membership they pay for, a new product from a
 * creator they bought from), newest first, from GET /api/notifications/inbox
 * (lib/notifications/user-inbox.ts).
 *
 * On a computer it is a popover under the bell; on a phone the app's one
 * bottom sheet (components/ui/bottom-sheet.tsx), as /app's own
 * notifications are (components/app/notifications-modal.tsx): it slides up
 * from the foot of the screen over a dimmed page, follows the thumb, and a
 * pull down, a tap on the page or Escape sends it back. It used to be a
 * full screen page of its own. Both have the same parts: "Notifications",
 * Mark all as read, a filter (All, Communities, Following, Purchases), and
 * rows with the actor's photo, their name in bold, what happened, when, a
 * line of preview, and a dot while unread. A row opens its page and is
 * marked read on the way. More rows load as the list is scrolled to its
 * end.
 *
 * LIVE. Supabase realtime on the person's own rows in both tables (each
 * table may only be read by its owner, parts 81 and 85): a new row counts up
 * the badge at once and, while the list is open, is fetched into it. The
 * realtime client is given the session's token before it joins
 * (realtimeAuth), or the join goes as a visitor and nothing ever arrives.
 * The count is read again when the tab comes back into view, so reads made
 * on another device or in a community's own inbox show here too.
 *
 * Signed out, or before the session is known, it draws nothing.
 *
 * OPEN AND CLOSE. A second click on the bell closes it; so do a click
 * anywhere outside the list (a press that lands on another control still
 * does what it says, there is no invisible layer over the page to swallow
 * it) and Escape. Both ways are a transition on opacity, `translate` and
 * `scale` only (it used to be a keyframe animation cut off by a timer of
 * the same length, which could let it snap back to full strength for a
 * frame before it went). The list is BUILT AHEAD AND KEPT, the way the
 * navigator's popover is (components/nav/place-navigator.tsx): once the
 * page is idle, or a pointer comes near the bell, it is put in the page
 * invisible and inert, so the click that opens it changes a few properties
 * and builds nothing (measured with the CPU slowed four times, building it
 * on the click cost the first frame of the fade 50 to 67ms). Visibility
 * flips at the end of the way out, never on the way in, where it would keep
 * the list hidden too long to take focus. Under reduced motion nothing
 * moves. The popover is a fixed height, so the list arriving does not grow
 * it under the pointer, and every picture in it is a fixed box asked for at
 * the size it is drawn (lib/images optimizedImageUrl) and loaded lazily.
 *
 * The phone's sheet is built ahead and kept the same way (the sheet's own
 * keepMounted: it waits below the screen and the tap only slides it up).
 * Its rows are read before it opens, so it is as tall as they are and opens
 * with them drawn; a refresh waits until it has arrived (onOpened), so
 * nothing is redrawn in the middle of the slide.
 */
import Link from "next/link"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Bell, Check, ChevronDown } from "lucide-react"

import { AppAvatar } from "@/components/app/app-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { INBOX_EVENT, realtimeAuth } from "@/components/community/member/realtime"
import { relativeTime } from "@/lib/communities/format"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { INBOX_FILTERS, badgeLabel, splitTitle, type InboxFilter, type InboxItem, type InboxPage } from "@/lib/notifications/user-inbox-shared"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const INBOX = "/api/notifications/inbox"
const READ = "/api/notifications/read"
/** Below this width the list is a bottom sheet. */
const PHONE_QUERY = "(max-width: 639px)"

type Load = "idle" | "loading" | "failed"

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function postRead(body: Record<string, unknown>): Promise<{ unread: number } | null> {
  /* keepalive: a row's tap marks it read and navigates at once, and the mark must outlive the page. */
  return getJson<{ unread: number }>(READ, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   ONE BELL ON SCREEN DOES THE ASKING; THE COUNT IS SHARED
  ═══════════════════════════════════════════════════════════════════════════
  The Storelib header draws a bell in its phone row and another in its
  computer row, and one of the two is always display: none. Both used to
  read the unread count and open their own two realtime channels, so every
  signed in visitor held four channels where two do the job. Now only the
  bell that is on screen (the same rule that decides which one builds its
  list) reads the count and listens. The count itself lives here, shared by
  every bell on the page, so when the window crosses 768px the bell that
  appears already shows the right badge: the hidden one lets its channels
  go and the visible one opens its own and reads the count once, at the
  same moment, never both at rest.
*/
let sharedUnread = 0
const unreadListeners = new Set<() => void>()
function setSharedUnread(next: number | ((n: number) => number)) {
  const v = Math.max(0, typeof next === "function" ? next(sharedUnread) : next)
  if (v === sharedUnread) return
  sharedUnread = v
  unreadListeners.forEach((f) => f())
}
const subscribeUnread = (f: () => void) => {
  unreadListeners.add(f)
  return () => unreadListeners.delete(f)
}

/** Whether this bell is on screen: not inside something display: none. Kept current as the layout changes. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>, ready: boolean): boolean {
  const [on, setOn] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!ready || !el) return
    const check = () => setOn(el.getClientRects().length > 0)
    check()
    /* A switch to display: none gives the button an empty box, which the observer reports. */
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check)
    ro?.observe(el)
    window.addEventListener("resize", check)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", check)
    }
  }, [ref, ready])
  return on
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE FIRST PAGE IS ALREADY HERE WHEN THE LIST OPENS
  ═══════════════════════════════════════════════════════════════════════════
  The phone's sheet used to open on four grey skeleton rows and ask for the
  real ones once it had arrived, so every open was a slide, a flash of
  placeholders, then the rows. Now the first page of "All" is asked for
  while the page is idle (with the count, which is asked for at once), and
  kept warm: a row arriving by realtime asks for the page again in the
  background, and an open after FRESH_MS asks again without emptying what is
  shown. So the sheet's first frame already has the rows in it. The page is
  held here as well as in the bell, so a bell drawn again (the Storelib
  header's and a community's are different bars) starts with it. Memory
  only, never storage, and only for the person it was read for.
*/
const FRESH_MS = 30_000
let warm: { userId: string; at: number; items: InboxItem[]; nextCursor: string | null } | null = null

export function NotificationBell({ className }: { className?: string }) {
  const [userId, setUserId] = useState<string | null>(null)
  const unread = useSyncExternalStore(subscribeUnread, () => sharedUnread, () => 0)
  const setUnread = setSharedUnread
  const [open, setOpen] = useState(false)
  /* The list is built once (idle, a pointer near the bell, or the click itself) and kept. */
  const [built, setBuilt] = useState(false)
  if (open && !built) setBuilt(true)
  const [filter, setFilter] = useState<InboxFilter>("all")
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [load, setLoad] = useState<Load>("idle")
  const phone = usePhone()
  const triggerRef = useRef<HTMLButtonElement>(null)
  /* Only the bell on screen reads the count, listens live and builds its list. */
  const active = useOnScreen(triggerRef, !!userId)
  const openRef = useRef(open)
  const filterRef = useRef(filter)
  openRef.current = open
  filterRef.current = filter
  /* When the rows on hand were read, for whether an open asks again. */
  const loadedAtRef = useRef(0)
  const hasItemsRef = useRef(false)
  hasItemsRef.current = items !== null
  const userRef = useRef(userId)
  userRef.current = userId

  /* Who is signed in, from the session the browser already holds. */
  useEffect(() => {
    let gone = false
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession()
        if (gone) return
        const id = data.session?.user?.id ?? null
        /* The page another bell already read for this person, so this one opens on it too. */
        if (id && warm && warm.userId === id && filterRef.current === "all") {
          setItems(warm.items)
          setCursor(warm.nextCursor)
          loadedAtRef.current = warm.at
        }
        setUserId(id)
      } catch {
        /* No session: no bell. */
      }
    })()
    return () => {
      gone = true
    }
  }, [])

  const refreshCount = useCallback(async () => {
    const r = await getJson<{ unread: number }>(`${INBOX}?summary=1`)
    if (r && Number.isFinite(r.unread)) setUnread(Math.max(0, r.unread))
  }, [])

  const loadFirst = useCallback(async (f: InboxFilter) => {
    setLoad("loading")
    const r = await getJson<InboxPage>(`${INBOX}?filter=${f}`)
    if (filterRef.current !== f) return
    if (!r) return setLoad("failed")
    setItems(r.items)
    setCursor(r.nextCursor)
    setUnread(r.unread)
    setLoad("idle")
    loadedAtRef.current = Date.now()
    if (f === "all" && userRef.current) warm = { userId: userRef.current, at: loadedAtRef.current, items: r.items, nextCursor: r.nextCursor }
  }, [])
  /* Asked again only when what is on hand is missing or older than FRESH_MS; what is shown stays until the answer. */
  const refreshIfStale = useCallback(() => {
    if (!hasItemsRef.current || Date.now() - loadedAtRef.current > FRESH_MS) void loadFirst(filterRef.current)
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (!cursor || load === "loading") return
    const f = filter
    setLoad("loading")
    const r = await getJson<InboxPage>(`${INBOX}?filter=${f}&cursor=${encodeURIComponent(cursor)}`)
    if (filterRef.current !== f) return
    if (!r) return setLoad("failed")
    setItems((cur) => [...(cur ?? []), ...r.items.filter((n) => !(cur ?? []).some((c) => c.id === n.id))])
    setCursor(r.nextCursor)
    setLoad("idle")
  }, [cursor, filter, load])

  /* The badge once signed in (or once this bell comes on screen), and again when the tab comes back or a community's inbox says it changed. */
  useEffect(() => {
    if (!userId || !active) return
    void refreshCount()
    let last = Date.now()
    const again = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return
      last = Date.now()
      void refreshCount()
    }
    const fromCommunity = () => void refreshCount()
    document.addEventListener("visibilitychange", again)
    window.addEventListener(INBOX_EVENT, fromCommunity)
    return () => {
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener(INBOX_EVENT, fromCommunity)
    }
  }, [userId, active, refreshCount])

  /* New rows, live, from both tables. One channel each, so a table missing from the publication cannot stop the other. Only while this bell is on screen. */
  useEffect(() => {
    if (!userId || !active) return
    let gone = false
    let timer: number | null = null
    let supabase: ReturnType<typeof createClient> | null = null
    const channels: ReturnType<ReturnType<typeof createClient>["channel"]>[] = []
    const arrived = (payload: { new?: { read_at?: string | null } }) => {
      if (payload.new && !payload.new.read_at) setUnread((n) => n + 1)
      /* Kept warm: open or not, a list already read is read again, so the next open shows the new row at once. */
      if (!openRef.current && !hasItemsRef.current) return
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => void loadFirst(filterRef.current), 400)
    }
    void (async () => {
      try {
        supabase = createClient()
        await realtimeAuth(supabase)
        if (gone) return
        for (const table of ["user_notifications", "community_notifications"]) {
          channels.push(
            supabase
              .channel(`bell:${table}:${userId}`)
              .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `user_id=eq.${userId}` }, arrived)
              .subscribe(),
          )
        }
      } catch {
        /* No realtime: the count is read when the tab comes back. */
      }
    })()
    return () => {
      gone = true
      if (timer) window.clearTimeout(timer)
      if (supabase) for (const ch of channels) supabase.removeChannel(ch)
    }
  }, [userId, active, loadFirst])

  /*
    Built while the page is idle, once somebody is signed in, and only for a
    bell that is on screen: the Storelib header draws one bell in its phone
    row and one in its computer row, and the hidden one (display: none) is
    never opened, so it builds nothing.
  */
  useEffect(() => {
    if (!userId || built || !active) return
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    /* Built, and the first page asked for, so an open has rows to show (THE FIRST PAGE IS ALREADY HERE). */
    const build = () => {
      setBuilt(true)
      refreshIfStale()
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(build, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(build, 1500)
    return () => window.clearTimeout(t)
  }, [userId, built, active, refreshIfStale])

  const openList = () => {
    setOpen(true)
    /*
      The rows are on hand (asked for while the page was idle), so the list
      opens drawn. On a phone a refresh of rows that are there waits for the
      sheet to arrive (onArrived), so nothing is redrawn in the middle of its
      slide; with nothing on hand yet (opened before the page went idle) it
      is asked for now, the sooner the better.
    */
    if (!phone || !hasItemsRef.current) refreshIfStale()
    void postRead({ seen: true })
  }
  const onArrived = useCallback(() => refreshIfStale(), [refreshIfStale])
  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) window.setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0)
  }, [])

  const choose = (f: InboxFilter) => {
    if (f === filterRef.current) return
    setFilter(f)
    filterRef.current = f
    setItems(null)
    setCursor(null)
    void loadFirst(f)
  }

  const markAll = async () => {
    setItems((cur) => (cur ? cur.map((n) => ({ ...n, read: true })) : cur))
    setUnread(0)
    const r = await postRead({ all: true })
    if (r) setUnread(r.unread)
  }

  const openRow = (n: InboxItem) => {
    if (!n.read) {
      setItems((cur) => (cur ? cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : cur))
      setUnread((u) => Math.max(0, u - 1))
      void postRead({ ids: [n.id] })
    }
    close(false)
  }

  if (!userId) return null
  const label = badgeLabel(unread)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onPointerEnter={() => setBuilt(true)}
        onFocus={() => setBuilt(true)}
        aria-label={label ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-notification-bell=""
        data-bell-active={active ? "" : undefined}
        className={cn("relative flex h-[42px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full transition", className)}
      >
        <span className="relative inline-flex">
          <Bell className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
          {label ? (
            <span
              data-bell-badge=""
              aria-hidden
              /* Ink with white figures, not red; white with ink on a dark bar (round 8, the same as the heart's CountBadge). */
              className="absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1a1a2e] px-[5px] text-white [[data-header-tone=dark]_&]:bg-white [[data-header-tone=dark]_&]:text-[#1a1a2e]"
            >
              <span className="block text-[10px] font-semibold leading-none tabular-nums">{label}</span>
            </span>
          ) : null}
        </span>
      </button>
      {built ? (
        <BellPanel
          phone={phone}
          open={open}
          anchor={triggerRef}
          items={items}
          unread={unread}
          filter={filter}
          load={load}
          hasMore={!!cursor}
          onClose={close}
          onFilter={choose}
          onMarkAll={markAll}
          onOpenRow={openRow}
          onMore={loadMore}
          onRetry={() => void loadFirst(filterRef.current)}
          onArrived={onArrived}
        />
      ) : null}
    </>
  )
}

/* ── The list, as a popover or a sheet ────────────────────────────────── */

function BellPanel({
  phone,
  open,
  anchor,
  items,
  unread,
  filter,
  load,
  hasMore,
  onClose,
  onFilter,
  onMarkAll,
  onOpenRow,
  onMore,
  onRetry,
  onArrived,
}: {
  phone: boolean
  /** False while it is closed: kept in the page, invisible and inert. */
  open: boolean
  anchor: React.RefObject<HTMLButtonElement | null>
  items: InboxItem[] | null
  unread: number
  filter: InboxFilter
  load: Load
  hasMore: boolean
  onClose: (refocus?: boolean) => void
  onFilter: (f: InboxFilter) => void
  onMarkAll: () => void
  onOpenRow: (n: InboxItem) => void
  onMore: () => void
  onRetry: () => void
  /** The phone's sheet has finished sliding up. */
  onArrived: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const titleId = useId()

  /* Under the bell, its right edge on the bell's, inside a 16px gutter. Measured again on every open, before it is painted. */
  useLayoutEffect(() => {
    if (phone) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      setPos({ top: Math.round(r.bottom + 8), right: Math.max(16, Math.round(window.innerWidth - r.right - 4)) })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [phone, anchor, open])

  /*
    Escape closes; so does a press anywhere outside the list and the bell
    (the bell toggles itself, so it is not "outside"). Heard in the capture
    phase, so it is not lost to a control that stops its own events, and it
    never cancels the press: whatever was under it still gets its click.
    The popover only: the phone's sheet has its own Escape, its own dimmed
    page that closes it on a tap, and holds the page behind it still.
  */
  useEffect(() => {
    if (!open || phone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchor.current?.contains(t)) return
      onClose(false)
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", away, true)
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", away, true)
    }
  }, [open, phone, onClose, anchor])

  /* More rows as the end of the list comes into view. */
  useEffect(() => {
    const end = endRef.current
    /* Only while open: a kept list that is closed asks for nothing. */
    if (!open || !end || !hasMore || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), { root: listRef.current, rootMargin: "120px" })
    io.observe(end)
    return () => io.disconnect()
  }, [open, hasMore, onMore, items])

  if (typeof document === "undefined" || (!phone && !pos)) return null

  const title = (
    <h2 id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
      Notifications
    </h2>
  )
  /* A phone has the title on one row and what to do with the list under it (the filter's longest name and Mark all as read do not fit beside the title at 320px); a computer has all of it on one. */
  const head = phone ? (
    <div className="border-b border-[#f0f1f3]" data-bell-sheet-header="">
      <div className="flex h-10 items-center pl-4 pr-2">{title}</div>
      <div className="flex h-11 items-center justify-between pb-1 pl-2 pr-2">
        <FilterMenu value={filter} onChange={onFilter} align="left" />
        <MarkAll unread={unread} onMarkAll={onMarkAll} />
      </div>
    </div>
  ) : (
    <div className="shrink-0 border-b border-[#f0f1f3] bg-white">
      <div className="flex h-[58px] items-center gap-2 pl-5 pr-3">
        {title}
        <MarkAll unread={unread} onMarkAll={onMarkAll} />
        <FilterMenu value={filter} onChange={onFilter} />
      </div>
    </div>
  )
  const list = (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-bell-list="">
      {items === null ? (
        load === "failed" ? (
          <Quiet>
            That did not load.{" "}
            <button type="button" onClick={onRetry} className="cursor-pointer font-medium text-[#1a1a2e] underline underline-offset-2">
              Try again
            </button>
          </Quiet>
        ) : (
          <RowsLoading />
        )
      ) : items.length === 0 ? (
        <Quiet empty>Nothing new</Quiet>
      ) : (
        <ul className="divide-y divide-[#f0f1f3]">
          {items.map((n) => (
            <li key={n.id}>
              <Row n={n} onOpen={onOpenRow} />
            </li>
          ))}
        </ul>
      )}
      {items && items.length > 0 && hasMore ? (
        <div ref={endRef} className="flex h-14 items-center justify-center text-[13px] text-[#9ca3af]">
          {load === "failed" ? (
            <button type="button" onClick={onMore} className="h-10 cursor-pointer px-3 font-medium text-[#1a1a2e]">
              Show more
            </button>
          ) : (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#9ca3af] motion-reduce:animate-none" aria-label="Loading" />
          )}
        </div>
      ) : null}
    </div>
  )

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={() => onClose(false)}
        label="Notifications"
        hideFrom="sm"
        fill
        /*
          AS TALL AS ITS ROWS, NO TALLER (image 55: four rows in a fixed
          68dvh sheet left a white gap under the list, down to the browser's
          bar). The rows are on hand before it opens (THE FIRST PAGE IS
          ALREADY HERE), so sized to them it never grows under the thumb; a
          long list stops at this height and scrolls inside.
        */
        maxHeight="min(78dvh, 640px)"
        /* Built while the page is idle and kept: the tap only slides it up. */
        keepMounted
        onOpened={onArrived}
        header={head}
      >
        <div
          ref={panelRef}
          aria-labelledby={titleId}
          data-notification-panel="sheet"
          data-state={open ? "open" : "closed"}
          className="flex min-h-0 flex-1 flex-col"
        >
          {list}
        </div>
      </BottomSheet>
    )
  }

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby={titleId}
      data-notification-panel="popover"
      data-state={open ? "open" : "closed"}
      inert={open ? undefined : true}
      /* A fixed height (the room under the bell, at most 560px), so the list arriving never grows the panel under the pointer. */
      style={{ top: pos!.top, right: pos!.right, height: `min(560px, calc(100vh - ${pos!.top + 16}px))` }}
      className={cn(
        "fixed z-[130] flex w-[420px] max-w-[calc(100vw-32px)] origin-top-right flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left outline-none shadow-[0_24px_60px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)]",
        "motion-reduce:transition-none",
        open
          ? "transition-[opacity,translate,scale] translate-y-0 scale-100 opacity-100 duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:-translate-y-1 starting:scale-[0.98] starting:opacity-0"
          : "transition-[opacity,translate,scale,visibility] invisible pointer-events-none -translate-y-1 scale-[0.98] opacity-0 duration-[150ms] ease-[cubic-bezier(0.4,0,1,1)]",
      )}
    >
      {head}
      {list}
    </div>,
    document.body,
  )
}

function MarkAll({ unread, onMarkAll }: { unread: number; onMarkAll: () => void }) {
  if (unread <= 0) return null
  return (
    <button
      type="button"
      onClick={onMarkAll}
      data-mark-all-read=""
      className="h-10 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13.5px] font-medium text-[#1a1a2e] outline-none transition-colors hover:bg-[#f4f5f7] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
    >
      Mark all as read
    </button>
  )
}

function Row({ n, onOpen }: { n: InboxItem; onOpen: (n: InboxItem) => void }) {
  const { lead, rest } = splitTitle(n.title, n.actor?.name)
  const when = relativeTime(n.createdAt)
  const inner = (
    <>
      <Face n={n} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px] leading-[1.4]", n.read ? "text-[#4b5563]" : "text-[#1a1a2e]")}>
          {lead ? <span className="font-semibold text-[#1a1a2e]">{lead}</span> : null}
          <span>{rest}</span>
          {when ? (
            /* No break space before the dot: the time never starts a line on its own, it takes the last word with it. */
            <span className="whitespace-nowrap text-[#9ca3af]" suppressHydrationWarning>
              {"\u00a0·\u00a0"}
              {when}
            </span>
          ) : null}
        </span>
        {n.body ? <span className="mt-0.5 block truncate text-[13.5px] leading-[1.45] text-[#6b7280]">{n.body}</span> : null}
      </span>
      <span className="flex w-3 shrink-0 justify-end pt-[7px]">{!n.read ? <span aria-label="Unread" data-unread-dot="" className="h-2.5 w-2.5 rounded-full bg-[#1a1a2e]" /> : null}</span>
    </>
  )
  const cls = "flex min-h-[64px] w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-[#f8f9fa] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:px-5"
  return n.url ? (
    <Link href={n.url} prefetch={false} onClick={() => onOpen(n)} className={cls} data-notification-row={n.read ? "read" : "unread"}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={() => onOpen(n)} className={cn(cls, "cursor-pointer")} data-notification-row={n.read ? "read" : "unread"}>
      {inner}
    </button>
  )
}

/**
 * The actor's photo; a community's logo or a product's picture when nobody
 * acted; a bell when there is neither. A community row carries its
 * community on the photo's corner (its logo, or its first letter), so a
 * reply from one community reads apart from a reply in another without a
 * line of its own.
 */
/* A picture that will not load leaves its grey box, never the browser's broken image mark. */
const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = "hidden"
}

function Face({ n }: { n: InboxItem }) {
  if (n.actor) {
    return (
      <span className="relative shrink-0">
        <AppAvatar src={n.actor.avatarUrl} name={n.actor.name} alt="" size={40} markWhileLoading lazy />
        {n.community ? (
          <span title={n.community.name} data-community-mark="" className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-[6px] bg-[#1a1a2e] text-[9.5px] font-semibold uppercase leading-none text-white ring-2 ring-white">
            {n.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImageUrl(n.image, 18)} alt="" width={18} height={18} className="h-full w-full object-cover" loading="lazy" decoding="async" onError={hideBroken} />
            ) : (
              n.community.name.trim().charAt(0)
            )}
          </span>
        ) : null}
      </span>
    )
  }
  if (n.image) {
    return (
      /* A fixed 40px box with the grey under it, so a picture still on its way holds its place. */
      <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#eef0f3] bg-[#eef0f3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={optimizedImageUrl(n.image, 40)} alt="" width={40} height={40} className="h-full w-full object-cover" loading="lazy" decoding="async" onError={hideBroken} />
      </span>
    )
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef0f3] text-[#6b7280]">
      <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  )
}

function FilterMenu({ value, onChange, align = "right" }: { value: InboxFilter; onChange: (f: InboxFilter) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = INBOX_FILTERS.find((f) => f.key === value) ?? INBOX_FILTERS[0]
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", away)
    /* Capture, so it is heard before the list's own Escape: the first Escape closes this menu, the second the list. */
    window.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", away)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-bell-filter={value}
        className="flex h-10 cursor-pointer items-center gap-1 rounded-lg pl-2.5 pr-2 text-[13.5px] font-medium text-[#6b7280] outline-none transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
      >
        {current.label}
        <ChevronDown className={cn("h-4 w-4 transition-[rotate] duration-150 motion-reduce:transition-none", open && "rotate-180")} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Show"
          data-bell-filter-menu=""
          className={cn("absolute top-[calc(100%+4px)] z-10 w-[180px]", align === "left" ? "left-0" : "right-0", " overflow-hidden rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-[0_12px_32px_-8px_rgba(17,24,39,0.18)] animate-in fade-in-0 zoom-in-95 duration-100")}
        >
          {INBOX_FILTERS.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                role="option"
                aria-selected={f.key === value}
                onClick={() => {
                  setOpen(false)
                  onChange(f.key)
                }}
                className="flex h-10 w-full cursor-pointer items-center justify-between px-3.5 text-left text-[14px] text-[#1a1a2e] outline-none hover:bg-[#f8f9fa] focus-visible:bg-[#f4f5f7]"
              >
                {f.label}
                {f.key === value ? <Check className="h-4 w-4 text-[#1a1a2e]" strokeWidth={2.25} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Quiet({ children, empty }: { children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center" data-bell-empty={empty ? "" : undefined}>
      {empty ? (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f5f7] text-[#9ca3af]">
          <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <p className="text-[14px] text-[#6b7280]">{children}</p>
    </div>
  )
}

function RowsLoading() {
  return (
    <ul aria-hidden className="divide-y divide-[#f0f1f3]" data-bell-loading="">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
          <span className="h-10 w-10 shrink-0 rounded-full bg-[#f1f2f4]" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-3/4 rounded bg-[#f1f2f4]" />
            <span className="block h-3 w-1/2 rounded bg-[#f4f5f7]" />
          </span>
        </li>
      ))}
    </ul>
  )
}
