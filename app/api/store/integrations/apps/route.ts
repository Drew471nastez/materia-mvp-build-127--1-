import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { appStatesFrom } from "@/lib/integrations/storelib-apps"
import { readAppFacts } from "@/lib/integrations/storelib-apps-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Storelib's own apps in the integrations directory, and the Essentials:
 * whether each is On, Off or still to Set up, read off the caller's store
 * (lib/integrations/storelib-apps-server.ts). States and links only.
 *
 *   GET   { states: { [appId]: "on" | "off" | "setup" | null }, hrefs: { [appId]: string } }
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const physical = await isPhysicalCommerceEnabled().catch(() => false)
  const { facts, codeHref } = await readAppFacts(c.db, c.creatorId, physical)
  return physicalJson({ states: appStatesFrom(facts), hrefs: codeHref ? { "storelib-code": codeHref } : {} })
}
