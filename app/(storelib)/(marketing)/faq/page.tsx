import { Metadata } from "next"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"
import { faqTopics, SUPPORT_EMAIL } from "@/lib/marketing/faq-page"
import { publicHelpUrl } from "@/lib/help/paths"
import { alternativesFlags } from "@/lib/alternatives/flags"

/* The whole set (lib/seo/page-metadata): its Open Graph had no image, and a page's openGraph replaces the layout's. */
export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "FAQ",
  description: "Answers about Storelib: selling, fees, payouts, refunds and tax, the Free, Grow and Pro plans, your website and domain, email, analytics, your team and your account.",
})

/* Round 14: an answer about communities, physical products or Explore is only given while its switch is on (lib/alternatives/flags), so the page is rebuilt hourly like /features. A build with no database draws the switches off and the first rebuild corrects it. */
export const revalidate = 3600

export default async function FaqPage() {
  const flags = await alternativesFlags()
  /* Landing round 13: the questions are read from the plan, fee and storage tables on the server (lib/marketing/faq-page), so every answer is the code's own number. */
  return (
    <>
      {/* Breadcrumbs only: no FAQPage markup, which Google no longer shows for a site like this one. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibBreadcrumbJsonLd([{ name: "FAQ", path: "/faq" }]))) }} />
      <FaqPageClient topics={faqTopics(flags)} supportEmail={SUPPORT_EMAIL} helpUrl={publicHelpUrl()} />
    </>
  )
}
