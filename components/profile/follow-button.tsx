"use client"

/**
 * ===========================================================================
 *  FOLLOW, ON ANY PROFILE AND ON A CREATOR'S PAGE
 * ===========================================================================
 * One button for following a person, wherever a person is shown: a buyer's
 * profile, a creator's profile, a creator's page, a follower list. It says
 * what will happen (Follow) or what is true (Following), changes the moment
 * it is pressed and goes back if the server refuses, and the server is
 * POST /api/follow, which takes the follower from the session.
 *
 * Signed out, the press goes to sign in and comes back here.
 *
 * TWO LOOKS. On Storelib's own pages ("platform") Follow is the near black
 * primary and Following the white secondary, the pair the rest of the app
 * uses. On a creator's page ("storefront") the page is painted in the
 * creator's scheme, possibly dark, so the button is drawn in the page's own
 * text colour (currentColor): a full strength outline, and a hairline with
 * a light wash of that colour once followed.
 */
import { useState } from "react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

export type FollowTone = "platform" | "storefront"

export function useFollow(input: { targetUserId: string; initialFollowing: boolean; signedIn: boolean; onFollowers?: (n: number) => void; onChange?: (following: boolean) => void }) {
  const [following, setFollowing] = useState(input.initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (!input.signedIn) {
      const back = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"
      window.location.assign(`/login?next=${encodeURIComponent(back)}`)
      return
    }
    if (busy) return
    const next = !following
    setBusy(true)
    setError(null)
    setFollowing(next)
    input.onChange?.(next)
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: input.targetUserId, follow: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { following?: boolean; followers?: number; error?: string }
      if (!res.ok || typeof data.following !== "boolean") throw new Error(data.error || "That did not go through. Try again.")
      setFollowing(data.following)
      if (typeof data.followers === "number") input.onFollowers?.(data.followers)
    } catch (e) {
      setFollowing(!next)
      input.onChange?.(!next)
      setError(e instanceof Error ? e.message : "That did not go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return { following, busy, error, toggle }
}

export function FollowButton({
  following,
  busy,
  onClick,
  tone = "platform",
  size = "md",
  name,
  className,
}: {
  following: boolean
  busy?: boolean
  onClick: () => void
  tone?: FollowTone
  size?: "sm" | "md"
  /** Who, for a screen reader: "Follow Ana". */
  name?: string
  className?: string
}) {
  const box = size === "sm" ? "h-9 min-w-[96px] rounded-[10px] px-3.5 text-[13px]" : "h-10 min-w-[120px] rounded-xl px-5 text-[14px]"
  const look =
    tone === "storefront"
      ? cn(
          "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap border font-semibold outline-none transition-[background-color,border-color] duration-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current [-webkit-tap-highlight-color:transparent]",
          /* Follow is the line at full strength, the strongest thing in the row; Following settles back to a hairline and a wash. */
          following ? "border-current/30 bg-current/[0.08] hover:border-current/50" : "border-[1.5px] border-current bg-transparent hover:bg-current/[0.06]",
        )
      : following
        ? secondaryDepth
        : primaryDepth
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={following}
      aria-label={name ? `${following ? "Following" : "Follow"} ${name}` : undefined}
      aria-busy={busy || undefined}
      data-follow-button={following ? "following" : "follow"}
      className={cn(look, box, className)}
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
