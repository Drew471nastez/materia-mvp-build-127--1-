import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { FilesClient } from "./files-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Files") }
}

/** Every picture the store has uploaded (lib/files/library.ts), for every store. */
export default async function FilesPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <FilesClient />
}
