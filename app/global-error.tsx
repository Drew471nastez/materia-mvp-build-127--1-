"use client"

/**
 * ===========================================================================
 *  THE LAST THING BETWEEN A THROW AND A BLANK PAGE
 * ===========================================================================
 * global-error replaces the ROOT LAYOUT, so it is the only boundary that
 * survives a failure in the layout itself: providers, fonts, the header, the
 * things every page mounts before it renders anything of its own. Nothing
 * catches what this does not.
 *
 * Because it stands in for the root layout it must render <html> and <body>
 * itself. That is also why it cannot rely on the app's CSS: this is the case
 * where the stylesheet may be exactly what failed.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  )
}
