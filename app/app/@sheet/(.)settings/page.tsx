import type { Metadata } from "next"
import { SettingsForm } from "../../settings/_view"

export const metadata: Metadata = {
  title: "Settings",
}

/* Settings opened from a page of /app: what fills the sheet (./layout.tsx) over that page, which stays where it was. */
export default async function SettingsOverPage() {
  return SettingsForm()
}
