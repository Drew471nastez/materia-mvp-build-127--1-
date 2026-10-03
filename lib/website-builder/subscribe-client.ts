/**
 * ===========================================================================
 *  ONE WAY FOR AN EMAIL BOX ON A SITE TO REACH THE CREATOR
 * ===========================================================================
 * Four places on a built site ask for an email address: the newsletter
 * section, the footer, the contact form's "Keep me updated" box, and any form
 * in a section written in the Storelib Builder Framework. Two of them posted
 * nowhere. The footer's form called `preventDefault()` and stopped, so a
 * visitor typed their address, pressed Join, and nothing happened at all.
 *
 * Every one of them calls this now, so they share one endpoint, one error
 * wording and one rate limit, and all land in the creator's Subscribers.
 */

import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

/** Where on the page the address was given, for the consent record. */
export type SignupPlacement = "newsletter" | "footer" | "contact" | "section" | "password"

export type SignupResult = { ok: true } | { ok: false; error: string }

/**
 * WHAT A SIGN UP DOES WHERE IT IS SENT FROM. The builder's canvas never
 * subscribes anybody: it shows the form's success state, because designing a
 * page is not signing up to it. A live page with no creator to send to (a
 * cover screenshot) says so rather than thanking somebody for nothing. A
 * live page of a creator's website sends it. Every email box on a website
 * asks this one question (StorelibSection, NewsletterSection).
 */
export function signupMode(input: { inEditor: boolean | undefined; creatorId: string | null | undefined }): "preview" | "unavailable" | "send" {
  if (input.inEditor) return "preview"
  if (!input.creatorId) return "unavailable"
  return "send"
}

export async function subscribeToCreator(input: {
  creatorId: string
  email: string
  name?: string
  placement: SignupPlacement
  /** A form's invisible field, which only a script fills in. */
  company?: string
}): Promise<SignupResult> {
  const email = input.email.trim()
  if (!email) return { ok: false, error: "Enter your email address." }

  try {
    const res = await fetch("/api/website-builder/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* The contact form sends this and then opens a mailto: link, which in
         a browser set to hand mail to a webmail tab can leave the page. */
      keepalive: true,
      body: JSON.stringify({
        creator_id: input.creatorId,
        email,
        name: input.name?.trim() || undefined,
        placement: input.placement,
        ...(input.company ? { company: input.company } : {}),
        /* Where the visit came from, for the creator's Subscribers. The
           server takes the website's address from the request itself. */
        origin: pageOrigin(),
      }),
    })
    if (res.ok) return { ok: true }
    const out = (await res.json().catch(() => ({}))) as { error?: string }
    /* The server's own words when it has them: "Enter a valid email address",
       or the rate limit's "Try again in a minute". */
    return { ok: false, error: out.error || "Could not sign you up. Please try again." }
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." }
  }
}
