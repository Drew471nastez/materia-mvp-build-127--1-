"use client"

import { useState, useEffect, useRef } from "react"

interface UseCountUpOptions {
  start?: number
  end: number
  duration?: number // in milliseconds
  decimals?: number
  prefix?: string
  suffix?: string
  enabled?: boolean // Only animate when enabled
}

export function useCountUp({
  start = 0,
  end,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  enabled = true,
}: UseCountUpOptions): string {
  const [count, setCount] = useState(enabled ? start : end)
  const countRef = useRef(start)
  const startTimeRef = useRef<number | null>(null)
  const previousEndRef = useRef(end)

  useEffect(() => {
    if (!enabled) {
      setCount(end)
      return
    }

    // If end value changed, start new animation from current count
    if (previousEndRef.current !== end) {
      countRef.current = count
      startTimeRef.current = null
      previousEndRef.current = end
    }

    const startValue = countRef.current
    const endValue = end

    // If values are the same, no animation needed
    if (startValue === endValue) {
      return
    }

    let animationFrameId: number

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out-quad)
      const easeOutQuad = 1 - (1 - progress) * (1 - progress)

      const currentCount = startValue + (endValue - startValue) * easeOutQuad

      setCount(currentCount)
      countRef.current = currentCount

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate)
      } else {
        setCount(endValue)
        countRef.current = endValue
      }
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [end, duration, enabled])

  // Format the number
  const formattedCount = count.toFixed(decimals)
  return `${prefix}${formattedCount}${suffix}`
}

// Hook for formatting numbers with K, M, B suffixes and count-up animation
export function useCountUpCompact({
  end,
  duration = 1000,
  enabled = true,
}: {
  end: number
  duration?: number
  enabled?: boolean
}): string {
  const [displayValue, setDisplayValue] = useState(enabled ? 0 : end)
  const startTimeRef = useRef<number | null>(null)
  const previousEndRef = useRef(end)

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(end)
      return
    }

    // Reset animation when end changes
    if (previousEndRef.current !== end) {
      startTimeRef.current = null
      previousEndRef.current = end
    }

    let animationFrameId: number

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out-quad)
      const easeOutQuad = 1 - (1 - progress) * (1 - progress)

      const currentCount = end * easeOutQuad

      setDisplayValue(currentCount)

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate)
      } else {
        setDisplayValue(end)
      }
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [end, duration, enabled])

  // Format compact number
  if (displayValue >= 1000000000) {
    return `${(displayValue / 1000000000).toFixed(1)}B`
  } else if (displayValue >= 1000000) {
    return `${(displayValue / 1000000).toFixed(1)}M`
  } else if (displayValue >= 1000) {
    return `${(displayValue / 1000).toFixed(1)}K`
  }
  return Math.round(displayValue).toLocaleString()
}

// Hook for price count-up animation
export function useCountUpPrice({
  end,
  duration = 1000,
  enabled = true,
}: {
  end: number
  duration?: number
  enabled?: boolean
}): string {
  const [displayValue, setDisplayValue] = useState(enabled ? 0 : end)
  const startTimeRef = useRef<number | null>(null)
  const previousEndRef = useRef(end)

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(end)
      return
    }

    if (previousEndRef.current !== end) {
      startTimeRef.current = null
      previousEndRef.current = end
    }

    let animationFrameId: number

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      const easeOutQuad = 1 - (1 - progress) * (1 - progress)
      const currentCount = end * easeOutQuad

      setDisplayValue(currentCount)

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate)
      } else {
        setDisplayValue(end)
      }
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [end, duration, enabled])

  // Format as price
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(displayValue)
}
