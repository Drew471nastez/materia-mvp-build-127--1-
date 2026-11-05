import { notFound } from "next/navigation"
import { PlacePage } from "@/components/community/member/place-page"

/**
 * /community/<slug>/space/<space>: one space's feed (the feed's one slot, arriving on this space) or, for a chat space, its
 * chat. Only spaces this member may see; any other address is a 404. On a phone the address becomes the home address with
 * ?space=<space> in place (place-host.tsx PlaceSeed, replaceState), never by loading the page again. Round 15: seeds the shell.
 */
export default async function CommunitySpacePage({ params }: { params: Promise<{ slug: string; space: string }> }) {
  const { slug, space } = await params
  let name = space
  try {
    name = decodeURIComponent(space)
  } catch {
    notFound()
  }
  return <PlacePage slug={slug} place={{ kind: "space", slug: name.toLowerCase() }} />
}
