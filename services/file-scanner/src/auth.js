import { createHash, timingSafeEqual } from "node:crypto"

/**
 * THE BEARER SECRET, COMPARED IN CONSTANT TIME.
 *
 * Both sides are hashed first, so the two buffers timingSafeEqual compares
 * are always 32 bytes: comparing the raw strings would either throw on a
 * length mismatch or leak the secret's length through how early it returned.
 */

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest()
}

/** The token after "Bearer ", or null when the header is not a bearer header. */
export function bearerToken(header) {
  if (typeof header !== "string" || header.length > 4096) return null
  const trimmed = header.trim()
  if (trimmed.slice(0, 7).toLowerCase() !== "bearer ") return null
  const token = trimmed.slice(7).trim()
  return token.length > 0 ? token : null
}

export function createVerifier(secret) {
  if (typeof secret !== "string" || secret.length === 0) throw new Error("A secret is required")
  const expected = digest(secret)
  return function verify(authorizationHeader) {
    const token = bearerToken(authorizationHeader)
    /* Hash something even when there is no token, so a missing header takes as long as a wrong one. */
    const given = digest(token ?? "")
    const same = timingSafeEqual(given, expected)
    return token !== null && same
  }
}

/** A short, one way label for a caller's token, for rate limiting without keeping the token. */
export function tokenLabel(authorizationHeader) {
  const token = bearerToken(authorizationHeader)
  return token ? digest(token).toString("hex").slice(0, 16) : "none"
}
