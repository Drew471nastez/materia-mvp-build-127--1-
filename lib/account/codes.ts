import { randomInt, timingSafeEqual } from "node:crypto"

/**
 * One time codes for changes to an account: a new email address, deleting
 * the account.
 *
 * SIX DIGITS IS A MILLION GUESSES, and nothing counted them. A code was
 * valid for fifteen minutes and a wrong one cost nothing, so a script could
 * walk the space. Now every wrong code is counted against the code it was
 * aimed at, and after MAX_CODE_ATTEMPTS it is thrown away: a new one has to
 * be sent, and sending is rate limited on its own.
 *
 * Codes come from the operating system's random source (they came from
 * Math.random, which is not meant to be unpredictable) and are compared in
 * constant time.
 */

export const MAX_CODE_ATTEMPTS = 5

export function newCode(): string {
  return String(randomInt(100000, 1000000))
}

export function codeMatches(expected: string | null | undefined, given: string | null | undefined): boolean {
  const a = Buffer.from(String(expected ?? ""))
  const b = Buffer.from(String(given ?? "").trim())
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** What to say when a code is wrong, given how many wrong tries it has had now. */
export function wrongCodeMessage(attemptsAfterThisOne: number): string {
  const left = MAX_CODE_ATTEMPTS - attemptsAfterThisOne
  if (left <= 0) return "Too many wrong codes. Ask for a new one."
  return left === 1 ? "That code is not right. One try left." : `That code is not right. ${left} tries left.`
}
