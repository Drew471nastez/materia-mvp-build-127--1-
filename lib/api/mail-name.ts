/* Pure, no server imports: lib/email.tsx and the tests read it (round AY, lib/api/typed-mail.ts has the reason). */

/**
 * A visitor's name as it may appear in mail to a typed address, or null.
 * The name is the only text a visitor writes that reached such mail (a
 * welcome email's "Hi {name}"), so "Your account is locked, visit evil.co"
 * typed as a name went out under a store's own name. A person's name is
 * letters, spaces, apostrophes, hyphens and initials; anything else is left
 * out and the email uses its usual greeting.
 */
export function mailSafeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.replace(/\s+/g, " ").trim()
  if (!name || name.length > 40) return null
  if (!/^[\p{L}\p{M}' ’.-]+$/u.test(name)) return null
  /* "evil.com" is letters and a dot; an initial is a dot then a space or the end. */
  if (/\.[\p{L}\p{M}]/u.test(name)) return null
  if (name.split(" ").length > 4) return null
  return name
}
