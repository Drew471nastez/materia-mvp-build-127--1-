import { redirect } from "next/navigation"

/**
 * The old per creator community feed, from before Storelib Communities.
 * Every community a person belongs to is in their library now.
 */
export default function LegacyCreatorCommunityPage() {
  redirect("/library/communities")
}
