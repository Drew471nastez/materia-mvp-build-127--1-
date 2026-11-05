import type { Metadata } from "next"
import { SettingsForm } from "../../settings/_view"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Settings"),
  }
}

/* Settings opened from a page of /app: what fills the sheet (./layout.tsx) over that page, which stays where it was. */
export default async function SettingsOverPage() {
  return SettingsForm()
}
