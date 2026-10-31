import type React from "react"
import type { Metadata } from "next"
import { authPageMetadata } from "@/lib/seo/private-metadata"

/* A client page, so its title is set here. Not indexed, links followed, no canonical (lib/seo/private-metadata.ts). */
export const metadata: Metadata = authPageMetadata("Choose a new password", "Set a new password for your Storelib account.")

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
