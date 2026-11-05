"use client"

/**
 * The boundary at the top of the websites' own root (app/(site)/layout.tsx,
 * round 52), as app/(storelib)/error.tsx is for Storelib's pages: a page of
 * this root with no closer boundary (a theme preview, a cover render) shows
 * the same screen it did under the shared root. A website's pages have their
 * own, nearer one (w/[username]/error.tsx).
 */
import { ErrorScreen } from "@/components/platform/error-screen"

export default function SiteRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} />
}
