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
  setDbUnread,
  setUnreadState,
  setupNotificationIds,
  subscribeUnread,
  unreadCount,
  writeUnreadOnly,
} from "@/lib/notifications/unread-state"

interface Notification {
  id: string
  type: "action" | "update" | "message" | "opportunity" | "new_review"
  title: string
  description: string
  href?: string
  read: boolean
  createdAt: Date
  // For database notifications
  isFromDb?: boolean
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
  const [activeTab, setActiveTab] = useState<"all" | "updates" | "messages" | "opportunities">("all")
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
  const toggleUnreadOnly = () => {
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
  // OnePage setup notification - only show if not published AND not dismissed
  if (setupIds.includes("onepage-setup") && !unread.dismissed.includes("onepage-setup")) {
    generatedNotifications.push({
      id: "onepage-setup",
      type: "opportunity",
      title: t("notifications.onepageTitle"),
      description: t("notifications.onepageDesc"),
      href: "/app/onepage",
      read: unread.read.includes("onepage-setup"),
      createdAt: new Date(0),
      isFromDb: false,
    })
  }
  // Payment setup notification - only show if not connected AND not dismissed
  if (setupIds.includes("payment-setup") && !unread.dismissed.includes("payment-setup")) {
    generatedNotifications.push({
      id: "payment-setup",
      type: "action",
      title: t("notifications.paymentTitle"),
      description: t("notifications.paymentDesc"),
      href: "/app/settings/payments",
      read: unread.read.includes("payment-setup"),
      createdAt: new Date(0),
      isFromDb: false,
    })
  }
  /* The setup to-dos lead the list, as they did when they were stamped with
     the moment the list was drawn; the rows follow, newest first. */
  const notifications: Notification[] = [
    ...generatedNotifications,
    ...dbNotifications
      .map((n) => ({
        id: n.id,
        type: n.type as Notification["type"],
        title: n.title,
        description: n.message,
        href: n.action_url || undefined,
        read: !!n.read_at,
        createdAt: new Date(n.created_at),
        isFromDb: true,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  ]

  const inTab = notifications.filter((n) => {
    if (activeTab === "all") return true
    if (activeTab === "updates") return n.type === "update"
    if (activeTab === "messages") return n.type === "message"
    if (activeTab === "opportunities") return n.type === "opportunity"
    return true
  })
  const filteredNotifications = unreadOnly ? inTab.filter((n) => !n.read) : inTab
  const shownIds = new Set(filteredNotifications.map((n) => n.id))
  const hasUnread = unreadCount(unread, setupIds) > 0 || notifications.some((n) => !n.read)

  /*
    SWITCHING VIEWS. The new view's rows fade in (opacity, 180ms) from the
    top of the list, rather than replacing the old ones in a single frame.
    On a computer the panel is as tall as its content, so a view with fewer
    rows used to pull its foot up under the pointer; it holds the tallest
    height it has had since it opened, until it closes. The sheet on a phone
    has one height already.
  */
  const switchTab = (id: typeof activeTab) => {
    if (id === activeTab) return
    const body = bodyRef.current
    if (body && !isMobile) body.style.minHeight = `${Math.max(body.offsetHeight, parseFloat(body.style.minHeight) || 0)}px`
    if (listRef.current) listRef.current.scrollTop = 0
    setActiveTab(id)
  }
  /*
    EVERY ROW STAYS; A VIEW SHOWS SOME OF THEM. Each switch used to throw the
    list away and build the next one (a `key` per view), which on a phone's
    CPU was 60 to 110ms of rendering, styling and layout on the tap, and an
    element put in or taken out under a sheet is also a change the page's
    :has() rules answer by restyling the whole document
    (scripts/check-app-sheets-frames.mjs). Now the rows are all there, the
    ones not in the view are `hidden`, and the view fades in on the
    compositor as it did.
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
  }, [activeTab, unreadOnly])
  useEffect(() => {
    if (open) return
    /* After the close has faded, so the panel does not shrink as it goes. */
    const id = window.setTimeout(() => {
      if (bodyRef.current) bodyRef.current.style.minHeight = ""
    }, 240)
    return () => window.clearTimeout(id)
  }, [open])

  const tabs = [
    { id: "all" as const, labelKey: "notifications.all" },
    { id: "updates" as const, labelKey: "notifications.updates" },
    { id: "messages" as const, labelKey: "notifications.messages" },
    { id: "opportunities" as const, labelKey: "notifications.opportunities" },
  ]

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
    if (notification.isFromDb) {
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
   * and built it again each time anything here changed: the tabs, the
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
      <NotificationTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey as any) }))}
        active={activeTab}
        onChange={switchTab}
      />

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
              data-notifications-view={activeTab}
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

