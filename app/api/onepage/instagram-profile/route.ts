import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { onePageActor } from "@/lib/team/onepage"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { fetchPublic } from "@/lib/api/public-fetch"
import { downloadExternalImage } from "@/lib/blog/copy-image"
import { META_GRAPH_VERSION } from "@/lib/analytics/destinations/providers"
import { UPLOAD_HEADERS, screenInBackground } from "@/lib/storage/upload-guard"
import { businessDiscoveryUrl, instagramGraphConfig, instagramUsername, parseBusinessDiscovery, parseProfileOpenGraph, type InstagramProfile } from "@/lib/onepage/instagram-profile"

export const runtime = "nodejs"
export const maxDuration = 30

/*
  AN INSTAGRAM PROFILE'S PICTURE, COPIED INTO STORELIB (round 3), for a
  signed-in creator's app block (components/onepage/app-block-editor).

  POST { url }   a profile address (instagram.com/name), "@name" or "name"
  200 { name, avatar_url, posts, source }   avatar_url is on Storelib's storage
  422 { error }  Instagram did not give the picture: the creator uploads one

  - Signed in, a OnePage owner or team member (lib/team/onepage), 10 lookups
    in 10 minutes per person and address.
  - With Meta's token (lib/onepage/instagram-profile instagramGraphConfig) the
    Graph API's business_discovery, which also gives the latest posts.
  - Without it the profile page's Open Graph picture, read through
    fetchPublic (private addresses refused at connect time, 1 MB, 5 s).
  - The picture is downloaded under the blog's copy rules (lib/blog/copy-
    image: https only, 10 MB, a real raster image, metadata stripped) and
    stored where the OnePage's uploads go. Instagram's own address, which
    expires, is never returned.
*/
const BUCKET_NAME = process.env.ONEPAGE_LEAD_FILES_BUCKET || "lead-form-files-v2"
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: UPLOAD_HEADERS })

async function viaGraph(username: string): Promise<InstagramProfile | null> {
  const cfg = instagramGraphConfig(process.env)
  if (!cfg) return null
  try {
    const r = await fetchPublic(businessDiscoveryUrl(cfg, username, META_GRAPH_VERSION), { maxBytes: 262_144, timeoutMs: 5000, maxRedirects: 0, httpsOnly: true })
    if (!r.ok) return null
    return parseBusinessDiscovery(JSON.parse(await r.text()), username)
  } catch {
    return null
  }
}

async function viaOpenGraph(username: string): Promise<InstagramProfile | null> {
  try {
    const r = await fetchPublic(`https://www.instagram.com/${username}/`, { maxBytes: 1_048_576, timeoutMs: 5000, maxRedirects: 2, httpsOnly: true })
    if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || "")) return null
    return parseProfileOpenGraph(await r.text(), username)
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return json({ error: "Sign in to use your Instagram picture." }, 401)
  const user = who.user

  let body: { url?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* An empty body is the missing address below. */
  }
  const username = instagramUsername(typeof body.url === "string" ? body.url : "")
  if (!username) return json({ error: "Add your Instagram profile address first, like instagram.com/yourname." }, 400)

  const limited = await rateLimit({ bucket: "onepage-instagram-profile", subjects: [addressSubject(request), user.id], windows: [{ limit: 10, seconds: 600 }] })
  if (limited) return limited

  const supabase = await createClient()
  const actor = await onePageActor(supabase, user.id)
  if (actor instanceof NextResponse) return actor
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", actor.pageOwnerId).single()
  if (!creator) return json({ error: "Creator not found" }, 404)

  const graph = await viaGraph(username)
  const profile = graph?.picture ? graph : await viaOpenGraph(username)
  if (!profile?.picture) {
    return json({ error: "Instagram didn't share this profile's picture. Upload one instead.", posts: graph?.posts ?? [] }, 422)
  }

  const got = await downloadExternalImage(profile.picture)
  if ("error" in got) return json({ error: "Instagram didn't share this profile's picture. Upload one instead.", posts: graph?.posts ?? [] }, 422)

  const path = `${creator.id}/product-images/${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.${got.ext}`
  const { error } = await admin.storage.from(BUCKET_NAME).upload(path, got.bytes, { contentType: got.mime, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[instagram-profile] storage:", String(error.message ?? "").slice(0, 200))
    return json({ error: "The picture couldn't be saved. Try again." }, 500)
  }
  screenInBackground(admin, { bytes: got.bytes, bucket: BUCKET_NAME, path, context: "public_image", userId: user.id })
  const { data } = admin.storage.from(BUCKET_NAME).getPublicUrl(path)
  if (!data?.publicUrl) return json({ error: "The picture couldn't be saved. Try again." }, 500)

  return json({ name: profile.name, avatar_url: data.publicUrl, posts: graph?.posts ?? [], source: graph?.picture ? "graph" : "open_graph" })
}
