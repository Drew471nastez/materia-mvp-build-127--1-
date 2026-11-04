import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  THE PASS A DRAFT ASSET ADDRESS CARRIES (lib/storelib-theme/compat/draft-version.ts)
 * ===========================================================================
 * One install, signed with a server-only secret: the install id is inside
 * what is signed, so a pass for one store opens nothing of another's. It
 * does not expire, because the builder's canvas keeps its addresses for as
 * long as the editor is open; it is handed only to the owner's editor and
 * drawn only into pages already allowed to show the draft (a preview link,
 * the cover's own pass). What it opens is the draft of that one store's
 * stylesheets, scripts and the settings drawn into them, nothing else, and
 * never anything that can be changed.
 *
 * The secret is DRAFT_ASSET_SECRET when set (32 characters or more), else
 * one derived from the service role key, as the cover pass does
 * (./cover-pass.ts): derived, so a pass never exposes anything that could be
 * turned back into database access. Changing either changes every pass, and
 * an editor open at that moment draws from the published files until it is
 * reloaded.
 */
function key(): Buffer {
  const own = process.env.DRAFT_ASSET_SECRET
  if (own && own.length >= 32) return Buffer.from(own, "utf8")
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No secret to sign draft asset passes with")
  return createHmac("sha256", base).update("storelib:draft-assets:v1").digest()
}

export function draftAssetPass(installId: string): string {
  return createHmac("sha256", key()).update(`draft-assets:${installId.toLowerCase()}`).digest("base64url").slice(0, 32)
}

/** Whether `pass` is this server's pass for this install, compared in constant time. Never throws. */
export function isDraftAssetPass(installId: string, pass: string | null | undefined): boolean {
  if (typeof pass !== "string" || pass.length !== 32) return false
  let expected: string
  try {
    expected = draftAssetPass(installId)
  } catch {
    return false
  }
  const a = Buffer.from(pass)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
