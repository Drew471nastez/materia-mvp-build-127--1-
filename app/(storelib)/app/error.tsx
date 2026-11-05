"use client"

/**
 * The dashboard's own boundary.
 *
 * Scoped to /app so a failure on one screen keeps the person inside the
 * product: the way out offered here is the dashboard, not the marketing
 * site, because somebody whose orders page threw wants their orders, not the
 * front page.
 *
 * A SERVER THAT DID NOT ANSWER IS ASKED AGAIN, QUIETLY (round 51). A page
 * whose read failed on the server (the error carries a digest) used to put
 * "Something went wrong" up at once, and its Try again only cleared this
 * boundary: React drew the same failed answer the router held, so the
 * button did nothing until the page was loaded again. Now the page is asked
 * for again (router.refresh, then reset, in one transition) twice, after
 * QUIET_RETRY_MS, behind the same plain surface and spinner a slow page
 * waits with (components/app/app-stage.tsx SlowPage), and once more when the
 * browser comes back online. Only then the screen, whose Try again asks the
 * server again too. A failure in the browser (no digest) is shown at once,
 * as before: asking the server would not change it, and ErrorScreen reloads
 * a tab whose code a deploy replaced.
 */

import { startTransition, useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ErrorScreen } from "@/components/platform/error-screen"
import { PageLanded } from "@/components/app/app-stage"
import { PageSpinner } from "@/components/ui/activity-spinner"
import { tt } from "@/lib/i18n/text"

/** The pauses before each quiet try: two, then the screen. */
export const QUIET_RETRY_MS = [1_200, 3_500] as const
/** Tries are counted per page for this long, so a page that keeps failing reaches the screen instead of a loop. */
const COUNT_FOR_MS = 60_000
const tries = new Map<string, { n: number; at: number }>()

function triesFor(path: string): number {
  const t = tries.get(path)
  if (!t || Date.now() - t.at > COUNT_FOR_MS) return 0
  return t.n
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const path = usePathname() || "/app"
  /* A server's failure, while there are quiet tries left for this page. */
  const quiet = !!error.digest && triesFor(path) < QUIET_RETRY_MS.length
  const [waiting, setWaiting] = useState(quiet)
  const gone = useRef(false)

  /* Asks the server for the page again, and draws what it answers. */
  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }, [router, reset])

  useEffect(() => {
    gone.current = false
    if (!quiet) return
    const n = triesFor(path)
    const go = () => {
      if (gone.current) return
      tries.set(path, { n: n + 1, at: Date.now() })
      retry()
    }
    /* Offline: the try waits for the connection, then goes at once. */
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const back = () => go()
      window.addEventListener("online", back, { once: true })
      /* Still offline after both pauses: the screen. */
      const giveUp = window.setTimeout(() => !gone.current && setWaiting(false), QUIET_RETRY_MS[0] + QUIET_RETRY_MS[1])
      return () => {
        gone.current = true
        window.removeEventListener("online", back)
        window.clearTimeout(giveUp)
      }
    }
    const t = window.setTimeout(go, QUIET_RETRY_MS[n] ?? QUIET_RETRY_MS[QUIET_RETRY_MS.length - 1])
    return () => {
      gone.current = true
      window.clearTimeout(t)
    }
  }, [quiet, path, retry])

  /* A page that came back clears its count: the next failure gets its quiet tries again. */
  useEffect(() => () => {
    if (!waiting) tries.delete(path)
  }, [waiting, path])

  /* A page that threw is still where the navigation ended: the slow page's
     spinner goes (components/app/app-stage.tsx PageLanded). */
  if (waiting) {
    return (
      <>
        <PageLanded />
        <div data-app-quiet-retry="" aria-busy="true" className="h-full min-h-[60vh] bg-[#f8f9fa]">
          <PageSpinner />
        </div>
      </>
    )
  }
  return (
    <>
      <PageLanded />
      <ErrorScreen error={error} reset={retry} home="/app" homeLabel={tt("Back to dashboard")} />
    </>
  )
}
