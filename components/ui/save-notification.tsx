"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface SaveNotificationProps {
  show: boolean
  message?: string
  duration?: number
}

export function SaveNotification({
  show,
  message = "Changes saved",
  duration = 3000
}: SaveNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

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

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div className={cn(
      "fixed left-0 right-0 z-[2147483647] flex justify-center px-4 pointer-events-none",
      isMobile ? "bottom-16" : "top-4"
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
        <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
        <span className="text-sm font-medium truncate">{message}</span>
      </div>
    </div>
    ,
    document.body
  )
}
