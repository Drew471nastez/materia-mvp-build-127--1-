"use client"

/**
 * Sign in, sign up, reset password and onboarding. A throw here keeps the
 * auth layout, and the way back is the sign in page rather than the front
 * page: somebody on these screens is trying to get into their account.
 * ErrorScreen reports the failure with its digest.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} home="/login" homeLabel="Back to sign in" />
}
