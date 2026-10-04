"use client"

/**
 * ===========================================================================
 *  FOLLOW, ON ANY PROFILE AND ON A CREATOR'S PAGE
 * ===========================================================================
 * One button for following a person, wherever a person is shown: a buyer's
 * profile, a creator's profile, a creator's page. It says what will happen
 * (Follow) or what is true (Following, with a check). A press on Follow
 * makes it Following; a press on Following makes it Follow. Nothing else:
 * the owner asked for the hover "Unfollow" to go, so a pointer over
 * Following only shades it a little, as any button does.
 *
 * IT ANSWERS THE FINGER, NOT THE SERVER, AND NOTHING MOVES.
 *   pointerdown  the face takes its pressed shade on that very frame: set on
 *                the element directly, no React render in between
 *   click        the state flips at once: the two faces (the solid Follow
 *                and the quiet Following) and their labels crossfade over
 *                160ms, opacity only, so the compositor does all of it and
 *                the main thread is free
 * No scale, no bounce, no spring: the owner asked for "no bump" between
 * Follow and Following. The box is the same box in both states and while
 * pressed (scripts/check-follow-button.mjs measures it on every frame of a
 * press at a quarter CPU speed). Both labels are always laid out in one grid
 * cell, so the button is as wide as the wider of them in both states:
 * nothing beside it moves.
 * Reduced motion: the same switch, without the fade.

 * TAPS SETTLE TO THE LAST ONE (useFollow). "On mobile, clicking Follow
 * then quickly clicking again blocks for about 3 seconds." It did: the
 * button ignored every press while a request was out (`if (busy) return`),
 * and the request took that long because the route waited for the
 * follower's handle and the "followed you" notice before it answered. Now
 * no press ever waits on the network. Each press flips what the button shows
 * on that frame; the server hears the result once the presses stop
 * (DEBOUNCE_MS), one request at a time, and only when it differs from what
 * the server already has. A press while a request is out is kept, and the
 * newest one is sent when that request lands. Follow, Following, Follow in a
 * quick row is one follow, and a double tap is nothing. A request that fails
 * on the way (no network, a 5xx) is tried once more (RETRY_MS later); only
 * when that fails too, or the server says no, do the button and the count
 * go back to what the server has. Leaving the page mid wait still sends it
 * (keepalive, on that request only). Nothing here refreshes the page.
 * The server is POST /api/follow, which takes the follower from the session
 * and answers before the notice is written (after()).
 *
 * Signed out, the press goes to sign in and comes back here.
 *
 * ONE BUTTON LANGUAGE, THE PAGE'S COLOURS. Everywhere it is Storelib's
 * pair from components/ui/depth-button.ts: Follow a solid primary with a
 * line of light on top and a darker foot, Following the quiet secondary with a hairline and a soft foot, both going flat with
 * the shade inside when pressed, at the same height and rounding. On
 * Storelib's own pages ("platform") that is the near black and the white.
 * On a creator's page ("storefront") the same shapes are painted in the
 * scheme the creator picked (lib/store-builder/storefront-chrome.ts
 * `action`): Follow in their buy button colour, Following a surface a
 * step off their page with their page's ink. The colours travel
 * as CSS variables, so hover and press are plain CSS.
 *
 * THE NATIVE SHELL. globals.css dims every pressed button to 72% inside the
 * app; this one has its own press, so it keeps its opacity (inline, which
 * that rule does not outrank). `touch-action: manipulation` drops the
 * double tap zoom, and the box is 40px tall.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
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
  quiet?: { background: string; hover: string; press: string; border: string; text: string }
  dark?: boolean
}

/** How long the presses must stop before the server hears the last one. */
export const DEBOUNCE_MS = 300
/** How long before a request that failed on the way is tried the second and last time. */
export const RETRY_MS = 600

type FollowAnswer = { following?: boolean; followers?: number; error?: string }

const TRY_AGAIN = "That did not go through. Try again."

