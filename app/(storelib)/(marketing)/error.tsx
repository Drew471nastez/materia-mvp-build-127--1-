"use client"

/**
 * The marketing pages' boundary: home, pricing, features, the blog, a
 * creator's page and product, /p/<slug>, Explore and the community index
 * all render inside app/(marketing)/layout.tsx. Without this file a throw in
 * any of them went to the root boundary, which replaces the layout too: the
 * header and the buyer tab bar went with the page. Here they stay, the
 * middle says what happened, Try again re-renders this page alone, and
 * ErrorScreen reports the failure with its digest (/api/client-errors), the
 * same digest the server logged in onRequestError (instrumentation.ts).
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} />
}
