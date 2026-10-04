"use client"

/**
 * ===========================================================================
 *  FOLLOW, ON ANY PROFILE AND ON A CREATOR'S PAGE
 * ===========================================================================
 * One button for following a person, wherever a person is shown: a buyer's
 * profile, a creator's profile, a creator's page, a follower list. It says
 * what will happen (Follow) or what is true (Following, with a check), and
 * a pointer over Following, or a finger pressing it, says what a press will
 * do: Unfollow. It changes the moment it is pressed and goes back if the
 * server refuses, and the server is POST /api/follow, which takes the
 * follower from the session.
 *
 * Signed out, the press goes to sign in and comes back here.
 *
 * THE LOOK FOLLOWS THE PAGE. On Storelib's own pages ("platform") Follow is
 * the near black primary and Following the white secondary, the pair the
 * rest of the app uses. On a creator's page ("storefront") Follow is drawn
 * in the creator's own button colours, the scheme they picked in the page
 * editor (lib/store-builder/storefront-chrome.ts `action`), and Following
 * settles back to a hairline in the page's text colour (currentColor).
 *
 * NO UNFOLLOW UNDER A POINTER THAT JUST FOLLOWED. The pointer that pressed
 * Follow is still over the button, so it would at once offer to undo what
 * it just did. "Unfollow" only shows again once the pointer has left.
 */
import { useState } from "react"
import { Check } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

export type FollowTone = "platform" | "storefront"

/** A page's primary button colours: the creator's scheme, resolved on the server. */
export interface ActionScheme {
  background: string
  text: string
  /** The scheme's button rounding in px. */
  radius?: number | null
}

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
    /* Optimistic: the button and the count change on the press, and both go back if the server says no. */
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

/** The inline style of a storefront Follow: the scheme's own fill, text and rounding. */
export function schemeFill(scheme: ActionScheme | null | undefined, following: boolean): React.CSSProperties | undefined {
  if (!scheme) return undefined
  const radius = typeof scheme.radius === "number" && scheme.radius >= 0 ? { borderRadius: `${Math.min(scheme.radius, 999)}px` } : {}
  if (following) return radius
  return { ...radius, backgroundColor: scheme.background, color: scheme.text, borderColor: scheme.background }
}

export function FollowButton({
  following,
  busy,
  onClick,
  tone = "platform",
  scheme,
  size = "md",
  name,
  className,
}: {
  following: boolean
  busy?: boolean
  onClick: () => void
  tone?: FollowTone
  /** On a creator's page: their scheme's button colours. Without one, the page's text colour draws it. */
  scheme?: ActionScheme | null
  size?: "sm" | "md"
  /** Who, for a screen reader: "Follow Ana". */
  name?: string
  className?: string
}) {
  /* Set by a Follow press, cleared when the pointer leaves: see NO UNFOLLOW UNDER A POINTER THAT JUST FOLLOWED. */
  const [fresh, setFresh] = useState(false)
  const box = size === "sm" ? "h-9 min-w-[104px] rounded-[10px] px-3.5 text-[13px]" : "h-10 min-w-[128px] rounded-xl px-5 text-[14px]"
  const storefront = tone === "storefront"
  const look = storefront
    ? cn(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap border font-semibold outline-none transition-[background-color,border-color,color,filter] duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current [-webkit-tap-highlight-color:transparent]",
        following
          ? "border-current/30 bg-transparent hover:border-current/50 hover:bg-current/[0.05]"
          : scheme
            ? "hover:brightness-[0.94] active:brightness-[0.88]"
            : "border-[1.5px] border-current bg-transparent hover:bg-current/[0.06]",
      )
    : following
      ? cn(secondaryDepth, "hover:text-[#b42318] active:text-[#b42318]")
      : primaryDepth
  const unfollowable = following && !fresh
  return (
    <button
      type="button"
      onClick={() => {
        if (!following) setFresh(true)
        onClick()
      }}
      onPointerLeave={() => setFresh(false)}
      onBlur={() => setFresh(false)}
      aria-pressed={following}
      aria-label={name ? `${following ? "Following" : "Follow"} ${name}` : undefined}
      aria-busy={busy || undefined}
      data-follow-button={following ? "following" : "follow"}
      data-follow-tone={storefront ? (scheme ? "scheme" : "storefront") : "platform"}
      className={cn("group/follow", look, box, className)}
      style={storefront ? schemeFill(scheme, following) : undefined}
    >
      {following ? (
        /* Following and Unfollow share one cell, so the button never changes width between them. */
        <span className="grid place-items-center">
          <span
            className={cn("col-start-1 row-start-1 inline-flex items-center gap-1.5", unfollowable && "group-hover/follow:invisible group-active/follow:invisible")}
            data-follow-label="following"
          >
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Following
          </span>
          <span
            aria-hidden
            className={cn("invisible col-start-1 row-start-1", unfollowable && "group-hover/follow:visible group-active/follow:visible")}
            data-follow-label="unfollow"
          >
            Unfollow
          </span>
        </span>
      ) : (
        <span data-follow-label="follow">Follow</span>
      )}
    </button>
  )
}
