"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="mb-4 text-2xl font-bold text-neutral-900">Authentication Error</h1>
        <p className="mb-4 text-neutral-600">
          There was a problem signing you in. This could be because:
        </p>
        <ul className="mb-6 text-left text-sm text-neutral-500 space-y-2">
          <li>• The authentication link expired or was already used</li>
          <li>• You cancelled the sign in process</li>
          <li>• There was a problem with Google authentication</li>
        </ul>
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-100 p-4">
            <p className="text-sm text-red-700 font-medium">Error details:</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-neutral-900 hover:bg-neutral-800">
            <Link href="/login">Try Again</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuthErrorFallback() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
        <p className="mt-4 text-neutral-500">Loading...</p>
      </div>
    </div>
  )
}

export default function AuthCodeErrorPage() {
  return (
    <Suspense fallback={<AuthErrorFallback />}>
      <AuthErrorContent />
    </Suspense>
  )
}
