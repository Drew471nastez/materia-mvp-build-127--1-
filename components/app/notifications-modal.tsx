"use client"

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } from "react"
import { Bell, ListFilter, CircleCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useLanguage } from "@/lib/i18n"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import {
  dismissSetupNotification,
  getServerUnreadState,
  getUnreadState,
  loadRemembered,
  markAllRead,
  markSetupNotificationRead,
  readUnreadOnly,
  refreshDbUnread,
  setCovered,
  setDbUnread,
  setUnreadState,
  setupNotificationIds,
  setupShown,
  staysUntilDone,
  subscribeUnread,
  unreadCount,
  writeUnreadOnly,
} from "@/lib/notifications/unread-state"
import { labelOf, panelHref, panelOrder, staysOnOpen, toneOf } from "@/lib/notifications/panel"
import { CATEGORIES, type Category, type DigestItem } from "@/lib/notifications/types"

interface Notification {
  id: string
  type: "action" | "update" | "message" | "opportunity" | "new_review" | string
  title: string
  description: string
  href?: string
  read: boolean
  createdAt: Date
  // For database notifications
  isFromDb?: boolean
  /** From the rules engine (lib/notifications): how much it matters, and its word. */
  category?: Category | null
  kind?: string | null
  priority?: number | null
  area?: string | null
  /** A digest's lines, each its own link. */
  items?: DigestItem[] | null
}

interface DbNotification {
  id: string
  type: string
  title: string
  message: string
  action_url: string | null
  read_at: string | null
  created_at: string
  metadata?: Record<string, any>
  kind?: string | null
  category?: string | null
  priority?: number | null
}

/** A row's category, if it is one the panel knows. */
function categoryFrom(value: unknown): Category | null {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : null
}

/** A digest's lines, as the engine wrote them in metadata, links inside the site only. */
function itemsFrom(value: unknown): DigestItem[] | null {
  if (!Array.isArray(value)) return null
  const items = value
    .filter((x): x is { title: string; href: string } => !!x && typeof x.title === "string" && typeof x.href === "string")
    .map((x) => ({ title: x.title, href: panelHref(x.href) ?? "/app" }))
    .slice(0, 5)
  return items.length ? items : null
}

interface NotificationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stripeConnected?: boolean
  stripeStatus?: string
  onePagePublished?: boolean
}

/** The shared unread state (lib/notifications/unread-state.ts), read once from this browser. */
function useUnreadState() {
  useEffect(() => {
    loadRemembered()
  }, [])
  return useSyncExternalStore(subscribeUnread, getUnreadState, getServerUnreadState)
}

/**
 * An icon button in the panel's header. What is drawn is 32px everywhere; on
 * a phone the button around it is 44px, so a thumb has the room without the
 * icons looking bigger. Its name shows in a tooltip on hover or keyboard
 * focus on a computer only. The tooltip is drawn inside the button and laid
 * over the list, so showing it moves nothing.
 */
function HeaderButton({
  label,
  tip,
  pressed,
  disabled,
  onClick,
  children,
  ...rest
}: {
  label: string
  tip?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...rest}
      className="group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none disabled:cursor-default md:h-8 md:w-8"
    >
      <span
        data-face=""
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150",
          "group-focus-visible:ring-2 group-focus-visible:ring-[#1a1a2e]/25",
          pressed
            ? "bg-[#1a1a2e] text-white group-hover:bg-[#2a2a40]"
            : "text-[#6b7280] group-hover:bg-[#f3f4f6] group-hover:text-[#1a1a2e] group-active:bg-[#e5e7eb]",
          "group-disabled:bg-transparent group-disabled:text-[#9ca3af]",
        )}
      >
        {children}
      </span>
      {tip ? (
        <span
          aria-hidden="true"
          data-tip=""
          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 hidden whitespace-nowrap rounded-md bg-[#1a1a2e] px-2 py-1 text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0_4px_12px_rgba(16,24,40,0.18)] transition-opacity duration-100 md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
        >
          {tip}
        </span>
      ) : null}
    </button>
  )
}

