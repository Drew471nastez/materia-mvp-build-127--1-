import { NextResponse } from "next/server"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { fetchPublic, publicUrlProblem } from "@/lib/api/public-fetch"
import { parseLinkMetadata } from "@/lib/onepage/link-metadata"
import { oembedEndpoint, parseOEmbed } from "@/lib/onepage/oembed"
export const runtime = "nodejs"

/*
  A PASTED ADDRESS'S PUBLIC PREVIEW, for a signed-in creator's editor only.

  - Signed in, or 401. Rate limited per user and per address (40 in 10 min).
  - The address must be http or https on a standard port, with no
    credentials and no local or private host.
  - fetchPublic (lib/api/public-fetch) resolves the name AT CONNECT TIME and
    refuses any private, loopback, link-local or metadata address, and does
    the same on every redirect hop (at most 2).
  - At most 512 KB is read; each hop has 4.5 s and the whole lookup 8 s.
  - Answers are kept 10 minutes (failures 2 minutes) in a bounded cache, so
    a repeated paste asks the site once.
  - Only text is returned: the title, description, picture and icon
    addresses, each checked again (lib/onepage/link-metadata).
*/
type Preview = ReturnType<typeof parseLinkMetadata>
const cache = new Map<string, { at: number; value: Preview | null }>()
const HIT_MS = 600_000
const MISS_MS = 120_000
const TOTAL_MS = 8000
const CACHE_MAX = 200

function remember(key: string, value: Preview | null) {
  cache.delete(key)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), value })
}
const noPreview = () =>
  NextResponse.json(
    { error: "A preview is not available. Your link still works." },
    { status: 422, headers: { "Cache-Control": "no-store" } },
  )

/** The service's own oEmbed answer, as a preview, or null. Never throws. */
async function readOEmbed(url: string): Promise<Preview | null> {
  const at = oembedEndpoint(url)
  if (!at) return null
  try {
    const r = await fetchPublic(at.url, { maxBytes: 65_536, timeoutMs: 3500, maxRedirects: 1 })
    if (!r.ok || !/json/i.test(r.headers.get("content-type") || "")) return null
    return parseOEmbed(JSON.parse(await r.text()), url, at.provider)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user")
    return NextResponse.json(
      { error: "Sign in to preview a link." },
      { status: 401 },
    )
  const raw = new URL(request.url).searchParams.get("url") || ""
  if (raw.length > 2048 || publicUrlProblem(raw))
    return NextResponse.json(
      { error: "Use a public website address." },
      { status: 400 },
    )
  const limited = await rateLimit({
    bucket: "onepage-link-preview",
    subjects: [addressSubject(request), who.user.id],
    windows: [{ limit: 40, seconds: 600 }],
  })
  if (limited) return limited
  const key = new URL(raw)
  key.hash = ""
  const url = key.href,
    had = cache.get(url)
  if (had && Date.now() - had.at < (had.value ? HIT_MS : MISS_MS))
    return had.value
      ? NextResponse.json(had.value, { headers: { "Cache-Control": "no-store" } })
      : noPreview()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), TOTAL_MS)
    })
    /*
      Round AR3: a service that publishes oEmbed (lib/onepage/oembed) is asked
      there first, at its fixed address, through the same guard: TikTok,
      Spotify and SoundCloud give a server little in Open Graph. A miss falls
      through to the page itself.
    */
    const viaOEmbed = await Promise.race([readOEmbed(url), deadline]).catch(() => null)
    if (viaOEmbed) {
      remember(url, viaOEmbed)
      return NextResponse.json(viaOEmbed, { headers: { "Cache-Control": "no-store" } })
    }
    const r = await Promise.race([
      fetchPublic(url, {
        maxBytes: 524_288,
        timeoutMs: 4500,
        maxRedirects: 2,
      }),
      deadline,
    ])
    const type = r.headers.get("content-type") || ""
    if (!r.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
      remember(url, null)
      return NextResponse.json(
        { error: "This website has no link preview." },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      )
    }
    const value = parseLinkMetadata(await r.text(), r.url || url)
    remember(url, value)
    return NextResponse.json(value, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    remember(url, null)
    return noPreview()
  } finally {
    if (timer) clearTimeout(timer)
  }
}
