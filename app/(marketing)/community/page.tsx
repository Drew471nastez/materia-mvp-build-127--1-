import { notFound, redirect } from "next/navigation"

import { communitiesEnabled } from "@/lib/communities/flag"

/**
 * /community on its own is not a page: communities are found on Explore.
 * With communities switched off there is nothing to find, so it is a 404,
 * like every other community address.
 */
export const dynamic = "force-dynamic"

export default async function CommunityIndexPage() {
  if (!(await communitiesEnabled())) notFound()
  redirect("/explore/communities")
}