export function NotificationsModal({
  open,
  onOpenChange,
  stripeConnected = false,
  stripeStatus = "not_connected",
  onePagePublished = false
}: NotificationsModalProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [dbNotifications, setDbNotifications] = useState<DbNotification[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()
  const closeSheet = useCallback(() => onOpenChange(false), [onOpenChange])
  const unread = useUnreadState()

  /* A media query answers once per crossing, where a resize listener asked on
     every pixel of every keyboard and rotation. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  /* "View unread only" is remembered for this viewer, in this browser. */
  useEffect(() => {
    setUnreadOnly(readUnreadOnly())
  }, [])
  /*
    TURNING "UNREAD ONLY" ON OR OFF. The list's rows fade in (opacity, 200ms)
    from the top, rather than changing in a single frame. On a computer the
    panel is as tall as its content, so a shorter list used to pull its foot
    up under the pointer that had just pressed the filter; it holds the
    tallest height it has had since it opened, until it closes. The sheet on
    a phone has one height already. This is what a switch of tab used to do,
    and the filter is now the only thing that changes what the list shows.
  */
  const toggleUnreadOnly = () => {
    const body = bodyRef.current
    if (body && !isMobile) body.style.minHeight = `${Math.max(body.offsetHeight, parseFloat(body.style.minHeight) || 0)}px`
    if (listRef.current) listRef.current.scrollTop = 0
    setUnreadOnly((on) => {
      writeUnreadOnly(!on)
      return !on
    })
  }

  // Fetch notifications from database when modal opens
  /**
   * THE SPINNER IS FOR THE FIRST LOAD ONLY. Every open used to swap the list
   * for a spinner and back, so the sheet rose with one thing in it, changed
   * height under the finger and then showed the same list it had last time.
   * Now what was there stays while it is refreshed.
   */
  const loadedOnceRef = useRef(false)
  const markingRef = useRef(false)
  const fetchNotifications = useCallback(async () => {
    if (!loadedOnceRef.current) setIsLoading(true)
    try {
      const res = await fetch("/api/notifications?limit=20")
      if (res.ok && !markingRef.current) {
        const data = await res.json()
        setDbNotifications(data.notifications || [])
        if (typeof data.unreadCount === "number") setDbUnread(data.unreadCount)
        if (data && "covered" in data) setCovered(data.covered)
      }
    } catch (err) {
      console.error("[notifications] Failed to fetch:", err)
    } finally {
      loadedOnceRef.current = true
      setIsLoading(false)
    }
  }, [])

  /* On a phone the refresh waits for the sheet to arrive (BottomSheet
     onOpened below): the rows it brings back are drawn after the slide, not
     in the middle of it. */
  useEffect(() => {
    if (open && !isMobile) {
      fetchNotifications()
    }
  }, [open, isMobile, fetchNotifications])

  /* The list is read once, quietly, a moment after /app loads, so the first
     open already has its rows. It used to open on a spinner and then change
     height under the finger when the rows arrived. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!loadedOnceRef.current) fetchNotifications()
    }, 1500)
    return () => window.clearTimeout(id)
  }, [fetchNotifications])

  // Handle click outside for desktop panel
  useEffect(() => {
    if (!open || isMobile) return

    /* The bell is not "outside". A press on it used to close the panel on
       mousedown and open it again on the click that followed, so a second
       press on the bell flickered instead of closing. The bell toggles. */
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null
      if (target?.closest?.("[data-notifications-trigger]")) return
      if (panelRef.current && !panelRef.current.contains(target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open, isMobile, onOpenChange])

  /* Escape closes the panel on a computer; the sheet on a phone closes itself. */
  useEffect(() => {
    if (!open || isMobile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, isMobile, onOpenChange])

  const setupIds = setupNotificationIds({ stripeConnected, stripeStatus, onePagePublished })

  // Combine generated notifications with database notifications
  const generatedNotifications: Notification[] = []
  /* A to-do is left out when it was dismissed here, or when a row from the
     server already says it better ("Set up payments" beside "Stripe paused
     your payouts"): setupShown in lib/notifications/unread-state.ts. */
  // OnePage setup notification - only show if not published AND not dismissed
  if (setupIds.includes("onepage-setup") && setupShown("onepage-setup", unread)) {
    generatedNotifications.push({
      id: "onepage-setup",
      type: "opportunity",
      category: "next_step",
      title: t("notifications.onepageTitle"),
      description: t("notifications.onepageDesc"),
      href: "/app/onepage",
      read: unread.read.includes("onepage-setup"),
      createdAt: new Date(0),
      isFromDb: false,
    })
  }
  /* Payment setup: shown until Stripe can take a payment. Nothing puts it
     away, not a tap and not a dismissal from an older build
     (STAYS_UNTIL_DONE): "if the user needs to connect Stripe to get paid,
     it must appear in notifications". */
  if (setupIds.includes("payment-setup") && setupShown("payment-setup", unread)) {
    generatedNotifications.push({
      id: "payment-setup",
      type: "action",
      category: "next_step",
      title: t("notifications.paymentTitle"),
      description: t("notifications.paymentDesc"),
      href: "/app/settings/payments",
      read: unread.read.includes("payment-setup"),
      createdAt: new Date(0),
      isFromDb: false,
    })
  }
  /* What needs the creator first, whatever its age: critical, then
     problems, then the next step (the setup to-dos are next steps). The rest
     follow, newest first (lib/notifications/panel.ts). */
  const notifications: Notification[] = panelOrder([
    ...generatedNotifications,
    ...dbNotifications.map((n) => ({
      id: n.id,
      type: n.type as Notification["type"],
      title: n.title,
      description: n.message,
      href: panelHref(n.action_url),
      read: !!n.read_at,
      createdAt: new Date(n.created_at),
      isFromDb: true,
      category: categoryFrom(n.category),
      kind: n.kind ?? null,
      priority: typeof n.priority === "number" ? n.priority : null,
      area: typeof n.metadata?.area === "string" ? n.metadata.area : null,
      items: itemsFrom(n.metadata?.items),
    })),
  ])

  /*
    ONE LIST. The panel had four tabs over the list (All, Updates, Messages,
    Opportunities) and a dark pill that slid between them. "Get rid of those
    category pills in the notifications modal": every notification is in the
    one list, most urgent first, and what kind of thing each one is is the
    word above its title (labelOf in lib/notifications/panel.ts: Payouts,
    Domains, Reviews, Getting started). "Unread only" is the one filter left.
  */
  const filteredNotifications = unreadOnly ? notifications.filter((n) => !n.read) : notifications
  const shownIds = new Set(filteredNotifications.map((n) => n.id))
  const hasUnread = unreadCount(unread, setupIds) > 0 || notifications.some((n) => !n.read)

  /*
    EVERY ROW STAYS; THE FILTER SHOWS SOME OF THEM. A change of view (a tab,
    when there were tabs) used to throw the list away and build the next one,
    which on a phone's CPU was 60 to 110ms of rendering, styling and layout
    on the tap, and an
    element put in or taken out under a sheet is also a change the page's
    :has() rules answer by restyling the whole document
    (scripts/check-app-sheets-frames.mjs). Now the rows are all there, the
    ones the filter leaves out are `hidden`, and the list fades in on the
    compositor.
  */
  const viewRef = useRef<HTMLDivElement>(null)
  const emptyRef = useRef<HTMLDivElement>(null)
  const firstView = useRef(true)
  useLayoutEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const el = viewRef.current && !viewRef.current.hidden ? viewRef.current : emptyRef.current
    el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  }, [unreadOnly])
  useEffect(() => {
    if (open) return
    /* After the close has faded, so the panel does not shrink as it goes. */
    const id = window.setTimeout(() => {
      if (bodyRef.current) bodyRef.current.style.minHeight = ""
    }, 240)
    return () => window.clearTimeout(id)
  }, [open])

  /**
   * MARK ALL AS READ: at once on screen, then one request that marks every
   * row of this person's read on the server. If the server says no, the rows
   * it would have changed go back to unread and the panel says so. The
   * setup to-dos are marked read in this browser, which cannot fail.
   */
  const markErrorTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(markErrorTimer.current), [])
  const handleMarkAllRead = async () => {
    if (marking || !hasUnread) return
    const optimistic = markAllRead(dbNotifications, getUnreadState(), setupIds, new Date().toISOString())
    setDbNotifications(optimistic.rows)
    setUnreadState(optimistic.state)
    setMarkError(null)
    setMarking(true)
    markingRef.current = true
    let ok = false
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      })
      ok = res.ok
    } catch {
      ok = false
    }
    markingRef.current = false
    setMarking(false)
    if (!ok) {
      setDbNotifications((rows) => optimistic.undo(rows, getUnreadState()).rows)
      setUnreadState(optimistic.undo([], getUnreadState()).state)
      setMarkError("Could not mark them as read. Try again.")
      window.clearTimeout(markErrorTimer.current)
      markErrorTimer.current = window.setTimeout(() => setMarkError(null), 5000)
    }
  }

  /* One notification read, from the check on its row. On screen at once;
     the row stays in the list, read. */
  const handleMarkRead = async (notification: Notification) => {
    if (notification.read) return
    if (!notification.isFromDb) {
      markSetupNotificationRead(notification.id)
      return
    }
    const at = new Date().toISOString()
    setDbNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read_at: at } : r)))
    setDbUnread(getUnreadState().dbUnread - 1)
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id], action: "read" }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setDbNotifications((rows) => rows.map((r) => (r.id === notification.id && r.read_at === at ? { ...r, read_at: null } : r)))
      setDbUnread(getUnreadState().dbUnread + 1)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.isFromDb && staysOnOpen(notification)) {
      /* Critical, a problem or a digest: opened and read, and it stays until
         it is fixed, when it resolves and drops off by itself. */
      void handleMarkRead(notification)
    } else if (notification.isFromDb) {
      // For database notifications, mark as read and dismissed via API
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notification.id], action: "dismiss" }),
        })
        // Remove from local state
        setDbNotifications((prev) => prev.filter((n) => n.id !== notification.id))
        if (!notification.read) setDbUnread(getUnreadState().dbUnread - 1)
      } catch (err) {
        console.error("[notifications] Failed to dismiss:", err)
      }
    } else if (staysUntilDone(notification.id)) {
      /* "Set up payments": opened and read, and it stays until Stripe is
         connected, like a critical row. */
      markSetupNotificationRead(notification.id)
    } else {
      // For generated notifications, remembered in this browser
      dismissSetupNotification(notification.id)
    }

    if (notification.href) {
      onOpenChange(false)
    }
  }

  /*
    NO CLOSE BUTTON. The panel closes the way everything else in /app that
    floats does: a press anywhere outside it or Escape on a computer, a drag
    down or a tap on the dimmed page for the sheet on a phone. An X in the
    corner was a third button in a header of two, for something the hand
    already knows how to do.
  */
  const headerButtons = (
    <div className="flex items-center gap-0.5 md:gap-1">
      <HeaderButton
        label="Unread only"
        tip={unreadOnly ? "Show all" : "Show unread only"}
        pressed={unreadOnly}
        onClick={toggleUnreadOnly}
        data-notifications-filter=""
      >
        <ListFilter className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </HeaderButton>
      <HeaderButton
        label="Mark all as read"
        tip="Mark all as read"
        disabled={!hasUnread || marking}
        onClick={handleMarkAllRead}
        data-notifications-mark-all=""
      >
        <CircleCheck className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </HeaderButton>
    </div>
  )

  /**
   * AN ELEMENT, NOT A COMPONENT. This was `const NotificationsContent = () =>`,
   * a new component type on every render, so React threw the whole list away
   * and built it again each time anything here changed: the filter, the
   * fetch finishing, a notification dismissed. Mid-animation that is a
   * rebuilt subtree and a list scrolled back to the top.
   */
  const notificationsContent = (
    <div className="flex flex-1 flex-col h-full min-h-0">
      {markError ? (
        <p role="alert" className="shrink-0 border-b border-[#fde2e1] bg-[#fef3f2] px-5 py-2 text-[13px] text-[#b42318]">
          {markError}
        </p>
      ) : null}
      {/* Notifications list */}
      <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto overscroll-contain min-h-0" data-notifications-list="">
        {isLoading && notifications.length === 0 ? (
          /* Nothing drawn while the first read is out: no spinner, and the
             same height the empty words take, so nothing moves when it lands. */
          <div className="h-full min-h-[180px]" aria-busy="true" aria-label={t("notifications.loading")} />
        ) : (
          <>
            {/* A line between two rows that are showing, whichever are hidden between them. */}
            <div
              ref={viewRef}
              hidden={filteredNotifications.length === 0}
              data-notifications-view=""
              className="[&>:not([hidden])~:not([hidden])]:border-t [&>:not([hidden])~:not([hidden])]:border-[#f1f2f4]"
            >
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  hidden={!shownIds.has(notification.id)}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification)}
                  onMarkRead={() => handleMarkRead(notification)}
                />
              ))}
            </div>
            {/* A small bell and one line, both muted. It was a 56px grey disc
                with a 28px bell, a 16px heading and a sentence under it: an
                illustration for a list with nothing in it. "Smaller and less
                AI." The height stays the loading block's 180px, so nothing
                moves when the first read lands. */}
            <div ref={emptyRef} hidden={filteredNotifications.length > 0} className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 py-10" data-notifications-empty="">
              <Bell aria-hidden className="h-5 w-5 text-[#9ca3af]" strokeWidth={1.75} />
              <p className="text-center text-[14px] leading-5 text-[#6b7280]">
                {unreadOnly ? "No unread notifications" : t("notifications.empty")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={closeSheet}
        label="Notifications"
        hideFrom="md"
        fill
        height="min(62dvh, 540px)"
        /* Built while the page is idle and kept: the tap only slides it up. */
        keepMounted
        onOpened={fetchNotifications}
        header={
          <div className="flex items-center justify-between gap-2 border-b border-[#eef0f2] pb-1 pl-5 pr-2 pt-1" data-notifications-header="">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{t("notifications.title")}</h3>
            {headerButtons}
          </div>
        }
      >
        {notificationsContent}
      </BottomSheet>
    )
  }

  // Desktop: Inline dropdown panel with smooth open/close animation
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("notifications.title")}
      aria-hidden={!open}
      data-notifications-panel=""
      className={cn(
        "fixed right-[120px] top-[64px] z-50 w-[380px] max-h-[500px] rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.22),0_2px_6px_rgba(16,24,40,0.05)] overflow-hidden transition-all duration-200 ease-out origin-top-right",
        open
          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
          : "opacity-0 scale-95 -translate-y-2 pointer-events-none invisible"
      )}
      style={{ transitionProperty: "opacity, scale, translate, visibility", transitionDelay: open ? "0s" : "0s, 0s, 0s, 200ms" }}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-[#eef0f2] pl-5 pr-3" data-notifications-header="">
        <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{t("notifications.title")}</h3>
        {headerButtons}
      </div>
      <div ref={bodyRef} className="flex max-h-[420px] flex-col overflow-y-auto overscroll-contain">
        {notificationsContent}
      </div>
    </div>
  )
}

