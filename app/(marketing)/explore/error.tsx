"use client"

import Link from "next/link"

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Explore</h1>
        <p className="mt-2 text-muted-foreground">Discover creators and their products</p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground mb-4">
          Something went wrong while loading the explore page.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <Link href="/" className="text-primary hover:underline">
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
