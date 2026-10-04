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
 * ONE BUTTON LANGUAGE, THE PAGE'S COLOURS. Everywhere it is Storelib's
 * pair from components/ui/depth-button.ts: Follow a solid primary with a
 * line of light on top and a darker foot, Following (and Message beside it)
 * the quiet secondary with a hairline and a soft foot, both going flat with
 * the shade inside when pressed, at the same height and rounding. On
 * Storelib's own pages ("platform") that is the near black and the white.
 * On a creator's page ("storefront") the same shapes are painted in the
 * scheme the creator picked (lib/store-builder/storefront-chrome.ts
 * `action`): Follow in their buy button colour, Following and Message a
 * surface a step off their page with their page's ink, Unfollow in a red
 * that reads on it. The colours travel as CSS variables, so hover and press
 * are plain CSS and answer on the first frame.
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

/** A page's button colours: the creator's scheme, resolved on the server (storefront-chrome `schemeAction`). */
export interface ActionScheme {
  background: string
  text: string
  /** The scheme's button rounding in px (not used by the follow buttons, which keep Storelib's shape). */
  radius?: number | null
  hover?: string
  press?: string
  quiet?: { background: string; hover: string; press: string; border: string; text: string; danger: string }
  dark?: boolean
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

/**
 * The scheme's colours as the variables the classes below read. Follow's
 * fill (`--sf-*`) and the quiet secondary (`--sq-*`) are both set, so one
 * button can turn from one into the other without a style change. Without
 * a scheme a creator page's text colour draws the quiet one.
 */
export function schemeVars(scheme: ActionScheme | null | undefined): React.CSSProperties | undefined {
  if (!scheme) return undefined
  const q = scheme.quiet
  return {
    "--sf-bg": scheme.background,
    "--sf-ink": scheme.text,
    "--sf-hover": scheme.hover || scheme.background,
    "--sf-press": scheme.press || scheme.hover || scheme.background,
    ...(q
      ? { "--sq-bg": q.background, "--sq-hover": q.hover, "--sq-press": q.press, "--sq-line": q.border, "--sq-ink": q.text, "--sq-danger": q.danger }
      : {}),
  } as React.CSSProperties
}

/** Storelib's solid primary (primaryDepth), in the scheme's fill. */
export const schemePrimary = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap border border-transparent font-semibold outline-none",
  "bg-[var(--sf-bg)] text-[var(--sf-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.3),0_1px_2px_rgba(16,24,40,0.22)]",
  "transition-[background-color,box-shadow,color] duration-100",
  "hover:bg-[var(--sf-hover)] active:bg-[var(--sf-press)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.38)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-bg)]",
  "[-webkit-tap-highlight-color:transparent]",
)

/**
 * Storelib's quiet secondary (secondaryDepth), in the scheme's surface,
 * hairline and ink. Falls back to the page's text colour when there is no
 * scheme, so it is never a white box on a dark page.
 */
export const schemeQuiet = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border font-semibold outline-none",
  "border-[var(--sq-line,color-mix(in_srgb,currentColor_22%,transparent))] bg-[var(--sq-bg,transparent)] text-[var(--sq-ink,currentColor)]",
  "shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)] transition-[background-color,box-shadow,color] duration-100",
  "hover:bg-[var(--sq-hover,color-mix(in_srgb,currentColor_5%,transparent))] active:bg-[var(--sq-press,color-mix(in_srgb,currentColor_9%,transparent))] active:shadow-[inset_0_1px_1px_rgba(0,0,0,0.12)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-current",
  "[-webkit-tap-highlight-color:transparent]",
)

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
  const unfollowable = following && !fresh
  /* Red only while a press would unfollow: not under the pointer that has just followed. */
  const look = storefront
    ? following
      ? cn(schemeQuiet, unfollowable && "hover:text-[var(--sq-danger,currentColor)] active:text-[var(--sq-danger,currentColor)]")
      : scheme
        ? schemePrimary
        : schemeQuiet
    : following
      ? cn(secondaryDepth, unfollowable && "hover:text-[#b42318] active:text-[#b42318]")
      : primaryDepth
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
      style={storefront ? schemeVars(scheme) : undefined}
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