/** "Today at 4:03 PM", "Yesterday at 9:12 AM", "Sep 11 at 4:03 PM", with the year only when it is not this one. */
function whenOf(date: Date): string | null {
  if (!date.getTime()) return null
  const now = new Date()
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (days === 0) return `Today at ${time}`
  if (days === 1) return `Yesterday at ${time}`
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
  return `${day} at ${time}`
}

/**
 * A ROW. No icon: where it came from and when, on one quiet line, then what
 * happened, then the detail. That first line is the only place a row's kind
 * is said now the tabs are gone, so every row has one: a rule's own area
 * (Payouts, Domains), or a word for its type or category, never blank
 * (labelOf). An unread row has a dot at its start and a
 * light grey ground, and a check on the right marks it read without leaving
 * the list. The whole row is the link when it goes somewhere; the check sits
 * above that link, so pressing it never navigates.
 */
function NotificationItem({
  notification,
  onClick,
  onMarkRead,
  hidden,
}: {
  notification: Notification
  onClick: () => void
  onMarkRead: () => void
  /** Not in the view that is showing (see the list). */
  hidden?: boolean
}) {
  const when = whenOf(notification.createdAt)
  const unread = !notification.read
  const tone = toneOf(notification)
  return (
    <div
      className={cn(
        "group/row relative flex items-start gap-3 py-3.5 pl-4 pr-3 transition-colors duration-150",
        unread ? "bg-[#f6f6f7] hover:bg-[#f0f0f2]" : "bg-white hover:bg-[#f9fafb]",
      )}
      data-notification-item=""
      data-unread={unread ? "" : undefined}
      hidden={hidden}
    >
      {notification.href ? (
        <Link
          href={notification.href}
          onClick={onClick}
          aria-label={notification.title}
          className="absolute inset-0 z-0 outline-none focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]"
        />
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-label={notification.title}
          className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]"
        />
      )}
      {/* The unread mark: a near black bead with a soft ring round it and a
          touch of light on its top edge, so it reads as a thing on the row
          rather than a hole in it. Marked read, it shrinks away on
          transform and opacity. */}
      <span
        aria-hidden="true"
        data-unread-dot=""
        className={cn(
          "pointer-events-none relative mt-[6px] h-2 w-2 shrink-0 rounded-full bg-[#111113] shadow-[0_0_0_3px_rgba(17,17,19,0.07),inset_0_1px_0.5px_rgba(255,255,255,0.28)] transition-[opacity,scale] duration-200 ease-out",
          unread ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
      <div className="pointer-events-none relative min-w-0 flex-1">
        {/* Critical: the word red, a small red dot before it. A problem: an
            amber dot. Nothing else on the row changes: no red ground. */}
        <p data-notification-meta="" data-tone={tone ?? undefined} className="flex min-w-0 items-center text-[12.5px] leading-[18px] text-[#6b7280]">
          {tone ? (
            <span
              aria-hidden="true"
              data-tone-dot=""
              className={cn("mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone === "critical" ? "bg-[#d92d20]" : "bg-[#dc6803]")}
            />
          ) : null}
          {tone === "critical" ? <span className="sr-only">Needs you now: </span> : null}
          <span data-notification-label="" className={cn("truncate", tone === "critical" && "font-medium text-[#b42318]")}>{labelOf(notification)}</span>
          {when ? <span className="shrink-0 px-1.5 text-[#b6bac1]">&bull;</span> : null}
          {when ? <span className="shrink-0">{when}</span> : null}
        </p>
        <p className={cn("mt-1 text-[14px] leading-5 text-[#1a1a2e]", unread ? "font-semibold" : "font-medium")}>
          {notification.title}
        </p>
        {notification.items ? (
          /* A digest: a line per opportunity, each its own link. */
          <ul data-notification-digest="" className="mt-1 space-y-1.5">
            {notification.items.map((item, i) => (
              <li key={i} className="min-w-0">
                <Link
                  href={item.href}
                  onClick={onClick}
                  className="pointer-events-auto relative z-[1] line-clamp-2 rounded-sm text-[13px] leading-[18px] text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:shadow-[0_0_0_2px_#1a1a2e]"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-[#6b7280]">{notification.description}</p>
        )}
      </div>
      {unread ? (
        <button
          type="button"
          onClick={onMarkRead}
          aria-label="Mark as read"
          title="Mark as read"
          data-notification-read=""
          className="relative z-[1] -my-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#9ca3af] outline-none transition-colors duration-150 hover:bg-black/[0.05] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_2px_#1a1a2e]"
        >
          <CircleCheck className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : (
        /* The check's room is kept, so a row marked read does not rewrap. */
        <span aria-hidden="true" className="-my-1 h-9 w-9 shrink-0" />
      )}
    </div>
  )
}

/**
 * The count on the bell. It pulses, and the pulse is a ring behind the badge
 * that grows and fades: transform and opacity, so the compositor draws it.
 * It was a `box-shadow` keyframe, which repaints the header on every frame
 * for as long as there is anything unread, on every page of /app.
 * See `.notification-badge-pulse` in app/globals.css.
 */
export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <span data-notification-badge="" className="notification-badge-pulse absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold text-white rounded-full bg-red-500 ring-2 ring-white/30">
      {count > 9 ? "9+" : count}
    </span>
  )
}

/**
 * The badge with its own count: the setup to-dos not yet read or dismissed,
 * and the unread rows the server counted. It reads the shared state, so
 * "Mark all as read" in the panel empties it in the same frame, and only
 * this badge draws again, not the header around it.
 */
export function LiveNotificationBadge(props: { stripeConnected: boolean; stripeStatus: string; onePagePublished: boolean }) {
  const state = useUnreadState()
  useEffect(() => {
    void refreshDbUnread()
  }, [])
  return <NotificationBadge count={unreadCount(state, setupNotificationIds(props))} />
}
