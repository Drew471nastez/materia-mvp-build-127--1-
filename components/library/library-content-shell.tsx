"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cleanPath } from "./library-tab-list"

/**
 * Stable min-height while a tab route swaps. Tab presses get the same panel
 * entrance as /app settings (app/globals.css `.library-panel`).
 */
export function LibraryContentShell({ children, enter }: { children: ReactNode; enter?: boolean }) {
  const path = cleanPath(usePathname())
  return (
    <div
      key={path}
      data-library-screen=""
      data-probe-path={path}
      className={`min-h-[14rem] ${enter ? "library-panel" : ""}`}
    >
      {children}
    </div>
  )
}
