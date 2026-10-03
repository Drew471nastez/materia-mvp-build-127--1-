import "server-only"

/**
 * ===========================================================================
 *  A CREATOR'S OWN AI KEY, SEALED
 * ===========================================================================
 * The key somebody pastes is stored encrypted,
 * never as text: AES-256-GCM, a fresh 12 byte nonce each time, and the tag,
 * as `v1.<nonce>.<tag>.<ciphertext>` in base64url. A row read out of the
 * database on its own opens nothing.
 *
 * THE SECRET. `AI_KEYS_SECRET` when the deployment has one. Without it, a
 * key is derived (HKDF) from the Supabase service role key, which every
 * deployment of this app already has and which never reaches a browser, so
 * the feature works the day it ships with nothing new to set. Setting
 * `AI_KEYS_SECRET` later, or rotating the service key, makes the old rows
 * unreadable: `open` then returns null and the creator is asked to connect
 * again, which is the right failure for a credential.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

const VERSION = "v1"

function secret(): Buffer {
  const own = process.env.AI_KEYS_SECRET
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No secret to seal AI keys with: set AI_KEYS_SECRET")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-own-ai-keys"), Buffer.from(own ? "own" : "service"), 32))
}

export function seal(plain: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", secret(), nonce)
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, nonce.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".")
}

/** The key, or null when the row was sealed with another secret or has been tampered with. */
export function open(sealed: string): string | null {
  try {
    const [version, nonce, tag, body] = sealed.split(".")
    if (version !== VERSION || !nonce || !tag || !body) return null
    const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(nonce, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** What the creator is shown of a key: its last four characters. */
export function hintOf(key: string): string {
  return key.trim().slice(-4)
}
