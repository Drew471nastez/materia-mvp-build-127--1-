import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage, teamPageStore } from "@/lib/team/server"
import { GumroadImportClient } from "./gumroad-import-client"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Import from Gumroad") }
}

/**
 * Products › Import from Gumroad. Nothing to read before the seller pastes
 * their token, so the page is only the gate: the owner, or a team member
 * whose role holds Products (lib/team/server teamPageStore). The work is in
 * ./gumroad-import-client.tsx and app/api/app/products/import/gumroad.
 */
export default async function GumroadImportPage() {
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") return noStorePage("/app/products/import/gumroad")
  return <GumroadImportClient />
}
