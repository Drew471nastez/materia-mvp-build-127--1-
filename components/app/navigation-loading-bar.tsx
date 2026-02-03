"use client"

import { useEffect, useState, useTransition, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function NavigationLoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isPending, startTransition] = useTransition()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)
  const prevPathRef = useRef(pathname)

  // Detect navigation start
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
        const url = new URL(anchor.href)
        // Only show loading bar for internal navigation
        if (url.pathname !== pathname || url.search !== searchParams.toString()) {
          setIsLoading(true)
          setProgress(0)

          // Animate progress
          let currentProgress = 0
          progressRef.current = setInterval(() => {
            currentProgress += Math.random() * 15
            if (currentProgress >= 90) {
              currentProgress = 90
              if (progressRef.current) clearInterval(progressRef.current)
            }
            setProgress(currentProgress)
          }, 100)
        }
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname, searchParams])

  // Detect navigation end (pathname change)
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      // Navigation completed
      if (progressRef.current) clearInterval(progressRef.current)
      setProgress(100)

      // Reset after animation
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false)
        setProgress(0)
      }, 300)

      prevPathRef.current = pathname
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [pathname])

  if (!isLoading && progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      {/* Background track */}
      <div className="h-[2px] w-full bg-transparent">
        {/* Progress bar with glow effect */}
        <div
          className="h-full transition-all duration-200 ease-out relative"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.9) 50%, #fff 100%)',
          }}
        >
          {/* Glowing tip */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-[6px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, #fff 100%)',
              filter: 'blur(3px)',
              boxShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.4)',
            }}
          />
          {/* Sharp bright tip */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-[2px]"
            style={{
              background: '#fff',
              boxShadow: '0 0 8px #fff, 0 0 15px rgba(255,255,255,0.8)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
