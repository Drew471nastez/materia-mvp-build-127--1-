"use client"

/*
  Reports itself with its digest, the way ErrorScreen does (r48-obs): this
  boundary drew its own look and told nobody, so a broken Explore was a
  screenshot in a message rather than a row in Admin, Health, Errors.
*/
import { useEffect } from "react"
import Link from "next/link"
import { buildReport } from "@/lib/client-errors"

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    try {
      void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildReport(error, window.location.href)), keepalive: true }).catch(() => {})
    } catch {
      /* A report is never worth breaking the screen over. */
    }
  }, [error])
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
