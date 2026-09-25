"use client"

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react"
import { Bell, CreditCard, ChevronRight, X, Link2, Star, Loader2, ListFilter, CircleCheck } from "lucide-react"
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
          "group-focus-visible:ring-2 group-focus-visible:ring-[#8b5cf6]/40",
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

  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // Handle click outside for desktop panel
  useEffect(() => {
    if (!open || isMobile) return

    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    // Add slight delay to prevent immediate close on click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("mousedown", handleClickOutside)
    }
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
  const hasUnread = unreadCount(unread, setupIds) > 0 || notifications.some((n) => !n.read)

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
      <HeaderButton label="Close" onClick={closeSheet}>
        <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
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
    <div className="flex flex-col h-full min-h-0">
      {markError ? (
        <p role="alert" className="border-b border-[#fde2e1] bg-[#fef3f2] px-5 py-2 text-[13px] text-[#b42318]">
          {markError}
        </p>
      ) : null}
      {/* Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#eef0f2] overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              activeTab === tab.id
                ? "bg-[#1a1a2e] text-white"
                : "bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e5e7eb]"
            )}
          >
            {t(tab.labelKey as any)}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0" data-notifications-list="">
        {isLoading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <Loader2 className="w-8 h-8 text-neutral-400 animate-spin mb-4" />
            <p className="text-sm text-neutral-500">{t("notifications.loading")}</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4" data-notifications-empty="">
            <div className="w-14 h-14 rounded-full bg-[#f3f4f6] flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-[#6b7280]" strokeWidth={1.75} />
            </div>
            {unreadOnly ? (
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">No unread notifications</h3>
            ) : (
              <>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">{t("notifications.empty")}</h3>
                <p className="text-[14px] text-[#6b7280] text-center max-w-[240px]">{t("notifications.emptyDesc")}</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#f1f2f4]">
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
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
      <div className="max-h-[420px] overflow-y-auto overscroll-contain">
        {notificationsContent}
      </div>
    </div>
  )
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification
  onClick: () => void
}) {
  const content = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-[#f9fafb] transition-colors cursor-pointer",
        !notification.read && "bg-violet-50/50"
      )}
      data-notification-item=""
      data-unread={notification.read ? undefined : ""}
      onClick={onClick}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
        notification.type === "new_review" ? "bg-amber-100" : "bg-violet-100"
      )}>
        {notification.type === "action" && <CreditCard className="w-5 h-5 text-violet-600" />}
        {notification.type === "update" && <Bell className="w-5 h-5 text-violet-600" />}
        {notification.type === "message" && <Bell className="w-5 h-5 text-violet-600" />}
        {notification.type === "opportunity" && <Link2 className="w-5 h-5 text-violet-600" />}
        {notification.type === "new_review" && <Star className="w-5 h-5 text-amber-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm",
          !notification.read ? "font-semibold text-neutral-900" : "font-medium text-neutral-700"
        )}>
          {notification.title}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
          {notification.description}
        </p>
      </div>
      {notification.href && (
        <ChevronRight className="w-5 h-5 text-neutral-400 shrink-0" />
      )}
    </div>
  )

  if (notification.href) {
    return <Link href={notification.href}>{content}</Link>
  }

  return content
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
