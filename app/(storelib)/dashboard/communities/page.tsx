import { redirect } from "next/navigation"

/**
 * The old buyer list of creator communities. Communities a person belongs to
 * are in their library now (/library/communities).
 */
export default function LegacyCommunitiesPage() {
  redirect("/account/communities")
}
