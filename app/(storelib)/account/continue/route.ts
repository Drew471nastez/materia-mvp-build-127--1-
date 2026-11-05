import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMainDomain } from "@/lib/url-helpers"
import { safeReturnTarget } from "@/lib/auth/return-to"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ACCOUNT, PRESSED FROM A CREATOR'S SITE
 * ===========================================================================
 * The built site cannot answer "is this visitor signed in". Its session
 * cookie is host-only to the platform on purpose, so that a site somebody
 * generated with a prompt can never read a Storelib token. That is the right
 * trade and this does not weaken it: the question is answered HERE, on the
 * platform, where the cookie is, and the visitor is sent on.
 *
 *   signed in   -> their library, which is what Account means once you have
 *                  one: what you have bought and what you can download.
 *   signed out  -> sign in, carrying where to come back to.
 *
 * The site learns nothing either way. A cross-origin redirect's destination
 * is not readable by the page that started it; only the visitor's own
 * browser follows it, which is the same as them clicking a link.
 *
 * WHERE BACK IS is checked, not trusted. See lib/auth/return-to.ts: an
 * unchecked one of these turns the sign-in page into a laundering service
 * for somebody else's link.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const platform = `https://${getMainDomain()}`

  const back = safeReturnTarget(searchParams.get("next"), { mainDomain: getMainDomain() })

  let signedIn = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    signedIn = !!user
  } catch {
    /* Treated as signed out. Sending somebody to sign in when they did not
       need to costs them a click; sending them to a library they cannot see
       costs them an error page. */
  }

  if (signedIn) return NextResponse.redirect(`${platform}/account/library`)

  const login = new URL("/login", platform)
  if (back) login.searchParams.set("next", back)
  return NextResponse.redirect(login.toString())
}
