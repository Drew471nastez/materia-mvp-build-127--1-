import { NextResponse } from "next/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { fetchPublic } from "@/lib/api/public-fetch"
import { parseLinkMetadata } from "@/lib/onepage/link-metadata"
import { isSocialNetwork, profileUrl, socialHandle, usablePicture } from "@/lib/onboarding/social-preview"

export const runtime = "nodejs"
export const maxDuration = 15

/*
  THE PICTURE OF THE ACCOUNT TYPED IN, for the seller onboarding's socials
  step (components/app/creator-onboarding-modal).

  GET ?network=instagram|tiktok|youtube|twitter&handle=<what was typed>
  200 { handle, name, avatar }   avatar is null when the network gave none
  400 { error }                  not an account on that network

  Signed in only, 40 lookups in 10 minutes per person and address. The page
  is the network's own public profile, read through fetchPublic (private
  addresses refused at connect time, https only, 1 MB, 5 s, two redirects);
  only its Open Graph picture and title are used. Nothing is stored. A
  network that hides the picture from a server (X often does) answers
  avatar: null and the field simply keeps its icon.
*/
export async function GET(request: Request) {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Sign in first." }, { status: 401 })

  const url = new URL(request.url)
  const network = url.searchParams.get("network")
  if (!isSocialNetwork(network)) return NextResponse.json({ error: "Unknown network." }, { status: 400 })
  const handle = socialHandle(network, url.searchParams.get("handle"))
  if (!handle) return NextResponse.json({ error: "That is not an account name." }, { status: 400 })

  const limited = await rateLimit({ bucket: "onboarding-social-preview", subjects: [addressSubject(request), who.user.id], windows: [{ limit: 40, seconds: 600 }], memoryFirst: true })
  if (limited) return limited

  let avatar: string | null = null
  let name: string | null = null
  try {
    const page = await fetchPublic(profileUrl(network, handle), { maxBytes: 1_048_576, timeoutMs: 5000, maxRedirects: 2, httpsOnly: true })
    if (page.ok && /text\/html/i.test(page.headers.get("content-type") || "")) {
      const meta = parseLinkMetadata(await page.text(), profileUrl(network, handle))
      avatar = usablePicture(meta.image)
      name = meta.title ? meta.title.slice(0, 80) : null
    }
  } catch {
    /* Not reachable from here: no picture, the field keeps its icon. */
  }
  return NextResponse.json({ handle, name, avatar }, { headers: { "Cache-Control": "private, max-age=600" } })
}
