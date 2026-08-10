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

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const { draft } = await searchParams
  // The canvas colour and the minimum height are for DESKTOP only now. On a
  // phone the form is a `fixed inset-0` sheet, so it owns the whole screen and
  // a box behind it can only be one of two things: invisible, or — if the
  // numbers ever disagree — a strip of grey showing past the sheet's edge.
  // `md:` on both, so there is nothing behind the sheet at all.
  return (
    <div className="md:min-h-[calc(100svh-56px)] md:bg-[#f6f6f7]">
      <NewListingForm draftId={draft ?? null} />
    </div>
  )
}
