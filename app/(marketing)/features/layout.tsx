import type React from "react"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibApplicationJsonLd, storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"

/*
  /features is a client page, which cannot export metadata, so it carried
  none: the home page's title, no canonical and the home page's og:url. Its
  own are set here, in a layout that holds nothing else.
*/
export const metadata: Metadata = pageMetadata({
  path: "/features",
  title: "Features",
  description: "What Storelib does for a creator: storefronts, Stripe payments, automatic file delivery, sales analytics, your own domain and AI help writing product pages.",
})

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The product and where this page sits (lib/seo/structured-data.ts): the page is a client one, so it is printed here. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibApplicationJsonLd(), storelibBreadcrumbJsonLd([{ name: "Features", path: "/features" }]))) }} />
      {children}
    </>
  )
}
