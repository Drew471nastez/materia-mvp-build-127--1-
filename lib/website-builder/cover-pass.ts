import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { isThemeId } from "@/lib/website-builder/theme-registry"

/**
 * ===========================================================================
 *  A PASS FOR THE BROWSER THAT TAKES THE COVER, AND FOR NOTHING ELSE
 * ===========================================================================
 * The cover is a screenshot of a website's SAVED home page — drafts
 * included, since "last saved" is what a creator is looking for — taken by a
 * headless Chromium on the server. That browser has no session, so it needs
 * some other way to be allowed to see an unpublished draft.
 *
 * Not the preview link. That token is the creator's own: they choose to make
 * one, they share it, and turning it off is how they un-share it. Minting one
 * quietly so a screenshot could be taken would be exactly the kind of secret
 * the publish panel is careful never to create behind somebody's back.
 *
 * So this is a separate pass, and a narrow one:
 *
 *   ONE install. The id is inside the signed part; it cannot be swapped.
 *   TWO minutes. Long enough for a page to load, useless after.
 *   SIGNED with a server-only secret, compared in constant time.
 *
 * It is only ever handed from this server to its own Chromium. Somebody who
 * somehow saw one would get, for two minutes, a view of one home page they
 * could not otherwise see — and nothing they could change.
 */

const TTL_MS = 2 * 60 * 1000

function key(): Buffer {
  /*
    A secret of its own if one is set. Otherwise one derived from the service
    role key, which every server environment already has and no browser ever
    sees: derived rather than used directly, so the pass never contains or
    exposes anything that could be turned back into database access.
  */
  const own = process.env.COVER_RENDER_SECRET
  if (own && own.length >= 32) return Buffer.from(own, "utf8")
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No secret to sign cover passes with")
  return createHmac("sha256", base).update("storelib:cover-render:v1").digest()
}

function sign(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url")
}

export function mintCoverPass(installId: string, now = Date.now()): string {
  if (!isThemeId(installId)) throw new Error("Not an install id")
  const body = `${installId}.${(now + TTL_MS).toString(36)}`
  return `${body}.${sign(body)}`
}

/** The install a pass is for, or null if it is not a pass this server made, or has expired. */
export function readCoverPass(pass: string, now = Date.now()): string | null {
  if (typeof pass !== "string" || pass.length > 200) return null
  const parts = pass.split(".")
  if (parts.length !== 3) return null
  const [installId, exp, sig] = parts
  if (!isThemeId(installId) || !/^[a-z0-9]{1,12}$/.test(exp)) return null
  let expected: string
  try {
    expected = sign(`${installId}.${exp}`)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Number.parseInt(exp, 36) < now) return null
  return installId
}
