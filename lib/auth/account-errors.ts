/**
 * What to tell somebody when a change to their own account did not work.
 *
 * Supabase answers with an error code (weak_password, same_password,
 * reauthentication_needed and so on) and a developer's sentence. The
 * sentence is not for a person, so it is never shown: the code decides the
 * words. Anything unrecognised says what happened and what to do, without
 * inventing a cause.
 *
 * Pure, safe in the browser and on the server, and driven by
 * tests/account-settings.test.ts.
 */

export type AccountErrorKind =
  | "weak_password"
  | "same_password"
  | "reauthentication_needed"
  | "reauthentication_not_valid"
  | "rate_limited"
  | "signed_out"
  | "network"
  | "email_taken"
  | "unknown"

interface ErrorLike {
  code?: string
  error_code?: string
  status?: number
  name?: string
  message?: string
  reasons?: string[]
  weak_password?: { reasons?: string[] }
}

export function accountErrorKind(error: unknown): AccountErrorKind {
  const e = (error ?? {}) as ErrorLike
  const code = String(e.code ?? e.error_code ?? "").toLowerCase()
  const message = String(e.message ?? "").toLowerCase()

  /* Same before weak: Supabase's same-password sentence also begins "password should". */
  if (code === "same_password" || message.includes("should be different from the old password")) return "same_password"
  if (code === "weak_password" || e.weak_password || message.includes("password should")) return "weak_password"
  if (code === "reauthentication_needed" || message.includes("reauthentication")) {
    return code === "reauthentication_not_valid" ? "reauthentication_not_valid" : "reauthentication_needed"
  }
  if (code === "reauthentication_not_valid" || code === "otp_expired" || message.includes("nonce")) return "reauthentication_not_valid"
  if (code.startsWith("over_") || e.status === 429 || message.includes("rate limit") || message.includes("too many")) return "rate_limited"
  if (code === "email_exists" || message.includes("already been registered") || message.includes("already in use")) return "email_taken"
  if (
    code === "session_not_found" ||
    code === "session_expired" ||
    code === "refresh_token_not_found" ||
    e.name === "AuthSessionMissingError" ||
    message.includes("auth session missing")
  ) {
    return "signed_out"
  }
  if (e.name === "AuthRetryableFetchError" || e.status === 0 || message.includes("fetch") || message.includes("network") || message.includes("load failed")) {
    return "network"
  }
  return "unknown"
}

const WORDS: Record<AccountErrorKind, string> = {
  weak_password: "That password is too easy to guess. Use at least 8 characters with a mix of letters and numbers.",
  same_password: "That is the password you already have. Choose a different one.",
  reauthentication_needed: "For your security, confirm it is you first. We sent a code to your email.",
  reauthentication_not_valid: "That code did not work or has expired. Ask for a new one.",
  rate_limited: "Too many tries in a short time. Wait a few minutes and try again.",
  signed_out: "Your session ended. Sign in again to change this.",
  network: "Could not reach Storelib. Check your connection and try again.",
  email_taken: "That email is already used by another account.",
  unknown: "That did not work. Try again in a moment.",
}

export function accountErrorMessage(error: unknown): string {
  return WORDS[accountErrorKind(error)]
}

/** The checks worth making before a password goes anywhere. Returns what is wrong, or null. */
export function passwordProblem(password: string, confirm: string): string | null {
  /* The same floor as the reset page (app/(auth)/reset-password). Anything
     stricter is Supabase's to say, and its answer is weak_password above. */
  if (password.length < 8) return "Use at least 8 characters."
  if (password !== confirm) return "The two passwords do not match."
  return null
}
