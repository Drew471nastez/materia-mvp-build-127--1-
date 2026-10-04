import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { CollectionsClient } from "./collections-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = { title: "Collections" }

/** Groups of products, picked or matched by rules, of every kind: Products › Collections. */
export default async function CollectionsPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <CollectionsClient />
}
