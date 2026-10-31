import { Suspense } from "react"
import type { Metadata } from "next"
import { authPageMetadata } from "@/lib/seo/private-metadata"
import VerifyEmailContent from "./verify-email-content"

/* Not indexed, links followed, no canonical (lib/seo/private-metadata.ts). */
export const metadata: Metadata = authPageMetadata("Verify your email", "Confirm the email address of your Storelib account.")

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}
