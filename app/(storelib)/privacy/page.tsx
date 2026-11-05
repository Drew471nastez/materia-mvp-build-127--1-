import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { PRIVACY_TOC, PrivacyBody } from "@/components/legal/privacy-body"
import { legalMetadata } from "@/lib/seo/page-metadata"

/* The whole set, so its card and og:url are its own and not the home page's (lib/seo/page-metadata). */
export const metadata: Metadata = legalMetadata("privacy")

/* The text is components/legal/privacy-body, shared with the sheet a OnePage opens; the layout is components/legal/legal-page. */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage kind="privacy" toc={PRIVACY_TOC}>
      <PrivacyBody />
    </LegalPage>
  )
}
