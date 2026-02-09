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
  duration = 2000
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
        }, 400) // Match animation duration
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, isVisible, duration])

  if (!isVisible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none">
      <div
        className={cn(
          "mt-4 px-4 py-2.5 bg-gray-900 text-white rounded-full shadow-lg flex items-center gap-2",
          isAnimating
            ? "translate-y-0"
            : "-translate-y-4"
        )}
        style={{
          transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}
