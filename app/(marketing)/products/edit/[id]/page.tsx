import type { Metadata } from "next"
import { NewListingForm } from "@/components/sell/new-listing-form"

/**
 * The non-intercepted half of the edit screen.
 *
 * An interception only fires on a client navigation from inside this layout. A
 * shared link, a reload, a cold app launch straight into /products/edit/<id>, or
 * a push from outside the group all render THIS one, full-page — exactly as
 * `products/new/page.tsx` stands behind the sell sheet. Both must work, and both
 * render the same component so they cannot drift.
 *
 * `noindex` for the obvious reason: it is a form for one person, about one row
 * they own, and the server refuses it to anybody else.
 */
export const metadata: Metadata = {
  title: "Editează anunțul | Storelib",
  robots: { index: false, follow: false },
}

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // The canvas colour and the minimum height are DESKTOP only, for the same
  // reason they are on the new-listing page: on a phone the form is a
  // `fixed inset-0` sheet that owns the whole screen, so a box behind it can
  // only ever be invisible or a strip of grey showing past its edge.
  return (
    <div className="md:min-h-[calc(100svh-56px)] md:bg-[#f6f6f7]">
      <NewListingForm editId={id} />
    </div>
  )
}
