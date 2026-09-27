/**
 * A picture for an email, made once and kept by the CDN
 * (lib/email-campaigns/inbox-image says what and why): the same PNG or JPEG
 * for every mail client, transparency kept, sized for the width it is drawn
 * at. Public on purpose: an inbox fetches it with no session. It only resizes
 * pictures on the hosts the site's own image endpoint takes, only at a fixed
 * set of widths, and fetches through fetchPublic.
 */
import { fetchPublic } from "@/lib/api/public-fetch"
import { readInboxRequest } from "@/lib/email-campaigns/inbox-image"
import { renderInboxImage } from "@/lib/email-campaigns/inbox-image-render"

export const runtime = "nodejs"

const MAX_BYTES = 20 * 1024 * 1024
const KEEP = "public, max-age=31536000, s-maxage=31536000, immutable"

export async function GET(request: Request) {
  const asked = readInboxRequest(new URL(request.url).searchParams)
  if (!asked.ok) return new Response(asked.reason, { status: asked.status, headers: { "cache-control": "no-store" } })

  let input: Buffer
  try {
    const res = await fetchPublic(asked.src, { maxBytes: MAX_BYTES, timeoutMs: 8000, maxRedirects: 2 })
    if (!res.ok) throw new Error(`status ${res.status}`)
    if (!/^image\//i.test(res.headers.get("content-type") ?? "image/")) throw new Error("not a picture")
    input = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return fallBack(asked.src, e)
  }

  try {
    const out = await renderInboxImage(input, asked.width)
    return new Response(new Uint8Array(out.body), {
      status: 200,
      headers: {
        "content-type": out.type,
        "content-length": String(out.body.length),
        "cache-control": KEEP,
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
      },
    })
  } catch (e) {
    return fallBack(asked.src, e)
  }
}

/** Could not make it: the stored picture itself, on a host already checked, so the email still shows something. Not kept. */
function fallBack(src: string, e: unknown) {
  let host = ""
  try {
    host = new URL(src).hostname
  } catch {
    /* already checked */
  }
  console.warn(`[email-img] sent the stored picture from ${host}: ${e instanceof Error ? e.message : "failed"}`)
  return new Response(null, { status: 302, headers: { location: src, "cache-control": "no-store" } })
}
