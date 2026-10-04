"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cleanPath } from "./library-tab-list"

/**
 * The live screen's box: a floor under its height while a tab route swaps,
 * and the address it is showing, for the probes. No entrance of its own: a
 * pill's screen arrives whole under the old one's dissolving copy
 * (library-panel.tsx), and an entrance played on top of that is what used to
 * dip the new screen to a fifth of its strength the frame after it landed.
 */
export function LibraryContentShell({ children }: { children: ReactNode }) {
  const path = cleanPath(usePathname())
  return (
    <div data-library-screen="" data-probe-path={path} className="min-h-[14rem]">
      {children}
    </div>
  )
}
