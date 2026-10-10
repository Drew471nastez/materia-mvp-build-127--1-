import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { myPostsPage } from "@/lib/communities/server/member-profile"
import { AccountPosts } from "@/components/account/account-posts"
import { ACCOUNT_POSTS } from "@/lib/profile/owner-pills"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Posts" }

/**
 * /account/posts: the Posts pill of your profile (round 16). Everything you
 * posted in the communities you are in, newest first, with Edit and Delete
 * where you may (components/account/account-posts.tsx). The first page is
 * read here with the page, by round 15's loader (myPostsPage: your
 * communities, the spaces you may still see in them, one keyset query); the
 * next pages come from /api/account/posts as the list is read. A 404 with
 * communities switched off, like every community address.
 */
export default async function AccountPostsPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser(accountLoginPath(ACCOUNT_POSTS))
  if (!user) return null
  const first = await myPostsPage(admin(), user.id, null).catch(() => ({ posts: [], next: null }))
  return <AccountPosts initial={first} now={Date.now()} />
}
