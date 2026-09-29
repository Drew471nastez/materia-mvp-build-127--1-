"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

export function MemberFollowButton({
  targetUserId,
  initialFollowing,
  signedIn,
}: {
  targetUserId: string
  initialFollowing: boolean
  signedIn: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/member/follow", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId }),
      })
      const data = (await res.json()) as { following?: boolean }
      if (res.ok && typeof data.following === "boolean") setFollowing(data.following)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      data-member-follow=""
      className={cn(
        secondaryDepth,
        "h-10 min-w-[120px] rounded-xl px-5 text-[14px] font-medium",
        following && "border-[#d5d9e0] bg-[#eceef1]",
      )}
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
