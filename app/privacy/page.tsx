import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { PRIVACY_TOC, PrivacyBody } from "@/components/legal/privacy-body"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Storelib Inc. collects, why, who it is shared with, how long it is kept and the choices you have.",
  alternates: { canonical: "/privacy" },
}

/* The text is components/legal/privacy-body, shared with the sheet a OnePage opens; the layout is components/legal/legal-page. */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage kind="privacy" toc={PRIVACY_TOC}>
      <PrivacyBody />
    </LegalPage>
  )
}
