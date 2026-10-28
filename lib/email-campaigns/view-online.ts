/**
 * ===========================================================================
 *  A CAMPAIGN'S OWN PAGE: "VIEW IN BROWSER"
 * ===========================================================================
 * Every campaign email carries a "View in browser" link above it, for an
 * inbox that draws it badly. The page is public, so its address must not be
 * guessable or editable into somebody else's email:
 *
 *   /api/email/view?t=r.<recipient id>.<signature>   one reader's copy: their
 *                                                    name in it and their own
 *                                                    unsubscribe link
 *   /api/email/view?t=c.<campaign id>.<signature>    the email as a reader with
 *                                                    no name gets it, for a
 *                                                    scheduled or sent email's
 *                                                    page in /app (copy, share)
 *
 * The signature is an HMAC of the kind and the id with a server key, 128
 * bits, so an id alone (seen in a URL or a log) opens nothing, and nothing
 * about a reader is stored for it. Without a signing key no link is made:
 * an email without the line beats a line that leads to an error.
 *
 * The page never counts an open and never rewrites a link through the click
 * counter (./view-online-server.ts): reading it in a browser is not an open,
 * and a forwarded link must not record clicks against the reader.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { APP_URL } from "@/lib/email-automation"

export type ViewTarget = { kind: "recipient" | "campaign"; id: string }

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIX: Record<ViewTarget["kind"], string> = { recipient: "r", campaign: "c" }

function key(): Buffer | null {
  const secret = process.env.EMAIL_LINK_SECRET || process.env.AUTOMATION_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  /* Its own key, derived apart from the click signatures', so one never stands in for the other. */
  return createHmac("sha256", secret).update("storelib.campaign-view.v1").digest()
}

function sign(prefix: string, id: string): string | null {
  const k = key()
  if (!k) return null
  return createHmac("sha256", k).update(`${prefix}:${id.toLowerCase()}`).digest("hex").slice(0, 32)
}

/** The token for one reader's copy or for the campaign's own, or null without a key or for an id that is not one. */
export function viewToken(target: ViewTarget): string | null {
  if (!ID.test(target.id)) return null
  const prefix = PREFIX[target.kind]
  const sig = sign(prefix, target.id)
  return sig ? `${prefix}.${target.id.toLowerCase()}.${sig}` : null
}

/** What a token opens, or null when it is not one this server made. */
export function readViewToken(raw: unknown): ViewTarget | null {
  if (typeof raw !== "string" || raw.length > 120) return null
  const [prefix, id, sig, ...rest] = raw.split(".")
  if (rest.length || !id || !sig || !ID.test(id)) return null
  const kind = prefix === "r" ? "recipient" : prefix === "c" ? "campaign" : null
  if (!kind) return null
  const expected = sign(prefix, id)
  if (!expected || sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  return { kind, id: id.toLowerCase() }
}

/** The page's address, or null when no link can be made. */
export function viewOnlineUrl(target: ViewTarget): string | null {
  const token = viewToken(target)
  return token ? `${APP_URL}/api/email/view?t=${token}` : null
}
