import type React from "react"
import { serverDelay } from "../../fix/delay"
import { AccountFix } from "../../fix/account-fix"
export const dynamic = "force-dynamic"
export default async function A({ children }: { children: React.ReactNode }) {
  await serverDelay("account", 700)
  const identity = { userId: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, bio: "Wheel thrower, weekends only.", coverUrl: "/cover.webp", followers: 12, following: 30, creator: false }
  return <AccountFix identity={identity}>{children}</AccountFix>
}
