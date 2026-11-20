import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { REFUND_TOC, RefundBody } from "@/components/legal/refund-body"
import { legalMetadata } from "@/lib/seo/page-metadata"

/* Its own card and og:url, like /terms and /privacy (lib/seo/page-metadata). */
export const metadata: Metadata = legalMetadata("refunds")

/*
  STORELIB'S REFUND POLICY. The checkout's "I agree to the Terms and
  Conditions and the Refund policy" linked here before there was a page. The
  text is components/legal/refund-body, shared with the sheet a OnePage opens;
  the layout is components/legal/legal-page.
*/
export default function RefundPolicyPage() {
  return (
    <LegalPage kind="refunds" toc={REFUND_TOC}>
      <RefundBody />
    </LegalPage>
  )
}
