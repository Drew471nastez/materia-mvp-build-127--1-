import type React from "react"
import type { Metadata } from "next"
import { authPageMetadata } from "@/lib/seo/private-metadata"

/* A client page, so its title is set here. Not indexed, links followed, no canonical (lib/seo/private-metadata.ts). */
export const metadata: Metadata = authPageMetadata("Reset your password", "Get an email with a link to reset the password of your Storelib account.")

export default function RequestResetLayout({ children }: { children: React.ReactNode }) {
  return children
}
