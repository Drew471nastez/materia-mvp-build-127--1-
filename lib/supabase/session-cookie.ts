/**
 * ===========================================================================
 *  DOES THIS REQUEST CARRY A SESSION AT ALL
 * ===========================================================================
 * Read from the cookie's name alone, with no round trip: the session cookie
 * supabase-ssr writes (`sb-<project>-auth-token`, whole or in chunks).
 *
 * Used where a shared read made with the anon key may come back empty and
 * the code then asks again on the visitor's own client in case their session
 * may see more (lib/commerce/product-page-data.ts). A visitor with no
 * session cookie asks with the same anon role as the shared read did, under
 * the same policies, so asking again can only find the same nothing: that
 * second read is skipped for them, and kept for everyone signed in.
 *
 * Errs on the side of asking: any cookie that looks like a session counts.
 */
import { cookies } from "next/headers"
import { storedSessionKey } from "./session-jar"

export async function requestMayHaveSession(): Promise<boolean> {
  try {
    const key = storedSessionKey()
    const jar = await cookies()
    return jar.getAll().some((c) => (key ? c.name === key || c.name.startsWith(`${key}.`) : false) || /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
  } catch {
    return true
  }
}
