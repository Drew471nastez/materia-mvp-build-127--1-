import type React from "react"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { FEATURES_DESCRIPTION, FEATURES_PATH, FEATURES_TITLE } from "@/lib/marketing/features-seo"

/*
  /features is Storelib in one page (round 45). Its title, canonical and
  share card are set here, from lib/marketing/features-seo, which the page's
  structured data reads too.
*/
export const metadata: Metadata = pageMetadata({ path: FEATURES_PATH, title: FEATURES_TITLE, description: FEATURES_DESCRIPTION, absolute: true })

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children
}
