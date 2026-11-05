import type React from "react"
import type { Metadata } from "next"
import { PRIVATE_PAGE_METADATA } from "@/lib/seo/private-metadata"

/* One person's step, never a page to index, and no canonical (lib/seo/private-metadata.ts). proxy.ts also sends X-Robots-Tag. */
export const metadata: Metadata = PRIVATE_PAGE_METADATA

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
