import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibApplicationJsonLd, storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"
import { PricingPageClient } from "./pricing-client"
import { CompareStrip } from "@/components/alternatives/compare-strip"

/* Its own title, canonical and card: with none, /pricing was the home page's title and og:url. */
export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing",
  description: "Three plans. Free has no monthly fee and a 5% + $0.25 fee per sale. Pro is $29 a month and lowers the fee to 3% + $0.25, with your own domain and no Storelib branding. Scale is $99 a month, with the most websites, storage and AI edits.",
})

/*
  THE SAME PAGE FOR EVERY VISITOR, SO IT IS BUILT ONCE AND SERVED FROM THE
  CDN (the owner: marketing pages served from the CDN). It read the session
  and the query string on the server, and either one alone made /pricing a
  function call for every visitor. Both are read in the browser now
  (pricing-client): who is signed in from the header's record of the
  session, and ?source=upgrade&returnTo from the address. Neither changes
  the first paint: the plan's button keeps its label either way, and the
  heading the upgrade mode renames is still hidden at that moment, waiting
  for its scroll-in.
*/
export default function PricingPage() {
  return (
    <>
      {/* The product with its plans as Offers, priced from lib/billing/plans.ts, and where this page sits (lib/seo/structured-data.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibApplicationJsonLd(), storelibBreadcrumbJsonLd([{ name: "Pricing", path: "/pricing" }]))) }} />
      <PricingPageClient compare={<CompareStrip />} />
    </>
  )
}
