"use client"

import type { ReactNode } from "react"

/**
 * Stable min-height while a tab route swaps. Cross-fade is handled by
 * library-panel.tsx; a second fade here felt mushy and direct at once.
 */
export function LibraryContentShell({ children }: { children: ReactNode }) {
  return <div className="min-h-[14rem]" data-library-screen="">{children}</div>
}
