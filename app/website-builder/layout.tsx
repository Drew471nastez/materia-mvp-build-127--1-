import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { Toaster } from "sonner"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

// Full-screen layout for Website Builder editor & code editor pages.
// No app sidebar — the editor has its own top bar.
export default async function WebsiteBuilderEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /* A blip is not a sign-out (lib/auth/current-user.ts). When Supabase did
     not answer, the session is recovered in the browser, not thrown away. */
  const current = await currentUserForRequest()
  if (!current.user) {
    if (current.state === "indeterminate") return <SessionRecovery />
    redirect("/login")
  }

  return (
    /*
      `fixed inset-0`, for the same reason the editor's own root is: an
      `h-svh` wrapper is content, and the body's safe-area padding sits
      underneath it, making the document taller than the screen by the
      home indicator. Pinned to the viewport it adds no height at all.
    */
    <div className="fixed inset-0 overflow-hidden bg-background">
      {children}
      <Toaster position="bottom-right" />
    </div>
  )
}
