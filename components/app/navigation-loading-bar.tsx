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
  const [isVisible, setIsVisible] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const safetyRef = useRef<NodeJS.Timeout | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTsRef = useRef<number>(0)
  const activeRef = useRef(false)
  const prevPathRef = useRef(pathname)
  const prevSearchRef = useRef(searchParams.toString())

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const clearAllTimers = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    if (safetyRef.current) clearTimeout(safetyRef.current)
    cancelRaf()
  }

  // Write the current progress straight to the DOM — avoids a React
  // re-render on every animation frame.
  const setBarWidth = (pct: number) => {
    const el = barRef.current
    if (el) el.style.width = `${pct}%`
  }

  const doComplete = () => {
    cancelRaf()
    activeRef.current = false
    setBarWidth(100)
    setIsComplete(true)
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false)
      setIsComplete(false)
      setBarWidth(0)
    }, 380)
  }

  const completeLoading = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    if (safetyRef.current) clearTimeout(safetyRef.current)
    // Enforce a 250 ms minimum so the bar never flashes and disappears instantly
    const elapsed = performance.now() - startTsRef.current
    const remaining = Math.max(0, 250 - elapsed)
    if (remaining > 0) {
      hideTimeoutRef.current = setTimeout(doComplete, remaining)
    } else {
      doComplete()
    }
  }

  // Start the animated loading bar immediately (called from outside via event or click)
  const startLoading = () => {
    clearAllTimers()
    startTsRef.current = performance.now()
    activeRef.current = true
    setIsComplete(false)
    setIsVisible(true)
    // Paint at 0 % first so the transform from the previous run (if any)
    // doesn't flash. The RAF loop immediately drives it upward from here.
    setBarWidth(0)

    // Smooth continuous animation using requestAnimationFrame.
    // Asymptotic curve — approaches but never exceeds 90 % until the real
    // navigation completes. This produces the silky "nprogress" feel rather
    // than the stuttery stepped progress from the old setTimeout loop.
    //
    //   p(t) = 90 * (1 - e^(-t / TAU))
    //
    // TAU controls how quickly we approach the ceiling. 1800 ms puts us at
    // ~40 % after 900 ms, ~63 % at 1.8 s, ~86 % at 3.6 s — matching the
    // pacing of real page loads on 3G/4G.
    const TAU = 1800
    const tick = (now: number) => {
      if (!activeRef.current) return
      const t = now - startTsRef.current
      const p = 90 * (1 - Math.exp(-t / TAU))
      setBarWidth(p)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

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
      if (activeRef.current) {
        completeLoading()
      }
      prevPathRef.current = pathname
      prevSearchRef.current = currentSearch
    }

    return () => clearAllTimers()
  }, [pathname, searchParams])

  if (!isVisible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      {/* 3px tall — more visible than 2px on high-DPI mobile screens */}
      <div className="h-[3px] w-full bg-transparent">
        <div
          ref={barRef}
          className="h-full relative"
          style={{
            // Width is updated every RAF frame by the asymptotic curve, so
            // the bar advances at a true 60 fps without the visible stair-
            // stepping that the old setTimeout loop produced. The CSS
            // transition is only enabled on completion, where it drives the
            // final jump to 100 % and the fade-out.
            width: '0%',
            transition: isComplete
              ? 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms ease-out'
              : 'none',
            opacity: isComplete ? 0 : 1,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.65) 70%, rgba(255,255,255,0.95) 100%)',
            willChange: 'width, opacity',
            backfaceVisibility: 'hidden',
          }}
        >
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-[5px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 60%, rgba(255,255,255,0.75) 100%)',
              filter: 'blur(2px)',
              opacity: isComplete ? 0 : 0.85,
              transition: 'opacity 320ms ease-out',
            }}
          />
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-[3px]"
            style={{
              background: 'rgba(255,255,255,0.98)',
              boxShadow: '0 0 6px rgba(255,255,255,0.6), 0 0 12px rgba(255,255,255,0.35)',
              opacity: isComplete ? 0 : 1,
              transition: 'opacity 320ms ease-out',
            }}
          />
        </div>
      </div>
    </div>
  )
}
