"use client"

/**
 * The root segment boundary: every route that does not bring its own.
 *
 * Before this file existed, a throw anywhere in the product that was not
 * /explore or one auth callback went all the way to Next's default, which is
 * the sentence "Application error: a client-side exception has occurred" on
 * an otherwise empty page. Every route degrades to something readable now,
 * and `reset` re-renders the segment without a full page load, so a
 * transient failure costs a click rather than a navigation.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} />
}
