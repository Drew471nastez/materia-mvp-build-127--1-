/**
 * Whether an access token came from a password reset link: its `amr` (how
 * the session was made) names "recovery". Read only, never verified: the one
 * caller (app/(auth)/reset-password, Back to log in) uses it to END such a
 * session on this device, which is the safe direction whatever it says.
 * Browser and server safe; no imports.
 */
export function isRecoveryToken(token: string | null | undefined): boolean {
  try {
    if (!token) return false
    const part = token.split(".")[1] ?? ""
    if (!part) return false
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as { amr?: unknown }
    return Array.isArray(json.amr) && json.amr.some((a) => (a as { method?: unknown } | null)?.method === "recovery")
  } catch {
    return false
  }
}
