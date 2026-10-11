/**
 * An imported Shopify theme's home page, for its website's cover picture
 * (lib/website-builder/cover-take.ts). The same pass as /cover-render, which
 * draws a theme of Storelib's own: minted for one install, short lived.
 */
import { NextResponse } from "next/server"
import { readCoverPass } from "@/lib/website-builder/cover-pass"
import { compatDraftHome } from "@/lib/website-builder/compat-site"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: Request, { params }: { params: Promise<{ pass: string }> }) {
  const { pass } = await params
  const installId = readCoverPass(decodeURIComponent(pass))
  if (!installId) return new NextResponse("Not found", { status: 404 })
  const html = await compatDraftHome(installId)
  if (html === null) return new NextResponse("Not found", { status: 404 })
  /*
    The theme's scripts run, for the picture to be the page as visitors see
    it, and in a sandbox with no origin: this is storelib.com, and nothing a
    theme carries may act in it.
  */
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      /* Framed only by this origin, and only when asked to be (the Website page's live miniature, ?embedded=1); never by anybody else. */
      "Content-Security-Policy": new URL(req.url).searchParams.get("embedded") === "1" ? "sandbox allow-scripts; frame-ancestors 'self'" : "sandbox allow-scripts",
    },
  })
}
