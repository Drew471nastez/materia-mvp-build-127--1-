"use client"

/**
 * ===========================================================================
 *  THE COUNTS AND THE BUTTONS UNDER A PERSON'S NAME
 * ===========================================================================
 * "12 followers   30 following", each opening that list, then the actions:
 * Follow / Following for somebody else, Message when the two of them share
 * a community where messages are open (the page works that out on the
 * server and passes the address), and the store when they have one. Your
 * own profile has no Follow; it has the owner's pills instead (the page).
 *
 * The followers count is the server's after every press, so it never
 * drifts from the list it opens. The same block sits on a creator's page
 * (tone "storefront"), drawn in the page's own colours: Follow in the
 * scheme's button colours (`scheme`), Message as an outline in the page's
 * text colour with the scheme's rounding. A plain profile has Storelib's
 * own pair.
 *
 * Message never goes to a member page: it opens the conversation in the
 * community the two share (/community/<slug>?dm=<userId>, which the
 * community opens once and then drops from the address).
 */
import Link from "next/link"
import { useState } from "react"
import { MessageCircle } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { FollowButton, useFollow, type ActionScheme, type FollowTone } from "./follow-button"
import { FollowListSheet, type FollowListKind } from "./follow-list-sheet"

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
  messageHref,
  showCounts = true,
  tone = "platform",
  scheme,
  className,
}: {
  userId: string
  name: string
  followers: number
  following: number
  viewerFollowing: boolean
  signedIn: boolean
  isSelf: boolean
  messageHref?: string | null
  /** A creator can keep their follower count off their page (Show followers); the button stays. */
  showCounts?: boolean
  tone?: FollowTone
  /** A creator page's scheme button colours (lib/store-builder/storefront-chrome.ts `action`). */
  scheme?: ActionScheme | null
  className?: string
}) {
  const [followers, setFollowers] = useState(initialFollowers)
  const [open, setOpen] = useState<FollowListKind | null>(null)
  const follow = useFollow({
    targetUserId: userId,
    initialFollowing: viewerFollowing,
    signedIn,
    onFollowers: setFollowers,
    onChange: (on) => setFollowers((n) => Math.max(0, n + (on ? 1 : -1))),
  })
  const storefront = tone === "storefront"
  const count = (kind: FollowListKind, n: number, word: string) => (
    <button
      type="button"
      onClick={() => setOpen(kind)}
      data-profile-count={kind}
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-lg px-1.5 outline-none transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:ring-2",
        storefront ? "focus-visible:ring-current/30 hover:underline" : "text-[#6b7280] hover:text-[#1a1a2e] focus-visible:ring-[#1a1a2e]/20",
      )}
    >
      <span className={cn("font-semibold tabular-nums", !storefront && "text-[#1a1a2e]")}>{compact(n)}</span>
      <span className={storefront ? "opacity-75" : undefined}>{word}</span>
    </button>
  )

  return (
    <div className={cn("flex flex-col items-center", className)} data-profile-social="">
      {showCounts ? (
        <div className="flex items-center justify-center gap-3 text-[14px]" data-profile-counts="">
          {count("followers", followers, followers === 1 ? "follower" : "followers")}
          {count("following", following, "following")}
        </div>
      ) : null}
      {!isSelf ? (
        <div className={cn("flex w-full max-w-[360px] flex-wrap items-center justify-center gap-2", showCounts ? "mt-2" : "mt-4")} data-profile-actions="">
          <FollowButton following={follow.following} busy={follow.busy} onClick={follow.toggle} tone={tone} scheme={scheme} name={name} className="flex-1 sm:flex-none" />
          {messageHref ? (
            <Link
              href={messageHref}
              data-profile-message=""
              style={storefront && typeof scheme?.radius === "number" ? { borderRadius: `${Math.min(scheme.radius, 999)}px` } : undefined}
              className={cn(
                storefront
                  ? "inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-current/30 px-4 text-[14px] font-semibold outline-none transition-[background-color,border-color] duration-100 hover:border-current/50 hover:bg-current/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                  : cn(secondaryDepth, "h-10 min-w-[112px] rounded-xl px-4 text-[14px]"),
                "flex-1 sm:flex-none",
              )}
            >
              <MessageCircle className="h-4 w-4 opacity-70" aria-hidden />
              Message
            </Link>
          ) : null}
        </div>
      ) : null}
      {follow.error ? (
        <p role="alert" className="mt-2 text-[12px] text-[#b42318]">
          {follow.error}
        </p>
      ) : null}
      <FollowListSheet
        userId={userId}
        name={name}
        open={open !== null}
        initialList={open ?? "followers"}
        onClose={() => setOpen(null)}
        signedIn={signedIn}
        counts={{ followers, following }}
      />
    </div>
  )
}
