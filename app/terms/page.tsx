import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { TERMS_TOC, TermsBody } from "@/components/legal/terms-body"
import { legalMetadata } from "@/lib/seo/page-metadata"

/* The whole set, so its card and og:url are its own and not the home page's (lib/seo/page-metadata). */
export const metadata: Metadata = legalMetadata("terms")

/* The text is components/legal/terms-body, shared with the sheet a OnePage opens; the layout is components/legal/legal-page. */
export default function TermsOfServicePage() {
  return (
    <LegalPage kind="terms" toc={TERMS_TOC}>
      <TermsBody />
    </LegalPage>
  )
}
