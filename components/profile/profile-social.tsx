"use client"

/**
 * ===========================================================================
 *  THE COUNTS AND THE BUTTONS UNDER A PERSON'S NAME
 * ===========================================================================
 * Where they are from, then one quiet line, "12 followers · 30 following".
 *
 * NO BUTTON (r40). The owner: "there should be no follow button". Follow was
 * the last button here (Message went first: "only Follow"), so the block is
 * words only now, and draws nothing at all when it has nothing to say, so no
 * empty row is left under the name. Follow is still a button inside a
 * community (components/community/member), from the same
 * components/profile/follow-button.
 *
 * THE COUNTS ARE A LINE, NOT A DOOR. They opened a dialog listing every
 * follower, which the owner asked to remove: a count is a fact about the
 * person, and a modal of strangers' names under it was a detour nobody
 * needed. So it is plain text now, quieter than the buttons under it. The
 * followers number is still the server's after every press.
 *
 * NOT ON A CREATOR PAGE. The owner (round 38): followers and following
 * only on personal profiles and member profiles inside communities. A
 * creator page (app/(marketing)/u/[username]) draws this block with
 * `showCounts` false: where they are from, no numbers.
 *
 * On a creator's page (tone "storefront") the words take the page's own ink.
 */
import { cn } from "@/lib/utils"
import type { FollowTone } from "./follow-button"

function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}

export function ProfileSocial({
  followers = 0,
  following = 0,
  showCounts = true,
  tone = "platform",
  location,
  className,
}: {
  /** Both counts are for a person's profile; a creator page passes neither and sets showCounts false. */
  followers?: number
  following?: number
  /** False on a creator page: followers and following belong to profiles only (round 38). */
  showCounts?: boolean
  tone?: FollowTone
  /** Where they are from, already one line ("Lisbon, Portugal": lib/profile/location.ts locationLine); nothing when they never said. */
  location?: string | null
  className?: string
}) {
  if (!location && !showCounts) return null
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
    </div>
  )
}
