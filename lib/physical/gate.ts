import "server-only"

import { NextResponse } from "next/server"
import { notFound } from "next/navigation"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

/**
 * The one way every physical route, page and job asks the switch. Off, an
 * API answers 404 (the route does not exist, as before it was built) and a
 * page is not found; nothing is read or written.
 *
 *   const off = await physicalApiGate()
 *   if (off) return off
 */
export async function physicalApiGate(): Promise<NextResponse | null> {
  if (await isPhysicalCommerceEnabled()) return null
  return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } })
}

/** For a page or a server component: not found while physical commerce is off. */
export async function requirePhysicalPage(): Promise<void> {
  if (!(await isPhysicalCommerceEnabled())) notFound()
}
