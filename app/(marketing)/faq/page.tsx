import { Metadata } from "next"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { pageMetadata } from "@/lib/seo/page-metadata"

/* The whole set (lib/seo/page-metadata): its Open Graph had no image, and a page's openGraph replaces the layout's. */
export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "FAQ",
  description: "Frequently asked questions about Storelib. Learn about getting started, selling, payments, pricing, customization, and more.",
})

export default function FaqPage() {
  return <FaqPageClient />
}
