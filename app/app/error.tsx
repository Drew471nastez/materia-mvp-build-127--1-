"use client"

/**
 * The dashboard's own boundary.
 *
 * Scoped to /app so a failure on one screen keeps the person inside the
 * product: the way out offered here is the dashboard, not the marketing
 * site, because somebody whose orders page threw wants their orders, not the
 * front page.
 */

import { ErrorScreen } from "@/components/platform/error-screen"
import { PageLanded } from "@/components/app/app-stage"
import { tt } from "@/lib/i18n/text"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  /* A page that threw is still where the navigation ended: the slow page's
     spinner goes (components/app/app-stage.tsx PageLanded). */
  return (
    <>
      <PageLanded />
      <ErrorScreen error={error} reset={reset} home="/app" homeLabel={tt("Back to dashboard")} />
    </>
  )
}
