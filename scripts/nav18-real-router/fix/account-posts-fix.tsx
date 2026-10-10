"use client"
import { AccountPosts } from "@/components/account/account-posts"
const c = { id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", name: "Clay Studio", logoUrl: null }
const posts = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: `My post number ${i + 1}`, excerpt: "Slower drying under plastic for two days made the difference.", space: "General", at: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(), reactions: i, comments: i % 3, href: `/community/clay-studio/post/p${i}`, imageUrl: null, community: c, canEdit: true, canDelete: true }))
export function AccountPostsFix() {
  return <AccountPosts initial={{ posts, next: "c1" } as never} now={Date.now()} />
}
