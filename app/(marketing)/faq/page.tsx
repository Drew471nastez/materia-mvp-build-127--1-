import { Metadata } from "next"
import { FaqPageClient } from "@/components/marketing/faq-page-client"

export const metadata: Metadata = {
  title: "FAQ | Storelib",
  description: "Frequently asked questions about Storelib. Learn about getting started, selling, payments, pricing, customization, and more.",
  openGraph: {
    title: "FAQ | Storelib",
    description: "Frequently asked questions about Storelib. Learn about getting started, selling, payments, pricing, customization, and more.",
    type: "website",
    url: "/faq",
    siteName: "Storelib",
  },
  alternates: {
    canonical: "/faq",
  },
}

export default function FaqPage() {
  return <FaqPageClient />
}
