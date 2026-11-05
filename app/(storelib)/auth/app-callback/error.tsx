"use client"

/**
 * Error boundary for the /auth/app-callback bridge page.
 *
 * If the bridge page crashes for any reason, this shows a helpful message
 * with a retry button and a link back to login — instead of the generic
 * Next.js "Application error" page that gives zero debugging info.
 */
export default function AppCallbackError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-neutral-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {error.message || "An unexpected error occurred during sign-in."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-neutral-400 font-mono">
            {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 items-center">
          <button
            onClick={reset}
            className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Try again
          </button>
          <a
            href="/login"
            className="text-sm text-neutral-500 underline hover:text-neutral-700"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
