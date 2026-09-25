import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { parseReturnUrl, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { checkFormProof, isState, mintCode } from "@/lib/site-accounts/token"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  CONTINUE, PRESSED: A CODE FOR THE WEBSITE, AND THE VISITOR SENT TO IT
 * ===========================================================================
 * The form on /account/site posts here. Before a code is made:
 *
 *   the POST came from storelib.com itself        Origin is this host. A page
 *                                                  elsewhere cannot make a
 *                                                  browser press Continue.
 *   the form was drawn for this person, this       formProof, signed, ten
 *   address and this state, lately                 minutes
 *   the person is signed in here                   the Supabase session, read
 *                                                  the way every page reads it
 *   the address is a creator's website, now        looked up again, not taken
 *                                                  from the form
 *
 * The code goes to the website in the query of a 303, to the website's own
 * exchange route, which is on the host the code is bound to. Referrer-Policy
 * no-referrer, so the next page the visitor opens does not carry it on.
 */
export async function POST(request: Request) {
  const host = (request.headers.get("host") || "").toLowerCase()
  const main = getMainDomain().toLowerCase()
  const origin = request.headers.get("origin")
  let fromHere = false
  try {
    fromHere = !!origin && new URL(origin).host.toLowerCase() === host && (host === main || host.split(":")[0] === "localhost")
  } catch {
    fromHere = false
  }
  if (!fromHere) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return privateResponse(NextResponse.json({ error: "Bad request" }, { status: 400 }))
  }
  const target = parseReturnUrl(form.get("return"))
  const state = form.get("state")
  const proof = form.get("proof")
  if (!target || !isState(state)) return privateResponse(NextResponse.redirect(new URL("/library", originOf(host)), 303))

  const again = new URL(`/account/site?${new URLSearchParams({ return: target.href, state }).toString()}`, originOf(host))

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    userId = null
  }
  /* Signed out since the page was drawn: the page again, which sends them to sign in. */
  if (!userId) return privateResponse(NextResponse.redirect(again, 303))
  /* A form from somebody else's session, or an old tab: drawn again, fresh. */
  if (!checkFormProof(proof, { userId, returnUrl: target.href, state })) return privateResponse(NextResponse.redirect(again, 303))

  const owner = await siteOwnerOfHost(createAdminClient(), target.host)
  if (!owner) return privateResponse(NextResponse.redirect(again, 303))

  const code = mintCode({ userId, creatorId: owner.creatorId, host: target.host, state, returnPath: target.path })
  if (!code) return privateResponse(NextResponse.redirect(again, 303))

  const to = new URL("/api/site-account/exchange", originOf(target.host))
  to.searchParams.set("code", code)
  return privateResponse(NextResponse.redirect(to, 303))
}
