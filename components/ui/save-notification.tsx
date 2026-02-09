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
  duration = 2000
}: SaveNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  useEffect(() => {
    if (show && !isVisible) {
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
        }, 400) // Match animation duration
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, isVisible, duration])

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div className="fixed top-[76px] md:top-4 left-0 right-0 z-[2147483646] flex justify-center px-3 sm:px-4 pointer-events-none">
      <div
        className={cn(
          "px-4 py-2.5 bg-gray-900/95 text-white rounded-full shadow-lg flex items-center gap-2 max-w-full",
          isAnimating
            ? "translate-y-0"
            : "-translate-y-4"
        )}
        style={{
          transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        <Check className="w-4 h-4 text-white shrink-0" strokeWidth={2.6} />
        <span className="text-sm font-medium truncate">{message}</span>
      </div>
    </div>
    ,
    document.body
  )
}
