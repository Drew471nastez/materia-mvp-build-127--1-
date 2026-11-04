import { NextResponse, type NextRequest } from "next/server"
import { canvasFrameAnswer } from "@/lib/website-builder/canvas-frame"

/**
 * The canvas shell on the canvas origin (lib/website-builder/canvas-origin.ts):
 * reached as storelib.me/__canvas/<installId> through lib/onepage/host-route.ts,
 * and answered only there, only with the install's draft pass, and only to one
 * of the builder's own origins (lib/website-builder/canvas-frame.ts). A 404
 * while NEXT_PUBLIC_CANVAS_ORIGIN is unset.
 */
export const dynamic = "force-dynamic"

async function answer(request: NextRequest, params: Promise<{ installId: string }>, head: boolean) {
  const { installId } = await params
  const q = request.nextUrl.searchParams
  const a = canvasFrameAnswer({ host: request.headers.get("host"), installId, pass: q.get("pass"), editor: q.get("editor") })
  return new NextResponse(head ? null : a.body, { status: a.status, headers: a.headers })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ installId: string }> }) {
  return answer(request, params, false)
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ installId: string }> }) {
  return answer(request, params, true)
}
