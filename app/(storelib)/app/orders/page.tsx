import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Orders"),
  }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export { default } from "./sales/page"
