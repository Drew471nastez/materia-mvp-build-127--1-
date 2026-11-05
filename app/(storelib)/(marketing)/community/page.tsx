import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { communitiesEnabled } from "@/lib/communities/flag"

/**
 * /community on its own is not a page: communities are found on Explore.
 * With communities switched off there is nothing to find, so it is a 404,
 * like every other community address. Read per request (connection()), so
 * the switch is never baked into a build; it only ever redirects, so there
 * is no loading screen to show.
 */
export default async function CommunityIndexPage() {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  redirect("/explore?type=communities")
}
