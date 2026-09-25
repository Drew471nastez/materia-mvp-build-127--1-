/**
 * ===========================================================================
 *  A TRACKED LINK THAT ALWAYS STILL GOES WHERE IT SAID
 * ===========================================================================
 * Every https link in a campaign is sent through /api/email/click so a click
 * can be counted. Two things must both hold:
 *
 *   it is not an open redirect   a link anybody can edit to point anywhere
 *                                turns storelib.com into a phishing tool, so
 *                                each carries a signature of (token, target)
 *                                made with a server key, and the redirect
 *                                only follows a target whose signature fits
 *   it never breaks              the signature is of the exact address that
 *                                was written into the email, so the check
 *                                does not depend on finding the link in the
 *                                saved draft again (which the send renders
 *                                afresh, with http upgraded to https)
 *
 * Emails sent before signatures still carry the old form; the click route
 * checks those against the campaign's saved body, as it did.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { APP_URL } from "@/lib/email-automation"

function key(): Buffer | null {
  const secret = process.env.EMAIL_LINK_SECRET || process.env.AUTOMATION_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.campaign-link.v1").digest()
}

export function signLink(token: string, target: string): string | null {
  const k = key()
  if (!k) return null
  return createHmac("sha256", k).update(`${token}\n${target}`).digest("hex").slice(0, 32)
}

export function verifyLink(token: string, target: string, sig: string | null | undefined): boolean {
  const expected = signLink(token, target)
  if (!expected || typeof sig !== "string" || sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}

/** base64url of the address, so any character in it survives the query string. */
export function encodeTarget(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url")
}

/** An http(s) address from `u`, in either the new base64url or the old base64 form. */
export function decodeTarget(raw: string | null): string | null {
  if (!raw || raw.length > 6000) return null
  try {
    const text = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    const u = new URL(text)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * Every https link through the click counter, except the way out and our
 * own tracking addresses. mailto: and tel: are left as they are. Without a
 * signing key nothing is rewritten: an untracked link beats a broken one.
 */
export function trackLinks(html: string, token: string): string {
  if (!key()) return html
  return html.replace(/<a\s([^>]*?)href="([^"]+)"([^>]*)>/gi, (whole, before: string, href: string, after: string) => {
    const url = href.replace(/&amp;/g, "&")
    if (!/^https:\/\//i.test(url) || /\/unsubscribe|\/api\/email\//i.test(url)) return whole
    let target: string
    try {
      target = new URL(url).toString()
    } catch {
      return whole
    }
    const sig = signLink(token, target)
    if (!sig) return whole
    return `<a ${before}href="${APP_URL}/api/email/click?u=${encodeTarget(target)}&amp;t=${encodeURIComponent(token)}&amp;s=${sig}"${after}>`
  })
}
