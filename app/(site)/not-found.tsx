import type { Metadata } from "next"
import { NOT_FOUND_METADATA } from "@/lib/seo/not-found-metadata"
import { SiteNotFound } from "@/components/website-builder/site-not-found"
import { PlainSiteNotFound } from "@/components/website-builder/plain-site-not-found"

/**
 * A PAGE OF A WEBSITE THAT IS NOT THERE, inside the website's own document
 * (app/(site)/layout.tsx is a root layout, round 52). The same answer the
 * shared 404 gave a creator's address before (app/(storelib)/not-found.tsx):
 * the 404 page the creator arranged, inside their own header and footer,
 * with the plain page below when it cannot be drawn. Reads nothing from the
 * request, so the pages above it stay static.
 */
export const metadata: Metadata = NOT_FOUND_METADATA

export default function SiteNotFoundBoundary() {
  return <SiteNotFound fallback={<PlainSiteNotFound />} />
}
