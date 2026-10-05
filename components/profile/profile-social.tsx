"use client"

/**
 * ===========================================================================
 *  THE COUNTS AND THE BUTTONS UNDER A PERSON'S NAME
 * ===========================================================================
 * One quiet line, "12 followers · 30 following", then Follow / Following
 * for somebody else. Your own profile has no Follow; it has the owner's
 * pills instead (the page).
 *
 * ONLY FOLLOW. The owner: "remove the Message button on profiles and creator
 * pages for now: only Follow". So there is no second button and no address
 * for one; a conversation still starts inside a community the two share.
 *
 * THE COUNTS ARE A LINE, NOT A DOOR. They opened a dialog listing every
 * follower, which the owner asked to remove: a count is a fact about the
 * person, and a modal of strangers' names under it was a detour nobody
 * needed. So it is plain text now, quieter than the buttons under it. The
 * followers number is still the server's after every press.
 *
 * Follow is Storelib's button (components/profile/follow-button.tsx): on
 * a creator's page (tone "storefront") painted in the page's scheme
 * (`scheme`), on a plain profile Storelib's own near black and white.
 */
import { useState } from "react"
import { cn } from "@/lib/utils"
import { FollowButton, useFollow, type ActionScheme, type FollowTone } from "./follow-button"

function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}

export function ProfileSocial({
  userId,
  name,
  followers: initialFollowers,
  following,
  viewerFollowing,
  signedIn,
  isSelf,
  showCounts = true,
  tone = "platform",
  scheme,
  location,
  className,
}: {
  userId: string
  name: string
  followers: number
  following: number
  viewerFollowing: boolean
  signedIn: boolean
  isSelf: boolean
  /** A creator can keep their follower count off their page (Show followers); the button stays. */
  showCounts?: boolean
  tone?: FollowTone
  /** A creator page's scheme button colours (lib/store-builder/storefront-chrome.ts `action`). */
  scheme?: ActionScheme | null
  /** Where they are from, already one line ("Lisbon, Portugal": lib/profile/location.ts locationLine); nothing when they never said. */
  location?: string | null
  className?: string
}) {
  const [followers, setFollowers] = useState(initialFollowers)
  const follow = useFollow({
    targetUserId: userId,
    initialFollowing: viewerFollowing,
    signedIn,
    onFollowers: setFollowers,
    onChange: (on) => setFollowers((n) => Math.max(0, n + (on ? 1 : -1))),
  })
  const storefront = tone === "storefront"
  const count = (kind: "followers" | "following", n: number, word: string) => (
    <span data-profile-count={kind} className="whitespace-nowrap">
      <span className={cn("font-semibold tabular-nums", storefront ? undefined : "text-[#1a1a2e]")} data-profile-count-value="">
        {compact(n)}
      </span>{" "}
      <span className={storefront ? "opacity-70" : undefined}>{word}</span>
    </span>
  )

  return (
    <div className={cn("flex flex-col items-center", className)} data-profile-social="">
      {/* WHERE THEY ARE FROM, quieter than the counts under it: no pin, no flag, only the words (round 12). */}
      {location ? (
        <p className={cn("mb-1.5 max-w-full truncate text-center text-[13px] leading-5", storefront ? "opacity-70" : "text-[#6b7280]")} data-profile-location="">
          {location}
        </p>
      ) : null}
      {showCounts ? (
        <p className={cn("text-center text-[14px] leading-5", !storefront && "text-[#6b7280]")} data-profile-counts="">
          {count("followers", followers, followers === 1 ? "follower" : "followers")}{" "}
          <span aria-hidden className={cn("px-1", storefront ? "opacity-40" : "text-[#c4c8cf]")}>
            ·
          </span>{" "}
          {count("following", following, "following")}
        </p>
      ) : null}
      {!isSelf ? (
        <div className={cn("flex w-full max-w-[360px] items-center justify-center gap-2", showCounts ? "mt-3" : "mt-4")} data-profile-actions="">
          <FollowButton following={follow.following} busy={follow.busy} onClick={follow.toggle} tone={tone} scheme={scheme} name={name} className="min-w-[156px]" />
        </div>
      ) : null}
      {follow.error ? (
        <p role="alert" className="mt-2 text-[12px] text-[#b42318]">
          {follow.error}
        </p>
      ) : null}
    </div>
  )
}