export function useFollow(input: {
  targetUserId: string
  initialFollowing: boolean
  signedIn: boolean
  onFollowers?: (n: number) => void
  onChange?: (following: boolean) => void
  /** A press that could not be saved, after the button went back (the community card says it in a toast). */
  onError?: (message: string) => void
}) {
  /* What the button shows: the last press. */
  const [following, setFollowing] = useState(input.initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* What the server has, the last press, the one request allowed in flight, and the wait before it. */
  const server = useRef(input.initialFollowing)
  const wanted = useRef(input.initialFollowing)
  const flying = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const live = useRef(input)
  live.current = input

  /* One request (and its one retry) at a time, for whatever the newest press is when it goes. `leaving` marks the one sent as the page goes away. */
  const send = useCallback(async (leaving = false) => {
    timer.current = null
    if (flying.current || wanted.current === server.current) return
    flying.current = true
    setBusy(true)
    let failure: string | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const next = wanted.current
      /* Pressed back to what the server has while waiting to retry: nothing left to say. */
      if (next === server.current) {
        failure = null
        break
      }
      let refused = false
      try {
        const res = await fetch("/api/follow", {
          method: "POST",
          credentials: "include",
          keepalive: leaving,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: live.current.targetUserId, follow: next }),
        })
        const data = (await res.json().catch(() => ({}))) as FollowAnswer
        if (res.ok && typeof data.following === "boolean") {
          server.current = data.following
          failure = null
          /* The server's count only while it is still the count of what the button shows. */
          if (wanted.current === data.following && typeof data.followers === "number") live.current.onFollowers?.(data.followers)
          break
        }
        failure = data.error || TRY_AGAIN
        /* A no from the server (signed out, too many, nobody by that id) is its answer; asking again would not change it. */
        refused = res.status < 500
      } catch {
        failure = TRY_AGAIN
      }
      if (refused || attempt === 1 || leaving) break
      await new Promise((r) => setTimeout(r, RETRY_MS))
    }
    /* The last word was a no: the button and the count go back to what the server has. */
    if (failure && wanted.current !== server.current) {
      wanted.current = server.current
      setFollowing(server.current)
      live.current.onChange?.(server.current)
      setError(failure)
      live.current.onError?.(failure)
    }
    flying.current = false
    setBusy(false)
    /* Pressed again while that one was out: one more, for the newest press. */
    if (wanted.current !== server.current && !timer.current) void send()
  }, [])

  /* Leaving with a press still waiting: send it now, keepalive carries it past the page. */
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        void send(true)
      }
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [send])

  /* Never awaits anything: the press is answered in this event, the server in the background. */
  const toggle = () => {
    if (!input.signedIn) {
      const back = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"
      window.location.assign(`/login?next=${encodeURIComponent(back)}`)
      return
    }
    const next = !wanted.current
    wanted.current = next
    setError(null)
    /* Optimistic: the button and the count change on the press. */
    setFollowing(next)
    input.onChange?.(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void send(), DEBOUNCE_MS)
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
      ? { "--sq-bg": q.background, "--sq-hover": q.hover, "--sq-press": q.press, "--sq-line": q.border, "--sq-ink": q.text }
      : {}),
  } as React.CSSProperties
}

/**
 * The state change: a crossfade of the two faces and their labels, opacity
 * only, so nothing grows, shrinks or shifts. It starts 24ms in (a negative
 * delay): a transition's first frame is its starting value, so without that
 * the frame right after the press would show nothing yet; with it, that
 * frame is already a part of the way across.
 */
const SWAP = "transition-opacity duration-[160ms] [transition-delay:-24ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"

/**
 * A label that is not the state goes invisible once it has faded, so the
 * button's text (and a find in page) is only the state. Visibility steps:
 * shown at the start of a fade in, hidden at the end of a fade out.
 */
const LABEL = "relative col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap transition-[opacity,visibility] duration-[160ms] [transition-delay:-24ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"

/**
 * NOTHING TO WORK OUT ON A PRESS. cn() runs tailwind-merge, which parses
 * every class it has not seen before. The parts below change class on every
 * switch, so the first press met strings never merged and spent most of its
 * render on them (a profile of the first tap at a quarter CPU speed). They
 * have no clashing classes to settle, so they are joined, and the face's
 * box is worked out once, here.
 */
const join = (...parts: string[]) => parts.join(" ")

/** The face: the same box in every state. The press is a shade on the fill (PLATFORM, SCHEME), never a size. */
const FACE_BOX = "relative grid w-full place-items-center rounded-[inherit] px-5"

/** Each face is a full layer of the button, at the same box: a 1px edge on both, so neither is a pixel bigger. */
const FACE = "pointer-events-none absolute inset-0 rounded-[inherit] border"

