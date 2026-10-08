import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import type { Metadata } from "next"
import { loadSettingsData } from "./_server"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const data = await loadSettingsData()
  if (!data) return null

  /* Drawn as one large sheet over the dashboard (components/app/settings-sheet.tsx), at the same address. */
  return (
    <SettingsSheet>
    <SettingsFormNew
      profile={data.profile}
      creator={data.creator}
      accountTimeZone={data.timeZone}
      websitePublished={data.websitePublished}
      onePageLive={data.onePageLive}
      sharePlatforms={data.sharePlatforms}
      website={data.website}
      newsletter={data.newsletter}
      otherStores={data.otherStores}
      paymentsProvider={data.paymentsProvider}
      initialTab="general"
    />
    </SettingsSheet>
  )
}
