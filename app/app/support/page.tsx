import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { SupportClient } from "./support-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = { title: "Support" }

/** A store's requests to Storelib (lib/support), answered from /admin/resolution. */
export default async function SupportPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <SupportClient />
}
