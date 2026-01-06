import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold text-neutral-900">Authentication Error</h1>
        <p className="mb-6 text-neutral-600">
          There was a problem signing you in. This could be because the authentication link expired or was already used.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
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
