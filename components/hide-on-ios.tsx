"use client"

import { useState, useEffect, type ReactNode } from "react"
import { isIOS } from "@/lib/native-bridge"

/** Renders children on web/Android; renders nothing on iOS Capacitor (App Store Guideline 3.1.1). */
export function HideOnIOS({ children }: { children: ReactNode }) {
  const [ios, setIos] = useState(false)
  useEffect(() => { setIos(isIOS()) }, [])
  if (ios) return null
  return <>{children}</>
}
