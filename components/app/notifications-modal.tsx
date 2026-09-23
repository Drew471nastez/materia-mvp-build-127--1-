"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Bell, CreditCard, ChevronRight, X, Link2, Star, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useLanguage } from "@/lib/i18n"
import { BottomSheet } from "@/components/ui/bottom-sheet"

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

const DISMISSED_NOTIFICATIONS_KEY = "storelib_dismissed_notifications"

function getDismissedNotifications(): string[] {
  if (typeof window === "undefined") return []
  try {
    const dismissed = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY)
    return dismissed ? JSON.parse(dismissed) : []
  } catch {
    return []
  }
}

function dismissNotification(notificationId: string): void {
  if (typeof window === "undefined") return
  try {
    const dismissed = getDismissedNotifications()
    if (!dismissed.includes(notificationId)) {
      dismissed.push(notificationId)
      localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(dismissed))
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function NotificationsModal({
  open,
  onOpenChange,
  stripeConnected = false,
  stripeStatus = "not_connected",
  onePagePublished = false
}: NotificationsModalProps) {
  const [activeTab, setActiveTab] = useState<"all" | "updates" | "messages" | "opportunities">("all")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [dbNotifications, setDbNotifications] = useState<DbNotification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()
  const closeSheet = useCallback(() => onOpenChange(false), [onOpenChange])

  /* A media query answers once per crossing, where a resize listener asked on
     every pixel of every keyboard and rotation. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  // Load dismissed notifications from localStorage
  useEffect(() => {
    setDismissedIds(getDismissedNotifications())
  }, [])

  // Fetch notifications from database when modal opens
  /**
   * THE SPINNER IS FOR THE FIRST LOAD ONLY. Every open used to swap the list
   * for a spinner and back, so the sheet rose with one thing in it, changed
   * height under the finger and then showed the same list it had last time.
   * Now what was there stays while it is refreshed.
   */
  const loadedOnceRef = useRef(false)
  const fetchNotifications = useCallback(async () => {
    if (!loadedOnceRef.current) setIsLoading(true)
    try {
      const res = await fetch("/api/notifications?limit=20")
      if (res.ok) {
        const data = await res.json()
        setDbNotifications(data.notifications || [])
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

  // Combine generated notifications with database notifications
  useEffect(() => {
    const generatedNotifications: Notification[] = []

    // OnePage setup notification - only show if not published AND not dismissed
    if (!onePagePublished && !dismissedIds.includes("onepage-setup")) {
      generatedNotifications.push({
        id: "onepage-setup",
        type: "opportunity",
        title: t("notifications.onepageTitle"),
        description: t("notifications.onepageDesc"),
        href: "/app/onepage",
        read: false,
        createdAt: new Date(),
        isFromDb: false,
      })
    }

    // Payment setup notification - only show if not connected AND not dismissed
    if ((!stripeConnected || (stripeStatus !== "enabled" && stripeStatus !== "connected")) && !dismissedIds.includes("payment-setup")) {
      generatedNotifications.push({
        id: "payment-setup",
        type: "action",
        title: t("notifications.paymentTitle"),
        description: t("notifications.paymentDesc"),
        href: "/app/settings/payments",
        read: false,
        createdAt: new Date(),
        isFromDb: false,
      })
    }

    // Transform database notifications to UI format
    const transformedDbNotifications: Notification[] = dbNotifications.map((n) => ({
      id: n.id,
      type: n.type as Notification["type"],
      title: n.title,
      description: n.message,
      href: n.action_url || undefined,
      read: !!n.read_at,
      createdAt: new Date(n.created_at),
      isFromDb: true,
    }))

    // Combine and sort by date (newest first)
    const allNotifications = [...generatedNotifications, ...transformedDbNotifications]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    setNotifications(allNotifications)
  }, [stripeConnected, stripeStatus, onePagePublished, dismissedIds, dbNotifications, t])

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true
    if (activeTab === "updates") return n.type === "update"
    if (activeTab === "messages") return n.type === "message"
    if (activeTab === "opportunities") return n.type === "opportunity"
    return true
  })

  const tabs = [
    { id: "all" as const, labelKey: "notifications.all" },
    { id: "updates" as const, labelKey: "notifications.updates" },
    { id: "messages" as const, labelKey: "notifications.messages" },
    { id: "opportunities" as const, labelKey: "notifications.opportunities" },
  ]

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
      } catch (err) {
        console.error("[notifications] Failed to dismiss:", err)
      }
    } else {
      // For generated notifications, use localStorage
      dismissNotification(notification.id)
      setDismissedIds((prev) => [...prev, notification.id])
    }

    // Remove from current notifications list
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id))

    if (notification.href) {
      onOpenChange(false)
    }
  }

  /**
   * AN ELEMENT, NOT A COMPONENT. This was `const NotificationsContent = () =>`,
   * a new component type on every render, so React threw the whole list away
   * and built it again each time anything here changed: the tabs, the
   * fetch finishing, a notification dismissed. Mid-animation that is a
   * rebuilt subtree and a list scrolled back to the top.
   */
  const notificationsContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              activeTab === tab.id
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {t(tab.labelKey as any)}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        {isLoading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <Loader2 className="w-8 h-8 text-neutral-400 animate-spin mb-4" />
            <p className="text-sm text-neutral-500">{t("notifications.loading")}</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-1">{t("notifications.empty")}</h3>
            <p className="text-sm text-neutral-500 text-center max-w-[240px]">
              {t("notifications.emptyDesc")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
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
        height="min(78dvh, 640px)"
        header={
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 pb-3 pt-2">
            <h3 className="text-[16px] font-semibold text-neutral-900">{t("notifications.title")}</h3>
            <button
              onClick={closeSheet}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-neutral-100"
            >
              <X className="h-4 w-4 text-neutral-500" />
            </button>
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
      className={cn(
        "fixed right-[120px] top-[64px] z-50 w-[380px] max-h-[500px] rounded-2xl border border-neutral-200/60 bg-white/95 backdrop-blur-xl shadow-xl shadow-black/10 overflow-hidden transition-all duration-200 ease-out origin-top-right",
        open
          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
          : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
      )}
    >
      <div className="px-5 py-4 border-b border-neutral-200/60 flex items-center justify-between bg-gradient-to-r from-neutral-50/80 to-white">
        <h3 className="text-[15px] font-semibold text-neutral-900">{t("notifications.title")}</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-500" />
        </button>
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
        "flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors cursor-pointer",
        !notification.read && "bg-violet-50/50"
      )}
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
    <span className="notification-badge-pulse absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold text-white rounded-full bg-red-500 ring-2 ring-white/30">
      {count > 9 ? "9+" : count}
    </span>
  )
}
