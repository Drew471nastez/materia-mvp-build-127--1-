import type React from "react"
import type { Metadata, Viewport } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { EditorToaster } from "@/components/ui/editor-toaster"
import { EditorFrame } from "@/components/website-builder/editor-frame"
import { SlimScrollRail } from "@/components/website-builder/editor/slim-scroll-rail"
import { ActivityBeacon } from "@/components/app/activity-beacon"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

/*
  NO ZOOM IN THE EDITOR (round 20). iOS zooms the page into a field whose
  text is under 16px when it is tapped, and into whatever is double tapped,
  and leaves it zoomed: the owner's phone showed Ask Storelib's sheet with
  its header and thread pushed in and cut off at the right. The editor is a
  tool laid out for the screen it is on, so the page stays at its own scale
  (Safari still lets a pinch zoom; the app's web view does not). The rest of
  the root's viewport (width, the notch) is kept: Next merges this into it.
*/
export const viewport: Viewport = { maximumScale: 1 }

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
    /*
      SIGNED OUT INSIDE THE EDITOR'S OWN FRAME (round 66). The code pane is
      this page in a frame of the editor; sent on to /login, which refuses to
      be framed, the pane showed "storelib.com refused to connect". In a
      frame it says so, and signing in again opens in the whole tab.
    */
    if ((await headers()).get("sec-fetch-dest") === "iframe") return <FramedSignedOut />
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
      {/* Pages and named actions for /admin's creator activity, once a minute (components/app/activity-beacon). */}
      <ActivityBeacon />
    </EditorFrame>
  )
}

/** Signed out, in a frame of the editor: said here, with the way back in the whole tab. */
function FramedSignedOut() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white px-6 text-center font-sans">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">You were signed out</p>
      <p className="max-w-[320px] text-[13px] text-[#6b7280]">Sign in again to keep editing. Your unsaved code stays in this browser.</p>
      <a href="/login" target="_top" className="mt-1 inline-flex h-9 items-center rounded-full bg-[#1a1a2e] px-4 text-[13px] font-semibold text-white">
        Sign in
      </a>
    </div>
  )
}
