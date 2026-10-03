import "server-only"

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  A WEBSITE'S PASSWORD, KEPT AS SOMETHING NOBODY CAN TYPE
 * ===========================================================================
 * The password a creator gives their website is never stored. What is kept
 * (site_access.password_hash) is scrypt over it with a random salt of its
 * own, written with its cost so a later change of cost still reads the old
 * ones:
 *
 *   scrypt$<N>$<r>$<p>$<salt, base64url>$<hash, base64url>
 *
 * It never leaves the server: the settings page is told only whether a
 * password is set, and the password page only whether the one typed is right.
 */

const N = 16384
const R = 8
const P = 1
const KEYLEN = 32

export const PASSWORD_MIN = 4
export const PASSWORD_MAX = 100

/** What a creator or a visitor typed, as a password: the ends trimmed, no control characters, 4 to 100 long. Null when it is not one. */
export function cleanPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  const pw = value.trim()
  if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(pw)) return null
  return pw
}

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`
}

/** True when the password is the one the hash was made from. Constant time over the hash; false for anything malformed. */
export async function verifyPassword(password: unknown, stored: unknown): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string" || password.length === 0 || password.length > PASSWORD_MAX * 4) return false
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [n, r, p] = parts.slice(1, 4).map((x) => Number(x))
  /* Within what this server would ever have written, so a row cannot ask for a cost that stalls it. */
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0) || n > 1 << 17 || r > 16 || p > 4) return false
  const salt = Buffer.from(parts[4], "base64url")
  const expected = Buffer.from(parts[5], "base64url")
  if (salt.length < 8 || expected.length !== KEYLEN) return false
  try {
    const got = await derive(password.trim(), salt, n, r, p)
    return got.length === expected.length && timingSafeEqual(got, expected)
  } catch {
    return false
  }
}
