"use client";

import { useState, useEffect } from "react"
import { isIOS } from "@/lib/native-bridge"

/**
 * Non-sticky announcement bar for /app pages.
 * Renders inline at the top of the page content area,
 * positioned under the header, scrolling with content.
 *
 * iOS/Android Capacitor: hidden entirely on iOS for App Store compliance
 * (Guideline 3.1.1 — no purchase/upgrade CTAs outside Apple IAP).
 * Shown normally on Android and all web browsers.
 */
export function AnnouncementBarMobile({ children }: { children: React.ReactNode }) {
  const [isIOSApp, setIsIOSApp] = useState(false)
  useEffect(() => { setIsIOSApp(isIOS()) }, [])

  if (isIOSApp) return null

  return (
    <div className="w-full bg-[#8b5cf6] text-white">
      <div className="h-[40px] md:h-[42px] flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  );
}
