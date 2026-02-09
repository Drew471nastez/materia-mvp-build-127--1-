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
  duration = 4000
}: SaveNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
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
        }, 500) // Match animation duration
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, duration])

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div className="fixed top-[76px] md:top-4 left-0 right-0 z-[2147483646] flex justify-center px-3 sm:px-4 pointer-events-none">
      <div
        className={cn(
          "px-3 py-1.5 bg-gray-900/95 backdrop-blur-sm text-white rounded-full shadow-xl flex items-center gap-1.5 max-w-[calc(100%-24px)] sm:max-w-[280px] border border-gray-800/50",
          isAnimating
            ? "translate-y-0 opacity-100"
            : "-translate-y-3 opacity-0"
        )}
        style={{
          transition: 'transform 500ms cubic-bezier(0.32, 0.72, 0, 1), opacity 500ms cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        <div className="flex-shrink-0 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
        <span className="text-xs font-medium truncate">{message}</span>
      </div>
    </div>
    ,
    document.body
  )
}
