import "server-only"

/**
 * An integration's API key or webhook secret, sealed before it is stored:
 * AES-256-GCM with a fresh nonce, as `v1.<nonce>.<tag>.<ciphertext>`. The
 * key is COMMERCE_SECRETS_KEY when the deployment sets one, else derived
 * (HKDF) from the service role key, which never reaches a browser. A secret
 * is never returned to the client: the settings page shows its last four
 * characters.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

function key(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to seal integration secrets with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-commerce-secrets"), Buffer.from(own ? "own" : "service"), 32))
}

export function sealSecret(plain: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), nonce)
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null
  try {
    const [version, nonce, tag, body] = sealed.split(".")
    if (version !== "v1" || !nonce || !tag || !body) return null
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function secretHint(plain: string | null): string | null {
  return plain ? plain.trim().slice(-4) : null
}
