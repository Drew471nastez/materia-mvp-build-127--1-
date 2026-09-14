"use client"

/**
 * ===========================================================================
 *  A TOP BAR, AND THE PAGE ITSELF UNDERNEATH IT
 * ===========================================================================
 * The frame holds the real /u/<handle>, signed in, so every control a creator
 * already has on their own page is the control they use here: the pencil on
 * the avatar, the profile dialog, the About editor, the owner menu. Nothing
 * is reimplemented, so nothing can drift out of step with what a visitor
 * sees.
 *
 * WHY A FRAME AND NOT AN IMPORT. The page is a server component that reads
 * cookies, queries six tables and renders a thousand lines. Calling it from a
 * client workspace is not possible; copying it is the approximation this
 * replaces. A frame runs the actual route, with the actual session, and costs
 * one request.
 *
 * `?embedded=1` is what tells it that it is inside the workspace, and the
 * proxy only relaxes X-Frame-Options for that exact combination — see the
 * frame-ancestors block in proxy.ts. Opened at its own address the page is
 * still unframeable by anybody, us included.
 */

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, Loader2, RotateCw } from "lucide-react"

export function CreatorPageWorkspace({
  handle,
  displayName,
  published,
}: {
  handle: string
  displayName: string
  published: boolean
}) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  /**
   * Bumped to reload the frame after an edit made somewhere else, without
   * reloading the workspace around it and losing the scroll position of the
   * app. `key` on the iframe is the only reliable way: assigning to
   * contentWindow.location is a cross-document navigation the browser may
   * refuse once the page has its own history.
   */
  const [nonce, setNonce] = useState(0)

  const src = `/u/${encodeURIComponent(handle)}?embedded=1`
  const liveUrl = `/u/${encodeURIComponent(handle)}`

  const refresh = useCallback(() => {
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  return (
    <div
      className="wb-canvas-in flex h-svh min-h-0 flex-col bg-[#f8f9fa]"
      style={leaving ? { opacity: 0, transition: "opacity 160ms ease-out" } : undefined}
    >
      {/*
        ONE ROW, AND IT SAYS WHERE YOU ARE BEFORE IT OFFERS ANYTHING.
        The handle is the subject of this screen, so it is the first thing on
        it, and the published state is a fact rather than a badge with a colour
        for its own sake.
      */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5e7eb]/70 bg-white px-4 py-2.5 sm:px-6">
        {/*
          THE WAY BACK, because there is no sidebar to leave by any more.

          It fades the screen out before navigating rather than cutting to the
          dashboard mid-paint, which is what the website builder does when it
          leaves its own editor. Without it, a full-screen editor closing is a
          hard swap between two unrelated layouts.
        */}
        <button
          type="button"
          onClick={() => {
            setLeaving(true)
            window.setTimeout(() => router.push("/app"), 150)
          }}
          aria-label="Back to Storelib"
          title="Back to Storelib"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{displayName}</p>
          <p className="truncate text-[12px] text-[#6b7280]">
            storelib.com/u/{handle}
            {published ? "" : "  ·  not published yet"}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          aria-label="Reload the page"
          title="Reload the page"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#374151]"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white no-underline transition-colors hover:bg-[#2a2a3e]"
        >
          <ExternalLink className="h-4 w-4" />
          View live
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f8f9fa]">
            <Loader2 className="h-5 w-5 animate-spin text-[#9ca3af]" />
          </div>
        )}
        <iframe
          key={nonce}
          ref={frameRef}
          src={src}
          title={`${displayName}'s creator page`}
          onLoad={() => setLoading(false)}
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  )
}