/** Storelib's own pair (components/ui/depth-button.ts primaryDepth and secondaryDepth), as faces. */
const PLATFORM = {
  solid: cn(
    FACE,
    "border-transparent bg-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25)]",
    "group-hover/follow:bg-[#2a2a40] group-data-[pressed]/follow:bg-[#0f0f1c] group-data-[pressed]/follow:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  ),
  quiet: cn(
    FACE,
    "border-[#d9dbe0] bg-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)]",
    "group-hover/follow:bg-[#f7f7f8] group-data-[pressed]/follow:bg-[#f1f2f4] group-data-[pressed]/follow:shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]",
  ),
  solidInk: "text-white",
  /* Medium, as Storelib's quiet secondary is (secondaryDepth). */
  quietInk: "text-[#1a1a2e] font-medium",
}

/** The same pair in the creator's scheme, as faces: Follow in their buy colour, Following a surface a step off their page. Without a scheme the quiet face falls back to the page's text colour, so it is never a white box on a dark page. */
const SCHEME = {
  solid: cn(
    FACE,
    "border-transparent bg-[var(--sf-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.3),0_1px_2px_rgba(16,24,40,0.22)]",
    "group-hover/follow:bg-[var(--sf-hover)] group-data-[pressed]/follow:bg-[var(--sf-press)] group-data-[pressed]/follow:shadow-[inset_0_1px_2px_rgba(0,0,0,0.38)]",
  ),
  quiet: cn(
    FACE,
    "border-[var(--sq-line,color-mix(in_srgb,currentColor_22%,transparent))] bg-[var(--sq-bg,transparent)] shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)]",
    "group-hover/follow:bg-[var(--sq-hover,color-mix(in_srgb,currentColor_5%,transparent))] group-data-[pressed]/follow:bg-[var(--sq-press,color-mix(in_srgb,currentColor_9%,transparent))] group-data-[pressed]/follow:shadow-[inset_0_1px_1px_rgba(0,0,0,0.12)]",
  ),
  solidInk: "text-[var(--sf-ink)]",
  quietInk: "text-[var(--sq-ink,currentColor)]",
}

export function FollowButton({
  following,
  busy,
  onClick,
  tone = "platform",
  scheme,
  name,
  className,
}: {
  following: boolean
  busy?: boolean
  onClick: () => void
  tone?: FollowTone
  /** On a creator's page: their scheme's button colours. Without one, the page's text colour draws it. */
  scheme?: ActionScheme | null
  /** Who, for a screen reader: "Follow Ana". */
  name?: string
  className?: string
}) {
  const storefront = tone === "storefront"
  const look = storefront ? SCHEME : PLATFORM
  /* A creator page without a scheme draws Follow in the quiet face too, in the page's own text colour. */
  const solid = storefront && !scheme ? SCHEME.quiet : look.solid
  const solidInk = storefront && !scheme ? SCHEME.quietInk : look.solidInk
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    delete e.currentTarget.dataset.pressed
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        /* The pressed shade on this frame, without waiting for React: see IT ANSWERS THE FINGER. */
        if (e.button === 0) e.currentTarget.dataset.pressed = ""
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={onClick}
      aria-pressed={following}
      aria-label={name ? `${following ? "Following" : "Follow"} ${name}` : undefined}
      aria-busy={busy || undefined}
      data-follow-button={following ? "following" : "follow"}
      data-follow-tone={storefront ? (scheme ? "scheme" : "storefront") : "platform"}
      className={cn(
        "group/follow relative inline-flex h-10 min-w-[128px] shrink-0 cursor-pointer touch-manipulation select-none items-stretch justify-center rounded-xl text-[14px] font-semibold outline-none",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2",
        storefront ? "focus-visible:outline-current" : "focus-visible:outline-[#1a1a2e]/40",
        "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
        className,
      )}
      style={{ ...(storefront ? schemeVars(scheme) : null), opacity: 1 }}
    >
      {/* The face: one box for both states; a press shades it and a switch crossfades it. */}
      <span className={FACE_BOX} data-follow-face="">
        <span aria-hidden className={join(solid, SWAP, following ? "opacity-0" : "opacity-100")} data-follow-fill="follow" />
        <span aria-hidden className={join(look.quiet, SWAP, following ? "opacity-100" : "opacity-0")} data-follow-fill="following" />
        {/* Both labels in one cell, always laid out: the button is the width of the wider one in both states. */}
        <span
          className={join(LABEL, solidInk, following ? "invisible opacity-0" : "visible opacity-100")}
          aria-hidden={following || undefined}
          data-follow-label="follow"
        >
          Follow
        </span>
        <span
          className={join(LABEL, look.quietInk, following ? "visible opacity-100" : "invisible opacity-0")}
          aria-hidden={!following || undefined}
          data-follow-label="following"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Following
        </span>
      </span>
    </button>
  )
}
