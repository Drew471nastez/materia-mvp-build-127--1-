"use client"

/**
 * The website builder's boundary.
 *
 * This is the riskiest surface in the product: the canvas renders a
 * creator's own sections, from a creator's own theme files, with a creator's
 * own settings in them, and any one of those can be shaped in a way a
 * renderer did not expect. A throw here used to blank the editor with unsaved
 * work in it.
 *
 * The way out is the builder's own list, so a section that cannot render
 * does not cost somebody the rest of their websites.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function BuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/app/website-builder" homeLabel="Back to my websites" />
}
