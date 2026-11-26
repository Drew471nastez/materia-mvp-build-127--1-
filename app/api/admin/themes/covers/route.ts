import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { coverExportEntries, coverExportFileName, zipStream, type CoverExportEntry } from "@/lib/themes/cover-export"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* About two hundred pictures turned into PNG one after another. */
export const maxDuration = 300

/**
 * ===========================================================================
 *  GET /api/admin/themes/covers   every template's pictures as PNG, one zip
 * ===========================================================================
 * Round 30, for Pinterest: the desktop and phone covers and the SEO
 * pictures of every template (lib/themes/cover-export.ts), from the button
 * on /admin/themes. The admin cookie is checked first, as in every admin
 * route; without it the answer is 401 and nothing is read. The zip is made
 * while it downloads and kept nowhere, so there is no address to share and
 * nothing to expire. Never cached, never indexed.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const entries = coverExportEntries()
  const origin = req.nextUrl.origin
  /* Loaded here, not at the top: on Vercel every admin route is one function (scripts/fold-api-routes.mjs), and the others never need it. */
  const { default: sharp } = await import("sharp")
  /* Always over HTTP from the same site (Vercel serves public/ from its CDN). Never read from the disk: a file read under public/ makes the build trace the whole folder into the admin function (487 MB, over Vercel's 250 MB). */
  const load = async (e: CoverExportEntry): Promise<Uint8Array> => {
    const res = await fetch(new URL(e.source, origin), { cache: "no-store" })
    if (!res.ok) throw new Error(`${e.source}: ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    return new Uint8Array(await sharp(bytes).png({ compressionLevel: 6 }).toBuffer())
  }

  await recordAdminAction(createAdminClient(), { action: "theme_covers_downloaded", targetType: "platform", targetId: "theme-covers", targetLabel: "Template covers", detail: { files: entries.length } })

  return new NextResponse(zipStream(entries, load), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${coverExportFileName()}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  })
}
