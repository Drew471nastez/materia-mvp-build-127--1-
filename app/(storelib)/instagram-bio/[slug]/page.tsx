import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isResolvableOnePageName } from "@/lib/onepage/username"
import { findPublishedOnePage, onePageAddress, onePageOwner } from "@/lib/onepage/published-page"
import { InstagramBioPage } from "@/components/onepage/instagram-bio-page"

/**
 * /instagram-bio/<page name> (round AR, lib/onepage/instagram-bio): the
 * steps for putting a OnePage in an Instagram bio, opened on the creator's
 * phone from the QR code in Share. Public and read only: the address it
 * shows is the published page's own public address, worked out here from
 * the page (onePageAddress), never taken from the request. A name with no
 * published page, or a banned owner's, is a 404. Never indexed, and the
 * address is not sent on as a Referer.
 */
export const metadata: Metadata = {
  title: "Add your page to your Instagram bio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function InstagramBioRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isResolvableOnePageName(slug)) notFound()
  const onepage = await findPublishedOnePage(slug)
  if (!onepage) notFound()
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  if (owner.banned) notFound()
  const url = await onePageAddress(onepage, owner, onepage.slug || slug)
  const name = (typeof onepage.title === "string" && onepage.title.trim()) || owner.displayName || slug
  return <InstagramBioPage url={url} name={name} />
}
