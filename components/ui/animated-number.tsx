"use client"

import { useState, useEffect, useRef } from "react"

interface AnimatedNumberProps {
  value: number
  duration?: number
  formatFn?: (value: number) => string
  className?: string
  enabled?: boolean
}

export function AnimatedNumber({
  value,
  duration = 1000,
  formatFn = (v) => v.toLocaleString(),
  className = "",
  enabled = true,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(enabled ? 0 : value)
  const startTimeRef = useRef<number | null>(null)
  const previousValueRef = useRef(value)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(value)
      return
    }

    // Reset animation when value changes
    if (previousValueRef.current !== value) {
      startTimeRef.current = null
      previousValueRef.current = value
    }

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out-quad for smooth deceleration
      const easeOutQuad = 1 - (1 - progress) * (1 - progress)
      const currentCount = value * easeOutQuad

      setDisplayValue(currentCount)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [value, duration, enabled])

  return <span className={className}>{formatFn(displayValue)}</span>
}

// Helper functions for formatting
export const formatCompact = (value: number): string => {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`
  } else if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return Math.round(value).toLocaleString()
}

export const formatPrice = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export const formatPercent = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`
}
