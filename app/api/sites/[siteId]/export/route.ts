/**
 * Download the project.
 *
 * The whole file tree as a zip — a real Vite project, so `npm install && npm
 * run dev` works on somebody's laptop with Storelib nowhere in the picture.
 * That is the point: a project format only we can build is a lock-in this
 * product does not need, and the promise is worthless unless there is a button.
 */

import { type NextRequest, NextResponse } from "next/server"

import { resolveSite } from "@/lib/sites/resolve"

import { readProject } from "@/lib/sites/projects"
import { toSiteSlug } from "@/lib/sites/slug"
import { createZip } from "@/lib/sites/zip"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  // RLS decides: a site somebody else owns reads as absent.
  const found = await resolveSite(siteId)
  if (!found.ok) return found.response
  const site = found.site

  const files = await readProject(siteId)
  if (Object.keys(files).length === 0) {
    return NextResponse.json({ error: "This site has no files." }, { status: 400 })
  }

  const name = toSiteSlug(site.name) || "site"
  const zip = createZip(files)

  return new NextResponse(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      // `filename` is quoted and the name is slugified, so a site called
      // `"; rm -rf /` cannot break out of the header.
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
