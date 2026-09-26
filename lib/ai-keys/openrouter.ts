/** Shared by /api/ai-keys/openrouter and its callback. */

/** The httpOnly cookie that holds the PKCE verifier, the way back and who started it, for ten minutes. */
export const PKCE_COOKIE = "sl_openrouter_pkce"

/** Where to come back to: the website editor this was started from, else the website builder. Never a free address. */
export function returnPath(installId: string | null): string {
  return installId && /^[A-Za-z0-9-]{1,64}$/.test(installId) ? `/website-builder/editor/${installId}` : "/app/website-builder"
}
