import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { communitiesEnabled } from "@/lib/communities/flag"
import { accountCommunitiesBody } from "@/components/account/account-communities-body"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Communities" }

/**
 * /account/communities: the Communities pill of your profile. Every
 * community you run or are in, and the ones you have asked to join
 * (components/account/account-communities-body.tsx, the list /account
 * draws for a creator too). It used to be a tab of the library
 * (/library/communities, which now answers with this address). A 404 with
 * communities switched off, like every community address.
 */
export default async function AccountCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser(accountLoginPath("/account/communities"))
  if (!user) return null
  return await accountCommunitiesBody(user.id)
}
