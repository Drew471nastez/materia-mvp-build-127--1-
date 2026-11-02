"use client"

/**
 * The AI website editor (outside /app, full screen). A throw here used to go
 * to the root boundary with "Go to Storelib" as the way out; the way back is
 * the list of websites in the dashboard. ErrorScreen reports the failure with
 * its digest.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function SiteEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/app/sites" homeLabel="Back to my websites" />
}
