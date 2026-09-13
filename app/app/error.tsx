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

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/app" homeLabel="Back to dashboard" />
}
