"use client"

/**
 * ===========================================================================
 *  THE WAY BACK TO THE DASHBOARD, FROM ANY HELP CENTER PAGE
 * ===========================================================================
 * Help opens from /app's account menu as a page of its own, in the same tab
 * and, in the iOS and Android apps, in the same WebView. This link in the
 * band is how a seller gets back without hunting for the browser's Back.
 *
 * When the page just behind is one of /app's (Help opened from the account
 * menu, nothing read in between), it goes back to it: the router still has
 * that screen, with its scroll, and the history stays /app then /help rather
 * than /app, /help, /app. Otherwise it is a plain link to /app, a document
 * load, which is what the app's link guard asks of /app anyway
 * (lib/native-links needsDocumentLoad). A back that does nothing within
 * BACK_WATCH_MS opens /app instead (lib/navigation/go-back backThen).
 *
 * 44px tall for a thumb, pulled into the band's row by its own padding so
 * the band keeps its height.
 */
import type { MouseEvent } from "react"
import { previousPath } from "@/lib/navigation/in-app-history"
import { backThen } from "@/lib/navigation/go-back"

const fromApp = (path: string | null) => !!path && (path === "/app" || path.startsWith("/app/"))

export function HelpDashboardLink() {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!fromApp(previousPath())) return
    e.preventDefault()
    backThen(() => window.location.assign("/app"))
  }
  return (
    <a
      href="/app"
      onClick={onClick}
      data-help-dashboard=""
      className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-[14px] font-medium text-white/85 outline-none transition-colors [-webkit-tap-highlight-color:transparent] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 active:text-white"
    >
      Go to your dashboard
    </a>
  )
}
