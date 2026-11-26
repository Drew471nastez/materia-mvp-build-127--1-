/**
 * An imported Shopify theme's home page, for its website's cover picture
 * (lib/website-builder/cover-take.ts). The same pass as /cover-render, which
 * draws a theme of Storelib's own: minted for one install, short lived.
 */
import { NextResponse } from "next/server"
import { readCoverPass } from "@/lib/website-builder/cover-pass"
import { compatDraftHome } from "@/lib/website-builder/compat-site"
import { COVER_STILL_POLICY, withStillStyle } from "@/lib/website-builder/cover-still"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/*
  EVERY ANSWER TO THE FRAME CAN BE FRAMED (round 28). The Website page frames
  this route (?embedded=1) as a new website's live miniature. Its 404 (a pass
  that ran out, an install whose draft is not there yet) and a failed draw
  were sent with nothing but vercel.json's X-Frame-Options: DENY, so the card
  said "storelib.com refused to connect" instead of staying on its name.
  Measured live before the fix: /api/site-theme/cover/<bad>?embedded=1 was a
  404 with x-frame-options: DENY and no frame-ancestors. Now every answer to
  an embedded request carries the same frame rule the page has, and nothing
  else can frame any of them.
*/
const FRAMED_POLICY = "sandbox allow-scripts; frame-ancestors 'self'"

function missing(embedded: boolean, status = 404): NextResponse {
  return new NextResponse(status === 404 ? "Not found" : "Not available", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      ...(embedded ? { "Content-Security-Policy": FRAMED_POLICY } : {}),
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ pass: string }> }) {
  const { pass } = await params
  const embedded = new URL(req.url).searchParams.get("embedded") === "1"
  const installId = readCoverPass(decodeURIComponent(pass))
  if (!installId) return missing(embedded)
  let html: string | null
  try {
    html = await compatDraftHome(installId)
  } catch (e) {
    console.error("[site-theme cover] the page could not be drawn:", e instanceof Error ? e.message : e)
    return missing(embedded, 503)
  }
  if (html === null) return missing(embedded)
  /*
    The theme's scripts run, for the picture to be the page as visitors see
    it, and in a sandbox with no origin: this is storelib.com, and nothing a
    theme carries may act in it.
  */
  /* Still, and nothing from servers the picture does not need (lib/website-builder/cover-still.ts). */
  return new NextResponse(withStillStyle(html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      /* Framed only by this origin, and only when asked to be (the Website page's live miniature, ?embedded=1); never by anybody else. */
      "Content-Security-Policy": `${embedded ? FRAMED_POLICY : "sandbox allow-scripts"}, ${COVER_STILL_POLICY}`,
    },
  })
}
