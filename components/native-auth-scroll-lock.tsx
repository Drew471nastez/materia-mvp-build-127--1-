"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { isNativeApp } from "@/lib/native-bridge"

const LOCKED_PATHS = new Set(["/login", "/signup"])

export function NativeAuthScrollLock() {
  const pathname = usePathname()

  useEffect(() => {
    if (!isNativeApp() || !LOCKED_PATHS.has(pathname)) return

    const html = document.documentElement
    const body = document.body

    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
    }

    html.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    body.style.touchAction = "none"
    body.style.position = "fixed"
    body.style.width = "100%"

    return () => {
      html.style.overflow = prev.htmlOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overflow = prev.bodyOverflow
      body.style.overscrollBehavior = prev.bodyOverscroll
      body.style.touchAction = prev.bodyTouchAction
      body.style.position = prev.bodyPosition
      body.style.width = prev.bodyWidth
    }
  }, [pathname])

  return null
}
