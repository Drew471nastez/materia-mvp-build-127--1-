import { Metadata } from "next"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"

/* The whole set (lib/seo/page-metadata): its Open Graph had no image, and a page's openGraph replaces the layout's. */
export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "FAQ",
  description: "Frequently asked questions about Storelib. Learn about getting started, selling, payments, pricing, customization, and more.",
})

export default function FaqPage() {
  return (
    <>
      {/* Breadcrumbs only: no FAQPage markup, which Google no longer shows for a site like this one. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibBreadcrumbJsonLd([{ name: "FAQ", path: "/faq" }]))) }} />
      <FaqPageClient />
    </>
  )
}
