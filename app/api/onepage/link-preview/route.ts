import { NextResponse } from "next/server"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { fetchPublic, publicUrlProblem } from "@/lib/api/public-fetch"
import { parseLinkMetadata } from "@/lib/onepage/link-metadata"
export const runtime = "nodejs"
const cache = new Map<
  string,
  { at: number; value: ReturnType<typeof parseLinkMetadata> }
>()
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
  if (had && Date.now() - had.at < 600_000)
    return NextResponse.json(had.value, {
      headers: { "Cache-Control": "no-store" },
    })
  try {
    const r = await fetchPublic(url, {
      maxBytes: 524_288,
      timeoutMs: 4500,
      maxRedirects: 2,
    })
    if (!r.ok || !r.headers.get("content-type")?.includes("text/html"))
      return NextResponse.json(
        { error: "This website has no link preview." },
        { status: 422 },
      )
    const value = parseLinkMetadata(await r.text(), r.url || url)
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(url, { at: Date.now(), value })
    return NextResponse.json(value, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "A preview is not available. Your link still works." },
      { status: 422 },
    )
  }
}
