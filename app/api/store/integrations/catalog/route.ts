import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What /admin set over the integrations directory (lib/integrations/
 * overrides.ts): names, marks, order, a service paused or hidden, and the
 * ones added from /admin. Only how the directory looks; never a key.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  let overrides: Awaited<ReturnType<typeof cachedCatalogOverrides>> = []
  try {
    overrides = await cachedCatalogOverrides()
  } catch {
    overrides = []
  }
  return physicalJson({ overrides })
}
