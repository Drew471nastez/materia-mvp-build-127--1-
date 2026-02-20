"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function NavigationLoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)
  const safetyRef = useRef<NodeJS.Timeout | null>(null)
  const prevPathRef = useRef(pathname)
  const prevSearchRef = useRef(searchParams.toString())

  const clearAllTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (progressRef.current) clearTimeout(progressRef.current)
    if (safetyRef.current) clearTimeout(safetyRef.current)
  }

  const completeLoading = () => {
    clearAllTimers()
    setProgress(100)
    setIsComplete(true)
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setProgress(0)
      setIsComplete(false)
    }, 500)
  }

  // Detect navigation start
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
        const url = new URL(anchor.href)
        if (url.pathname !== pathname || url.search !== searchParams.toString()) {
          clearAllTimers()
          setIsLoading(true)
          setIsComplete(false)
          setProgress(0)

          let currentProgress = 0
          const animate = () => {
            const increment = Math.random() * 3 + 1
            currentProgress += increment
            if (currentProgress >= 80) {
              currentProgress = 80 + (Math.random() * 2)
            }
            if (currentProgress < 85) {
              setProgress(currentProgress)
              progressRef.current = setTimeout(animate, 200 + Math.random() * 100)
            }
          }
          progressRef.current = setTimeout(animate, 50)

          // Safety timeout: auto-dismiss after 8 seconds to prevent stuck bar
          safetyRef.current = setTimeout(() => {
            completeLoading()
          }, 8000)
        }
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname, searchParams])

  // Detect navigation end (pathname or search params change)
  useEffect(() => {
    const currentSearch = searchParams.toString()
    if (prevPathRef.current !== pathname || prevSearchRef.current !== currentSearch) {
      if (isLoading) {
        completeLoading()
      }
      prevPathRef.current = pathname
      prevSearchRef.current = currentSearch
    }

    return () => clearAllTimers()
  }, [pathname, searchParams])

  if (!isLoading && progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      <div className="h-[2px] w-full bg-transparent">
        <div
          className="h-full relative"
          style={{
            width: `${progress}%`,
            transition: isComplete
              ? 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 400ms ease-out'
              : 'width 400ms cubic-bezier(0.4, 0, 1, 1)',
            opacity: isComplete ? 0 : 1,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.6) 70%, rgba(255,255,255,0.9) 100%)',
          }}
        >
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-[4px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 60%, rgba(255,255,255,0.7) 100%)',
              filter: 'blur(2px)',
              opacity: isComplete ? 0 : 0.8,
              transition: 'opacity 300ms ease-out',
            }}
          />
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-[2px]"
            style={{
              background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 0 4px rgba(255,255,255,0.5), 0 0 8px rgba(255,255,255,0.3)',
              opacity: isComplete ? 0 : 1,
              transition: 'opacity 300ms ease-out',
            }}
          />
        </div>
      </div>
    </div>
  )
}
