import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { TERMS_TOC, TermsBody } from "@/components/legal/terms-body"

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The agreement between you and Storelib Inc. for using storelib.com, the Storelib apps and every store, site and OnePage on them.",
  alternates: { canonical: "/terms" },
}

/* The text is components/legal/terms-body, shared with the sheet a OnePage opens; the layout is components/legal/legal-page. */
export default function TermsOfServicePage() {
  return (
    <LegalPage kind="terms" toc={TERMS_TOC}>
      <TermsBody />
    </LegalPage>
  )
}
