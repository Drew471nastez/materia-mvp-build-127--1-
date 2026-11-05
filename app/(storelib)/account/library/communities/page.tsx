import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { communitiesEnabled } from "@/lib/communities/flag"
import { accountCommunitiesBody } from "@/components/account/account-communities-body"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Communities | Library" }

/**
 * /account/library/communities: the library's Communities pill. The same
 * list the profile's own Communities pill draws (components/account/
 * account-communities-body.tsx), so the two never drift apart: every
 * community you run or are in, and the ones you have asked to join. A 404
 * with communities switched off, like every community address, and the
 * pill is not drawn then (app/account/library/layout.tsx).
 */
export default async function LibraryCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  return await accountCommunitiesBody(user.id)
}
