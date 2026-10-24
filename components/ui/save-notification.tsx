"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { Check, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/*
  ===========================================================================
   WHERE A TOAST SITS, SAID BY THE SCREEN IT IS ON
  ===========================================================================
  "Make sure the notification toasts don't overlap the top bar or the
  important things." In the OnePage editor a toast sat 72px from the top on
  a computer, across the editor's own bar (undo, redo, Links, Design,
  Products, Unsaved, Save), and 64px from the bottom on a phone, across the
  tab bar. A screen that knows where its own chrome is says so with
  <ToastSpot>; every toast inside it, however deep, sits there. The editor's
  spot ("onepage-editor") is under everything that matters: on a phone just
  above the tab bar (--op-tabbar-h, app/globals.css), on a computer at the
  foot of the editor's column, clear of the rail on the left (240px) and the
  phone preview on the right (410px). Anywhere else nothing changes.
*/
type ToastSpotName = "app" | "onepage-editor"
const ToastSpotContext = createContext<ToastSpotName>("app")

/* ONE AT A TIME IN THE EDITOR'S SPOT. Two toasts there sat one on the other ("New block added" under "Changes saved"); a new one sends the one before it out. */
const NEWER_TOAST = "storelib:newer-toast"
let toastCount = 0

export function ToastSpot({ spot, children }: { spot: ToastSpotName; children: ReactNode }) {
  return <ToastSpotContext.Provider value={spot}>{children}</ToastSpotContext.Provider>
}

interface SaveNotificationProps {
  show: boolean
  message?: string
  duration?: number
  icon?: ReactNode
  position?: "top" | "bottom"
}

export function SaveNotification({
  show,
  message = tt("Changes saved"),
  duration = 3000,
  icon,
  position,
}: SaveNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const spot = useContext(ToastSpotContext)
  const goneTimer = useRef(0)
  useEffect(() => {
    if (spot !== "onepage-editor" || !show) return
    const me = ++toastCount
    window.dispatchEvent(new CustomEvent(NEWER_TOAST, { detail: me }))
    const onNewer = (e: Event) => {
      if ((e as CustomEvent<number>).detail === me) return
      setIsAnimating(false)
      window.clearTimeout(goneTimer.current)
      goneTimer.current = window.setTimeout(() => setIsVisible(false), 220)
    }
    window.addEventListener(NEWER_TOAST, onNewer)
    return () => {
      window.removeEventListener(NEWER_TOAST, onNewer)
      window.clearTimeout(goneTimer.current)
    }
  }, [show, spot])

  useEffect(() => {
    setIsMounted(true)
    // Check if mobile
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => {
      setIsMounted(false)
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    if (show) {
      setIsVisible(true)
      // Small delay for smooth animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })

      // Auto-hide after duration
      const timer = setTimeout(() => {
        setIsAnimating(false)
        setTimeout(() => {
          setIsVisible(false)
        }, 600) // Match animation duration
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, duration])

  const resolvedPosition = position || (isMobile ? "bottom" : "top")

  if (!isVisible || !isMounted) return null

  /* The editor's spot: rises a little into place and sinks out, on opacity, translate and scale only, and no blur to redo every frame. */
  if (spot === "onepage-editor") {
    return createPortal(
      <div
        data-save-toast=""
        className="fixed left-0 right-0 bottom-[calc(var(--op-tabbar-h)+12px)] z-[2147483647] flex justify-center px-4 pointer-events-none md:bottom-6 md:left-[240px] md:right-[410px]"
      >
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full border border-white/10 bg-[#111113] px-3.5 py-2 text-white shadow-[0_1px_2px_rgba(16,24,40,0.2),0_8px_24px_rgba(16,24,40,0.18)] sm:max-w-[320px]",
            isAnimating ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0",
          )}
          style={{
            transitionProperty: "opacity, translate, scale",
            transitionDuration: isAnimating ? "320ms" : "200ms",
            transitionTimingFunction: isAnimating ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.4, 0, 1, 1)",
          }}
        >
          {icon || <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />}
          <span className="text-sm font-medium truncate">{message}</span>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div data-save-toast="" className={cn(
      "fixed left-0 right-0 z-[2147483647] flex justify-center px-4 pointer-events-none",
      resolvedPosition === "bottom" ? "bottom-16" : "top-[calc(58px+env(safe-area-inset-top)+14px)]"
    )}>
      <div
        className={cn(
          "px-3.5 py-2 bg-gray-900/95 backdrop-blur-sm text-white rounded-full shadow-2xl flex items-center gap-2 max-w-[calc(100%-24px)] sm:max-w-[300px] border border-white/10",
          isAnimating
            ? isMobile
              ? "translate-y-0 opacity-100 scale-100"
              : "translate-y-0 opacity-100"
            : isMobile
              ? "translate-y-6 opacity-0 scale-95"
              : "-translate-y-4 opacity-0"
        )}
        style={{
          transition: 'all 600ms cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {icon || <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />}
        <span className="text-sm font-medium truncate">{message}</span>
      </div>
    </div>
    ,
    document.body
  )
}

export const DeletedIcon = <Trash2 className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.2} />
