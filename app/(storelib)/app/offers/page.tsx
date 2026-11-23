import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { OffersScreen } from "./offers-screen"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Upsells and bundles") }
}

/** Products › Upsells and bundles (lib/offers): the list, read on the server (./offers-screen.tsx). `?choose=1` lands with New offer's kind chooser open. */
export default async function OffersPage({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const { choose } = await searchParams
  return OffersScreen({ from: "/app/offers", choose: choose === "1" })
}
