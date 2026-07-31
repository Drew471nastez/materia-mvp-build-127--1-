import type { Metadata } from "next"
import { NewListingForm } from "@/components/sell/new-listing-form"

// Deliberately at /products/new, NOT under /app. The old flow lived in the
// seller dashboard and was built for digital products; selling a jumper isn't a
// dashboard task, it's part of the marketplace. This route sits in the marketing
// group so it inherits the site header — and the footer is suppressed for it
// (see ConditionalFooter), because a long form shouldn't end in a sitemap.
export const metadata: Metadata = {
  title: "Listează un articol | Storelib",
  robots: { index: false, follow: false },
}

export default function NewListingPage() {
  // The canvas colour lives here, on a min-height box, rather than on the form.
  // The form used to force min-h-screen itself, which on a short listing left a
  // slab of empty grey under the last card.
  return (
    <div className="min-h-[calc(100svh-56px)] bg-[#f6f6f7]">
      <NewListingForm />
    </div>
  )
}
