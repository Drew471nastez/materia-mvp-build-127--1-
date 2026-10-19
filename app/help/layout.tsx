import type React from "react"
import { HelpHeader } from "@/components/help/help-header"

/*
  The Help Center reads like one: its own bar (components/help/help-header, the logo and "Help", support and a way
  back) and no footer. overflow-x-clip, not hidden: hidden makes this box a scroll container, and the contents beside
  an article would stop staying in view.
*/
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-white">
      <HelpHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
