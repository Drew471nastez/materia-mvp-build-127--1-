"use client"

/**
 * The admin's boundary: a page of the admin that throws offers the admin's
 * front page, not the marketing site. ErrorScreen reports the failure with
 * its digest; the server's own line is in error_events (Admin, Health).
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/admin" homeLabel="Back to admin" />
}
