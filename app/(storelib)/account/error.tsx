"use client"

/**
 * /account's own boundary, inside its layout. Without it a throw anywhere on
 * the profile, the library or settings went to the root boundary, which
 * replaces the whole shell: the header and the tab bar went with the page,
 * and the only way on was the browser's Back. Here the frame stays, the tab
 * bar still works, and Try again re-renders this page alone.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/account" homeLabel="Back to profile" />
}
