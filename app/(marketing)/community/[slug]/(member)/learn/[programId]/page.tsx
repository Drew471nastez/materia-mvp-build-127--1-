import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PlacePage } from "@/components/community/member/place-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Program", robots: { index: false, follow: false } }

/**
 * /community/<slug>/learn/<programId>?lesson=<id>: a program of this community in the course player, or why it is closed.
 * Round 15: seeds the shell (place-page.tsx); the player still asks again for every lesson, video and file
 * (lib/courses/server.ts lessonContext), so this page is not the only check.
 */
export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; programId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const [{ slug, programId }, { lesson }] = await Promise.all([params, searchParams])
  if (!/^[0-9a-z](?:[0-9a-z-]{0,62}[0-9a-z])?$/i.test(programId)) notFound()
  return <PlacePage slug={slug} place={{ kind: "program", id: programId }} lesson={typeof lesson === "string" ? lesson : null} />
}
