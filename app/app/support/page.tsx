import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { SupportClient } from "./support-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Support") }
}

/** A store's requests to Storelib (lib/support), answered from /admin/resolution. */
export default async function SupportPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <SupportClient />
}
