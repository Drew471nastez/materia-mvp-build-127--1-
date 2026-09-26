import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { APP_URL, escapeHtml } from "@/lib/email-automation"

/**
 * ===========================================================================
 *  OPENS AND CLICKS ON AN AUTOMATED EMAIL
 * ===========================================================================
 * Every email a flow sends has a row in email_flow_sends with a random token.
 * The email carries that token and nothing else about the person: a 1x1
 * image that reports the open, and every link rewritten through a redirect
 * that reports the click. The builder's per-step numbers are these rows.
 *
 * THE REDIRECT ONLY GOES WHERE THE EMAIL SAID. A click link names its target,
 * and a link anybody can edit is an open redirect: a stranger could send
 * people through storelib.com to anywhere. So each one carries a signature
 * of (token, target) made with a server key, and a link whose signature does
 * not match goes to the home page instead.
 *
 * Opens are a hint, not a fact: some mail apps load every image, some none.
 * The builder says "opened", and the numbers are what they are.
 */

function key(): Buffer | null {
  const secret = process.env.AUTOMATION_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.flow-link.v1").digest()
}

export function signTarget(token: string, target: string): string | null {
  const k = key()
  if (!k) return null
  return createHmac("sha256", k).update(`${token}\n${target}`).digest("hex").slice(0, 32)
}

export function verifyTarget(token: string, target: string, sig: string | null | undefined): boolean {
  const expected = signTarget(token, target)
  if (!expected || typeof sig !== "string" || sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isToken(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export function openPixel(token: string): string {
  return `<img src="${escapeHtml(`${APP_URL}/api/automations/t/o?k=${token}`)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`
}

export function clickUrl(token: string, target: string): string | null {
  const sig = signTarget(token, target)
  if (!sig) return null
  return `${APP_URL}/api/automations/t/c?k=${token}&u=${Buffer.from(target, "utf8").toString("base64url")}&s=${sig}`
}

/**
 * THE ADDRESS AS IT WAS SIGNED, AND WHERE IT GOES. A click link carries the
 * address its signature was made over (`written`); the reader is sent to
 * the same address read as a URL (`href`).
 *
 * The two used to be one, and they are not always the same string: a
 * browser's reading of "https://shop.com" is "https://shop.com/", of
 * "https://Shop.com/a b" is "https://shop.com/a%20b". The link was signed
 * over what the creator wrote and checked against the URL's reading of it,
 * so every link to a bare domain (the commonest link in an email, "visit my
 * shop") failed its check and sent the reader to storelib.com instead of
 * the creator's page. Links are signed over the URL's reading now
 * (trackLinks), and a link in an email already sent, signed over what was
 * written, is checked against that (t/c route: either one).
 */
export function readTarget(u: string | null): { written: string; href: string } | null {
  if (!u || u.length > 4096) return null
  try {
    const written = Buffer.from(u, "base64url").toString("utf8")
    const url = new URL(written)
    return url.protocol === "https:" || url.protocol === "http:" ? { written, href: url.toString() } : null
  } catch {
    return null
  }
}

/**
 * Every http(s) link in the body goes through the click redirect, except the
 * unsubscribe link (which must work as it is, and is not a click on the
 * creator's content). Without a signing key the body is left alone.
 */
export function trackLinks(html: string, token: string): string {
  if (!key()) return html
  return html.replace(/href\s*=\s*(["'])(https?:\/\/[^"'\s>]+)\1/gi, (whole, quote: string, raw: string) => {
    const written = raw.replace(/&amp;/g, "&")
    if (/\/unsubscribe\b/.test(written)) return whole
    /* Signed over the URL's own reading of it, which is what the click route
       checks and where it sends the reader (readTarget). */
    let target: string
    try {
      target = new URL(written).toString()
    } catch {
      return whole
    }
    const url = clickUrl(token, target)
    return url ? `href=${quote}${escapeHtml(url)}${quote}` : whole
  })
}
