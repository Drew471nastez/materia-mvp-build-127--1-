"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"

interface StickyHeaderWrapperProps {
  children: React.ReactNode
  className?: string
}

export function StickyHeaderWrapper({ children, className = "" }: StickyHeaderWrapperProps) {
  const [isSticky, setIsSticky] = useState(true)
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const isScrollingUp = currentScrollY < lastScrollY.current
      const isDesktop = window.innerWidth >= 1024 // lg breakpoint
      const isExplorePage = pathname.startsWith("/explore")

      // On desktop /explore page: no sticky behavior at all
      if (isDesktop && isExplorePage) {
        setIsSticky(false)
        setIsVisible(true)
        lastScrollY.current = currentScrollY
        return
      }

      // For other pages: sticky on scroll up
      if (currentScrollY <= 0) {
        // At top of page
        setIsVisible(true)
        setIsSticky(true)
      } else if (isScrollingUp) {
        // Scrolling up
        setIsVisible(true)
        setIsSticky(true)
      } else {
        // Scrolling down
        setIsVisible(false)
      }

      lastScrollY.current = currentScrollY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [pathname])

  const stickyClass = isSticky ? "sticky top-0" : ""
  const visibleClass = isVisible ? "translate-y-0" : "-translate-y-full"
  const transitionClass = "transition-transform duration-300 ease-in-out"

  return (
    <div className={`${stickyClass} ${visibleClass} ${transitionClass} ${className} z-50 w-full`}>
      {children}
    </div>
  )
}
