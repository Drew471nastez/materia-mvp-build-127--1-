import type { Metadata } from "next"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { SettingsForm } from "./_view"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Settings"),
  }
}

/* Opened on its own (a reload, an email link): the sheet over the shell. A press inside /app is app/app/@sheet/(.)settings. */
export default async function SettingsPage() {
  return <SettingsSheet>{await SettingsForm()}</SettingsSheet>
}
