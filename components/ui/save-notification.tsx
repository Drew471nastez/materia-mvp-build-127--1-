"use client"

import { useEffect, useState, useRef } from "react"
import { Check } from "lucide-react"
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current)
    }

    if (show) {
      // Show the notification
      setIsVisible(true)

      // Small delay for smooth fade-in animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })

      // Auto-hide after duration
      timeoutRef.current = setTimeout(() => {
        // Start fade-out animation
        setIsAnimating(false)

        // Remove from DOM after animation completes
        animationTimeoutRef.current = setTimeout(() => {
          setIsVisible(false)
        }, 500) // Match animation duration
      }, duration)
    } else {
      // Immediately hide if show becomes false
      setIsAnimating(false)
      setTimeout(() => {
        setIsVisible(false)
      }, 500)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [show, duration])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-[9999] flex justify-center pointer-events-none px-4">
      <div
        className={cn(
          "px-4 py-2.5 bg-gray-900/95 backdrop-blur-sm text-white rounded-full shadow-lg flex items-center gap-2.5 transition-all",
          isAnimating
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4"
        )}
        style={{
          transition: 'opacity 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
        <span className="text-sm font-medium whitespace-nowrap">{message}</span>
      </div>
    </div>
  )
}
