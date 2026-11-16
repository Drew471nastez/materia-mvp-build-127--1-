import { Metadata } from "next"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"
import { faqTopics, SUPPORT_EMAIL } from "@/lib/marketing/faq-page"
import { publicHelpUrl } from "@/lib/help/paths"

/* The whole set (lib/seo/page-metadata): its Open Graph had no image, and a page's openGraph replaces the layout's. */
export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "FAQ",
  description: "Answers about Storelib: getting started, selling, fees and payouts, the Free, Grow and Pro plans, your website, Explore and your account.",
})

export default function FaqPage() {
  /* Landing round 13: the questions are read from the plan, fee and storage tables on the server (lib/marketing/faq-page), so every answer is the code's own number. */
  return (
    <>
      {/* Breadcrumbs only: no FAQPage markup, which Google no longer shows for a site like this one. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibBreadcrumbJsonLd([{ name: "FAQ", path: "/faq" }]))) }} />
      <FaqPageClient topics={faqTopics()} supportEmail={SUPPORT_EMAIL} helpUrl={publicHelpUrl()} />
    </>
  )
}
