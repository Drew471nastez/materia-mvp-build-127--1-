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
 * On a computer it is a popover under the bell; on a phone a full screen
 * sheet. Both have the same parts: "Notifications", Mark all as read, a
 * filter (All, Communities, Following, Purchases), and rows with the actor's
 * photo, their name in bold, what happened, when, a line of preview, and a
 * dot while unread. A row opens its page and is marked read on the way.
 * More rows load as the list is scrolled to its end.
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
 */
import Link from "next/link"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Bell, Check, ChevronDown, X } from "lucide-react"

import { AppAvatar } from "@/components/app/app-avatar"
import { INBOX_EVENT, realtimeAuth } from "@/components/community/member/realtime"
import { relativeTime } from "@/lib/communities/format"
import { INBOX_FILTERS, badgeLabel, splitTitle, type InboxFilter, type InboxItem, type InboxPage } from "@/lib/notifications/user-inbox-shared"
import { createClient } from "@/lib/supabase/client"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { cn } from "@/lib/utils"

const INBOX = "/api/notifications/inbox"
const READ = "/api/notifications/read"
const ENTER_MS = 200
const EXIT_MS = 150
/** Below this width the list is a full screen sheet. */
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

export function NotificationBell({ className }: { className?: string }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [filter, setFilter] = useState<InboxFilter>("all")
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [load, setLoad] = useState<Load>("idle")
  const phone = usePhone()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef(open)
  const filterRef = useRef(filter)
  openRef.current = open
  filterRef.current = filter

  /* Who is signed in, from the session the browser already holds. */
  useEffect(() => {
    let gone = false
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession()
        if (!gone) setUserId(data.session?.user?.id ?? null)
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
  }, [])

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

  /* The badge once signed in, and again when the tab comes back or a community's inbox says it changed. */
  useEffect(() => {
    if (!userId) return
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
  }, [userId, refreshCount])

  /* New rows, live, from both tables. One channel each, so a table missing from the publication cannot stop the other. */
  useEffect(() => {
    if (!userId) return
    let gone = false
    let timer: number | null = null
    let supabase: ReturnType<typeof createClient> | null = null
    const channels: ReturnType<ReturnType<typeof createClient>["channel"]>[] = []
    const arrived = (payload: { new?: { read_at?: string | null } }) => {
      if (payload.new && !payload.new.read_at) setUnread((n) => n + 1)
      if (!openRef.current) return
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
  }, [userId, loadFirst])

  /* Open and close, with a short exit before it leaves the page. */
  useEffect(() => {
    if (open) {
      setShown(true)
      setLeaving(false)
      return
    }
    if (!shown) return
    setLeaving(true)
    const t = window.setTimeout(() => {
      setShown(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, shown])

  const openList = () => {
    setOpen(true)
    void loadFirst(filterRef.current)
    void postRead({ seen: true })
  }
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
        aria-label={label ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-notification-bell=""
        className={cn("relative flex h-[42px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full transition", className)}
      >
        <span className="relative inline-flex">
          <Bell className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
          {label ? (
            <span
              data-bell-badge=""
              aria-hidden
              className="absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-[5px] text-white"
            >
              <span className="block text-[10px] font-semibold leading-none tabular-nums">{label}</span>
            </span>
          ) : null}
        </span>
      </button>
      {shown ? (
        <BellPanel
          phone={phone}
          leaving={leaving}
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
        />
      ) : null}
    </>
  )
}

/* ── The list, as a popover or a sheet ────────────────────────────────── */

function BellPanel({
  phone,
  leaving,
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
}: {
  phone: boolean
  leaving: boolean
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
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const titleId = useId()

  useLightChrome(phone && !leaving)

  /* Under the bell, its right edge on the bell's, inside a 16px gutter. */
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
  }, [phone, anchor])

  /* Escape closes; a phone's page behind the sheet does not scroll. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    if (phone) document.body.style.overflow = "hidden"
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener("keydown", onKey)
      if (phone) document.body.style.overflow = prev
    }
  }, [phone, onClose])

  /* More rows as the end of the list comes into view. */
  useEffect(() => {
    const end = endRef.current
    if (!end || !hasMore || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), { root: listRef.current, rootMargin: "120px" })
    io.observe(end)
    return () => io.disconnect()
  }, [hasMore, onMore, items])

  if (typeof document === "undefined" || (!phone && !pos)) return null

  const body = (
    <>
      <div className={cn("shrink-0 border-b border-[#f0f1f3] bg-white", phone && "pt-[env(safe-area-inset-top)]")}>
        {/* A phone has the title and Close on one row and what to do with the list under it; a computer has all of it on one. */}
        <div className={cn("flex items-center gap-2", phone ? "h-14 pl-4 pr-2" : "h-[58px] pl-5 pr-3")}>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
            Notifications
          </h2>
          {phone ? (
            <button type="button" aria-label="Close" onClick={() => onClose()} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
              <X className="h-[20px] w-[20px]" />
            </button>
          ) : (
            <>
              <MarkAll unread={unread} onMarkAll={onMarkAll} />
              <FilterMenu value={filter} onChange={onFilter} />
            </>
          )}
        </div>
        {phone ? (
          <div className="-mt-1 flex h-11 items-center justify-between pb-1 pl-2 pr-2">
            <FilterMenu value={filter} onChange={onFilter} align="left" />
            <MarkAll unread={unread} onMarkAll={onMarkAll} />
          </div>
        ) : null}
      </div>
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
        {phone ? <div className="h-[env(safe-area-inset-bottom)]" /> : null}
      </div>
    </>
  )

  return createPortal(
    phone ? (
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-notification-panel="sheet"
        style={{ animationDuration: `${leaving ? EXIT_MS : ENTER_MS + 40}ms` }}
        className={cn(
          "fixed inset-x-0 top-[var(--vv-top,0px)] z-[130] flex h-[var(--vv-h,100dvh)] flex-col bg-white outline-none ease-sheet [backface-visibility:hidden]",
          leaving ? "animate-out fade-out-0 slide-out-to-bottom-6" : "animate-in fade-in-0 slide-in-from-bottom-6",
        )}
      >
        {body}
      </div>
    ) : (
      <>
        {/* No dark scrim: the page stays as it was, and a click outside closes the list. */}
        <div aria-hidden className="fixed inset-0 z-[120]" onClick={() => onClose(false)} />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-labelledby={titleId}
          data-notification-panel="popover"
          style={{ top: pos!.top, right: pos!.right, maxHeight: `min(600px, calc(100vh - ${pos!.top + 16}px))`, animationDuration: `${leaving ? EXIT_MS : ENTER_MS}ms` }}
          className={cn(
            "fixed z-[130] flex w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left outline-none shadow-[0_24px_60px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] ease-sheet",
            leaving ? "animate-out fade-out-0 slide-out-to-top-1" : "animate-in fade-in-0 slide-in-from-top-1",
          )}
        >
          {body}
        </div>
      </>
    ),
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
function Face({ n }: { n: InboxItem }) {
  if (n.actor) {
    return (
      <span className="relative shrink-0">
        <AppAvatar src={n.actor.avatarUrl} name={n.actor.name} alt="" size={40} markWhileLoading />
        {n.community ? (
          <span title={n.community.name} data-community-mark="" className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-[6px] bg-[#1a1a2e] text-[9.5px] font-semibold uppercase leading-none text-white ring-2 ring-white">
            {n.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.image} alt="" width={18} height={18} className="h-full w-full object-cover" loading="lazy" />
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
      // eslint-disable-next-line @next/next/no-img-element
      <img src={n.image} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full border border-[#eef0f3] object-cover" loading="lazy" />
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
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", away)
      window.removeEventListener("keydown", onKey)
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
