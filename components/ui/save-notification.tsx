"use client"

import { useEffect, useState } from "react"
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
        }, 500) // Match animation duration
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, isVisible, duration])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className={cn(
          "px-4 py-2.5 bg-gray-900 text-white rounded-full shadow-lg flex items-center gap-2",
          isAnimating
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4"
        )}
        style={{
          transition: 'opacity 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}
