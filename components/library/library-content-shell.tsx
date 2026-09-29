"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

/** Gentle fade when a library tab's real screen replaces the skeleton. */
export function LibraryContentShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  return (
    <div key={path} className="library-content-enter min-h-[14rem]">
      {children}
    </div>
  )
}
