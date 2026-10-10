import type React from "react"
import { serverDelay } from "../../../../fix/delay"
import { CommunityFix } from "../../../../fix/community-fix"
export const dynamic = "force-dynamic"
export default async function L({ children }: { children: React.ReactNode }) {
  await serverDelay("community", 300)
  return <CommunityFix>{children}</CommunityFix>
}
