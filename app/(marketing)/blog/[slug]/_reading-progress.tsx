"use client"

import { useEffect, useRef, useCallback, useState } from "react"

export default function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const [headerHeight, setHeaderHeight] = useState(0)

  const update = useCallback(() => {
    if (!barRef.current) return
    const total = document.documentElement.scrollHeight - window.innerHeight
    const pct = total > 0 ? Math.min((window.scrollY / total) * 100, 100) : 0
    barRef.current.style.transform = `scaleX(${pct / 100})`
  }, [])

  useEffect(() => {
    // Measure header height so bar sits below it on mobile
    function measureHeader() {
      const header = document.getElementById("platform-header-root")
      if (header) {
        setHeaderHeight(header.getBoundingClientRect().height)
      }
    }
    measureHeader()
    window.addEventListener("resize", measureHeader, { passive: true })

    function onScroll() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(update)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", measureHeader)
      cancelAnimationFrame(rafRef.current)
    }
  }, [update])

  return (
    <div
      className="fixed left-0 right-0 z-[45] h-[3px] bg-transparent pointer-events-none"
      style={{ top: headerHeight > 0 ? `${headerHeight}px` : "0px" }}
    >
      <div
        ref={barRef}
        className="h-full bg-purple-600 origin-left will-change-transform"
        style={{ transform: "scaleX(0)", transition: "transform 60ms linear" }}
      />
    </div>
  )
}
