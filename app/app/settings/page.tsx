import { Suspense } from "react"
import type { Metadata } from "next"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { SettingsPlaceholder } from "@/components/app/settings/settings-placeholder"
import { SettingsForm } from "./_view"

export const metadata: Metadata = {
  title: "Settings",
}

/*
  Opened on its own (a reload, an email link): the sheet over the shell. A
  press inside /app is app/app/@sheet/(.)settings. The sheet is sent at once
  and the form streams into it, so a reload never sits on a blank white page
  while the server reads the account.
*/
export default function SettingsPage() {
  return (
    <SettingsSheet>
      <Suspense fallback={<SettingsPlaceholder />}>{SettingsForm()}</Suspense>
    </SettingsSheet>
  )
}
