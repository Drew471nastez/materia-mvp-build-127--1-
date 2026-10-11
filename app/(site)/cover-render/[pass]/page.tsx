import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { readCoverPass } from "@/lib/website-builder/cover-pass"
import { coverPage } from "../../w/[username]/render-site"
import { COVER_STILL_CSS } from "@/lib/website-builder/cover-still"

/**
 * The page the cover's screenshot is taken of. See lib/website-builder/
 * cover-pass.ts for who may open it, and render-site.tsx's coverPage for
 * what it draws.
 *
 * Dynamic, uncached, never indexed: it is a two-minute view of one draft for
 * one browser, and a pass that does not check out is simply not a page.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Cover",
  robots: { index: false, follow: false, nocache: true },
}

export default async function CoverRender({ params }: { params: Promise<{ pass: string }> }) {
  const { pass } = await params
  const installId = readCoverPass(decodeURIComponent(pass))
  if (!installId) notFound()
  /* Still: the theme's animations at their end, for the photograph and the small page on the card (lib/website-builder/cover-still.ts). */
  return (
    <>
      <style data-cover-still dangerouslySetInnerHTML={{ __html: COVER_STILL_CSS }} />
      {await coverPage(installId)}
    </>
  )
}
