import { cookies } from "next/headers"

import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-session"

/**
 * The cookie half of the admin gate. The token itself is in
 * lib/admin-session.ts, which has no framework import so that the signing
 * and the verifying can be run by the suite rather than read.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    return verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value)
  } catch {
    return false
  }
}

export { ADMIN_COOKIE, SESSION_MAX_AGE, issueSessionToken, verifySessionToken } from "@/lib/admin-session"
