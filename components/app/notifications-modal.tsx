"use client"

import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Bell, CreditCard, ChevronRight, X, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Notification {
  id: string
  type: "action" | "update" | "message" | "opportunity"
  title: string
  description: string
  href?: string
  read: boolean
  createdAt: Date
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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Load dismissed notifications from localStorage
  useEffect(() => {
    setDismissedIds(getDismissedNotifications())
  }, [])

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

  // Generate notifications based on user state
  useEffect(() => {
    const generatedNotifications: Notification[] = []

    // OnePage setup notification - only show if not published AND not dismissed
    if (!onePagePublished && !dismissedIds.includes("onepage-setup")) {
      generatedNotifications.push({
        id: "onepage-setup",
        type: "opportunity",
        title: "Have you tried out OnePage?",
        description: "Create your personalized link-in-bio page to showcase your products and connect with your audience.",
        href: "/app/onepage",
        read: false,
        createdAt: new Date(),
      })
    }

    // Payment setup notification - only show if not connected AND not dismissed
    if ((!stripeConnected || stripeStatus !== "enabled") && !dismissedIds.includes("payment-setup")) {
      generatedNotifications.push({
        id: "payment-setup",
        type: "action",
        title: "Set up payments to start selling",
        description: "Connect your Stripe account to receive payments for your products.",
        href: "/app/settings/payments",
        read: false,
        createdAt: new Date(),
      })
    }

    setNotifications(generatedNotifications)
  }, [stripeConnected, stripeStatus, onePagePublished, dismissedIds])

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true
    if (activeTab === "updates") return n.type === "update"
    if (activeTab === "messages") return n.type === "message"
    if (activeTab === "opportunities") return n.type === "opportunity"
    return true
  })

  const tabs = [
    { id: "all" as const, label: "All" },
    { id: "updates" as const, label: "Updates" },
    { id: "messages" as const, label: "Messages" },
    { id: "opportunities" as const, label: "Opportunities" },
  ]

  const handleNotificationClick = (notification: Notification) => {
    // Dismiss the notification permanently
    dismissNotification(notification.id)
    setDismissedIds((prev) => [...prev, notification.id])

    // Remove from current notifications list
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id))

    if (notification.href) {
      onOpenChange(false)
    }
  }

  const NotificationsContent = () => (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-1">No notifications yet</h3>
            <p className="text-sm text-neutral-500 text-center max-w-[240px]">
              Messages, new features, and insights will appear here.
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

  // Mobile: Full-screen sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-2xl" hideCloseButton>
          <SheetHeader className="px-4 py-3 border-b flex flex-row items-center justify-between">
            <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </SheetHeader>
          <NotificationsContent />
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Inline dropdown panel (not overlay)
  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="fixed left-[232px] bottom-[64px] z-50 w-[380px] max-h-[500px] rounded-2xl border border-neutral-200/60 bg-white/95 backdrop-blur-xl shadow-xl shadow-black/10 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-3 duration-200"
    >
      <div className="px-5 py-4 border-b border-neutral-200/60 flex items-center justify-between bg-gradient-to-r from-neutral-50/80 to-white">
        <h3 className="text-[15px] font-semibold text-neutral-900">Notifications</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-500" />
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <NotificationsContent />
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
      <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
        {notification.type === "action" && <CreditCard className="w-5 h-5 text-violet-600" />}
        {notification.type === "update" && <Bell className="w-5 h-5 text-violet-600" />}
        {notification.type === "message" && <Bell className="w-5 h-5 text-violet-600" />}
        {notification.type === "opportunity" && <Link2 className="w-5 h-5 text-violet-600" />}
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

// Badge component for notification count - red gradient with glassmorphism effect and subtle pulse animation
export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <>
      <style jsx>{`
        @keyframes subtle-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(239, 68, 68, 0);
          }
        }
        .notification-badge-pulse {
          animation: subtle-pulse 2.5s ease-in-out infinite;
        }
      `}</style>
      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold text-white rounded-full shadow-lg backdrop-blur-sm bg-gradient-to-br from-red-500 via-red-500 to-red-600 ring-2 ring-white/30 notification-badge-pulse">
        {count > 9 ? "9+" : count}
      </span>
    </>
  )
}
