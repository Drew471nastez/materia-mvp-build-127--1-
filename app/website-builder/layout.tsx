import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { EditorToaster } from "@/components/ui/editor-toaster"
import { EditorFrame } from "@/components/website-builder/editor-frame"
import { SlimScrollRail } from "@/components/website-builder/editor/slim-scroll-rail"

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
    /* Pinned to the viewport, with the editor's own frame under it rather
       than white (components/website-builder/editor-frame). */
    <EditorFrame>
      {children}
      {/* Compact on a phone and clear of the home indicator: see the file. */}
      <EditorToaster />
      {/* The panels' scrollbar, drawn over them so it takes no width. */}
      <SlimScrollRail />
    </EditorFrame>
  )
}
