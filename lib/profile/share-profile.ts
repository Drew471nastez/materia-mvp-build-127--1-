/**
 * ===========================================================================
 *  SHARING YOUR PROFILE: THE PHONE'S OWN SHEET, ELSE THE LINK COPIED
 * ===========================================================================
 * "Share profile (native share or copy link)", from the "..." of the phone's
 * profile bar (components/platform/platform-header-client.tsx). The address
 * is the one everybody else opens: /@handle on this site's own origin
 * (lib/profile/member-url.ts), the account's handle being made for it on the
 * way to /account (lib/profile/ensure-username.ts).
 *
 * The share sheet is asked for first, inside the press (a browser only opens
 * it for a press), and a person who closes it has decided: that is not a
 * reason to copy instead. Where there is no share sheet, or it refuses, the
 * link goes to the clipboard, and the caller says so.
 */
import { memberProfilePublicPath } from "@/lib/profile/member-url"

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed"

/** The address of a person's profile on this origin, or null without a handle. */
export function profileShareUrl(origin: string, username: string | null | undefined): string | null {
  const path = memberProfilePublicPath(username || "")
  return path === "/" ? null : `${origin.replace(/\/+$/, "")}${path}`
}

export async function shareProfile(input: { url: string; name?: string | null }): Promise<ShareOutcome> {
  const nav = typeof navigator === "undefined" ? null : navigator
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title: input.name ? `${input.name} on Storelib` : "My Storelib profile", url: input.url })
      return "shared"
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return "cancelled"
      /* Refused for another reason (no permission, an embedded frame): the copy below still works. */
    }
  }
  try {
    await nav?.clipboard?.writeText(input.url)
    return nav?.clipboard ? "copied" : "failed"
  } catch {
    return "failed"
  }
}
