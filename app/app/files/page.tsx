import { FilesClient } from "./files-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage, teamPageStore } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Files") }
}

/** Every picture the store has uploaded (lib/files/library.ts), for every store. */
export default async function FilesPage() {
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in; the page's own reads go through the API, which asks the same. */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") return noStorePage("/app/files")
  return <FilesClient />
}
