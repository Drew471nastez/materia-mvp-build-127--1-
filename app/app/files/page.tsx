import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { FilesClient } from "./files-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = { title: "Files" }

/** Every picture the store has uploaded (lib/files/library.ts), for every store. */
export default async function FilesPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <FilesClient />
}
