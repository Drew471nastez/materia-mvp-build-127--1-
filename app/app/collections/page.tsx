import { redirect } from "next/navigation"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { currentCreatorId } from "@/lib/creators/current"
import { CollectionsClient } from "./collections-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = { title: "Collections" }

/** Groups of products, picked or matched by rules. Only while physical commerce is on in /admin. */
export default async function CollectionsPage() {
  await requirePhysicalPage()
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <CollectionsClient />
}
