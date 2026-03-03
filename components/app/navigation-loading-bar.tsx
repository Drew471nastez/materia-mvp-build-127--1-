"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * Fire this immediately inside any onClick that calls router.push() so the
 * loading bar appears at tap-time rather than waiting for the pathname to
 * change (~1–2 s later on slow connections).
 *
 * Usage:
 *   onClick={() => { startNavigationLoading(); router.push("/target") }}
 */
export function startNavigationLoading() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("nav-loading-start"))
}

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
  // Track when loading started so we can enforce a minimum display time
  const startTimeRef = useRef<number>(0)

  const clearAllTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (progressRef.current) clearTimeout(progressRef.current)
    if (safetyRef.current) clearTimeout(safetyRef.current)
  }

  const doComplete = () => {
    setProgress(100)
    setIsComplete(true)
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setProgress(0)
      setIsComplete(false)
    }, 400)
  }

  const completeLoading = () => {
    clearAllTimers()
    // Enforce a 250 ms minimum so the bar never flashes and disappears instantly
    const elapsed = Date.now() - startTimeRef.current
    const remaining = Math.max(0, 250 - elapsed)
    if (remaining > 0) {
      timeoutRef.current = setTimeout(doComplete, remaining)
    } else {
      doComplete()
    }
  }

  // Start the animated loading bar immediately (called from outside via event or click)
  const startLoading = () => {
    clearAllTimers()
    startTimeRef.current = Date.now()
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
    progressRef.current = setTimeout(animate, 20) // start within 20 ms

    // Safety timeout: auto-dismiss after 8 seconds to prevent stuck bar
    safetyRef.current = setTimeout(() => { completeLoading() }, 8000)
  }

  // Detect navigation start — both <a> clicks and programmatic router.push()
  // calls (the latter dispatch 'nav-loading-start' via startNavigationLoading())
  useEffect(() => {
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor || !anchor.href) return
      try {
        const url = new URL(anchor.href)
        // Match same origin OR canonical domain/subdomains.
        // In Capacitor the WebView origin is capacitor://localhost but links may
        // resolve to https://storelib.com — both should trigger the loading bar.
        const isSameOrigin = url.origin === window.location.origin
        const isOurDomain = url.hostname === mainDomain || url.hostname.endsWith(`.${mainDomain}`)
        if ((isSameOrigin || isOurDomain) && (url.pathname !== pathname || url.search !== searchParams.toString())) {
          startLoading()
        }
      } catch {
        // ignore unparseable hrefs
      }
    }

    const handleProgrammatic = () => startLoading()

    document.addEventListener('click', handleClick)
    window.addEventListener('nav-loading-start', handleProgrammatic)
    return () => {
      document.removeEventListener('click', handleClick)
      window.removeEventListener('nav-loading-start', handleProgrammatic)
    }
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
      {/* 3px tall — more visible than 2px on high-DPI mobile screens */}
      <div className="h-[3px] w-full bg-transparent">
        <div
          className="h-full relative"
          style={{
            width: `${progress}%`,
            transition: isComplete
              ? 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 350ms ease-out'
              : 'width 400ms cubic-bezier(0.4, 0, 1, 1)',
            opacity: isComplete ? 0 : 1,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.65) 70%, rgba(255,255,255,0.95) 100%)',
          }}
        >
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-[5px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 60%, rgba(255,255,255,0.75) 100%)',
              filter: 'blur(2px)',
              opacity: isComplete ? 0 : 0.85,
              transition: 'opacity 300ms ease-out',
            }}
          />
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-[3px]"
            style={{
              background: 'rgba(255,255,255,0.98)',
              boxShadow: '0 0 6px rgba(255,255,255,0.6), 0 0 12px rgba(255,255,255,0.35)',
              opacity: isComplete ? 0 : 1,
              transition: 'opacity 300ms ease-out',
            }}
          />
        </div>
      </div>
    </div>
  )
}