/** The word before the date on a row: where it came from, not what icon it would have had. */
function categoryOf(n: Notification): string {
  if (n.id === "payment-setup") return "Payments"
  if (n.id === "onepage-setup") return "OnePage"
  switch (n.type) {
    case "new_review":
      return "Reviews"
    case "message":
      return "Messages"
    case "opportunity":
      return "Opportunities"
    case "action":
      return "To do"
    default:
      return "Updates"
  }
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
 * THE TABS. A grey pill per view, and the chosen one dark. The dark pill is
 * a second copy of the row, dark with white words, laid exactly over the
 * first and cut to the chosen tab's pill by a clip-path. Moving to another
 * tab moves the cut: the dark pill slides and stretches to its new place,
 * and because the words under it are the white copy's, a word turns white
 * exactly as the pill reaches it. It used to be a pill sliding under words
 * that changed colour on their own clock, so for a moment the new word was
 * white on grey and the old one grey on dark. Measured from the buttons, so
 * a longer word in another language still fits; the first placing does not
 * animate, so the panel never opens with the pill flying in.
 */
const TAB_MOVE = "clip-path 300ms cubic-bezier(0.32, 0.72, 0, 1)"

function NotificationTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const placedRef = useRef(false)

  const place = useCallback((animate: boolean) => {
    const row = rowRef.current
    const pill = pillRef.current
    if (!row || !pill) return
    const button = row.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    if (!button || !button.offsetWidth) return
    const left = button.offsetLeft
    const right = row.offsetWidth - left - button.offsetWidth
    pill.style.transition = animate ? TAB_MOVE : "none"
    pill.style.clipPath = `inset(0px ${right}px 0px ${left}px round 999px)`
    pill.style.opacity = "1"
    placedRef.current = true
  }, [active])

  useLayoutEffect(() => {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    place(placedRef.current && !calm)
  }, [place])

  /* The words can change width after the first paint (the font arriving, a
     language switch, the panel going from hidden to shown): follow them
     without animating. One observer for the row's life, reading the latest
     placing: a new observer per tab reported the row's size at once, and
     that report placed the pill again without its move, so it jumped. */
  const placeRef = useRef(place)
  placeRef.current = place
  useEffect(() => {
    const row = rowRef.current
    if (!row || typeof ResizeObserver === "undefined") return
    let first = true
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      placeRef.current(false)
    })
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  const word = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium md:px-2.5"
  return (
    <div className="shrink-0 overflow-x-auto border-b border-[#eef0f2] px-4 py-3 scrollbar-hide">
      <div ref={rowRef} role="tablist" aria-label="Notification views" className="relative isolate flex w-max items-center gap-2 md:gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            data-tab={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn("group relative cursor-pointer outline-none focus-visible:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#1a1a2e]", word)}
          >
            <span aria-hidden="true" className="absolute inset-0 z-0 rounded-full bg-[#f3f4f6] transition-colors duration-150 group-hover:bg-[#e9eaed]" />
            <span className="relative z-[1] text-[#4b5563] transition-colors duration-150 group-hover:text-[#1a1a2e]">{tab.label}</span>
          </button>
        ))}
        <div
          ref={pillRef}
          aria-hidden="true"
          data-tab-pill=""
          className="pointer-events-none absolute inset-0 z-[2] flex items-center gap-2 bg-[#1a1a2e] opacity-0 md:gap-1.5"
        >
          {tabs.map((tab) => (
            <span key={tab.id} className={cn(word, "text-white")}>
              {tab.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A ROW. No icon: where it came from and when, on one quiet line, then what
 * happened, then the detail. An unread row has a dot at its start and a
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
        <p data-notification-meta="" className="truncate text-[12.5px] leading-[18px] text-[#6b7280]">
          {categoryOf(notification)}
          {when ? <span className="px-1.5 text-[#b6bac1]">&bull;</span> : null}
          {when}
        </p>
        <p className={cn("mt-1 text-[14px] leading-5 text-[#1a1a2e]", unread ? "font-semibold" : "font-medium")}>
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-[#6b7280]">{notification.description}</p>
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
